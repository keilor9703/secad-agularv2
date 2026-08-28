# Edge PlantaTel Service

Microservicio mínimo de despacho para el **Nivel 3 (Offline)** del modelo de
resiliencia de SECAD (Especificaciones Técnicas §7.1 — "servicios edge:
microservicios mínimos de despacho en nodos locales").

Se despliega en la sede local de cada CAD como destino de **fallback** de la
PBX cuando `https://secad.polired.gov.co` no responde. Su único trabajo es
recibir el evento de llamada entrante y escribirlo en la tabla
`cad_plantatel` de la base de datos local, para que el operador siga
viendo llamadas entrantes por el mismo mecanismo de polling que usa en modo
normal.

## Qué hace

- `POST /api/plantatel` — recibe `{ acd, numTelefono, sitioGraba }`, valida
  `X-Api-Key` e inserta una fila en `cad_plantatel` (BD local).
- `GET /health` — healthcheck simple para el balanceador/PBX.

## Qué NO hace (fuera de alcance)

Este servicio **no reemplaza** al backend central ni asume que exista una
réplica PostgreSQL local promovida a primaria — eso, junto con la
reconciliación automática al restaurar el enlace WAN, es infraestructura que
todavía no existe en el proyecto. Ver
[`backend/docs/RESILIENCIA_ESTADO_ACTUAL.md`](../docs/RESILIENCIA_ESTADO_ACTUAL.md)
(Componentes A, B y C) para el estado real y lo que falta por construir antes
de que el Nivel 3 sea funcional de punta a punta:

- Servidor PostgreSQL local en modo standby + promoción a primaria.
- Conmutación automática primaria/réplica en `ConnectionPoolManager`.
- Motor de reconciliación al restaurar la WAN.

Mientras esos componentes no existan, este microservicio solo tiene sentido
si ya hay una base de datos local disponible en la sede (por ejemplo, una
instancia PostgreSQL standalone con el esquema de `cad_plantatel`) a la
que el operador esté apuntando manualmente en modo contingencia.

## Configuración

`appsettings.json`:

```json
{
  "ConnectionStrings": {
    "LocalDb": "Host=localhost;Port=5432;Database=secad_local;Username=secad_edge;Password=..."
  },
  "EdgePlantaTel": {
    "ApiKey": "clave-compartida-con-la-pbx-de-esta-sede",
    "SitioGraba": 0
  }
}
```

- `EdgePlantaTel:SitioGraba` es el sitio de grabación por defecto de esta sede; se
  usa si la PBX no envía `sitioGraba` en el payload.
- La `ApiKey` es local a esta instancia — no depende de Vault ni del backend
  central, porque el nodo edge debe poder operar sin conectividad a Bogotá.

## Contrato del endpoint

```
POST /api/plantatel
X-Api-Key: <clave-local-de-esta-sede>
Content-Type: application/json

{
  "acd": "2001",
  "numTelefono": "3001234567",
  "sitioGraba": 1
}
```

Respuesta:

```json
{ "success": true, "message": "Llamada PlantaTel registrada en el nodo edge (modo offline).", "id": "123" }
```

Es intencionalmente el mismo contrato que
`POST api/RecepcionExterna/plantatel` del backend central, para que la PBX pueda
usar la misma plantilla de payload en ambos destinos (primario y fallback).

## Despliegue

```bash
docker build -t edge-plantatel-service -f backend/edge-plantatel-service/Dockerfile backend/edge-plantatel-service
docker run -p 8081:8081 \
  -e ConnectionStrings__LocalDb="Host=...;Database=...;Username=...;Password=..." \
  -e EdgePlantaTel__ApiKey="..." \
  -e EdgePlantaTel__SitioGraba=1 \
  edge-plantatel-service
```
