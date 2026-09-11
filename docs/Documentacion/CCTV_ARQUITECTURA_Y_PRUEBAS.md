# Arquitectura de SECAD, el nodo edge y las cámaras — y cómo probarlo sin nada institucional

> Este documento existe porque «nodo edge» significa **dos cosas distintas** en
> SECAD y se están mezclando. Separarlas es la mitad de la respuesta.

---

## 1. Hay dos «edge», y no tienen nada que ver entre sí

| | **Edge de resiliencia** | **Edge de cámaras** |
|---|---|---|
| ¿Qué problema resuelve? | Que el CAD siga operando si se cae el enlace con Bogotá | Que alguien pueda *alcanzar* la red de cámaras |
| ¿Qué mueve? | **Datos** (la base) | **Video** (y la firma para pedirlo) |
| ¿Qué necesita? | PostgreSQL local + réplica + reconciliación | Un proceso que firme y, quizá, retransmita |
| ¿Cuándo actúa? | Solo cuando SECAD central NO responde | **Siempre**, también en operación normal |
| ¿Está hecho? | Solo la **detección**. Ver §2 | El campo está; el enrutado **no**. Ver §4 |

Que los dos quieran una máquina en la misma sede es una coincidencia de
conveniencia, no una relación. **Se pueden desplegar por separado, y de hecho
conviene**: las cámaras se pueden resolver hoy sin tocar nada de resiliencia.

---

## 2. Operación normal y operación degradada (lo que hay hoy)

La especificación pide tres niveles. Lo implementado es la **observabilidad**,
no la conmutación:

```
  Nivel 1 · NORMAL       Todo va a la BD central de Bogotá.        ✅ es lo que pasa hoy
  Nivel 2 · DEGRADADO    Latencia alta → conmutar a réplica local. ⚠️  se DETECTA, no se conmuta
  Nivel 3 · OFFLINE      Sin enlace → el edge opera como primaria. ⚠️  se DETECTA, no se opera
```

`CadHealthMonitorService` sondea cada CAD, clasifica el nivel y lo publica en
el tablero «Salud CADs». Eso funciona. Lo que **no** existe es la réplica
local, el failover ni la reconciliación (ver
`Bakcend/backend/docs/RESILIENCIA_ESTADO_ACTUAL.md`).

La única pieza edge real que ya está escrita es
`Bakcend/backend/edge-plantatel-service/`: un microservicio de ~70 líneas que
recibe el mismo payload de la planta telefónica y lo escribe en un PostgreSQL
local. Es el **fallback** al que la PBX apunta cuando el SECAD central no
responde. No tiene nada que ver con cámaras.

**Para las cámaras, esto es irrelevante.** No espere a que exista el modo
degradado: son proyectos independientes.

---

## 3. El flujo normal de SECAD (sin cámaras)

```
  Navegador del operador (Tunja)
        │  HTTPS · JSON
        ▼
  SECAD central (su servidor Oracle, o Bogotá en producción)
        │
        ├──▶ BD maestra   (secad_tenants: qué CADs hay y dónde está su base)
        └──▶ BD del CAD   (Secad_Tunja: los casos, recursos, cámaras…)
```

El navegador **solo habla con SECAD**. SECAD resuelve el tenant por el
`cod_dane` del JWT y va a la base que corresponde. Nada más.

---

## 4. Dónde encajan las cámaras — y por qué aparece el edge

El edge de cámaras existe **por una sola razón: segmentación de red**. En el
despliegue institucional:

| Quién | Red | ¿Alcanza a las cámaras (172.19)? |
|---|---|---|
| Cámaras y HikCentral (Tunja) | `172.19.x.x` | — |
| SECAD edge (Tunja, misma sede) | `172.26.x.x` | ✅ sí |
| SECAD central (Bogotá) | `172.28.x.x` | ❌ no, ni debe |

Pedirle la URL del video a HikCentral requiere **dos cosas a la vez**:

1. **Alcanzar** la red `172.19` — Bogotá no puede.
2. **Firmar** con el AppSecret (AK/SK) — el navegador no debe, porque
   entregarle el secreto a un navegador es regalarlo.

