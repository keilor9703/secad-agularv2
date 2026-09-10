# Plan de Implementación SECAD — Horizonte de Desarrollo
> **Documento vivo** · Última actualización: 2026-05-28  
> Referencia: Especificaciones Técnicas SECAD 25.05.2026 (OFTIC / GUSOF)

---

## Estado de cumplimiento actual: ~25–30% funcional · ~15% no funcional/arquitectural

---

## ✅ IMPLEMENTADO (baseline al 2026-05-28)

| Req. | Módulo | Detalle |
|------|--------|---------|
| 6.7 parcial | **Recepción PlantaTel** | Integración centralita, formulario estructurado, ID Snowflake, multi-canal recepción |
| 6.11 parcial | **Módulo Eventos/Despacho** | Cola por canal, semáforo SLA configurable, actuaciones, lifecycle |
| 6.17 | **Asistente Inteligente** | Preguntas orientadoras automáticas al tipificar + relato narrativo natural |
| 6.15 | **Anotaciones de turno** | Novedades, comunicados, actividades durante el turno |
| 6.18 parcial | **Auditoría básica** | Acceso a eventos, trazabilidad de sesiones |
| 7.2 parcial | **Migraciones Flyway** | V1–V19, TenantContext multi-tenant |
| 1.1 parcial | **Stack tecnológico** | C# .NET 8 + Angular 20 + PostgreSQL, open source |
| 6.6 parcial | **Turnos de vigilancia** | Módulo base: creación manual de turnos y recursos |
| 6.2 parcial | **RBAC básico** | Roles en JWT, control de acceso por módulo |
| 6.2 parcial | **Usuarios civiles** | Creación de usuarios civil/otra entidad con auth local BCrypt, fallback login, herencia de tenant |

---

## 🔴 FASE 1 — Completar núcleo operativo
**Duración estimada:** 0–3 meses  
**Prioridad:** CRÍTICA — funcionalidades que el operador CAD necesita en producción hoy

### F1.1 — Módulo GIS 2D básico (Req. 2.3, 6.12)
- [ ] Integrar Leaflet.js (open source) como componente Angular
- [ ] Capa de incidentes activos con pins por tipo y estado
- [ ] Capa de recursos en campo (patrullas, motos, etc.)
- [ ] Geocodificación de dirección del caso (Nominatim/OpenStreetMap)
- [ ] Pin automático al registrar ubicación en recepción
- [ ] Capas de contexto: Policía, médica, bomberos, ejército
- [ ] *(ArcGIS institucional se integra en Fase 3)*

### F1.2 — Módulo de Reportes (Req. 6.16)
- [ ] Tiempos de atención por incidente (creación → cierre)
- [ ] Medios utilizados por tipo de incidente
- [ ] Volumen de llamadas por hora / día / semana
- [ ] Ciclo de vida del incidente (diagrama de flujo visual)
- [ ] Exportación a PDF y Excel (librerías open source)
- [ ] Comportamiento de ingreso de llamadas y creación de incidentes

### F1.3 — Completar ciclo de vida del incidente (Req. 6.11)
- [ ] Botón "Despachar a agencia" en detalle del evento
- [ ] Trazabilidad completa: quién hizo qué y cuándo
- [ ] Vista timeline: creación → recepción → despacho → atención → cierre
- [ ] Clasificación diferencial por población vulnerable

### F1.4 — Detección de duplicados (Req. 6.8)
- [ ] Al crear incidente: buscar últimos 30 min por dirección + tipo
- [ ] Alerta visual al operador: "Posible duplicado: Evento #XXXX en misma zona"
- [ ] Operador decide fusionar o crear nuevo
- [ ] ID raíz único con prefijo código DANE

### F1.5 — Multicanal: Chat y SMS entrada (Req. 6.7)
- [ ] Endpoint REST `POST /api/integracion/chat` — recepción automática de casos chat
- [ ] Endpoint REST `POST /api/integracion/sms` — recepción de SMS
- [ ] Ambos crean pedido con `origen = 'CHAT'` / `origen = 'SMS'`
- [ ] Operador ve casos entrantes en cola de recepción
- [ ] Soporte para adjuntar fotografías al incidente vía API

