# Cámaras: qué hacer, en orden

> Este documento no explica por qué. Explica **qué hacer**. El porqué está en
> `CCTV_LATENCIA.md` y `CCTV_NODO_EDGE.md`.

---

## Lo primero, para quitarnos el enredo de encima

Hay **dos formas** de ver video en SECAD. La segunda es opcional y se añade
encima de la primera:

| | Qué necesita | Retraso |
|---|---|---|
| **A. HLS** | Nada más que HikCentral | ~7 segundos |
| **B. Gateway** | Un programa más (MediaMTX) | casi nada |

**Si hoy ves video, ya tienes la A funcionando.** La B es un programa extra que
se instala al lado, y se activa cambiando un campo en la ficha de la
integración. Si algo sale mal, se devuelve el campo a `hls_s` y vuelves a la A.

**En desarrollo no hay «nodo edge».** El nodo edge es un servidor en la sede que
alcanza la red de cámaras. En tu PC, tu PC ya alcanza la red de cámaras: **tu PC
es el nodo edge**. Todo va en `localhost`.

---

# PARTE 1 — En tu equipo (desarrollo)

## Paso 0. Comprueba que la A sigue bien

Antes de tocar nada:

1. Levanta backend y frontend como siempre.
2. Abre un caso cerca de la cámara y ábrela en el tab de Cámaras.
3. Tiene que verse, con su retraso de ~7 s.

Si esto no funciona, **para aquí**: arregla esto primero. Lo de abajo se monta
encima.

## Paso 1. Pídele a HikCentral la URL RTSP y compruébala en VLC

Este paso no toca SECAD. Sirve para saber si HikCentral te entrega un RTSP
utilizable, que es lo único de toda la cadena que no se puede saber por
adelantado.

```bash
python scripts/hikcentral_probar.py ^
  --url https://TU_IP:443 ^
  --app-key TU_APPKEY --app-secret TU_APPSECRET ^
  --user-id TU_USUARIO ^
  --camara EL_CODIGO_DE_TU_CAMARA ^
  --protocol rtsp_s
```

Te va a imprimir una URL que empieza por `rtsp://`. **Cópiala y ábrela en VLC**
(Medio → Abrir ubicación de red).

- **VLC muestra imagen** → sigue al paso 2.
- **VLC pide usuario y contraseña** → anótalo: el gateway los va a necesitar
  igual. Prueba con el usuario del Partner de HikCentral.
- **VLC no muestra nada** → el problema es entre HikCentral y el RTSP, no es de
  SECAD. Revisa en HikCentral que la cámara tenga el stream habilitado.

> Si este paso falla, el camino B no va a funcionar y no tiene sentido seguir.
> Te quedas en HLS y no pierdes nada de lo que ya tienes.

## Paso 2. Instala MediaMTX en tu PC

1. Descarga el zip de Windows de `github.com/bluenviron/mediamtx/releases`
   (`mediamtx_vX.Y.Z_windows_amd64.zip`).
2. Descomprime en `C:\mediamtx`. Trae `mediamtx.exe` y `mediamtx.yml`.

## Paso 3. Reemplaza el `mediamtx.yml` por este

Para desarrollo, lo mínimo que funciona. Sin TLS y sin autorización: eso se
añade en el paso 6, cuando ya veas video.

```yaml
logLevel: info

api: true
apiAddress: 127.0.0.1:9997

webrtc: true
webrtcAddress: :8889
webrtcEncryption: false

rtsp: false
hls: false
rtmp: false
srt: false

paths: {}
```

Arráncalo en una consola aparte y déjalo abierto:

```
C:\mediamtx\mediamtx.exe
```

Tiene que decir `[WebRTC] started with listeners on :8889`. Si el puerto está
ocupado, cámbialo aquí y acuérdate de cambiarlo también en el paso 5.

## Paso 4. Deja pasar el gateway en la CSP del frontend

En `src/index.html`, dentro de `connect-src`, agrega `http://localhost:8889`:

```
connect-src 'self' ... http://localhost:8889 ...
```

Sin esto el navegador bloquea la conexión y el error no dice por qué. Reinicia
`ng serve` después de cambiarlo.

## Paso 5. Cambia la ficha de la integración en SECAD

Hub de Integraciones → tu integración de cámaras → editar:

| Campo | Valor |
|---|---|
| Protocolo de video | `rtsp_s` |
| URL del gateway de medios | `http://localhost:8889` |
| API del gateway de medios | `http://127.0.0.1:9997` |

Guarda. **No hace falta sincronizar de nuevo**: las cámaras ya están.

## Paso 6. Abre la cámara

Abre el caso y la cámara. Debe verse **casi sin retraso** — mueve la mano frente
a la cámara y compruébalo.

Si se ve: ya tienes el camino B funcionando en desarrollo.

## Paso 7. Ahora sí, enciende la autorización

Hasta aquí cualquiera que llegue al 8889 puede ver las cámaras. Añade al
`mediamtx.yml`:

```yaml
authMethod: http
authHTTPAddress: http://localhost:5224/api/Camaras/gateway/autorizar
authHTTPExclude:
  - action: api
  - action: publish
```

(`5224` es el puerto de tu backend; ajústalo si usas otro.)

Reinicia MediaMTX y vuelve a abrir la cámara. **Tiene que seguir viéndose.** Y
ahora, en la base de datos del CAD:

```sql
SELECT camara_codigo, usuario, accion, fecha
FROM   cad_camaras_visualizacion
WHERE  accion = 'VER_GATEWAY'
ORDER  BY fecha DESC LIMIT 5;
```

Si aparecen filas, la autorización está funcionando: el gateway le preguntó a
SECAD y SECAD dijo sí, y quedó registrado.

Para comprobar que también sabe decir **no**, pega la URL WebRTC en otra pestaña
sin token — no debe entregar video.

## Cuando algo no funciona en desarrollo

| Síntoma | Dónde mirar |
|---|---|
| El video no carga y la consola del navegador habla de CSP | falta el paso 4 |
| «No se pudo contactar el servidor de video» | MediaMTX no está corriendo, o el puerto no es el del paso 3 |
| «El servidor de video rechazó la autorización» | el paso 7: el backend no está en el puerto que dice `authHTTPAddress` |
| «source of path … has timed out» | MediaMTX no pudo tirar del RTSP. Vuelve al paso 1 y prueba en VLC |
| Se ve, pero con los mismos 7 segundos | la ficha quedó en `hls_s`; revisa el paso 5 |

---

# PARTE 2 — En producción

Es lo mismo, con tres diferencias que vienen de que ahí sí hay una red de verdad
en medio.

## Dónde va MediaMTX

**En el nodo edge de la sede**, no en el servidor central de Bogotá. El nodo
edge es el que alcanza la red de cámaras.

## Las tres diferencias

### 1. Tiene que ir por HTTPS

SECAD en producción se sirve por HTTPS. Un navegador **no deja** que una página
HTTPS abra una conexión HTTP: lo bloquea como «contenido mixto» y no explica
nada. En desarrollo no pasa porque `localhost` está exento.

```yaml
webrtcEncryption: true
webrtcServerKey:  /opt/secad/certs/edge.key
webrtcServerCert: /opt/secad/certs/edge.crt
```

Y en la CSP va el host real, no localhost:
```
connect-src 'self' ... https://edge-tunja.policia.gov.co:8889
```

### 2. El nodo edge tiene dos tarjetas de red, y eso rompe WebRTC

Es lo que define al nodo edge: una pata en la red de cámaras y otra en la
institucional. Pero WebRTC funciona diciéndole al navegador *«conéctate a mi
IP»*, y por defecto le manda **todas** sus IPs — incluida la de la red de
cámaras, a la que el despachador no llega. El video no conecta.

```yaml
webrtcIPsFromInterfaces: false
webrtcAdditionalHosts: [edge-tunja.policia.gov.co]
```

### 3. Puertos en el firewall

| Puerto | Desde dónde | Para qué |
|---|---|---|
| 8889 TCP | puestos de despacho → edge | el saludo inicial |
| 8189 UDP | puestos de despacho → edge | el video |
| 9997 | **solo el servidor de SECAD** | la API de control |

Si la política de red bloquea UDP —pasa a menudo—, habilita el respaldo:
```yaml
webrtcLocalTCPAddress: :8189
```

> **El 9997 no debe salir de la sede nunca.** Con él se puede apuntar cualquier
> ruta del gateway a cualquier cámara. Solo lo usa el backend de SECAD.

## El `mediamtx.yml` de producción, completo

```yaml
logLevel: info

authMethod: http
authHTTPAddress: https://secad.policia.gov.co/api/Camaras/gateway/autorizar
authHTTPExclude:
  - action: api
  - action: publish

api: true
apiAddress: 127.0.0.1:9997

webrtc: true
webrtcAddress: :8889
webrtcEncryption: true
webrtcServerKey:  /opt/secad/certs/edge.key
webrtcServerCert: /opt/secad/certs/edge.crt
webrtcIPsFromInterfaces: false
webrtcAdditionalHosts: [edge-tunja.policia.gov.co]

rtsp: false
hls: false
rtmp: false
srt: false

paths: {}
```

Como servicio, para que arranque solo:

```bash
docker run -d --name mediamtx --restart unless-stopped --network host \
  -v /opt/secad/mediamtx.yml:/mediamtx.yml:ro \
  -v /opt/secad/certs:/opt/secad/certs:ro \
  bluenviron/mediamtx:latest
```

## Y en la ficha de SECAD

| Campo | Valor |
|---|---|
| Protocolo de video | `rtsp_s` |
| URL del gateway de medios | `https://edge-tunja.policia.gov.co:8889` (lo que ve el **navegador**) |
| API del gateway de medios | `http://IP-DEL-EDGE:9997` (lo que ve el **servidor**) |

## Orden de despliegue recomendado

1. Monta el edge y deja la integración en `hls_s`. Comprueba que se ve video
   como hasta ahora.
2. Instala MediaMTX **sin** `authMethod: http`. Cambia la ficha a `rtsp_s`.
   Comprueba que se ve con baja latencia.
3. Enciende `authMethod: http`. Comprueba que se sigue viendo y que aparecen las
   filas `VER_GATEWAY` en la auditoría.

Un paso a la vez. Si el 2 falla, el 1 sigue funcionando; si el 3 falla, vuelves
al 2 quitando cuatro líneas.

---

## Un municipio SIN HikCentral

Si el municipio no tiene VMS central sino un NVR o cámaras sueltas, el gateway es
el mismo y los pasos de arriba no cambian. Lo único distinto es la ficha de la
integración, que usa el driver genérico por RTSP. Ver
`CCTV_DRIVER_RTSP_GENERICO.md`.
