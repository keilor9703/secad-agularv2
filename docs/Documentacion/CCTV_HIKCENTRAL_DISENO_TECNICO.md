# Diseño técnico — Integración CCTV con HikCentral Professional OpenAPI (piloto Tunja)

> **Alcance:** módulo Eventos de SECAD debe mostrar las cámaras CCTV más cercanas
> a un incidente y reproducir su video en vivo en el navegador del despachador.
> **Piloto:** municipio de **Tunja**, VMS **HikCentral Professional**, OpenAPI
> **V3.1.0** (documento fuente: `docs/HikCentral Professional OpenAPI V3.1.0_
> Developer Guide_V3.1.0_20260130.pdf`).
>
> Este documento traduce ese manual al diseño concreto para SECAD. La guía general
> (qué es un VMS, glosario, preguntas para la mesa de trabajo) está en
> `docs/CCTV_VMS_INTEGRACION.md`.

---

## 1. Conclusión de viabilidad

**Es viable sin media gateway ni transcodificación.** HikCentral V3.1.0 entrega el
video en **HLS** directamente (endpoint `previewURLs v2`), que el navegador
reproduce con hls.js. El patrón es el mismo que ya usamos con GESPO: SECAD firma
peticiones a una API institucional y consume los datos.

Piezas que ya tenemos y se reutilizan:
- **PostGIS** (`geography` + índice GiST + KNN) del "recurso más cercano" → sirve
  tal cual para "cámara más cercana".
- **Firma HMAC** (ya implementada para 2FA y GESPO) → el esquema AK/SK de HikCentral
  es HMAC-SHA256, casi idéntico.
- **Patrón de sincronización bajo demanda** de GESPO.

---

## 2. Arquitectura y flujo

```
                 (1) sync catálogo + estado           (2) URL de stream (HLS)
  ┌──────────┐  POST /resource/v1/cameras   ┌──────────────────┐
  │  SECAD    │ ───────────────────────────▶ │   HikCentral      │
  │ backend   │  POST /video/v2/previewURLs  │  OpenAPI (Artemis)│
  │ (.NET)    │ ◀─────────────────────────── │  172.x.x.x:443    │
  └────┬──────┘   firma AK/SK (HMAC-SHA256)   └────────┬─────────┘
       │  cad_camaras (PostGIS)                        │ HLS (.m3u8)
       │  + token/URL efímero                          │ sub-stream H.264
       ▼                                               ▼
  ┌──────────────────────────────────────────────────────────┐
  │  Navegador del despachador (Angular + hls.js)             │
  │  · capa de cámaras en el mapa Leaflet del evento          │
  │  · lista "N cámaras cercanas" con distancia               │
  │  · reproductor HLS embebido  ── video va directo ─────────┼──▶ HikCentral
  └──────────────────────────────────────────────────────────┘        (SMS)
```

**Regla de oro:** el **video NO pasa por el backend .NET** (mataría a Kestrel). El
backend solo **autoriza y entrega la URL/token efímero**; el stream viaja
navegador ↔ HikCentral (Streaming Media Server).

---

## 2.1 Arquitectura de despliegue — control central / datos en el edge

**Restricción de red confirmada:** por seguridad (segmentación VLAN), los
servidores centrales de Bogotá **NO alcanzan** las redes de cámaras de los
municipios. Las redes involucradas en el piloto:

| Componente | Red | ¿Alcanza a las cámaras (172.19)? |
|---|---|---|
| Cámaras / HikCentral (Tunja) | `172.19.x.x` | — |
| SECAD **edge** (Tunja, misma sede que las cámaras) | `172.26.x.x` | ✅ **Sí (confirmado)** |
| SECAD central (Bogotá) | `172.28.x.x` | ❌ No (ni debe) |
| Navegador del operador (Tunja) | red local Tunja | según VLAN operador↔cámaras |

El operador está en Tunja y su **navegador es local**, pero el SECAD que usa es el
**central de Bogotá**. Por eso se separa:

- **Plano de control (Bogotá):** login, eventos, despacho, **configuración** de la
  integración (tab Cámaras), **catálogo** de cámaras + coordenadas, cálculo de
  "cámaras cercanas" (metadata) y auditoría. Es texto liviano; replica al edge.
- **Plano de datos (edge Tunja):** la **llamada a HikCentral** (`previewURLs`,
  firmada con AK/SK) y el **video**. Corre en el edge, único que alcanza `172.19`
  y donde vive el AppSecret (nunca en el navegador ni en Bogotá).

**Por qué el edge es imprescindible aunque el operador use el SECAD central:**
minar la URL del stream requiere (a) alcanzar la red de cámaras y (b) firmar con
el secreto. Bogotá no puede (a); el navegador no debe hacer (b). → lo hace el edge.

```
Navegador (Tunja) ──── control / metadata (JSON) ────▶  SECAD central (Bogotá, 172.28)
      │
      │  "dame la URL de la cámara X"
      ▼
Servicio de cámaras en el EDGE (Tunja, 172.26) ──firma AK/SK──▶ HikCentral (172.19)
      │  (devuelve URL HLS efímera)
      ▼
Navegador (Tunja) ──── baja el video (HLS) ────▶ HikCentral SMS (Tunja, 172.19)
```

El video **nunca cruza a Bogotá**; a Bogotá solo va texto.

**Dos variantes según la VLAN local** (a confirmar con conectividad):
- Si el **navegador del operador alcanza `172.19`** → baja el HLS directo; el edge
  solo acuña la URL.
- Si **no** lo alcanza (solo el edge sí) → el edge además **relaya** el video
  (proxy/media gateway local en `172.26`) y el navegador baja del edge. Sigue
  siendo todo local a Tunja.

**Implicación de implementación:** el runtime del driver (`HikCentralVmsDriver`)
se ejecuta en el **nodo edge**, leyendo la configuración replicada desde el
central. La configuración de cada integración (tabla `cad_camara_integracion`)
identifica el nodo/edge que la atiende; el frontend dirige las operaciones de
video a ese edge, no a Bogotá.

---

## 3. Autenticación — AK/SK (sección 3.2 del manual)

HikCentral usa **AK/SK digest authentication** (HMAC-SHA256). Por cada petición:

1. Construir el **string a firmar**, con salto de línea `\n` entre cada parte:
   ```
   {HTTP_METHOD}\n
   {Accept}\n
   {Content-MD5}\n
   {Content-Type}\n
   {Date}\n
   {headers firmados, orden alfabético, "clave:valor\n"}
   {URI con query}
   ```
   - `Content-MD5` = `Base64(MD5(body))` (solo si hay body no-form).
   - Headers firmados típicos: `x-ca-key`, `x-ca-timestamp`, `x-ca-nonce`.
2. `signature = Base64( HmacSHA256(stringToSign, appSecret) )`.
3. Enviar en cabeceras:
   | Header | Valor |
   |---|---|
   | `X-Ca-Key` | el **AppKey** |
   | `X-Ca-Signature` | la firma calculada |
   | `X-Ca-Signature-Headers` | lista de headers firmados, ej. `x-ca-key,x-ca-nonce,x-ca-timestamp` |
   | `X-Ca-Timestamp` | epoch en milisegundos |
   | `X-Ca-Nonce` | UUID (anti-replay) |
   | `Accept` | `application/json` (recomendado explícito) |
   | `Content-Type` | `application/json` |

El `AppKey`/`AppSecret` se obtiene creando un **"Partner"** en HikCentral
(sección 2 del manual, *"Create a partner"*), marcando a qué APIs damos acceso.

> Implementación: un `HikSignatureHelper` reutilizable + un `DelegatingHandler`
> que firme automáticamente cada request del `HttpClient` de HikCentral.

---

## 4. Endpoints de HikCentral que se usan

### 4.1 Catálogo + estado de cámaras — `POST /artemis/api/resource/v1/cameras`
Paginado (`pageNo`, `pageSize`). Campos relevantes de cada cámara:
- `cameraIndexCode` — **ID de la cámara** (clave para pedir el stream). Hasta 64 chars.
- `cameraName` — nombre.
- `capabilitySet` — capacidades (incluye `"ptz"` si es móvil, `"gis"`, etc.).
- `regionIndexCode` — área.
- `status` — **0 desconocido, 1 online, 2 offline**.