---

## 🔴 FASE 2 — Seguridad y administración
**Duración estimada:** 3–6 meses  
**Prioridad:** ALTA — requerida por especificaciones de seguridad institucional

### F2.1 — Autenticación OUD/LDAP + fallback local (Req. 1.3, 3.3, 6.2)
- [ ] Integrar `Novell.Directory.Ldap.NETStandard` o `System.DirectoryServices.Protocols`
- [ ] Flujo: Login → API Gateway → OUD (LDAP/S) → JWT con tenant_id
- [ ] Fallback: tabla `local_users_fallback` con credenciales bcrypt cuando OUD falla
- [ ] Flag `modo_fallback = true` en JWT cuando se usa fallback
- [ ] Funcionarios civiles / otras entidades: autenticación solo local (NO OUD)
- [ ] Rotación automática de credenciales locales cada 90 días

### F2.2 — Doble Factor de Autenticación 2FA (Req. 3.3, 6.2)
- [ ] TOTP con `OtpNet` (compatible Google/Microsoft Authenticator)
- [ ] Código QR para enrolamiento inicial
- [ ] Códigos de backup de recuperación (8 códigos únicos)
- [ ] Administrador puede forzar o desactivar MFA por rol/usuario

### F2.3 — RBAC granular + gestión de sesión (Req. 6.2)
- [ ] Caducidad de sesión configurable (15 min, 30 min, 1h, por turno)
- [ ] Bloqueo de cuenta por intentos fallidos (configurable: 3/5/10 intentos)
- [ ] Cierre de sesión remoto por administrador
- [ ] Herencia de permisos: rol hijo hereda permisos del padre
- [ ] Mínimo privilegio: operador solo ve su canal asignado
- [ ] MFA integrado (TOTP de F2.2)

### F2.4 — Módulo administración nacional de CADs (Req. 2.5, 6.4, 6.5)
- [ ] Dashboard nacional: estado de salud de cada CAD (online/degradado/offline)
- [ ] Registro de nuevos CADs con código DANE, nombre, departamento, municipio
- [ ] Activar / desactivar / suspender tenants
- [ ] Feature flags por CAD (habilitar/deshabilitar módulos específicos)
- [ ] Visualización versión schema Flyway por tenant
- [ ] Disparo controlado de migraciones pendientes
- [ ] Configuración segura de credenciales de BD (cifrado vía Vault)
- [ ] Solo accesible con rol `ADMIN_PLATAFORMA`
- [ ] Registro auditable de todas las acciones administrativas

---

## 🟡 FASE 3 — Integraciones y capas avanzadas
**Duración estimada:** 6–12 meses  
**Prioridad:** MEDIA — amplía capacidades e interoperabilidad

### F3.1 — Integración GESPO para turnos y recursos (Req. 6.6)
- [ ] Consumir API REST de GESPO: personal en turno, recursos, posición GPS
- [ ] Sincronización periódica (cada 60s) con actualización en mapa GIS
- [ ] Recursos Policía Nacional desde GESPO; otras agencias: creación manual
- [ ] Guardado local en SECAD para operación sin dependencia de GESPO

### F3.2 — Integración de agencias EDXL-DE (Req. 6.1)
- [ ] `POST /api/integracion/entrada` — recibe incidente de agencia externa
- [ ] `POST /api/integracion/salida/{id}` — envía incidente a agencia
- [ ] Formato EDXL-DE o JSON simplificado documentado en Swagger/OpenAPI
- [ ] Catálogo auditable de agencias: jurisdicción, especialidad, horarios, cobertura, capacidad
- [ ] Historial de cambios con trazabilidad completa
- [ ] Máximo 10 integraciones activas por CAD

### F3.3 — GIS avanzado + ArcGIS + VMS cámaras (Req. 2.3, 6.12)
- [ ] Integrar licencias ArcGIS de la Policía Nacional (FeatureService WMS/WFS)
- [ ] Integrar VMS para cámaras georreferenciadas (popup de video al hacer clic)
- [ ] Mapas de calor histórico por tipo de incidente
- [ ] Geocercas configurables con alertas automáticas
- [ ] Herramienta de reproducción cronológica post-evento
- [ ] Rutas dinámicas para recursos despachados
- [ ] Niveles: Ciudad / Región / Departamento / Nación

