#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Probar la OpenAPI de HikCentral sin levantar SECAD.

Para qué sirve
──────────────
Cuando la integración no funciona, hay tres cosas que pueden estar mal y se
confunden entre sí: la red (no llego al servidor), las credenciales (la firma
no cuadra) o SECAD. Este script deja fuera a SECAD: se ejecuta en cualquier
máquina que alcance el HikCentral, firma igual que el driver y dice qué
respondió el VMS.

Si este script lista cámaras, el problema está en SECAD. Si no, el problema
está antes y no vale la pena tocar SECAD todavía.

Uso
───
    python3 scripts/hikcentral_probar.py \
        --url https://192.168.1.50:443 \
        --app-key AK... --app-secret SK... --user-id svc_secad_cctv

    # y para probar el video de una cámara concreta
    python3 scripts/hikcentral_probar.py --url ... --app-key ... \
        --app-secret ... --user-id ... --camara 103

No necesita instalar nada: solo la biblioteca estándar de Python 3.

La firma es la §3.2 del Developer Guide, la misma que implementa
`HikSignature.cs`. Si cambia una, hay que cambiar la otra.
"""

import argparse
import base64
import hashlib
import hmac
import json
import ssl
import sys
import time
import urllib.error
import urllib.request
import uuid

CONTENT_TYPE = "application/json;charset=UTF-8"
ACCEPT       = "application/json"

RUTA_CAMARAS = "/artemis/api/resource/v1/cameras"
RUTA_PREVIEW = "/artemis/api/video/v2/cameras/previewURLs"

# El gateway excluye estas del cálculo aunque se envíen. Firmar una produce un
# 401 que no dice por qué.
NO_SE_FIRMAN = {
    "x-ca-signature", "x-ca-signature-headers", "accept", "content-md5",
    "content-type", "date", "content-length", "server", "connection",
    "host", "transfer-encoding", "x-application-context", "content-encoding",
}


def firmables(cabeceras):
    """Nombre en minúscula, valor recortado, orden alfabético."""
    return sorted(
        ((k.lower(), (v or "").strip()) for k, v in cabeceras.items()
         if k.lower() not in NO_SE_FIRMAN),
        key=lambda kv: kv[0],
    )


def cadena_a_firmar(metodo, accept, content_md5, content_type, date, cabeceras, uri):
    """
    MÉTODO \n Accept \n Content-MD5 \n Content-Type \n Date \n
    cabeceras-firmadas
    URI

    Una cabecera ausente OMITE su línea entera; no deja una línea vacía.
    """
    partes = [metodo.upper() + "\n"]
    for valor in (accept, content_md5, content_type, date):
        if valor is not None:
            partes.append(valor + "\n")
    for k, v in firmables(cabeceras):
        partes.append(f"{k}:{v}\n")
    partes.append(uri)
    return "".join(partes)


def firmar(cadena, app_secret):
    mac = hmac.new(app_secret.encode("utf-8"), cadena.encode("utf-8"), hashlib.sha256)
    return base64.b64encode(mac.digest()).decode("ascii")


def llamar(base_url, ruta, cuerpo, app_key, app_secret, user_id,
           inseguro=True, timeout=15, verboso=False):
    cuerpo_json = json.dumps(cuerpo, separators=(",", ":"))

    firmadas = {
        "x-ca-key":       app_key,
        "x-ca-timestamp": str(int(time.time() * 1000)),
        "x-ca-nonce":     str(uuid.uuid4()),
        "userid":         user_id,
    }
    cadena = cadena_a_firmar("POST", ACCEPT, None, CONTENT_TYPE, None, firmadas, ruta)
    firma  = firmar(cadena, app_secret)

    if verboso:
        print("── cadena firmada ──")
        print(cadena.replace("\n", "\\n\n"))
        print("── firma ──")
        print(firma, "\n")

    cabeceras = {
        "Accept":                 ACCEPT,
        "Content-Type":           CONTENT_TYPE,
        "X-Ca-Key":               app_key,
        "X-Ca-Signature":         firma,
        "X-Ca-Signature-Headers": ",".join(k for k, _ in firmables(firmadas)),
    }
    for k, v in firmadas.items():
        if k != "x-ca-key":
            cabeceras[k] = v

    req = urllib.request.Request(
        base_url.rstrip("/") + ruta,
        data=cuerpo_json.encode("utf-8"),
        headers=cabeceras,
        method="POST",
    )

    # El HikCentral se instala con certificado autofirmado. SECAD hace lo mismo
    # (Vms:AceptarCertificadoPropio) porque los institucionales también lo son.
    ctx = ssl._create_unverified_context() if inseguro else None

    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except urllib.error.URLError as e:
        return None, f"{type(e.reason).__name__}: {e.reason}"


# Códigos del apéndice A.4 del Developer Guide. Traducirlos ahorra la mitad
# del tiempo de depuración: casi todos se confunden con "no conecta".
CODIGOS = {
    "0":          "Correcto.",
    "0x02401000": "No se envió AppKey.",
    "0x02401001": "El AppKey no corresponde a ningún Partner. ¿Se copió completo? ¿El Partner existe?",
    "0x02401002": "No se envió firma.",
    "0x02401003": "Firma inválida: el AppSecret no corresponde, o la cadena firmada no cuadra.",
    "0x02401004": "Falló la autenticación del token.",
    "0x02401007": "Sin permisos. El usuario del Partner no tiene acceso a lo que se pidió.",
    "0x02401008": "Excepción de autenticación: revisar el servicio del gateway.",
    "0x02401009": "Se alcanzó el máximo de llamadas permitidas al API.",
    "0x00072001": "Faltan parámetros obligatorios en la petición.",
    "0x00072004": "La respuesta es demasiado larga: hay que reducir el pageSize.",
    "0x00052104": "El servicio no está disponible. Revisar que los servicios de la plataforma estén arriba.",
    "0x00072201": "Sin permiso sobre el recurso. Hay que dar acceso a las cámaras al usuario del Partner.",
    "0x00072202": "El recurso no existe: ese cameraIndexCode no está en la plataforma.",
    "0x00072203": "Se alcanzó el máximo de licencias.",
    "0x00072204": "La licencia no habilita esta función. Revisar Third-Party Integration en License Details.",
    "64":         "Autenticación de usuario fallida. Es lo que responde el gateway a una petición sin "
                  "credenciales válidas; con AppKey/AppSecret correctos no debería aparecer.",
    "69":         "La API existe y las credenciales son válidas, pero ESTA api no está autorizada al "
                  "Partner. Web Client → OpenAPI Gateway → Basic Configuration → editar el Partner → "
                  "Authorized APIs, y marcar la que falta (ojo: hay versiones v1 y v2 del mismo "
                  "endpoint; el driver usa video/v2/cameras/previewURLs).",
}


def explicar_codigo(codigo, msg):
    detalle = CODIGOS.get(str(codigo))
    linea = f"code={codigo} msg={msg}"
    return f"{linea}\n  → {detalle}" if detalle else linea


def explicar(estado, texto):
    """Traduce el fallo a lo que hay que revisar."""
    if estado is None:
        return ("No hubo respuesta: el servidor no es alcanzable desde esta máquina.\n"
                "  · ¿La IP y el puerto son los correctos?\n"
                "  · ¿El firewall de Windows deja pasar el 443?\n"
                "  · ¿Estás en la misma red que el HikCentral?")
    if estado == 200:
        return ("El servidor respondió 200 pero con un código de error: mira el code.")
    if estado == 401:
        return ("401: el gateway rechazó la firma.\n"
                "  · AppKey/AppSecret equivocados, o el Partner quedó deshabilitado.\n"
                "  · Relojes desincronizados (x-ca-timestamp se usa como anti-replay).")
    if estado == 403:
        return ("403: la firma se aceptó pero el usuario no tiene permiso.\n"
                "  · Revisa que el userId esté vinculado al Partner y tenga acceso a las cámaras.")
    if estado == 404:
        return ("404: la ruta no existe en este servidor.\n"
                "  · ¿El componente de OpenAPI está instalado y el gateway encendido?")
    return f"HTTP {estado}."


def main():
    ap = argparse.ArgumentParser(description="Probar la OpenAPI de HikCentral.")
    ap.add_argument("--url",        required=True, help="https://IP:PUERTO del HikCentral")
    ap.add_argument("--app-key",    required=True)
    ap.add_argument("--app-secret", required=True)
    ap.add_argument("--user-id",    required=True, help="Usuario vinculado al Partner")
    ap.add_argument("--camara",     help="cameraIndexCode para pedir además la URL de video")
    ap.add_argument("--protocol",   default="hls_s",
                    help="hls_s (por defecto) | hls | rtsp_s | rtsp. Los rtsp son para el "
                         "camino de baja latencia: el navegador no los abre, los consume el "
                         "gateway de medios del nodo edge.")
    ap.add_argument("--stream-type", type=int, default=1, help="1 = sub-stream | 0 = main")
    ap.add_argument("--paginas",    type=int, default=1, help="Cuántas páginas de 20 listar")
    ap.add_argument("--verificar-tls", action="store_true",
                    help="Exigir certificado válido (por defecto se acepta el autofirmado)")
    ap.add_argument("-v", "--verboso", action="store_true", help="Mostrar la cadena firmada")
    ap.add_argument("--solo-url", action="store_true",
                    help="Imprimir ÚNICAMENTE la URL de video, para canalizarla "
                         "a otro comando. En PowerShell: ... --solo-url | Set-Clipboard")
    a = ap.parse_args()

    # Con --solo-url, stdout queda reservado para la URL: todo lo demás va a
    # stderr. Así la salida se puede canalizar sin arrastrar adornos, que es
    # justo donde se cuelan los errores al copiar a mano una URL de 400
    # caracteres.
    global print
    if a.solo_url:
        _print = print
        print = lambda *x, **k: _print(*x, **{**k, "file": sys.stderr})

    print(f"→ {a.url}{RUTA_CAMARAS}")
    total_listadas = 0
    primera = None

    for pagina in range(1, a.paginas + 1):
        estado, texto = llamar(
            a.url, RUTA_CAMARAS, {"pageNo": pagina, "pageSize": 20},
            a.app_key, a.app_secret, a.user_id,
            inseguro=not a.verificar_tls, verboso=a.verboso and pagina == 1)

        if estado != 200:
            print(f"\n✗ {explicar(estado, texto)}")
            if texto:
                print(f"\n  respuesta: {texto[:400]}")
            return 1

        try:
            cuerpo = json.loads(texto)
        except json.JSONDecodeError:
            print(f"\n✗ El servidor respondió 200 pero no es JSON:\n  {texto[:300]}")
            return 1

        if str(cuerpo.get("code")) != "0":
            print("\n✗ " + explicar_codigo(cuerpo.get("code"), cuerpo.get("msg")))
            print("\n  La plataforma respondió: el problema no es de red.")
            return 1

        datos = cuerpo.get("data") or {}
        lista = datos.get("list") or []
        if pagina == 1:
            print(f"\n✓ Conexión y firma correctas. Cámaras en el sistema: {datos.get('total')}\n")
            print(f"  {'cameraIndexCode':<40} {'estado':<10} nombre")
            print(f"  {'-'*40} {'-'*10} {'-'*30}")

        for c in lista:
            estado_cam = {1: "en línea", 0: "fuera"}.get(c.get("status"), str(c.get("status")))
            print(f"  {str(c.get('cameraIndexCode')):<40} {estado_cam:<10} {c.get('cameraName')}")
            primera = primera or c.get("cameraIndexCode")
        total_listadas += len(lista)
        if not lista:
            break

    if total_listadas == 0:
        print("\n⚠ La API respondió bien pero no hay ninguna cámara.")
        print("  Agrega al menos una en Device → Device y asígnala a un Area:")
        print("  sin cámaras el catálogo de SECAD llegaría vacío.")
        return 0

    codigo = a.camara or primera
    print(f"\n→ URL de video de {codigo} (protocol={a.protocol}, streamType={a.stream_type})")
    estado, texto = llamar(
        a.url, RUTA_PREVIEW,
        {"cameraIndexCodes": codigo, "cameraIndexCode": codigo,
         "streamType": a.stream_type, "protocol": a.protocol, "transmode": 1},
        a.app_key, a.app_secret, a.user_id, inseguro=not a.verificar_tls)

    if estado != 200:
        print(f"✗ {explicar(estado, texto)}\n  respuesta: {texto[:300]}")
        return 1

    cuerpo = json.loads(texto)
    if str(cuerpo.get("code")) != "0":
        print("✗ " + explicar_codigo(cuerpo.get("code"), cuerpo.get("msg")))
        # El aviso de hls_s solo aplica a errores de PARÁMETRO. Mostrarlo ante un
        # problema de permisos manda a cambiar algo que no tiene nada que ver.
        if a.protocol == "hls_s" and str(cuerpo.get("code")) in ("0x00072002", "0x00072003"):
            print("  hls_s solo existe desde la OpenAPI V3.1.1: en un servidor 3.1.0, --protocol hls.")
        return 1

    # La v2 es por lotes: data.list[0].url. La v1 devolvía data.url.
    data = cuerpo.get("data") or {}
    nodo = (data.get("list") or [{}])[0] if isinstance(data.get("list"), list) else data
    url = nodo.get("url")
    if url and url.startswith("[") and "]" in url:
        url = url.split("]", 1)[1]          # quita marcadores tipo [sms:preview]
    if not url:
        print("✗ El VMS respondió correctamente pero sin URL.")
        print(f"  respuesta cruda: {texto[:300]}")
        return 1
    if a.solo_url:
        sys.stdout.write(url + "\n")
    else:
        print(f"✓ {url}")
    if nodo.get("authentication"):
        print("  (trae además un campo 'authentication' para el stream)")
    if a.protocol.startswith("rtsp"):
        # Con RTSP la URL NO es para el navegador, y confundirlo es el error más
        # fácil de cometer aquí. Se dice qué hacer con ella.
        print("\n  Esa URL es RTSP: NINGÚN navegador la abre. La consume el gateway de")
        print("  medios (MediaMTX) del nodo edge, que la republica por WebRTC.")
        print("\n  Antes de configurar nada en SECAD, compruebe que se puede ver:")
        print("    • Ábrala en VLC: Medio → Abrir ubicación de red → pegue la URL.")
        print("    • Si VLC muestra imagen, el gateway también va a poder.")
        print("    • Si VLC pide usuario y contraseña, el gateway los va a necesitar")
        print("      igual: ahí es donde hay que mirar antes de seguir.")
    else:
        print("\n  Esa URL es la que el navegador del despachador tiene que poder abrir.")
        print("  Si el host que aparece ahí no es alcanzable desde el puesto de")
        print("  despacho, el video no se verá aunque la integración esté bien.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
