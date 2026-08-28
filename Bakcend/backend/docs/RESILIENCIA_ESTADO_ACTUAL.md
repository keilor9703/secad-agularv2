# Resiliencia — Estado de implementación vs. especificación técnica

**Referencia:** Especificaciones Técnicas SECAD — Sección 4.1  
**Fecha de revisión:** mayo 2026  
**Autor:** Revisión técnica durante sprint de modernización

---

## Contexto

La especificación técnica define un sistema que opera en **tres niveles de resiliencia** para garantizar que los CADs de zonas con conectividad precaria (Vaupés, Amazonas, Vichada, Guainía, zonas PDET) nunca pierdan operatividad, incluso ante pérdida total del enlace WAN con Bogotá.

Este documento registra qué se ha implementado, qué está pendiente de validación y qué debe construirse para alcanzar el cumplimiento completo.

---

## Mapa de cumplimiento por nivel

### Nivel 1 — Normal
> *"Conectado a Bogotá. Todas las escrituras van a BD primaria central. Réplica local sincronizada en standby."*

| # | Requisito | Estado | Observación |
|---|-----------|--------|-------------|
| 1.1 | Detectar y clasificar el estado Normal (latencia OK) | ✅ **CUMPLE** | `CadHealthMonitorService` detecta y persiste nivel 1 cuando latencia < `DegradedLatencyMs` |
| 1.2 | Todas las escrituras van a BD primaria central | ✅ **CUMPLE** | Comportamiento actual del sistema. `ConnectionPoolManager` apunta a un único endpoint por tenant |
| 1.3 | Réplica local sincronizada en standby | ❌ **NO CUMPLE** | No existe réplica local en ningún CAD. No hay infraestructura PostgreSQL local en las sedes |

---

### Nivel 2 — Degradado
> *"Latencia WAN supera umbral configurable. Conmutación silenciosa a réplica local write-capable. Alerta automática al monitoreo central."*

| # | Requisito | Estado | Observación |
|---|-----------|--------|-------------|
| 2.1 | Detectar latencia WAN por encima de umbral configurable | ✅ **CUMPLE** | Umbral `DegradedLatencyMs` en `appsettings.json`, clasificación automática a nivel 2 |
| 2.2 | Alerta automática al monitoreo central | ✅ **CUMPLE** | Dashboard "Salud CADs" refleja el estado en tiempo real. Logs con nivel `Warning`. Toast al cargar si hay CADs con alerta |
| 2.3 | Conmutación silenciosa a réplica local write-capable | ❌ **NO CUMPLE** | El sistema detecta Degradado pero no hace nada operativo. Sigue escribiendo en la misma BD primaria o falla. No existe réplica local ni lógica de failover en `ConnectionPoolManager` |

---

### Nivel 3 — Offline
> *"Pérdida total de conectividad (aplica especialmente para Vaupés, Amazonas, Vichada, Guainía, zonas PDET). El servidor edge local opera como primaria. Funcionalidad completa equivalente al SECAD actual. Reconciliación automática al restaurar enlace (máx. 15 min)."*

| # | Requisito | Estado | Observación |
|---|-----------|--------|-------------|
| 3.1 | Detectar pérdida total de conectividad | ✅ **CUMPLE** | `CadHealthMonitorService` detecta y persiste nivel 3 tras `OfflineThreshold` fallos consecutivos |
| 3.2 | Servidor edge local opera como primaria | ❌ **NO CUMPLE** | No existe servidor edge ni PostgreSQL local en las sedes. Cuando cae el enlace, la aplicación simplemente falla con error de conexión |
| 3.3 | Funcionalidad completa sin conexión a Bogotá | ❌ **NO CUMPLE** | La arquitectura actual es 100% dependiente de la BD central. Sin conexión = sin operación |
| 3.4 | Reconciliación automática al restaurar enlace (máx. 15 min) | ❌ **NO CUMPLE** | No existe lógica de reconciliación. El `SnowflakeGenerator` está implementado (prerequisito para merge sin colisiones de IDs), pero el motor de sync no existe |

---

## Resumen ejecutivo de brechas