> ⚠️ **Este endpoint NO devuelve latitud/longitud de cámaras fijas** (ver §5).

### 4.2 URL de video en vivo — `POST /artemis/api/video/v2/cameras/previewURLs`
Request body:
```json
{
  "cameraIndexCodes": "103",
  "streamType": 1,
  "protocol": "hls",
  "transmode": 1
}
```
- `streamType`: `0` = main (suele H.265) · **`1` = sub-stream (H.264, ligero) ← usar este**.
- `protocol`: **`"hls"`** para el navegador. (Otros: `rtsp`, `websocket`, `rtmp`.)
- `transmode`: `1` = TCP (default).

Respuesta:
```json
{ "code": "0", "msg": "Success",
  "data": { "url": "...m3u8...", "authentication": "<token/credenciales>" } }
```

> ⚠️ **Restricción del manual:** *"Streaming via RTMP and HLS only supports H.264
> video encoding."* → Por eso pedimos `streamType: 1` (sub-stream H.264). Si una
> cámara no tiene sub-stream H.264, su HLS fallará; en ese caso quedaría para una
> fase con transcodificación o el player WebSocket/JsDecoder de Hikvision.

### 4.3 (Fase posterior) PTZ — `POST /artemis/api/video/v1/ptzs/controlling`
Para cámaras móviles. Fuera del alcance del piloto.

---

## 5. El tema de las coordenadas (decisión de diseño)

La OpenAPI **no expone las coordenadas de las cámaras fijas** (los campos
`longitude`/`latitude` del manual pertenecen a cámaras móviles/GPS y eventos ANPR,
no al CCTV fijo). Las posiciones de cámaras fijas viven en el **e-map** de
HikCentral, no en la API de recursos.

**Solución (aprovechando que la Policía nos da acceso a las ubicaciones):**
- Las **coordenadas** se cargan a `cad_camaras` desde una **lista provista por el
  grupo de cámaras** (o exportada del e-map de HikCentral), emparejadas por
  `cameraIndexCode` (o por nombre).
- La **OpenAPI** aporta lo dinámico: **estado online/offline** y la **URL de
  stream**. La geolocalización es un dato relativamente estático que se siembra y
  se actualiza esporádicamente.

Es un patrón limpio: la API responde "qué cámara / video / estado", y el catálogo
georreferenciado se siembra una vez.

---

## 6. Modelo de datos (SECAD / PostgreSQL)

Migración nueva `cad_camaras` (por tenant), con PostGIS:
```sql
CREATE TABLE IF NOT EXISTS cad_camaras (
    id                BIGSERIAL PRIMARY KEY,
    camera_index_code VARCHAR(64)  NOT NULL,   -- ID en HikCentral
    nombre            VARCHAR(128),
    region_index_code VARCHAR(64),
    latitud           DOUBLE PRECISION,
    longitud          DOUBLE PRECISION,
    geo               geography(Point, 4326),   -- para KNN / ST_DWithin
    tiene_ptz         BOOLEAN NOT NULL DEFAULT FALSE,
    estado            SMALLINT,                 -- 0 desc / 1 online / 2 offline
    activa            BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_sync        TIMESTAMPTZ,
    UNIQUE (camera_index_code)
);
CREATE INDEX IF NOT EXISTS idx_camaras_geo ON cad_camaras USING GIST (geo);
```
`geo` se rellena con `ST_SetSRID(ST_MakePoint(longitud, latitud),4326)::geography`
al sembrar/actualizar.

---

## 7. Endpoints nuevos en SECAD

- `GET /api/Evento/{id}/camaras-cercanas?radioMetros=500&limite=5`
  → KNN PostGIS sobre `cad_camaras` respecto a la lat/lng del incidente
  (misma consulta que `G_GetRecursoMasCercanoAsync`). Devuelve id, nombre,
  distancia, estado online.