Nadie tiene las dos salvo un proceso en la sede. **Ese es el edge de cámaras**,
y su trabajo es exactamente uno:

> recibir «dame la URL de la cámara X», firmar la petición a HikCentral,
> y devolver la URL.

### Lo que el edge de cámaras NO es

- **No es una base de datos.** No guarda cámaras ni casos. El catálogo, las
  coordenadas y la auditoría viven en la BD del CAD, en el central.
- **No expone la API de SECAD.** Es un solo endpoint, no una copia del backend.
- **No es donde se conecta HikCentral a SECAD.** Es al revés: SECAD (desde el
  edge) *llama* a HikCentral. HikCentral nunca llama a SECAD.

### El reparto de responsabilidades

```
  Navegador (Tunja)
     │
     │ (1) "abre el evento 990001"          ┌──────────────────────────┐
     ├─────────────────────────────────────▶│  SECAD central           │
     │ ◀─ lista de cámaras cercanas ────────│  · catálogo y coordenadas│
     │    (JSON, texto, liviano)            │  · quién puede ver qué   │
     │                                      │  · AUDITORÍA             │
     │                                      └──────────────────────────┘
     │ (2) "dame la URL de la cámara 1002"
     ├──────────────────────────────────────▶  SECAD EDGE (Tunja, 172.26)
     │                                            │ firma AK/SK
     │                                            ▼
     │                                        HikCentral (172.19)
     │ ◀─ URL HLS efímera ───────────────────────┘
     │
     │ (3) el VIDEO, directo
     └──────────────────────────────────────▶  HikCentral SMS (172.19)
```

A Bogotá solo va **texto**. El video nunca cruza la WAN.

---

## 5. El streaming: sí, es como la videollamada… con una diferencia que decide todo

Tiene razón en el principio: **el video no pasa por el servidor de SECAD**. En
los dos casos el backend solo autoriza y da una dirección; los bytes van
directo. Meter video por Kestrel tumbaría el servidor con tres operadores.

Pero hay una diferencia que cambia el despliegue:

| | Videollamada con el ciudadano | Cámara CCTV |
|---|---|---|
| Protocolo | **WebRTC** | **HLS** (HTTP) |
| ¿Atraviesa NAT/redes distintas? | **Sí**, con STUN/TURN | **No**. Es HTTP a secas |
| Si los dos extremos no se ven | TURN retransmite | **no hay conexión** |

La videollamada funciona entre un celular en la calle y el CAD porque WebRTC
está *diseñado* para atravesar redes ajenas. HLS no: es descargar un archivo
por HTTP. Si el navegador del operador no tiene ruta hasta el servidor de
medios de HikCentral, no hay video y no hay truco que lo salve.

### Por eso hay que responder UNA pregunta antes de desplegar

> **¿El navegador del operador, en su puesto de Tunja, alcanza la red `172.19`?**

| Respuesta | Qué se despliega |
|---|---|
| **Sí** | El edge solo **firma**. Devuelve la URL y el navegador baja el video directo de HikCentral. Es lo más liviano y lo ideal. |
| **No** (solo el edge la alcanza) | El edge además **retransmite** el video (proxy HLS o go2rtc/MediaMTX). El navegador baja del edge. Sigue siendo todo local a Tunja, pero el edge necesita ancho de banda y CPU. |

Esta pregunta es para el grupo de redes, no para el de cámaras. **Hasta
responderla no tiene sentido dimensionar el edge.**

---

## 6. Estado honesto de lo implementado

| Pieza | Estado |
|---|---|
| Catálogo, emparejamiento, cámaras cercanas, auditoría | ✅ hecho y verificado |
| Driver HikCentral con firma AK/SK | ✅ hecho, conforme al manual V3.1.0 y V3.1.1 |
| Reproductor HLS en el navegador | ✅ hecho |
| Campo `nodo_edge_url` en la ficha | ✅ se guarda y se muestra en el visor |
| **Enrutar la petición al nodo edge** | ❌ **NO** — hoy el driver corre en el backend que atiende |
| Edge de cámaras como servicio desplegable | ❌ no existe todavía |
| Retransmisión de video por el edge | ❌ no existe (depende de §5) |