### F3.4 — Videollamada WebRTC ciudadano-operador (Req. 6.7)
- [ ] Enlace único y temporal generado por el operador (TTL configurable)
- [ ] Envío del link al ciudadano vía SMS o WhatsApp
- [ ] Sala WebRTC open source (Jitsi Meet embebido o mediasoup)
- [ ] Asociación automática al número de incidente activo
- [ ] Registro: coordenadas GPS del ciudadano, hora, operador, metadata técnica
- [ ] Sin requerir instalación de app en dispositivo del ciudadano
- [ ] Integración con Webex (req. 6.21)

### F3.5 — ELS/AML localización del llamante (Req. 6.8)
- [ ] Integrar con operadores móviles para coordenadas ELS (Google) y AML (ETSI/EENA)
- [ ] Visualización automática en capa GIS al recibir llamada PlantaTel
- [ ] Sin requerir app adicional ni datos activos del usuario
- [ ] *(Condicionado a acuerdos Policía Nacional ↔ operadores móviles)*

### F3.6 — Integración botones de pánico y sensores (Req. 6.7)
- [ ] Endpoint de entrada para dispositivos de alerta física/digital
- [ ] Activación inmediata de alerta en cola de recepción
- [ ] Despacho oportuno de recursos

---

## 🟢 FASE 4 — IA, analítica y arquitectura avanzada
**Duración estimada:** 12–18 meses  
**Prioridad:** LARGO PLAZO — arquitectura target y capacidades avanzadas

### F4.1 — Transcripción voz a texto + extracción IA (Req. 6.8, 6.10)
- [ ] Whisper (OpenAI, 100% local) para transcripción asíncrona post-llamada
- [ ] Extracción NLP: dirección, barrio, tipo emergencia, número de heridos, placas
- [ ] Información presentada como **sugerida** al operador — sin autocompletar
- [ ] Habilitabe/deshabilitabe por administrador sin afectar operación
- [ ] Procesamiento 100% local (req. 10.3 — sin egress externo)
- [ ] Condicionado a compatibilidad de formatos de audio de la planta telefónica

### F4.2 — ACD — Gestión de colas omnicanal (Req. 6.21)
- [ ] Cola de llamadas en tiempo real: volumen, ASA, abandonos, SLA
- [ ] Skills-based routing: asignar llamadas según habilidades del operador
- [ ] Estados de agente configurables: Disponible, Ocupado, Pausa, Desconectado
- [ ] Grabación de llamadas con trazabilidad al ID de incidente
- [ ] Integración PlantaTel/SIP mejorada
- [ ] Monitoreo: tablero supervisor en tiempo real

### F4.3 — Analítica ETL/DWH nacional (Req. 5.1)
- [ ] Pipeline ETL con Apache Airflow: extrae datos agregados de todos los tenants
- [ ] Pseudoanonimización antes de pasar al DWH (Ley 1581/2012 — datos sensibles)
- [ ] Data Warehouse centralizado en Bogotá (PostgreSQL o ClickHouse)
- [ ] Dashboards BI (Metabase o Grafana) apuntando exclusivamente al DWH
- [ ] Sin impacto en rendimiento operativo de los CADs
- [ ] KPIs y analítica operacional exportables

### F4.4 — Arquitectura microservicios Docker/Kubernetes (Req. 1.1, 7.1, 7.2)
- [ ] Separar servicios: Auth, TenantResolver, CADCore, DispatchEngine, GIS, AIService
- [ ] Dockerización de cada servicio
- [ ] Kubernetes para orquestación en producción
- [ ] API Gateway: Kong o Traefik
- [ ] HashiCorp Vault para credenciales de BD por tenant (rotación automática 90 días)
- [ ] Connection Pool Manager con credenciales cifradas
- [ ] Schema master solo para enrutamiento y autenticación global (sin datos operativos)

