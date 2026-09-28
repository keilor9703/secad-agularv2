# La latencia del video, y las dos formas de bajarla

> **Por qué importa ahora:** con el PTZ dentro, el retraso dejó de ser una
> molestia y pasó a ser un problema de uso. Mirar una cámara con 7 segundos de
> retraso no cambia ninguna decisión; **moverla** sí: el operador corrige contra
> una imagen de hace siete segundos, se pasa de largo, corrige al revés y
> termina persiguiendo la escena.

---

## 1. De dónde salen los 7 segundos

Medido contra el HikCentral real, no estimado. El manifiesto que entrega dice:

```
#EXT-X-TARGETDURATION:2
#EXTINF:1.664
```

| Sumando | Tiempo |
|---|---|
| Cerrar el segmento en curso antes de poder publicarlo | ~1,7 s |
| Búfer del reproductor: 3 segmentos (`liveSyncDurationCount: 3`) | ~5,0 s |
| Red y decodificación | ~0,5 s |
| **Total** | **~7 s** |

Es inherente a HLS, no un defecto de la configuración. Bajar
`liveSyncDurationCount` a 2 ya se probó: el reproductor se pega tanto al borde
de la emisión que consume más rápido de lo que el VMS publica y **el video se
congela cada segundo**. Ese ajuste está descartado con evidencia, no por
opinión.

**Conclusión: con HLS no se baja de ~5-7 s.** Para llegar a 1-3 s hay que
cambiar de transporte, y ahí hay exactamente dos caminos.

---

## 2. Camino A — jsDecoder de Hikvision (WebSocket)

El VMS entrega una URL `ws://` o `wss://` y un decodificador propietario pinta
los fotogramas en un canvas del navegador.

**Lo que ya está hecho y verificado:**

- El backend pide la URL correctamente. Tiene un detalle que no es obvio:
  **hay que usar la v1 del endpoint**, no la v2. `requestWebsocketProtocol`
  (0-ws, 1-wss) es obligatorio cuando `protocol` es `websocket`, y solo existe
  en el cuerpo de `/artemis/api/video/v1/cameras/previewURLs` (§5.4.12); la v2
  (§5.4.13) no lo lleva.
- El enrutado por nodo edge respeta la familia del esquema: un `ws://` detrás de
  un edge con TLS sale como `wss://`, no como `https://`. Con la regla anterior
  —copiar el esquema del edge— la conexión no se habría abierto nunca.
- El backend le dice al navegador **qué reproductor** hace falta, en lugar de
  dejar que lo adivine mirando la URL.
- El visor cambia al lienzo del jsDecoder y, si no está instalado, **dice qué
  falta y qué hacer**, en vez de dejar un rectángulo negro.
- La CSP no estorba: `connect-src` ya permite `wss:` (ver
  `CCTV_ARQUITECTURA_Y_PRUEBAS.md`).

**Lo que falta, y no lo podemos resolver solos:**

1. **Los archivos del SDK y su manual.** El jsDecoder **no viene con la
   OpenAPI**: es un entregable aparte de Hikvision, «VMSPlatform Video JsDecoder
   SDK_Developer Guide». El Developer Guide de la OpenAPI solo documenta el *web
   plug-in* (`JS_CreateWnd`, `JS_Disconnect`…), que es otro componente y además
   exige instalar un `.exe` en cada equipo. Sin ese manual, la secuencia de
   llamadas sería una invención.
2. **Instalarlo en cada puesto de despacho.**

**Límites que hay que decir antes de prometer tiempos** (§4.4.4 del manual):

| | |
|---|---|
| Sistema operativo | **Solo Windows** 7/8/10 |
| Navegadores | Chrome 45+ o Firefox 52+ (el manual no menciona Edge) |
| Funciones | Solo vista en vivo y reproducción — el PTZ sigue por la OpenAPI |
| Ventaja extra | Admite **H.265**, así que no obliga al sub-stream |

---

## 3. Camino B — gateway de medios en el nodo edge (WebRTC) — **ELEGIDO E IMPLEMENTADO**

El nodo edge —que ya está en el diseño y hay que desplegar de todos modos— corre
un gateway (MediaMTX o go2rtc), toma el **RTSP** del HikCentral y lo republica
al navegador como **WebRTC**.

| | |
|---|---|
| Latencia | **0,5-1,5 s**, mejor que el jsDecoder |
| Navegadores | Todos los modernos, cualquier sistema operativo |
| Instalación en el puesto | **Ninguna** |
| Componente propietario | Ninguno — WebRTC es estándar y el gateway es software libre |
| Códecs | RTSP no tiene la restricción de H.264 que sí tiene HLS |
| Coste | Un servicio más que operar en cada edge, y el consumo de CPU del gateway |
| Encaje | El driver `ONVIF_RTSP` de SECAD **ya contempla** un gateway así |

El coste real no es técnico sino operativo: hay que desplegar, monitorizar y
actualizar un servicio más en cada sede. A cambio se quita de encima una
dependencia propietaria, el requisito de Windows y la instalación en cada
puesto.

### Medido, no estimado

Se montó el banco completo —MediaMTX real, navegador real, API de SECAD real,
PostgreSQL real; lo único falso es la cámara— y se midió con un contador binario
quemado en la imagen que leen a la vez el navegador y un lector de referencia por
RTSP. Sin OCR y sin sincronizar relojes. Detalle en
`Bakcend/backend/oftic/pruebas/gateway-medios/README.md`.

