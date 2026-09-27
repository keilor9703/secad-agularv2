# Control PTZ de cámaras — diseño y operación

> **Qué resuelve:** que un despachador pueda mover una cámara móvil hacia el
> hecho sin salir de SECAD, y que quede registrado quién la movió y a dónde.

---

## 1. El riesgo que gobierna todo el diseño

La OpenAPI de HikCentral (§5.4.23) no tiene un comando «gira 30 grados». Tiene
**arrancar** y **parar**:

```
POST /artemis/api/video/v1/ptzs/controlling   { command: "LEFT", action: 0 }   ← arranca
POST /artemis/api/video/v1/ptzs/controlling   { command: "LEFT", action: 1 }   ← para
```

Si el «parar» no llega, **la cámara sigue girando indefinidamente**. Y hay
muchas formas de que no llegue: el despachador cierra la pestaña a mitad, se
cae el Wi-Fi del puesto, el turno termina, el navegador se congela, el enlace
con el municipio se corta justo entre las dos llamadas.

Una cámara que se queda girando no es un fallo cosmético: queda apuntando al
cielo o a una pared, y **deja de vigilar el punto que vigilaba** hasta que
alguien se dé cuenta y la devuelva a su sitio. En una cámara de un cruce, eso
puede ser justo el punto que hacía falta minutos después.

### La decisión

**El backend nunca expone «arrancar» y «parar» por separado.** La API de SECAD
tiene una sola operación, y su contrato es *mueve un paso acotado*:

```
POST /api/Camaras/{codigo}/ptz     { comando, velocidad, duracionMs, preset }
```

El backend arranca el movimiento, espera la duración pedida, y **para él mismo
antes de responder**. La parada ocurre dentro de la misma llamada, en el
servidor. Ninguna cosa que le pase al navegador puede dejar la cámara
moviéndose, porque el navegador nunca fue responsable de pararla.

El precio es que la petición HTTP tarda lo que dura el movimiento (hasta 2 s).
Es un precio que vale la pena: convierte un fallo grave y silencioso en, como
máximo, un paso que no se dio.

### Tres detalles que hacen que eso sea verdad de verdad

1. **La parada no viaja con el token de cancelación del cliente.** Si lo
   hiciera, cancelar la petición —cerrar la pestaña, un timeout de Kestrel—
   cancelaría precisamente la llamada que devuelve la cámara a su sitio. La
   parada lleva su propio `CancellationTokenSource` con tope de 10 s.
2. **Si la petición se cancela durante la espera, se para igual** antes de
   propagar la cancelación.
3. **Si el VMS acepta el arranque pero no confirma la parada**, la respuesta lo
   dice (`detenida: false`), queda un *warning* en el log del servidor y el
   operador ve el aviso en el mando. Callarlo sería lo peor posible.

---

## 2. Mantener pulsado, en el frontend

El operador quiere mantener pulsado y que la cámara gire, no dar treinta
toques. El visor lo consigue **encadenando pasos**: mientras el botón está
pulsado, pide un paso, espera la respuesta, y pide el siguiente.

```
pointerdown → paso(350 ms) → paso(350 ms) → paso(350 ms) → …
pointerup   → no pide el siguiente
```

Nunca hay dos comandos en vuelo. Si el navegador muere a mitad, lo único que
pasa es que no se pide el paso siguiente: el que estaba en curso lo para el
backend.

La cadena se corta al soltar el botón, al sacar el puntero del botón, al soltar
el ratón **fuera** de la ventana (`window:pointerup`), al perder el foco la
ventana (`window:blur`), al cerrar el visor, y a los 20 pasos (~7 s) por si un
puntero se queda enganchado. Esto último también respeta lo que pide el propio
manual en §4.4.5: *no llamar seguido*.

---

## 3. Límites, y quién los pone

Ninguno de estos límites se confía al navegador: **todos se aplican en el
backend**, porque un cliente manipulado es exactamente el escenario contra el
que protegen.

| Parámetro | Rango | Qué pasa fuera de rango |
|---|---|---|
| `velocidad` | 20–60 (manual §5.4.23; por defecto 40) | Se acota. Fuera de rango el VMS rechazaría la petición entera |
| `duracionMs` | 100–2000 (por defecto 400) | Se acota. Es el freno que impide un giro largo desde el navegador |
| `preset` | 1–256 | Se rechaza la petición |
| `patrulla` | 1–8 | Se rechaza la petición |
| `comando` | Lista cerrada de §5.4.23 | Se rechaza sin salir a la red |

**Presets y patrullas son la excepción al arranca/para:** los ejecuta el VMS
por su cuenta. Mandarles un «parar» detrás abortaría el recorrido a medias, así
que se disparan y no se paran.

> **Nota sobre `FOUCS_FAR`:** el manual escribe así el comando de enfoque
> lejano, con la errata incluida. SECAD lo manda literal, porque lo que importa
> es lo que acepta el gateway. Si un despliegue lo rechaza, es el primer sitio
> donde mirar.

---

## 4. Quién puede mover una cámara

Mover es más sensible que mirar: cambia lo que el resto del sistema puede ver.
Pasa por los mismos controles que el video **más dos**:

1. La cámara existe **en este CAD** (`sitio_graba` del JWT). Es la frontera: un
   operador no mueve cámaras de otra unidad aunque adivine el código.
2. Está emparejada con un VMS.
3. Está operativa según el inventario.
4. **El VMS la reporta como PTZ** (`capabilitySet` contiene `ptz`). Si se le
   instaló motor después, hay que sincronizar la integración.
