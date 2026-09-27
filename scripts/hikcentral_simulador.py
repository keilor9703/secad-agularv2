#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Simulador de HikCentral Professional OpenAPI — para probar SECAD sin VMS.

Para qué sirve
──────────────
El HikCentral de un municipio vive en una red interna a la que un servidor de
pruebas no llega, y la licencia de OpenAPI puede tardar semanas. Este
simulador permite ejercitar TODA la cadena de SECAD —firmar, listar cámaras,
emparejarlas con el censo, pedir la URL de video y auditar la consulta— sin
depender de nada institucional.

Qué tan fiel es
───────────────
La verificación de la firma AK/SK está reimplementada DESDE CERO siguiendo la
§3.2 del Developer Guide, sin compartir una línea con el driver de SECAD. Si
SECAD firma mal, aquí sale 401 igual que en el HikCentral real. Eso es lo que
le da valor: no es un «sí a todo».

Lo único que NO simula es el video. Sirve un manifiesto HLS válido y segmentos
vacíos, así que el reproductor descarga todo y falla al decodificar
(fragParsingError). Alcanza para comprobar que la URL llega y que el navegador
la usa; para ver imagen de verdad hace falta un VMS real o un servidor RTSP/HLS
con contenido.

Uso
───
    python3 scripts/hikcentral_simulador.py --puerto 5610

    # Con credenciales propias (las que se registren luego en SECAD)
    python3 scripts/hikcentral_simulador.py --app-key AK-mio --app-secret SK-mio \
        --user-id svc_secad --camaras camaras.json

Endpoints que atiende
─────────────────────
    POST /artemis/api/resource/v1/cameras          catálogo paginado
    POST /artemis/api/video/v2/cameras/previewURLs URL de video (lote, data.list[])
    POST /artemis/api/video/v1/cameras/previewURLs URL de video (una, data.url)
    POST /artemis/api/video/v1/ptzs/controlling    control PTZ (arranca / para)
    GET  /hls/<id>.m3u8                            manifiesto de prueba
    GET  /__diagnostico                            qué ha visto el simulador
    GET  /__reset                                  limpia el diagnóstico
