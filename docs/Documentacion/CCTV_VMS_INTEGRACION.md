# Integración de Cámaras CCTV (VMS) en el módulo Eventos — Guía y preguntas para mesa de trabajo

> **Propósito de este documento:** preparar la reunión con el grupo que administra
> las cámaras de la Policía. Explica en lenguaje simple qué es un VMS, cómo viaja
> el video, y qué preguntas hay que hacer para poder diseñar la integración en
> SECAD. El piloto se hará en un municipio con cámaras y VMS **Hikvision**.
>
> Requisito de origen: Especificaciones Técnicas SECAD (2.3, 6.1, 6.11, 6.12):
> *"acceso a cámaras georreferenciadas a través del VMS institucional"*,
> *"cámaras integradas vía VMS"*, y responsabilidad de la Policía Nacional de
> *"habilitar APIs de los sistemas institucionales (GESPO, VMS, ARCGIS) y proveer
> credenciales"*. Es decir: mismo patrón que GESPO.
>
> **Diseño técnico concreto del piloto (Tunja, HikCentral OpenAPI V3.1.0):**
> ver `docs/CCTV_HIKCENTRAL_DISENO_TECNICO.md`.

---

## 1. La idea de fondo

SECAD **no se conecta a las cámaras**. Se conecta al **VMS** (Video Management
System / Sistema de Gestión de Video), que es el sistema institucional que
administra todas las cámaras — igual que nos conectamos a GESPO para el GPS.

El VMS nos da: (a) la **ubicación** de cada cámara y (b) el **video**. SECAD solo
pide y muestra. La objetivo funcional: en el detalle de un evento, ver en el mapa
las **cámaras más cercanas** al incidente y **reproducir el video en vivo**.

```
[Cámara] → [Red / grabador NVR] → [VMS] → [¿en qué formato nos lo entrega?] → [Pantalla del operador]
```

La última flecha —**en qué formato** el VMS entrega el video— es lo que decide si
lo podemos mostrar en el navegador directo o si hace falta un componente extra.

---

## 2. Glosario mínimo

| Término | Qué es, en simple |
|---|---|
| **VMS** | Sistema central que administra todas las cámaras. Con él hablamos, no con las cámaras. |
| **RTSP** | El "idioma" más común de las cámaras para transmitir video. **Ningún navegador reproduce RTSP directo.** |
| **Codec H.264 / H.265** | Formato de compresión. H.265 pesa la mitad, pero **muchos navegadores NO lo reproducen**. H.264 sí. |
| **HLS / LL-HLS** | Formato que **sí** reproduce el navegador. Retraso 3–10 s. |
| **WebRTC** | Formato que **sí** reproduce el navegador con retraso <1 s. Ideal para despacho. |
| **PTZ** | Cámaras que se pueden mover/girar/zoom por software. |
| **ONVIF** | Estándar universal entre marcas de cámaras. |
| **Media gateway** | "Traductor" que convierte RTSP → WebRTC/HLS para el navegador. Solo si el VMS no da ya un formato web. |
| **API / OpenAPI / SDK** | La puerta programable del VMS. Es lo que la Policía debe habilitarnos. |

**El concepto clave:** el navegador no puede reproducir el video "tal cual sale"
de la cámara (RTSP). Solo hay dos caminos: que el VMS **ya entregue formato web**
(HLS/WebRTC), o montar un **media gateway** que traduzca.

---

## 3. Específico del piloto: Hikvision

"Hikvision" puede ser dos cosas muy distintas, y cambian mucho el trabajo:

| Escenario | Qué es | Dificultad |
|---|---|---|
| **A. HikCentral Professional/Enterprise** | VMS central con **OpenAPI** oficial | 🟢 Fácil — API da ubicación + video web (HLS) |
| **B. Solo NVRs / iVMS-4200** | Grabadores sueltos o cliente de escritorio, sin servidor central | 🟡 Más trabajo — RTSP + media gateway |

### Camino A — HikCentral Professional (ideal)
Tiene **OpenAPI** (puerta de entrada "Artemis"). Con ella:
- Listar cámaras **con coordenadas** → para "la más cercana".
- Pedir el video y recibirlo directo en **HLS** (enlace temporal) → el navegador lo reproduce.
- PTZ y video grabado si se necesita después.
- Autenticación por **App Key + App Secret** (hay que pedir que nos los generen y activen la OpenAPI).

En este caso **casi no hace falta infraestructura nueva**.