5. **El driver sabe mover** (`IVmsPtz`). Un driver que solo lee no implementa
   esa interfaz, y eso es una respuesta válida, no un error del sistema.

Además, **dos comandos simultáneos sobre la misma cámara se rechazan**. Un
«izquierda» y un «derecha» a la vez dejan la cámara donde nadie pidió. El
candado es por proceso, no distribuido: cubre a un operador pulsando rápido y a
dos operadores del mismo CAD. Si algún día la API corre replicada detrás de un
balanceador, dos instancias no se verían entre sí; está anotado en el código.

---

## 5. Auditoría

`cad_camaras_visualizacion` ya registraba «quién vio qué cámara». **V77** le
añade dos columnas en vez de crear otra tabla, para que la pregunta *«quién
tocó esta cámara»* se responda de una sola vez:

| Columna | Contenido |
|---|---|
| `accion` | `VER` para una consulta de video. Para PTZ, **el comando** con el nombre del VMS: `LEFT`, `ZOOM_IN`, `GOTO_PRESET`… |
| `detalle` | `vel=40 dur=400ms`, `preset=3` — lo que se pidió, para poder reconstruirlo |

Hay un índice parcial sobre `(accion, fecha DESC) WHERE accion <> 'VER'`: la
consulta que se va a pedir en una investigación es *«qué cámaras se movieron
esa noche»*.

**Los intentos negados también se registran**, con el motivo. Quién intentó
mover una cámara y no pudo es tan interesante como quién sí.

Consulta típica:

```sql
SELECT fecha, usuario, camara_codigo, accion, detalle, concedido, motivo
FROM   cad_camaras_visualizacion
WHERE  accion <> 'VER'
  AND  fecha >= NOW() - INTERVAL '24 hours'
ORDER  BY fecha DESC;
```

### Despliegue: la auditoría no se rompe si V77 va con retraso

`docker compose build && up -d` levanta la API **antes** de aplicar las
migraciones. Durante esa ventana, el `INSERT` con las columnas nuevas fallaría
con `42703` (columna inexistente) y **se perdería el registro**. El repositorio
lo detecta, lo anota en un indicador estático y reintenta sin esas columnas:
ninguna fila se pierde, y la única cosa que falta es el nombre del comando
hasta que se aplique V77. Está probado en los dos estados del esquema.

---

## 6. Cómo se verificó

Dos pruebas, ninguna de las cuales se cree lo que dice el código.

**Backend — prueba de integración** (`scripts/` + simulador). Recorre el camino
real: `DbCamaraService` → `HikCentralVmsReader` (firma AK/SK de verdad, HTTP de
verdad) → simulador, y `DbCamaraRepository` → PostgreSQL de verdad. El
simulador **reimplementa la verificación de la firma desde cero** siguiendo
§3.2 y valida el cuerpo con los límites del manual, así que no es un «sí a
todo»: si el driver firmara mal o mandara una velocidad fuera de rango, sale
rechazado.

Lo que se comprueba, y es lo que importa:

- A un `action=0` le sigue **siempre** un `action=1`, y se mide el tiempo entre
  los dos.
- Una cámara sin PTZ se rechaza **antes** de tocar el VMS (se verifica que el
  simulador no recibió nada).
- Velocidad y duración absurdas se acotan antes de salir.
- Un preset manda **una sola** llamada.
- Dos comandos simultáneos: el segundo se rechaza, y al terminar el primero la
  cámara vuelve a aceptar.
- **Petición cancelada a mitad: la parada llega igual.** Con el token del
  cliente en la llamada de parada, esta prueba falla — se verificó saboteando
  el código a propósito para confirmar que la prueba lo detecta.
- La bitácora queda completa en los dos estados del esquema (con y sin V77).

**Frontend — `camara-visor.ptz.spec.ts`.** Cuenta las llamadas reales en el
tiempo para comprobar que mantener pulsado encadena y soltar corta; que nunca
hay dos en vuelo; que soltar fuera de la ventana, perder el foco o destruir el
visor cortan la cadena; que un fallo del VMS la corta y se le dice al operador;
y que el preset se valida antes de salir a la red. También se comprobó
sabotéandolo: quitar la comprobación de «se soltó el botón» hace fallar tres de
las nueve pruebas.

---

## 7. Lo que NO entra todavía

- **Latencia.** El HLS de HikCentral llega con ~7 s de retraso (segmentos de
  1,665 s + búfer de 3). Para mirar una cámara no cambia ninguna decisión, pero
  **para mover una cámara sí**: el operador corrige contra una imagen de hace
  siete segundos y se pasa de largo. La ruta para bajarlo a 1–3 s es el
  jsDecoder de Hikvision por WebSocket. Con PTZ confirmado, deja de ser
  opcional. Ver `CCTV_HIKCENTRAL_DISENO_TECNICO.md` §11, fase 2.
- **Enfoque e iris** (`FOCUS_NEAR`, `FOUCS_FAR`, `IRIS_ENLARGE`, `IRIS_REDUCE`):
  el backend los acepta; el mando del visor no los muestra, porque en una
  cámara con enfoque automático solo sirven para desenfocarla.
- **Guardar la posición actual como preset** (`presets` de §5.4.2x). Requiere
  permiso de escritura en el VMS y una decisión de quién puede hacerlo.
- **Volver a la posición de reposo** al cerrar el visor. Tiene sentido, pero
  exige saber cuál es, y eso lo configura quien instala la cámara.