- `GET /api/Camaras/{cameraIndexCode}/stream`
  → el backend llama a `previewURLs v2` (protocol hls, sub-stream), y devuelve al
  frontend una **URL efímera** + registra la visualización en auditoría.
- `POST /api/Camaras/sync` (solo admin) → refresca catálogo + estado desde
  HikCentral (patrón GESPO, con cooldown).

Todo detrás de una interfaz **`IVmsReader`** con implementación
**`HikCentralVmsReader`** — para que otros municipios con otro VMS (Genetec, Bosch)
sean solo un driver nuevo, sin tocar el resto (igual que abstrajimos GESPO).

---

## 8. Frontend (Angular + Leaflet + hls.js)

- Capa de **cámaras en el mapa** del detalle del evento (marcador distinto, con
  estado online/offline).
- Lista lateral **"N cámaras cercanas"** con distancia (como se hizo con patrullas).
- Al hacer clic → pide `/stream`, abre un **reproductor HLS embebido** (hls.js) en
  modal o panel. El `<video>` consume la URL `.m3u8` directo de HikCentral.
- **hls.js** se agrega como dependencia (una sola librería, self-contained).

---

## 9. Seguridad, feature flag y auditoría

- **Feature flag por CAD** (obligatorio por la spec 6.4-6): el streaming solo se
  activa en tenants con conectividad suficiente. Tunja: activo.
- **RBAC**: solo roles autorizados ven cámaras.
- **Tokens efímeros**: nunca exponer en el frontend URLs RTSP permanentes ni el
  AppSecret; el backend firma y entrega la URL de corta vida.
- **Auditoría**: cada visualización queda registrada (quién, qué cámara, cuándo,
  con qué caso) — dato sensible.
- **HTTPS**: el manual recomienda HTTPS entre HikCentral y el navegador; usar el
  puerto TLS del HikCentral.
- **AppSecret** fuera de git (env vars / secret manager), como el resto de
  credenciales.

---

## 10. Requisitos operativos para arrancar (responsabilidad Policía/Tunja)

1. **Crear el "Partner" en HikCentral** de Tunja → entregar **AppKey + AppSecret**,
   con acceso al menos a `resource/v1/cameras` y `video/v2/cameras/previewURLs`.
2. **IP:puerto (TLS) del HikCentral** de Tunja y **acceso de red** desde el servidor
   SECAD (firewall/VPN).
3. **Lista de coordenadas** de las cámaras (`cameraIndexCode` o nombre → lat/lng),
   o habilitar la exportación del e-map.
4. Confirmar que las cámaras tienen **sub-stream en H.264**.

---

## 11. Fases

- **Fase 1 (piloto Tunja):** driver `HikCentralVmsReader` (firma AK/SK) + sync
  catálogo/estado + siembra de coordenadas + `camaras-cercanas` (PostGIS) + capa
  en el mapa + reproductor HLS del sub-stream. Feature flag + auditoría.
- **Fase 2:** baja latencia / H.265 vía player WebSocket (JsDecoder de Hikvision) o
  media gateway, si se requiere.
- **Fase 3:** PTZ, playback post-evento (`playbackURLs`), guardar clip al caso.
- **Nacional:** nuevos drivers `IVmsReader` por proveedor (Genetec, Bosch…).

---

## 12. Riesgos y decisiones abiertas

| Tema | Riesgo | Mitigación |
|---|---|---|
| Coordenadas de cámaras fijas no vienen por API | Sin ellas no hay "más cercana" | Sembrar desde lista de la Policía (§5) |
| HLS exige H.264 | Cámara solo H.265 → HLS falla | Usar sub-stream; si no hay, Fase 2 (WebSocket/gateway) |
| Ancho de banda del municipio | Varios streams saturan la WAN | Sub-stream + límite de streams concurrentes + feature flag |
| Latencia HLS (3–10 s) | Puede ser alta para despacho | Aceptable en piloto; WebSocket en Fase 2 si molesta |
| Licencia/concurrencia HikCentral | Límite de conexiones simultáneas | Confirmar con el grupo de cámaras (pregunta operativa) |