### F4.5 — Resiliencia 3 niveles + modo offline (Req. 4.1)
- [ ] **Nivel 1 (Normal):** Escrituras a BD central + réplica local en standby
- [ ] **Nivel 2 (Degradado):** Conmutación silenciosa a réplica local write-capable + alerta monitoreo
- [ ] **Nivel 3 (Offline):** Servidor edge opera como primaria — funcionalidad completa equivalente al SECAD actual
- [ ] Reconciliación automática al restaurar enlace (máx. 15 min)
- [ ] Aplicable: Vaupés, Amazonas, Vichada, Guainía, zonas PDET

### F4.6 — PWA + compatibilidad móvil (Req. 7.6)
- [ ] Service Worker para carga offline de la interfaz
- [ ] Manifest PWA instalable en Android, iOS y escritorio
- [ ] Compatibilidad verificada: Chrome, Firefox, Edge, Safari (versiones especificadas)

### F4.7 — Sincronización NTP (Req. 6.20)
- [ ] Sincronización horaria con `ntp1.inm.gov.co` (servidor referencia Colombia)
- [ ] Servidor NTP maestro + secundario con conmutación automática ≤30 segundos
- [ ] Timestamps en UTC, visualización en UTC-5 (Colombia)
- [ ] Precisión máxima ±1 segundo
- [ ] Registro de períodos de desincronización en auditoría

### F4.8 — DRP + alta disponibilidad 24/7 (Req. 6.19)
- [ ] Valoración de riesgo (impacto/probabilidad) documentada
- [ ] Sitios alternos definidos y configurados
- [ ] Diseño, implementación y pruebas del DRP
- [ ] Simulacros periódicos con registro de lecciones aprendidas
- [ ] SLA ≥99.95% servicios globales · SLA ≥99.9% por tenant

---

## 📋 REQUISITOS NO FUNCIONALES PENDIENTES

| Req. | Descripción | Fase |
|------|-------------|------|
| 1.6 | Suite completa de pruebas: unitarias, integración, funcionales, rendimiento, seguridad | F2 |
| 1.13 | Pruebas de vulnerabilidades OWASP Top 10 | F2 |
| 1.16 | Manual de usuario, manual técnico, modelos arquitectura, casos de uso, entidad-relacional | F3 |
| 6.13 | Dashboard nacional de salud de CADs (estado en tiempo real) | F2.4 |
| 6.22 | Cumplimiento NG911/NG112/NENA i3 | F4 |
| 7.5 | SLA documentado y garantizado ≥99.9% | F4 |
| 10.2 | Seguridad multitenant: VLAN/VPC, validación tenant en cada request, pruebas cross-tenant | F2 |
| 10.3 | Seguridad IA: procesamiento 100% local, bloqueo de egress para inferencia | F4.1 |

---

## 📊 Resumen ejecutivo por fase

| Fase | Alcance | Duración | Prioridad |
|------|---------|----------|-----------|
| **F1** | GIS básico · Reportes · Ciclo de vida · Duplicados · Chat/SMS | 0–3 meses | 🔴 Crítica |
| **F2** | OUD/LDAP · 2FA · RBAC granular · Admin CADs nacional | 3–6 meses | 🔴 Alta |
| **F3** | GESPO · EDXL-DE agencias · GIS avanzado · WebRTC · ELS/AML | 6–12 meses | 🟡 Media |
| **F4** | IA/Whisper · ACD · ETL/DWH · Microservicios · Offline · DRP | 12–18 meses | 🟢 Largo plazo |

---

## 🔖 Notas de contexto del proyecto

- **Stack:** Angular 20 standalone + ASP.NET Core 8 + PostgreSQL + Npgsql
- **IDs:** Snowflake (BIGINT 19 dígitos, serializados como `string` en frontend)
- **Migraciones:** Flyway — carpeta `docs/sql/master/`
- **Multi-tenant:** `TenantContext` resuelve la BD por tenant desde JWT
- **Usuarios civiles / otras entidades:** autenticación SOLO local (nunca OUD/LDAP)
- **Comentario en pedido (cad_pedidos.comentario):** INMUTABLE una vez registrado
- **Control de flujo Angular:** `@if` / `@for` (nueva sintaxis, no `*ngIf` / `*ngFor`)

---

*Documento generado el 2026-05-28. Actualizar el estado de las casillas `[ ]` → `[x]` a medida que se complete cada ítem.*