```
Especificación exige:
┌─────────────────────────────────────────────────────────────────┐
│  DETECCIÓN  →  CONMUTACIÓN  →  OPERACIÓN EDGE  →  RECONCILIACIÓN│
└─────────────────────────────────────────────────────────────────┘

Estado actual:
┌─────────────┐
│  DETECCIÓN  │   ← solo esta capa está completa
└─────────────┘
```

**Implementado:** Capa de observabilidad completa. El sistema sabe cuándo un CAD está bien, degradado o caído. Lo mide, lo persiste y lo muestra.

**Faltante:** Las tres capas operativas — conmutación, operación autónoma y reconciliación.

---

## Componentes faltantes — detalle técnico

### Componente A — Infraestructura: Réplica local PostgreSQL por CAD

**Qué es:**  
Cada sede CAD necesita un servidor PostgreSQL local configurado en modo `standby` (streaming replication desde la BD central de Bogotá). En condiciones normales es de solo lectura y recibe los cambios automáticamente. Al conmutar, se promueve a write-capable.

**Qué implica:**  
- Servidor físico o virtual en cada sede CAD
- PostgreSQL configurado con `primary_conninfo` apuntando a Bogotá
- Script o proceso de promoción automática (`pg_ctl promote` o `pg_promote()`)
- Monitoreo del lag de replicación (columna `replica_lag_ms` en `secad_tenants`, ya existe el espacio)

**Archivos a crear/modificar (cuando se retome):**
- Scripts SQL de configuración de réplica: `backend/docs/sql/replica/`
- Configuración `postgresql.conf` y `pg_hba.conf` para cada sede
- `DtoTenant.cs` → agregar `DbReplicaHost`, `DbReplicaPort` (campos de réplica local)
- `secad_tenants` tabla → agregar columnas `replica_host`, `replica_port`, `replica_lag_ms`

---

### Componente B — Backend: Lógica de conmutación en `ConnectionPoolManager`

**Qué es:**  
El `ConnectionPoolManager` actual solo conoce un endpoint por tenant (la BD primaria central). Debe aprender a manejar dos endpoints (primaria + réplica local) y conmutar automáticamente.

**Qué implica:**

```csharp
// Estado actual — solo un pool por tenant:
public NpgsqlDataSource GetOrCreate(DtoTenant tenant)
{
    return _pools.GetOrAdd(tenant.CodDane, _ => BuildDataSource(tenant));
}

// Lo que debe implementarse — pool primario + fallback a réplica:
public NpgsqlDataSource GetOrCreateWithFallback(DtoTenant tenant)
{
    // 1. Intentar BD primaria (Bogotá)
    // 2. Si falla o está en modo Offline confirmado → conmutar a réplica local
    // 3. Registrar en qué modo está operando cada tenant
    // 4. Al detectar que la primaria vuelve → re-enrutar y marcar para reconciliación
}
```

**Estado del tenant en tiempo de ejecución:**
```csharp
public enum TenantOperationMode
{
    Primary,      // Operando en BD central (normal)
    Replica,      // Operando en réplica local (degradado/offline)
    Reconciling   // BD central recuperada, reconciliación en curso
}
```

**Archivos a crear/modificar (cuando se retome):**
- `ConnectionPoolManager.cs` → lógica de failover + modo de operación por tenant
- `TenantContext.cs` → exponer `OperationMode` para que los servicios lo conozcan
- `DtoTenant.cs` → campos `DbReplicaHost`, `DbReplicaPort`

---

### Componente C — Backend: Motor de reconciliación

**Qué es:**  
Al restaurar el enlace WAN, los registros escritos en la réplica local durante el período Offline deben sincronizarse con la BD central sin pérdida de datos, sin duplicados y en máximo 15 minutos.

**Prerequisito ya cumplido:**  
El `SnowflakeGenerator` está implementado. Genera IDs únicos por nodo (configurado con `NodeId` en `appsettings.json`). Esto garantiza que los IDs generados localmente durante el Offline no colisionen con los generados en Bogotá. Este era el prerequisito técnico más crítico y ya está resuelto.

**Qué falta:**

```
Al detectar restauración del enlace:
    1. Marcar tenant como modo Reconciling
    2. Identificar registros escritos en réplica local desde la última sincronización
       → tabla secad_sync_pendiente (a crear) o por timestamp + node_id del Snowflake
    3. Aplicar esos registros en la BD central (insert/update con manejo de conflictos)
    4. Verificar integridad referencial
    5. Confirmar sincronización completada
    6. Volver a modo Primary
    7. Registrar duración de la reconciliación en secad_salud_historial
```