"""
import argparse, base64, hashlib, hmac, json, sys, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Cabeceras que el gateway EXCLUYE del cálculo de la firma (§3.2). Firmar una
# de estas es uno de los errores que dan 401 sin explicación.
NO_FIRMABLES = {
    "x-ca-signature", "x-ca-signature-headers", "accept", "content-md5",
    "content-type", "date", "content-length", "server", "connection",
    "host", "transfer-encoding", "x-application-context", "content-encoding",
}

CAMARAS_DEMO = [
    {"cameraIndexCode": "1001", "cameraName": "CAM 107 PLAZOLETA SAN FRANCISCO",
     "capabilitySet": "vss,gis",     "regionIndexCode": "CENTRO", "status": 1},
    {"cameraIndexCode": "1002", "cameraName": "Parque Santander",
     "capabilitySet": "vss,ptz,gis", "regionIndexCode": "CENTRO", "status": 1},
    {"cameraIndexCode": "1003", "cameraName": "PTZ PARQUE PINZON",
     "capabilitySet": "vss,ptz",     "regionIndexCode": "CENTRO", "status": 2},
    {"cameraIndexCode": "1004", "cameraName": "SAN IGNACIO - BOMBEROS",
     "capabilitySet": "vss",         "regionIndexCode": "NORTE",  "status": 1},
]

# Comandos PTZ que acepta §5.4.23. Se listan aquí a mano, tomados del manual,
# y NO se importan de ningún sitio compartido con SECAD: si el driver se
# inventara un nombre, aquí tiene que salir rechazado. La errata «FOUCS_FAR»
# se copia tal cual porque es lo que el gateway acepta de verdad.
PTZ_COMANDOS = {
    "LEFT", "RIGHT", "UP", "DOWN", "LEFT_UP", "LEFT_DOWN", "RIGHT_UP", "RIGHT_DOWN",
    "ZOOM_IN", "ZOOM_OUT", "FOCUS_NEAR", "FOUCS_FAR", "IRIS_ENLARGE", "IRIS_REDUCE",
    "GOTO_PRESET", "RUN_PATROL",
}

CFG = {}
diagnostico = {"firmas_ok": 0, "firmas_mal": [], "peticiones": [], "hls": [], "ptz": []}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    # ── utilidades ───────────────────────────────────────────────────────
    def _responder(self, code, cuerpo, tipo="application/json"):
        b = cuerpo if isinstance(cuerpo, bytes) else json.dumps(cuerpo).encode()
        self.send_response(code)
        self.send_header("Content-Type", tipo)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def _verificar_firma(self, cuerpo):
        """Rehace la cadena a firmar tal como manda el manual y compara."""
        h = {k.lower(): v for k, v in self.headers.items()}
        declaradas = [x.strip() for x in (h.get("x-ca-signature-headers") or "").split(",") if x.strip()]

        if any(d in NO_FIRMABLES for d in declaradas):
            return "declaró como firmada una cabecera que el gateway excluye"

        partes = [self.command.upper()]
        # Una cabecera ausente NO deja línea en blanco: se omite entera.
        for cab in ("accept", "content-md5", "content-type", "date"):
            if cab in h:
                partes.append(h[cab])
        for nombre in sorted(declaradas):
            if nombre not in h:
                return f"firmó «{nombre}» pero no la envió"
            partes.append(f"{nombre}:{h[nombre].strip()}")
        cadena = "\n".join(partes) + "\n" + self.path

        esperada = base64.b64encode(
            hmac.new(CFG["app_secret"].encode(), cadena.encode(), hashlib.sha256).digest()).decode()

        if h.get("x-ca-key") != CFG["app_key"]:
            return f"appKey no coincide (llegó «{h.get('x-ca-key')}»)"
        if h.get("x-ca-signature") != esperada:
            return f"la firma no cuadra. Cadena esperada: {cadena!r}"
        if "content-md5" in h:
            real = base64.b64encode(hashlib.md5(cuerpo.encode()).digest()).decode()
            if h["content-md5"] != real:
                return "Content-MD5 incorrecto"
        if h.get("userid") != CFG["user_id"]:
            return f"cabecera userId ausente o distinta (llegó «{h.get('userid')}»)"
        return None

    # ── POST: la OpenAPI ─────────────────────────────────────────────────
    def do_POST(self):
        cuerpo = self.rfile.read(int(self.headers.get("Content-Length") or 0)).decode()
        diagnostico["peticiones"].append(self.path)

        problema = self._verificar_firma(cuerpo)
        if problema:
            diagnostico["firmas_mal"].append({"ruta": self.path, "motivo": problema})
            print(f"  ✗ {self.path} → {problema}", flush=True)
            # El real distingue 401 (credencial) de 403 (permiso); se imita.
            code = 403 if "userId" in problema else 401
            return self._responder(code, {"code": "0x02401004", "msg": problema})

        diagnostico["firmas_ok"] += 1
        print(f"  ✓ {self.path}", flush=True)
        req = json.loads(cuerpo) if cuerpo else {}

        if self.path == "/artemis/api/resource/v1/cameras":
            n, t = int(req.get("pageNo", 1)), int(req.get("pageSize", 10))
            return self._responder(200, {"code": "0", "msg": "Success", "data": {
                "total": len(CFG["camaras"]), "pageNo": n, "pageSize": t,
                "list": CFG["camaras"][(n - 1) * t: n * t]}})

        if self.path == "/artemis/api/video/v2/cameras/previewURLs":
            return self._preview(req, v1=False)

        if self.path == "/artemis/api/video/v1/cameras/previewURLs":
            return self._preview(req, v1=True)

        if self.path == "/artemis/api/video/v1/ptzs/controlling":
            return self._ptz(req)

        return self._responder(404, {"code": "0x02404", "msg": "Not found"})

    def _preview(self, req, v1):
        """
        URL de video. Las dos versiones del endpoint existen de verdad y NO son
        intercambiables:

        - v2 (§5.4.13) es por LOTES y responde «data.list[0].url».
        - v1 (§5.4.12) es de una cámara y responde «data.url», y es la única que
          lleva «requestWebsocketProtocol» en el cuerpo — obligatorio cuando
          protocol es «websocket».

        El simulador devolvía la forma de la v1 para la v2, reproduciendo mi
        lectura equivocada del manual: por eso nunca detectó el fallo y lo
        encontró el HikCentral real.

        Sobre la v2 con protocol «websocket»: aquí se rechaza, porque es lo que
        se deduce de que el campo obligatorio no exista en su cuerpo. Eso es una
        DEDUCCIÓN del manual, no algo comprobado contra hardware — lo que esta
        regla protege de verdad es que el driver no vuelva a pedir websocket por
        la v2. Confirmar qué hace el HikCentral real en ese caso está pendiente.
        """
        cod = req.get("cameraIndexCodes") or req.get("cameraIndexCode")
        if not any(c["cameraIndexCode"] == cod for c in CFG["camaras"]):
            return self._responder(200, {"code": "0x02100003", "msg": "Camera does not exist"})

        protocolo = (req.get("protocol") or "rtsp").lower()
        base = CFG["url_publica"].rstrip("/")

        if protocolo in ("websocket", "websocket_s"):
            if not v1:
                return self._responder(200, {"code": "0x00000002", "msg":
                    "websocket requires requestWebsocketProtocol, absent from the v2 request body"})
            if protocolo == "websocket" and req.get("requestWebsocketProtocol") not in (0, 1):
                return self._responder(200, {"code": "0x00000002", "msg":
                    "requestWebsocketProtocol is required when protocol is websocket"})
            # wss cuando lo pide el campo, o cuando el nombre ya dice seguro.
            seguro = protocolo == "websocket_s" or req.get("requestWebsocketProtocol") == 1
            host = base.split("://", 1)[-1]
            url = f"{'wss' if seguro else 'ws'}://{host}/ws/{cod}?token=simulado"
            return self._responder(200, self._forma(v1, url))

        # RTSP: no se reproduce en un navegador. En SECAD va al gateway de medios
        # del nodo edge, que lo republica por WebRTC. Se devuelve con el marcador
        # «[sms:preview]» que antepone el HikCentral real cuando el stream sale
        # por un servidor de medios, para comprobar que el driver lo quita.
        if protocolo in ("rtsp", "rtsp_s"):
            destino = CFG.get("rtsp_destino") or f"rtsp://127.0.0.1:8554/{cod}"
            return self._responder(200, self._forma(v1, f"[sms:preview]{destino}"))

        # El real falla así cuando piden HLS de un main stream en H.265.
        if protocolo.startswith("hls") and int(req.get("streamType", 0)) != 1:
            return self._responder(200, {"code": "0", "msg": "Success",
                                         "data": {"list": []} if not v1 else {}})

        return self._responder(
            200, self._forma(v1, f"{base}/hls/{cod}_{req.get('streamType')}.m3u8"))

    @staticmethod
    def _forma(v1, url):
        """La v1 devuelve la URL suelta; la v2, una lista."""
        nodo = {"url": url, "authentication": "token-de-prueba"}
        return {"code": "0", "msg": "Success",
                "data": nodo if v1 else {"list": [nodo]}}

    def _ptz(self, req):
        """
        Control PTZ. Valida el cuerpo con los límites del manual y anota cada
        comando con su hora, para que una prueba pueda comprobar lo que de
        verdad importa: que a un arranque (action 0) le sigue SIEMPRE una
        parada (action 1), y cuánto tiempo pasó entre los dos.

        Los códigos de error de abajo son representativos, no literales: el
        número exacto varía entre versiones del gateway. Lo que se está
        verificando es que el driver trate como fallo cualquier código que no
        sea «0», no que sepa traducir un número concreto.
        """
        cod     = req.get("cameraIndexCode")
        comando = (req.get("command") or "").upper()
        accion  = req.get("action")

        camara = next((c for c in CFG["camaras"] if c["cameraIndexCode"] == cod), None)
        diagnostico["ptz"].append({
            "camara": cod, "command": comando, "action": accion,
            "speed": req.get("speed"), "presetIndex": req.get("presetIndex"),
            "patrolIndex": req.get("patrolIndex"), "t": round(time.monotonic(), 4),
        })

        if camara is None:
            return self._responder(200, {"code": "0x02100003", "msg": "Camera does not exist"})
        if comando not in PTZ_COMANDOS:
            return self._responder(200, {"code": "0x00000002", "msg": f"Invalid command: {comando}"})
        if accion not in (0, 1):
            return self._responder(200, {"code": "0x00000002", "msg": "action must be 0 or 1"})

        # Una cámara fija no se mueve: el gateway lo rechaza, no lo ignora.
        # Que esto salte significa que SECAD dejó pasar una cámara sin PTZ.
        if "ptz" not in [x.strip().lower() for x in camara.get("capabilitySet", "").split(",")]:
            return self._responder(200, {"code": "0x02100005", "msg": "Camera does not support PTZ"})

        vel = req.get("speed")
        if vel is not None and not (20 <= int(vel) <= 60):
            return self._responder(200, {"code": "0x00000002", "msg": f"speed out of range: {vel}"})
        if comando == "GOTO_PRESET" and not (isinstance(req.get("presetIndex"), int)
                                             and 1 <= req["presetIndex"] <= 256):
            return self._responder(200, {"code": "0x00000002", "msg": "presetIndex must be 1..256"})
        if comando == "RUN_PATROL" and not (isinstance(req.get("patrolIndex"), int)
                                            and 1 <= req["patrolIndex"] <= 8):
            return self._responder(200, {"code": "0x00000002", "msg": "patrolIndex must be 1..8"})

        # §4.4.5: la operación es asíncrona; el gateway confirma que la aceptó,
        # no que la cámara ya llegó.
        return self._responder(200, {"code": "0", "msg": "Success", "data": None})

    # ── GET: HLS de prueba y diagnóstico ─────────────────────────────────
    def do_GET(self):
        if self.path.startswith("/hls/") and self.path.endswith(".m3u8"):
            diagnostico["hls"].append(self.path)
            base = self.path[len("/hls/"):-len(".m3u8")]
            m3u8 = ("#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:2\n"
                    "#EXT-X-MEDIA-SEQUENCE:0\n"
                    f"#EXTINF:2.0,\n{base}_0.ts\n#EXTINF:2.0,\n{base}_1.ts\n")
            return self._responder(200, m3u8.encode(), "application/vnd.apple.mpegurl")

        if self.path.startswith("/hls/") and self.path.endswith(".ts"):
            diagnostico["hls"].append(self.path)
            # Segmento vacío: el reproductor lo descarga y no puede decodificar.
            return self._responder(200, b"", "video/mp2t")

        if self.path == "/__reset":
            diagnostico.update({"firmas_ok": 0, "firmas_mal": [], "peticiones": [], "hls": [], "ptz": []})
            return self._responder(200, {"ok": True})

        if self.path == "/__diagnostico":
            return self._responder(200, diagnostico)

        return self._responder(404, {"msg": "Not found"})


def main():
    ap = argparse.ArgumentParser(description="Simulador de HikCentral OpenAPI para probar SECAD.")
    ap.add_argument("--puerto", type=int, default=5610)
    ap.add_argument("--app-key", default="AK-simulador")
    ap.add_argument("--app-secret", default="SK-simulador")
    ap.add_argument("--user-id", default="svc_secad_cctv")
    ap.add_argument("--camaras", help="JSON con la lista de cámaras a reportar.")
    ap.add_argument("--rtsp-destino", default=None,
                    help="URL RTSP que se devuelve con protocol=rtsp/rtsp_s. Por defecto "
                         "rtsp://127.0.0.1:8554/<codigo>.")
    ap.add_argument("--url-publica", default=None,
                    help="Base con la que se arma la URL de video que recibe el navegador. "
                         "Por defecto http://127.0.0.1:<puerto>; póngala si el navegador "
                         "llega al simulador por otra dirección.")
    a = ap.parse_args()

    CFG.update(app_key=a.app_key, app_secret=a.app_secret, user_id=a.user_id,
               camaras=json.load(open(a.camaras, encoding="utf-8")) if a.camaras else CAMARAS_DEMO,
               rtsp_destino=a.rtsp_destino,
               url_publica=a.url_publica or f"http://127.0.0.1:{a.puerto}")

    print(f"Simulador de HikCentral en http://0.0.0.0:{a.puerto}")
    print(f"  AppKey      : {a.app_key}")
    print(f"  AppSecret   : {a.app_secret}")
    print(f"  userId      : {a.user_id}")
    print(f"  cámaras     : {len(CFG['camaras'])}")
    print(f"  URL de video: {CFG['url_publica']}/hls/...")
    print("\nRegistre en SECAD → Hub de Integraciones → Cámaras (VMS):")
    print(f"  URL del HikCentral = http://<este-host>:{a.puerto}")
    print("  y pulse «Probar»: debe reportar las cámaras de arriba.\n")
    try:
        ThreadingHTTPServer(("0.0.0.0", a.puerto), Handler).serve_forever()
    except KeyboardInterrupt:
        print("\nDetenido.")
        sys.exit(0)


if __name__ == "__main__":
    main()
