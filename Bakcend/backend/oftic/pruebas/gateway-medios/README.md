# Banco de pruebas del gateway de medios (video de baja latencia)

Monta la ruta de video por WebRTC completa —**MediaMTX real, navegador real, API
de SECAD real, PostgreSQL real**— y mide la latencia con exactitud. Lo único
falso es la cámara.

## Por qué existe

El HLS de HikCentral llega con ~7 s de retraso. Con el control PTZ eso deja de
ser una molestia: el operador corrige contra una imagen de hace siete segundos y
se pasa de largo. La alternativa es que el gateway del nodo edge tome el RTSP del
VMS y lo republique por WebRTC.

Eso hay que **medirlo**, no estimarlo, porque de la medida depende una decisión
de arquitectura. Y hay que probar el control de acceso, porque el video sale por
un puerto nuevo que antes no existía.

## Cómo mide la latencia, sin OCR ni relojes sincronizados

La cámara falsa lleva un **contador binario de 10 bits** quemado en la imagen:
diez recuadros, blanco = 1. Dos lectores leen los mismos recuadros:

1. El **navegador**, con una canvas, dentro de la página (`pagina_whep.html`).
2. Un **lector de referencia** (`referencia.py`) que lee el mismo stream por
   RTSP con `-fflags nobuffer -flags low_delay`, y anota a qué hora de pared
   llegó cada contador.

La latencia es la diferencia. No hace falta leer texto con OCR ni sincronizar
relojes: los dos números vienen del mismo contador y de la misma máquina. Con
1024 valores a 25 fps el contador no se repite en 41 s, así que no hay ambigüedad.

## Lo que se midió (MediaMTX v1.21.1, Chromium 1194)

| | |
|---|---|
| Latencia del navegador frente al lector de referencia | **+11 ms** (mediana de 40 muestras; 40/40 emparejadas) |
| Búfer de jitter del navegador | 7 ms por fotograma |
| Paquetes perdidos | 0 de 332 fotogramas |

O sea: **el transporte WebRTC no añade latencia apreciable**. Frente a los 5-7 s
que el HLS impone por su estructura de segmentos, la diferencia no es de grado.

Lo que esto **no** dice, y conviene no confundir:

- Todo corre en una máquina: no hay salto de red. En la LAN de una sede hay que
  sumar unos milisegundos, no segundos.
- La cámara falsa codifica con `-tune zerolatency`. El codificador del
  HikCentral añade su propio retraso, que no está medido aquí.
- El códec de la prueba es **VP8**, no H264: la Chromium de este contenedor no
  trae H264 para WebRTC (`RTCRtpReceiver.getCapabilities('video')` devuelve
  VP8/VP9/AV1). El Chrome de un puesto de despacho sí lo trae, y MediaMTX pasa
  el H264 tal cual sin transcodificar, así que si algo es más barato, no más caro.

## Lo que encontró que no se veía leyendo el código

- **El endpoint de autorización reventaba con «TenantContext no ha sido
  inicializado».** La petición la hace el gateway, no un navegador con sesión,
  así que no trae JWT y `TenantMiddleware` no puede resolver el CAD. Se arregló
  metiendo el CAD dentro del token firmado y resolviéndolo a mano
  (`ResolutorTenant`). Una prueba con el gateway simulado no lo habría
  encontrado.
- **El contrato de `authHTTPAddress` está observado, no supuesto:** se registró
  literalmente lo que MediaMTX envía. Ver `DtoGatewayAutorizacion`.
- **`POST /v3/config/paths/add/{ruta}` no es idempotente**: da 400 si la ruta ya
  existe. Por eso el backend hace primero `PATCH` y solo crea si da 404.

## Qué comprueba `extremo_a_extremo.mjs`

| # | |
|---|---|
| 1 | Con el token que emite SECAD, el video llega y se decodifica |
| 2 | **Sin** token, el gateway no sirve video —porque SECAD le dice que no— |
| 3 | Con un token válido pero **de otra cámara**, tampoco |

Los casos 2 y 3 son el control de acceso. Sin ellos, cualquiera que alcanzara el
puerto del gateway vería cualquier cámara registrada, saltándose entero el
control que SECAD hace al entregar la URL.

## Cómo se corre

```bash
# 1. El banco (MediaMTX + cámara falsa + lector de referencia + servidor)
./montar_banco.sh

# 2. El simulador de HikCentral, devolviendo el RTSP del banco
python3 scripts/hikcentral_simulador.py --puerto 5610 \
  --rtsp-destino rtsp://127.0.0.1:8554/origen-vp8

# 3. La API de SECAD contra una base de pruebas, y una integración con
#    protocol=rtsp_s, gatewayUrl=http://127.0.0.1:8889,
#    gatewayApiUrl=http://127.0.0.1:9997

# 4. Un token de gateway, pidiendo el stream de una cámara:
curl -s "$API/api/Camaras/1003/stream" -H "Authorization: Bearer $JWT" \
  | python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["autenticacion"])' \
  > /tmp/banco-gateway/tokengw.txt

# 5. Las pruebas
node medir_latencia.mjs       # latencia
node extremo_a_extremo.mjs    # control de acceso
```

Hace falta `playwright-core` y la Chromium del entorno
(`/opt/pw-browsers/chromium-*/chrome-linux/chrome`).

> **Un detalle del banco que NO aplica en producción:** aquí la «cámara» es otra
> ruta del propio MediaMTX, así que al tirar del origen se pide permiso a sí
> mismo y SECAD se lo niega. De ahí las exclusiones de `read` sobre `origen*` en
> `mediamtx.prueba.yml`. En un despliegue real la fuente es el RTSP del
> HikCentral, que es externo, y esas exclusiones no van.