**Archivos a crear (cuando se retome):**
- `backend/docs/sql/master/Vxx__resiliencia_sync_tables.sql` — tablas de control de sincronización
- `Datos/Gestion/ReconciliacionRepository.cs` — lógica de merge
- `Api/BackgroundServices/ReconciliacionService.cs` — BackgroundService que monitorea el estado y dispara la reconciliación
- `Datos/Interfaz/IReconciliacionRepository.cs` — interfaz

---

## Validaciones necesarias antes de retomar

Antes de implementar los componentes faltantes, confirmar:

| # | Pregunta | Impacto en el diseño |
|---|----------|----------------------|
| V1 | ¿Cada sede CAD tiene (o tendrá) un servidor local disponible para alojar la réplica? | Sin esto, los niveles 2 y 3 no son físicamente posibles |
| V2 | ¿El presupuesto contempla hardware/VM en sedes remotas (Vaupés, Amazonas, Vichada, Guainía)? | Define si es réplica en hardware propio o cloud edge |
| V3 | ¿Las tablas de la BD tienen `created_at` y `updated_at` consistentes en todos los módulos? | Crítico para identificar registros a reconciliar |
| V4 | ¿Todos los IDs del sistema usan Snowflake o hay tablas con `SERIAL`/`BIGSERIAL`? | Las tablas con serial generarán colisiones al reconciliar |
| V5 | ¿Cuál es el volumen máximo de registros que un CAD puede generar durante una ventana Offline de 24h? | Define si 15 minutos de reconciliación es alcanzable |
| V6 | ¿Qué pasa con registros en conflicto? (misma entidad modificada en central y en edge simultáneamente) | Define la estrategia de merge: last-write-wins, manual, campo-a-campo |

---

## Estado del prerequisito Snowflake

El generador de IDs distribuido `SnowflakeGenerator` ya está implementado y en producción:

```json
// appsettings.json
"Snowflake": {
    "NodeId": 1   // Nodo principal
                  // Nodos edge deben usar NodeId diferente (ej: 2, 3, 4...)
}
```

**Pendiente:** asignar y configurar un `NodeId` único para cada sede CAD en su `appsettings.json` local. Sin esto, dos nodos podrían generar el mismo ID.

---

## Orden de implementación recomendado (cuando se retome)

```
1. Resolver validaciones V1–V6 (decisiones de negocio/infraestructura)
2. Definir y asignar NodeIds por sede CAD
3. Auditar tablas → identificar las que usan SERIAL en lugar de Snowflake
4. Migrar tablas críticas de SERIAL a Snowflake (si aplica)
5. Agregar columnas de réplica en DtoTenant + secad_tenants
6. Implementar lógica de failover en ConnectionPoolManager (Componente B)
7. Crear tablas de control de sincronización (Componente C — SQL)
8. Implementar ReconciliacionRepository + ReconciliacionService (Componente C — código)
9. Pruebas de integración: simular corte WAN y verificar conmutación + reconciliación
10. Validar tiempo de reconciliación ≤ 15 min con volumen real de datos
```

---

## Archivos relevantes del estado actual

| Archivo | Propósito |
|---------|-----------|
| `backend/oftic/oftic/BackgroundServices/CadHealthMonitorService.cs` | Servicio de monitoreo (detección, clasificación, persistencia) |
| `backend/oftic/oftic/BackgroundServices/CadHealthMonitorOptions.cs` | Configuración del monitor |
| `backend/oftic/oftic/appsettings.json` | Parámetros `HealthMonitor.*` y `Snowflake.NodeId` |
| `backend/oftic/oftic.dl/Tenant/ConnectionPoolManager.cs` | Gestor de pools — aquí va la lógica de failover |
| `backend/oftic/oftic.cl/Dtos/Tenant/DtoTenant.cs` | DTO tenant — agregar campos de réplica |
| `backend/oftic/oftic.dl/Gestion/DbMasterRepository.cs` | Repositorio maestro |
| `backend/docs/sql/master/` | Migraciones SQL de la BD maestra |
| `backend/docs/HEALTH_MONITOR.md` | Documentación del monitor de salud |
