# Integración PlantaTel — PBX → SECAD

Implementa la recepción de llamadas entrantes desde la centralita telefónica
(PBX/PlantaTel) de cada CAD, reemplazando la integración local antigua
(`localhost`) por un endpoint centralizado multi-tenant en Bogotá, con un
microservicio edge como respaldo cuando no hay conectividad WAN.

## Los 3 niveles de operación

```
Nivel 1 — Normal
  PBX Cali → HTTPS + X-Cod-Dane: 11001 → API Central Bogotá
           → TenantMiddleware → BD Cali (Bogotá)
           → cad_plantatel (BD Cali)
           → Operador Cali hace polling → ve la llamada

Nivel 2 — Degradado (WAN lenta)
  Igual al Nivel 1, pero contra una réplica local write-capable.
  ⚠️ Pendiente: no existe réplica local ni conmutación automática.
  Ver backend/docs/RESILIENCIA_ESTADO_ACTUAL.md (Componentes A y B).

Nivel 3 — Offline (sin WAN)
  PBX Cali → HTTPS a Bogotá FALLA → fallback → microservicio edge local
           → cad_plantatel (BD local)
           → Operador Cali hace polling (BD local) → ve la llamada
  ⚠️ Pendiente: reconciliación automática al restaurar la WAN.
  Ver backend/docs/RESILIENCIA_ESTADO_ACTUAL.md (Componente C).
```

Este documento cubre lo que ya está implementado: el **endpoint PlantaTel**
(Nivel 1) y el **microservicio edge** que recibe el mismo payload cuando la
PBX no alcanza a Bogotá (Nivel 3, solo la escritura — ver limitaciones
abajo).

## 1. Endpoint PlantaTel en el backend central

```
POST /api/RecepcionExterna/plantatel
```

Implementado en
[`backend/oftic/oftic/Controllers/Operacion/RecepcionExternaController.cs`](../backend/oftic/oftic/Controllers/Operacion/RecepcionExternaController.cs),
siguiendo exactamente el mismo patrón que los endpoints existentes de
Chat (`/chat`) y SMS (`/sms`): autenticación por `X-Api-Key` y resolución de
tenant por `X-Cod-Dane` (vía `TenantMiddleware`, ya existente — sin cambios).

**Headers:**

| Header | Descripción |
|---|---|
| `X-Api-Key` | Clave configurada en `RecepcionExterna:ApiKey` (appsettings del backend central) |
| `X-Cod-Dane` | Código DANE del CAD destino — resuelve el tenant y la BD correcta |

**Body:**

```json
{
  "acd": "2001",
  "numTelefono": "3001234567",
  "sitioGraba": 1
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `acd` | string | Extensión del operador destino (se normaliza a entero) |
| `numTelefono` | string | Número del ciudadano que llama |
| `sitioGraba` | int | Consecutivo de `cad_sitios_grabacion` de la sede que origina la llamada |

**Respuesta:**

```json
{ "success": true, "message": "Llamada PlantaTel registrada.", "id": "123" }
```

El endpoint inserta directamente en `cad_plantatel` (tabla ya existente
desde `V4__reception_tables.sql`, renombrada de `cad_interfaz_cti` en
`V38__rename_cti_a_plantatel.sql`) del tenant resuelto por `X-Cod-Dane`. No
crea un `cad_pedidos` — esa tabla es solo el buzón de llamadas entrantes que
el operador consume por polling.

## 2. Reconfiguración de la PBX en cada ciudad

Cambio de infraestructura local, sin intervención de hardware — se hace
desde la consola de administración de la PBX (Cisco, Avaya, Asterisk, etc.):

| | Antes | Después |
|---|---|---|
| URL destino | `http://192.168.1.10/api/cti` (IP local) | `https://secad.polired.gov.co/api/RecepcionExterna/plantatel` |
| Autenticación | Ninguna (localhost) | `X-Api-Key` + `X-Cod-Dane` |
| Fallback | N/A | `http://<ip-edge-local>:8081/api/plantatel` (ver microservicio edge) |

**Importante:** la ruta cambió de `/api/RecepcionExterna/cti` a
`/api/RecepcionExterna/plantatel` (renombrada por completo, sin alias de
compatibilidad) — cada PBX ya configurada con la URL antigua debe
actualizarse a la vez que se despliega este cambio, o dejará de registrar
llamadas entrantes.

La `X-Api-Key` se gestiona hoy como una clave compartida en
`appsettings.json` del backend (`RecepcionExterna:ApiKey`) — igual que Chat
y SMS. Migrarla a una clave por tenant gestionada en Vault, como describe la
especificación original, queda fuera de este cambio y requiere una
extensión de `DtoTenant`/`secad_tenants` que hoy no existe.

## 3. Polling del operador — sin cambios

`GET /api/Recepcion/llamada` (en `RecepcionController.cs`) ya filtra por
`sitio_graba`, `acd` y `registrada = 'N'` usando los claims del JWT del
operador (`sitio_graba`, `acd`) y el tenant resuelto por `TenantMiddleware`
a partir del `cod_dane` del JWT. El aislamiento multi-tenant ya lo garantiza
el middleware existente — el endpoint PlantaTel solo agrega filas a la
misma tabla que este flujo ya consume.

## 4. Microservicio edge (Nivel 3 — Offline)

Ver [`backend/edge-plantatel-service/README.md`](../backend/edge-plantatel-service/README.md)
para el detalle completo. En resumen: un servicio standalone con el mismo
contrato (`POST /api/plantatel`), pensado como destino de fallback de la PBX
cuando `secad.polired.gov.co` no responde. Escribe en una BD PostgreSQL
local — **no** resuelve tenant ni depende del backend central.

**Importante:** este microservicio solo resuelve la parte de *ingesta* del
Nivel 3. La promoción de una réplica local a primaria y la reconciliación
automática al restaurar el enlace WAN siguen sin implementar — están
documentadas como pendientes en
[`backend/docs/RESILIENCIA_ESTADO_ACTUAL.md`](../backend/docs/RESILIENCIA_ESTADO_ACTUAL.md).
Desplegar el microservicio edge sin resolver esos componentes solo tiene
sentido si la sede ya cuenta con una BD PostgreSQL local operativa (por
ejemplo, en un piloto controlado).
