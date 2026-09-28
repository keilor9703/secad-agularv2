# Cámaras sin VMS central: el driver genérico por RTSP

> **Para quién es:** la mayoría de los municipios del país no tienen un
> HikCentral. Tienen un NVR en la estación con doce o veinte cámaras, o cámaras
> sueltas. Este driver es para ellos.

---

## 1. Qué cambia respecto a HikCentral

| | HikCentral | RTSP genérico |
|---|---|---|
| ¿Quién dice qué cámaras hay? | El VMS, por su API | **El administrador**, declarando los canales |
| ¿De dónde sale la URL del video? | La pide SECAD al VMS | **Se arma** con una plantilla |
| ¿Cómo se sabe si una cámara está en línea? | El VMS lo reporta | **SECAD lo comprueba** hablando RTSP |
| Video hacia el navegador | HLS directo, o gateway | **Siempre** gateway |
| PTZ | Sí | No (el RTSP no lleva control) |

Lo demás es idéntico: el emparejamiento con el censo, la búsqueda por cercanía
al caso, la auditoría, el visor flotante y la baja latencia funcionan igual,
porque nada de eso sabe de marcas.

## 2. Lo que hay que llenar

| Campo | Qué es |
|---|---|
| Dirección del equipo | IP del NVR o de la cámara, sin `rtsp://` |
| Puerto RTSP | 554 en casi todos |
| Canales | `1-16`, `1,3,5`, `1-8,12`. **SECAD no los adivina**: crea exactamente los que se declaren |
| Plantilla de la URL | Cambia según la marca (abajo) |
| Usuario y contraseña | Del equipo |
| URL del gateway de medios | Obligatoria: ningún navegador reproduce RTSP |
| API del gateway | Opcional; si se pone, SECAD registra las cámaras sola |

### Plantillas por marca

Se reemplazan `{usuario}`, `{clave}`, `{host}`, `{puerto}` y `{canal}`:

```
Hikvision  rtsp://{usuario}:{clave}@{host}:{puerto}/Streaming/Channels/{canal}02
Dahua      rtsp://{usuario}:{clave}@{host}:{puerto}/cam/realmonitor?channel={canal}&subtype=1
Axis       rtsp://{usuario}:{clave}@{host}:{puerto}/axis-media/media.amp?camera={canal}
```

En Hikvision el `02` final pide el **sub-stream**. Con el gateway de medios no
hace falta bajar de calidad —el gateway no tiene la restricción de H.264 que sí
tiene HLS—, así que se puede usar `{canal}01` para el stream principal si la red
de la sede lo aguanta.

Si no sabe la plantilla de su equipo: la trae el manual, o se saca abriendo la
cámara en VLC y mirando la URL que usa.

## 3. Por qué «probar conexión» tarda un segundo

Porque hace una petición RTSP **de verdad** (un `DESCRIBE`, la misma con la que
un reproductor pide el stream) y espera el SDP del equipo.

Abrir el puerto 554 y decir «correcto» habría sido instantáneo, pero solo prueba
que el NVR está encendido. No prueba que la plantilla esté bien, que el canal
exista, ni que la contraseña sirva — que son justo las tres que se equivocan al
configurar. Un botón que dice CORRECTO y luego no da imagen es peor que no tener
botón: manda a buscar el fallo donde no está.

Por eso los mensajes son concretos:

| Lo que dice | Qué revisar |
|---|---|
| «Usuario o contraseña incorrectos» | las credenciales del equipo |
| «Ese canal no existe en el equipo» | el número de canal y la plantilla |
| «El equipo no tiene más conexiones libres» | otro sistema está usando todas las cámaras |
| «No respondió en 4000 ms» | el equipo está apagado o no se alcanza desde el servidor |

Soporta autenticación **Digest** además de Basic, porque los NVR de Hikvision y
Dahua rechazan Basic por defecto.

## 4. Sincronizar sondea todos los canales

Al sincronizar, SECAD pregunta a cada canal declarado si está emitiendo, de
cuatro en cuatro. Con dieciséis canales y el equipo encendido es cuestión de
segundos; si el equipo está caído, cada canal consume su espera completa.

Es a propósito: la alternativa es mostrarle al despachador una lista de cámaras
que dicen estar en línea sin que nadie lo haya comprobado. Y sincronizar lo
dispara un administrador a mano, no la operación.

## 5. La contraseña del equipo

La URL RTSP lleva la contraseña del NVR, y **no sale hacia el navegador**: se le
entrega al gateway, que corre en el nodo edge, y el puesto de despacho solo
recibe la URL del gateway. Si esa URL llegara al navegador, la contraseña del
NVR quedaría en el historial de cada puesto.

Queda, eso sí, en la configuración en memoria del gateway. Es una razón más para
lo que ya dice `CCTV_LATENCIA.md`: **el puerto de la API del gateway (9997) no
debe ser alcanzable desde fuera de la sede.**

## 6. Cómo se verificó

`Bakcend/backend/oftic/pruebas/OnvifRtspIntegracion/` — 24 comprobaciones contra
un **servidor RTSP real** (el del banco de `pruebas/gateway-medios/`) y la API
real del gateway:

- La sonda distingue un canal que emite, uno que no existe y un equipo que no
  responde — cada uno con su mensaje.
- «Probar conexión» **no** dice que está bien cuando el canal no existe.
- El catálogo marca en línea lo que emite y fuera de línea lo que no: no se
  inventa que funciona.
- Los rangos se expanden y no duplican (`1-4,3,7` → 1,2,3,4,7).
- La contraseña del equipo **no** aparece en lo que recibe el navegador, y sí en
  lo que recibe el gateway.
- Sin gateway configurado, se explica en vez de entregar un RTSP que el
  navegador no puede abrir.