| | |
|---|---|
| Retraso del navegador frente al lector de referencia | **+11 ms** (mediana de 40 muestras) |
| Búfer de jitter del navegador | 7 ms por fotograma |
| Paquetes perdidos | 0 de 332 fotogramas |

**El transporte WebRTC no añade latencia apreciable.** Frente a los 5-7 s que HLS
impone por su estructura de segmentos, no es una diferencia de grado.

Lo que la medición no dice, y conviene no vender de más:

- Todo corría en una máquina: no hay salto de red. En la LAN de una sede se
  suman milisegundos, no segundos.
- El codificador del HikCentral añade su propio retraso, que no está medido.
- El códec del banco fue VP8 porque la Chromium del contenedor no trae H264 para
  WebRTC. El Chrome de un puesto sí, y MediaMTX pasa el H264 sin transcodificar.

### Cómo queda montado

```
HikCentral ──RTSP──► gateway (nodo edge) ──WebRTC/WHEP──► navegador
                          │
                          └──¿puede este token ver esta cámara?──► API de SECAD
```

1. El operador abre la cámara. SECAD le pide a HikCentral la URL **RTSP**
   (`protocol: rtsp_s`).
2. SECAD registra la ruta en el gateway por su API de control
   (`sourceOnDemand`: solo se conecta al VMS cuando alguien mira).
3. SECAD devuelve al navegador la URL **WHEP** y un **token firmado** de vida
   corta, atado a esa cámara, ese usuario y ese CAD.
4. El navegador abre el WebRTC. El gateway, antes de servir un solo fotograma,
   **le pregunta a SECAD** si ese token autoriza esa ruta.
5. SECAD valida, comprueba las mismas reglas que al entregar la URL —la cámara
   es de este CAD y está operativa— y **audita la lectura** (`accion =
   VER_GATEWAY`).

El punto 4 es el importante: el video sale por un puerto que antes no existía, y
sin esa pregunta cualquiera que alcanzara el gateway vería cualquier cámara
registrada. Probado en los tres casos: con token válido se ve; sin token no; con
el token de otra cámara tampoco.

### Lo que hay que configurar en la integración

| Campo | Qué es | Ejemplo |
|---|---|---|
| Protocolo de video | `rtsp_s` (o `rtsp`) | |
| URL del gateway de medios | El gateway **como lo ve el navegador** | `https://edge-tunja.policia.gov.co:8889` |
| API del gateway de medios | La API de control **como la ve el servidor**. Si se deja vacía, las rutas se mantienen a mano | `http://10.41.0.20:9997` |
| Token de la API del gateway | Solo si la API está protegida | |

Y en el `mediamtx.yml` del edge:

```yaml
authMethod: http
authHTTPAddress: https://secad.policia.gov.co/api/Camaras/gateway/autorizar
authHTTPExclude:
  - action: api        # el registro de rutas lo hace SECAD con su propia credencial
  - action: publish
api: true
apiAddress: :9997      # NO exponer fuera de la red de la sede
webrtc: true
webrtcAddress: :8889
```

> ⚠️ La API de control del gateway permite apuntar cualquier ruta a cualquier
> RTSP. **No debe ser alcanzable desde fuera de la sede**, y el puerto 9997 no va
> publicado. El 8889 (WebRTC) sí lo alcanza el navegador del despachador, y está
> protegido por la pregunta a SECAD.

---

## 4. Comparación, sin rodeos

| | HLS (hoy) | A: jsDecoder | B: edge + WebRTC |
|---|---|---|---|
| Latencia | ~7 s | 1-3 s | 0,5-1,5 s |
| Falta por conseguir | nada | SDK y manual de Hikvision | desplegar el gateway |
| Instalar en cada puesto | no | **sí** | no |
| Ataduras | ninguna | Windows + Chrome/Firefox | ninguna |
| Quién lo mantiene | nadie | Hikvision | nosotros |
| Estado en SECAD | **funcionando** | todo menos la llamada al SDK | **funcionando y medido** |

**Decidido: el camino B**, implementado y medido. Lo que sigue es el
razonamiento con el que se eligió. Da menos latencia que el A, no exige tocar los
puestos, no ata el despacho a Windows ni a un SDK propietario, y aprovecha un
servidor que ya hay que poner. El A tiene sentido si la Policía ya tiene el
jsDecoder desplegado por otro sistema, o si el gateway no se puede meter en la
sede por política de infraestructura.

Los dos caminos **conviven**: el protocolo se elige por integración, así que un
municipio puede ir por WebRTC y otro quedarse en HLS sin tocar código.

> El gateway no es solo para HikCentral. Recibe una URL RTSP, y RTSP lo hablan
> todos los equipos: por eso el mismo gateway sirve para los municipios que no
> tienen VMS central sino un NVR o cámaras sueltas. Ver
> `CCTV_DRIVER_RTSP_GENERICO.md`.

---

## 5. Qué preguntarle a Hikvision

Si se va por el camino A:

1. El paquete del **jsDecoder SDK** y su *Developer Guide* para la versión
   3.1.1 de la OpenAPI.
2. ¿Funciona en **Edge**? El manual solo nombra Chrome y Firefox, y los equipos
   de la Policía traen Edge de fábrica.
3. ¿Hay que instalar algo en el puesto, o basta con servir los `.js`?
4. ¿Cuántas cámaras simultáneas aguanta un puesto con el decodificador en
   software?

Si se va por el camino B, a Hikvision no hay que pedirle nada: el RTSP ya está
en la OpenAPI (`protocol: "rtsp_s"`) y el resto es nuestro.