### Camino B — Solo NVRs
Las cámaras/NVR entregan **RTSP** (no reproducible en navegador) + API de
dispositivo **ISAPI**. Aquí sí necesitamos un **media gateway**. Para Hikvision,
la opción estándar y liviana es **go2rtc** (o **MediaMTX**): toma el RTSP, lo
convierte a **WebRTC** para el navegador y resuelve el problema del H.265.

### El detalle que muerde: H.264 vs H.265
Hikvision suele transmitir el **main stream en H.265** (muchos navegadores no lo
reproducen). Pero cada cámara tiene también un **sub-stream en H.264**, de menor
resolución, que **sí reproduce** en cualquier navegador y **pesa menos** (bueno
para municipios con poca conectividad). **Estrategia: usar el sub-stream (H.264)
para el mapa de despacho.**

---

## 4. Preguntas para el grupo de cámaras (llevar escritas)

**Definen todo:**
1. ¿Tienen **HikCentral Professional** (servidor central), o son **NVRs/grabadores sueltos** con iVMS?
2. Si es HikCentral: ¿está habilitada la **OpenAPI** y nos pueden generar un **App Key / App Secret**?

**Sobre las cámaras y su ubicación:**
3. ¿Las cámaras tienen registradas sus **coordenadas** (están puestas en el mapa de HikCentral)? Si no, ¿nos dan la lista de ubicaciones aparte?
4. ¿Son cámaras fijas o hay **PTZ**?

**Sobre el video:**
5. ¿Transmiten en **H.264 o H.265**? ¿Hay **sub-stream en H.264** disponible?
6. ¿El VMS entrega video en **HLS/WebRTC**, o solo **RTSP**?
7. ¿El video viaja **cifrado**? (la spec nos exige cifrado en tránsito).

**Límites y operación:**
8. ¿Cuántas cámaras se pueden ver **en simultáneo** sin problema de licencia o rendimiento?
9. ¿En qué **red** está el HikCentral / los NVR y cómo nos conectamos desde el servidor de SECAD (firewall, VPN)?
10. ¿Qué se necesita **formalmente** para que nos habiliten el acceso?

---

## 5. Propuesta de implementación en SECAD (para el piloto)

Asumiendo el mejor caso (**HikCentral Professional**):

1. **Driver VMS genérico** (`IVmsReader`) con implementación `HikvisionVmsReader`
   — mismo patrón con que abstrajimos GESPO. Como en el país hay **varios
   proveedores**, mañana se agregan drivers (Genetec, Bosch…) sin tocar el resto.
2. **Sincronizar catálogo** de cámaras (id, nombre, coordenadas) a una tabla
   `cad_camaras` con columna geográfica → **reutiliza el PostGIS** que ya existe
   para "recurso más cercano".
3. **Endpoint** `GET /api/Evento/{id}/camaras-cercanas` → consulta espacial KNN
   (idéntica a la del recurso más cercano).
4. **UI en el detalle del evento**: capa de cámaras en el mapa + lista lateral
   "N cámaras cercanas" con distancia (igual que se hizo con las patrullas).
5. **Reproducción**: al hacer clic, SECAD pide a HikCentral un **enlace HLS
   temporal** del **sub-stream (H.264)** y lo reproduce embebido (hls.js). El
   video va **navegador ↔ VMS/gateway**, nunca a través del backend .NET.
6. **Feature flag por CAD/municipio** (obligatorio por spec 6.4-6): streaming
   pesado no puede estar activo en CADs de baja conectividad (categorías B/C).
7. **Seguridad y auditoría**: RBAC estricto (no todo rol ve cámaras), tokens
   efímeros (no URLs RTSP permanentes en el frontend), y registro auditable de
   cada visualización (quién, qué cámara, cuándo, con qué caso).

### Fases sugeridas
- **Fase 0 — Descubrimiento:** respuestas a las preguntas de arriba (bloqueante).
- **Fase 1 — Catálogo + cámaras cercanas + reproducción HLS** (bajo riesgo).
- **Fase 2 — Media gateway (go2rtc/MediaMTX) + WebRTC** solo si el VMS no da web o
  se necesita <1 s de latencia / transcodificación de H.265.
- **Fase 3 — Avanzado:** PTZ, playback post-evento, guardar clip al caso.

---

## 6. Resumen de una línea

**SECAD se conecta al VMS (no a las cámaras); el VMS da ubicación y video; toda la
dificultad está en el formato del video.** Para el piloto Hikvision, confirmar:
(1) HikCentral vs NVRs, (2) OpenAPI + App Key, (3) sub-stream en H.264. Con esas
tres respuestas se cierra el diseño técnico.