Es decir: **hoy SECAD llama a HikCentral desde donde esté corriendo el
backend**. Eso funciona perfectamente si ese backend alcanza el VMS — que es
justo el caso de las pruebas, y puede ser el caso de un piloto donde SECAD
esté dentro de la red del municipio. Para el despliegue central-Bogotá falta
el enrutado, y no se construyó antes de responder la pregunta de §5 porque las
dos variantes dan servicios distintos.

---

## 7. Cómo probar todo esto sin nada institucional

No hace falta el HikCentral de Tunja. En el repositorio hay un **simulador**
que verifica la firma AK/SK reimplementándola desde cero según el manual: si
SECAD firma mal, responde 401 igual que el real.

### Paso 1 — Levantar el simulador (en su servidor Oracle)

```bash
python3 scripts/hikcentral_simulador.py --puerto 5610 \
    --app-key AK-pruebas --app-secret SK-pruebas --user-id svc_secad
```

Si el navegador entra por el dominio público, dígaselo para que arme bien la
URL del video:

```bash
python3 scripts/hikcentral_simulador.py --puerto 5610 \
    --url-publica https://secad.suservidor.com/hls
```

> Abra el puerto solo hacia donde lo vaya a usar. Es un simulador, no tiene
> seguridad de producción.

### Paso 2 — Registrar la integración en SECAD

**Administración → Hub de Integraciones → Cámaras (VMS) → Nueva integración**

| Campo | Valor |
|---|---|
| Driver | HikCentral Professional (OpenAPI) |
| URL del HikCentral | `http://<su-servidor>:5610` |
| Usuario (userId) | `svc_secad` |
| App Key | `AK-pruebas` |
| App Secret | `SK-pruebas` |
| Calidad de video | `1` (sub-stream) |
| Protocolo | `hls` *(el simulador no hace TLS; en producción `hls_s`)* |
| Nodo edge | **vacío** — en pruebas el backend alcanza el simulador |

Pulse **Probar**. Debe decir cuántas cámaras ve. Si dice 401, el simulador
imprime en su consola exactamente qué no cuadró de la firma.

### Paso 3 — Sincronizar y emparejar

En la fila de la integración → **Sincronizar y emparejar cámaras**.
Sincronice, y confirme las parejas que proponga contra el censo de Tunja.

### Paso 4 — Verlo como operador

Abra un evento **con coordenadas en Tunja** (si no las tiene, no hay cámaras
cercanas que mostrar) → pestaña **Cámaras** → **Ver**.

El reproductor descargará el manifiesto y los segmentos. **No verá imagen**:
el simulador sirve segmentos vacíos porque no puede codificar video. Lo que
queda demostrado es la cadena completa —autorización, firma, URL, descarga y
auditoría—; para ver imagen hace falta un VMS real o un servidor de medios con
contenido.

### Paso 5 — Comprobar la auditoría

```sql
SELECT usuario, camara_codigo, evento_id, concedido, motivo, fecha
FROM   cad_camaras_visualizacion
ORDER  BY fecha DESC LIMIT 20;
```

Debe haber **una** fila por apertura, y también las negadas con su motivo.

### Qué NO se puede probar así

- **Imagen real** y latencia: necesita un VMS o un stream de verdad.
- **Que el sub-stream sea H.264**: depende de las cámaras de Tunja.
- **La segmentación de red**: en su servidor no existe. El edge solo se puede
  probar de verdad contra la red del municipio.

---

## 8. Qué pedir al grupo de redes y al de cámaras

1. ¿El **navegador del operador** en Tunja alcanza la red de cámaras? *(§5 — es
   la que decide el diseño del edge.)*
2. ¿La licencia de **Third-Party Integration / OpenAPI** está activa en el
   HikCentral de Tunja? *(Es el bloqueo más probable.)*
3. **AppKey, AppSecret, IP:puerto TLS** y el usuario vinculado al Partner.
4. ¿Las cámaras tienen **sub-stream en H.264**?
5. ¿Cuántos streams simultáneos admite la licencia?
