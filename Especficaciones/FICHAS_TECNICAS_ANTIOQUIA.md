# Fichas técnicas — Despliegue departamental de Antioquia

> **Cómo usar este documento.** Está redactado para pegarse en el pliego: sin
> marcas ni fabricantes, con la misma estructura de tabla que las fichas
> actuales (Descripción · Cumple · No cumple). Lo que está entre `[corchetes]`
> es un dato que la entidad debe confirmar antes de publicar.
>
> Las notas internas, el análisis y lo que **no** debe prometerse están en
> [`docs/Documentacion/ANTIOQUIA_DESPLIEGUE_DEPARTAMENTAL.md`](../docs/Documentacion/ANTIOQUIA_DESPLIEGUE_DEPARTAMENTAL.md).
> Ese archivo no va al pliego.

---

## 0. Alcance y criterios de dimensionamiento

### 0.1 Alcance

Infraestructura para operar el SECAD en el departamento de Antioquia, con:

- **Un núcleo departamental** en el centro de datos principal de
  `[Gobernación de Antioquia / sede a definir, Medellín]`.
- **Nodos edge** en los centros de atención y despacho (CAD) locales que se
  relacionan en el Anexo de sedes.
- **Sin componentes de inteligencia artificial** en esta etapa (ver §11).

### 0.2 Criterios de dimensionamiento

Toda la infraestructura ofertada debe soportar, con holgura, estas cargas. Son
las que se verificarán en las pruebas de aceptación (§0.3).

| N.° | Criterio | Valor |
|---|---|---|
| 0.2.1 | Llamadas atendidas por día (diseño) | 6.000 |
| 0.2.2 | Llamadas simultáneas en el pico | 100 |
| 0.2.3 | Videollamadas ciudadano–operador simultáneas | 25 |
| 0.2.4 | Usuarios concurrentes (recepción, despacho, supervisión) | 150 |
| 0.2.5 | Municipios (inquilinos) operando en el núcleo | 125 |
| 0.2.6 | Crecimiento previsto a 5 años sobre la carga de diseño | 50 % |
| 0.2.7 | Retención mínima de grabaciones y adjuntos | `[3]` años |
| 0.2.8 | Disponibilidad del servicio en el centro de datos principal | 99,9 % mensual |

### 0.3 Pruebas de aceptación

| N.° | Descripción | Cumple | No cumple |
|---|---|---|---|
| 0.3.1 | El contratista ejecutará una **prueba de carga** que demuestre los criterios 0.2.1 a 0.2.4 simultáneos durante mínimo 2 horas, con tiempo de respuesta del percentil 95 menor a 1 s en las operaciones de recepción y despacho. | | |
| 0.3.2 | Prueba de **falla de un servidor del núcleo** y de **un servidor de medios**, con el servicio activo: el servicio no se interrumpe más de 60 segundos y no se pierde ningún caso en curso. | | |
| 0.3.3 | Prueba de **conmutación automática de la base de datos y de la aplicación**: tiempo máximo de 60 s y pérdida de datos cero en el pico de carga. | | |
| 0.3.4 | Prueba de **restauración** de un respaldo completo y de recuperación a un punto en el tiempo, documentada. | | |
| 0.3.5 | Prueba de **pérdida del enlace** entre un nodo edge y el núcleo, y de reconexión posterior, conforme a lo definido en la ficha 5. | | |
| 0.3.6 | Todas las pruebas se entregarán con informe firmado y datos crudos. El supervisor podrá repetirlas. | | |

---

## 1. Servidores del núcleo (aplicación y base de datos)

> **Configuración de uso.** Se contratan **2 servidores idénticos**. Cada uno
> aloja la aplicación y una instancia de la base de datos: uno actúa como
> principal y el otro como respaldo en caliente, con conmutación automática (ver
> 1.14 y 1.15). El mismo modelo de servidor sirve también si la entidad decide
> separar los roles (uno de aplicación y otro de base de datos, sin conmutación
> automática, ver numeral 1.16).

| N.° | Descripción | Cumple | No cumple |
|---|---|---|---|
| 1.1 | Cantidad: **2**, de idénticas características. | | |
| 1.2 | Marca / Modelo: Especificar. | | |
| 1.3 | Tipo: rack, máximo 2U. La placa debe admitir un segundo procesador y al menos 1 TB de memoria, sin reemplazar el equipo. | | |
| 1.4 | Procesador: 1 procesador de la generación más reciente del fabricante, mínimo **32 núcleos**, velocidad base mínima 2,8 GHz. | | |
| 1.5 | Memoria: **256 GB** DDR5, 5600 MT/s o superior, instalada de forma balanceada entre los canales. | | |
| 1.6 | Almacenamiento del sistema: 2 unidades NVMe de 1,92 TB, intercambiables en caliente, en RAID 1. | | |
| 1.7 | Almacenamiento de datos: mínimo **7 TB efectivos** en unidades NVMe intercambiables en caliente, en RAID 10 (o RAID 1 sobre un mínimo de 4 unidades), con controladora de caché protegida. | | |
| 1.8 | Red: dos o más tarjetas con un total de 4 puertos a 10/25 GbE, activo/activo contra dos switches distintos, con módulos y cables incluidos. Un enlace dedicado de servidor a servidor para la replicación. | | |
| 1.9 | Gestión remota fuera de banda, licenciada, con consola virtual, monitoreo y alertas, e instalación remota del sistema operativo. | | |
| 1.10 | Fuentes de poder y ventiladores redundantes, intercambiables en caliente. | | |
| 1.11 | Sistema operativo: distribución Linux empresarial, con suscripción de soporte del fabricante por mínimo 3 años. **No se requieren licencias de sistemas operativos Windows.** | | |
| 1.12 | Plataforma de ejecución: el contratista dejará instalada y configurada la plataforma de contenedores con la que se despliegan los servicios del SECAD, en los dos servidores. | | |
| 1.13 | Motor de base de datos: **PostgreSQL**, versión estable vigente, con **soporte empresarial 7x24 de mínimo 3 años** para la totalidad de instancias. Una base de datos independiente por municipio (hasta 125), con agrupación de conexiones. | | |
| 1.14 | Alta disponibilidad de la base de datos: replicación en flujo entre los dos servidores, **conmutación automática** con regla anti-doble-principal, usando el nodo testigo de la ficha 4. Tiempo máximo de conmutación 60 s; pérdida de datos cero en operación normal. | | |
| 1.15 | Alta disponibilidad de la aplicación: la aplicación opera activa en un servidor y lista en el otro, con **conmutación automática** en máximo 60 s y sin pérdida de casos en curso. | | |
| 1.16 | Variante de roles separados (si la entidad la elige antes de la adjudicación): los mismos dos equipos, uno dedicado a aplicación y otro a base de datos, sin conmutación automática; con respaldo fuera de los servidores, un repuesto en sitio y restauración probada, y con el tiempo máximo de interrupción aceptado por la entidad dejado por escrito. | | |
| 1.17 | Respaldo continuo: archivado de los registros de transacciones al almacenamiento de la ficha 6, con recuperación a un punto en el tiempo (PITR) de mínimo 14 días. | | |
| 1.18 | Servicio de plataforma que queda instalado en los dos servidores en alta disponibilidad: **gestión de secretos y llaves**. | | |
| 1.19 | Los equipos se entregan instalados, con sistema operativo, conectados y con los servicios del SECAD desplegados y productivos. | | |

## 2. (Reservada)

> La capa de aplicación y la de base de datos se agruparon en la ficha 1. El
> número se conserva para no alterar las referencias de las demás fichas.

## 3. Servidores de medios en tiempo real (videollamada)

| N.° | Descripción | Cumple | No cumple |
|---|---|---|---|
| 3.1 | Cantidad: **2**, en alta disponibilidad activo/activo. | | |
| 3.2 | Tipo: rack, máximo 1U. | | |
| 3.3 | Procesador: 1 procesador, mínimo **24 núcleos**. | | |
| 3.4 | Memoria: **128 GB** DDR5. | | |
| 3.5 | Almacenamiento: 2 unidades NVMe de 1,92 TB en RAID 1. | | |
| 3.6 | Red: 4 puertos a 10/25 GbE en activo/activo. Cada servidor debe tener **una dirección IP pública dedicada** y acceso de entrada UDP/TCP a los puertos de señalización y de relevo de medios. | | |
| 3.7 | Capacidad: retransmisión (STUN/TURN) de al menos **200 sesiones simultáneas** y 1 Gbps sostenido por servidor, sin transcodificación. | | |
| 3.8 | Autenticación del relevo con credenciales efímeras firmadas por el servidor de la aplicación (sin credenciales permanentes). | | |
| 3.9 | Sistema operativo y gestión: igual que 1.9 a 1.11. | | |

## 4. Servidor de plataforma (testigo, monitoreo y registros)

| N.° | Descripción | Cumple | No cumple |
|---|---|---|---|
| 4.1 | Cantidad: **1**, ubicado **fuera** de los dos servidores del núcleo. Puede ser un equipo físico o una máquina virtual dedicada con recursos equivalentes, preferiblemente en otro sitio (por ejemplo el alterno de la ficha 10). | | |
| 4.2 | Recursos mínimos: 16 núcleos, 128 GB de memoria, 2 unidades NVMe de 1,92 TB en RAID 1 (sistema) y 2 unidades NVMe de 3,84 TB en RAID 1 (registros y métricas). Si es físico: rack máximo 1U, 4 puertos 10/25 GbE, fuentes y ventiladores redundantes. | | |
| 4.3 | Servicios que quedan instalados: **nodo testigo** del clúster de bases de datos y de la aplicación (voto de desempate); **monitoreo y alertas** (métricas, disponibilidad, SNMP/Redfish); **registros centralizados** con retención de mínimo 12 meses. | | |
| 4.4 | Si este equipo se detiene, los servicios del núcleo **siguen funcionando**; solo se suspende la conmutación automática, y debe emitirse alerta inmediata. | | |
| 4.5 | Sistema operativo y gestión: igual que 1.9 y 1.11. | | |

## 5. Nodos edge en los CAD locales

El edge existe para que el centro de atención conserve lo que necesita cuando
el enlace con el núcleo es lento o se cae. Hay dos tipos; el Anexo de sedes
indica cuál corresponde a cada CAD.

| N.° | Descripción | Tipo A (CAD grande) | Tipo B (CAD municipal) |
|---|---|---|---|
| 5.1 | Cantidad por sede | 2 (alta disponibilidad) | 1 |
| 5.2 | Cantidad total en el departamento | `[N_A]` sedes | `[N_B]` sedes |
| 5.3 | Tipo | Rack 1U | Rack 1U o torre |
| 5.4 | Procesador | 1 × mínimo 16 núcleos | 1 × mínimo 12 núcleos |
| 5.5 | Memoria | 128 GB | 64 GB |
| 5.6 | Almacenamiento | 2 × 1,92 TB NVMe RAID 1 (sistema) + 2 × 3,84 TB NVMe RAID 1 (datos) | 2 × 1,92 TB NVMe RAID 1 (sistema) + 2 × 1,92 TB NVMe RAID 1 (datos) |
| 5.7 | Red | 4 × 10/25 GbE | 4 × 1/10 GbE |
| 5.8 | Fuentes de poder | Redundantes | Redundantes cuando el modelo lo permita |
| 5.9 | Energía de respaldo (UPS) en línea, con autonomía mínima | 3 kVA, 30 min | 1,5 kVA, 30 min |
| 5.10 | Retransmisión de video de cámaras (RTSP a WebRTC/HLS) sin transcodificar | ≥ `[30]` flujos | ≥ `[10]` flujos |
| 5.11 | Enlace seguro con el núcleo | VPN con cifrado fuerte, reconexión automática | ídem |

| N.° | Descripción común | Cumple | No cumple |
|---|---|---|---|
| 5.12 | El video de las cámaras **no se enruta por el núcleo**: el edge, el sistema de video de la sede y los puestos de trabajo se comunican en la red local. | | |
| 5.13 | Funciones del edge: pasarela de medios de cámaras, servicio mínimo de despacho y una réplica local de la información de la sede. | | |
| 5.14 | Con el enlace caído, el CAD sigue operando con las funciones mínimas que defina el Anexo de funcionalidad edge, durante un mínimo de **72 horas**, y al restablecerse el enlace sincroniza sin duplicados ni pérdida de eventos. | | |
| 5.15 | Los identificadores de los registros creados en el edge no pueden colisionar con los del núcleo. | | |
| 5.16 | Sistema operativo y gestión remota: igual que 1.9 y 1.11. | | |
| 5.17 | Suministro, instalación y puesta en marcha en sitio, y capacitación al personal del CAD. | | |

## 6. Almacenamiento (grabaciones, adjuntos y respaldos)

| N.° | Descripción | Cumple | No cumple |
|---|---|---|---|
| 6.1 | Cantidad: un (1) sistema de almacenamiento unificado en el centro de datos principal. Marca / Modelo: Especificar. | | |
| 6.2 | Arquitectura: dos o más controladoras en activo-activo; bloque, archivo y objeto simultáneos (iSCSI, NFS, SMB y S3). | | |
| 6.3 | Capacidad: mínimo **150 TB útiles**, después de la protección de datos (RAID 6 o N+2) y **sin contar compresión ni deduplicación**. | | |
| 6.4 | Expansión: debe crecer hasta **500 TB útiles** o más sin reemplazar el sistema. | | |
| 6.5 | Medios: estado sólido en el nivel de rendimiento; el nivel de capacidad puede ser de estado sólido o de disco de alta capacidad, a elección del oferente, siempre que cumpla 6.6. | | |
| 6.6 | Rendimiento sostenido: mínimo **50.000 IOPS** (8 KB, 70 % lectura / 30 % escritura), **4 GB/s** de lectura secuencial y latencia menor a 1 ms en el nivel de rendimiento. | | |
| 6.7 | Memoria caché: mínimo 256 GB por sistema. | | |
| 6.8 | Conectividad: mínimo 8 puertos a 25 GbE y 2 a 1 GbE de gestión. Puertos de Fibre Channel solo si el diseño de la entidad los requiere. | | |
| 6.9 | Copias instantáneas (snapshots) **inmutables** (no se pueden borrar ni modificar durante el período de retención) y protección contra ransomware sin depender de software externo. | | |
| 6.10 | Replicación asíncrona hacia el sitio alterno (ficha 10), si se contrata. | | |
| 6.11 | Fuentes y ventiladores redundantes, intercambiables en caliente. Falla de una controladora sin interrupción del servicio. | | |
| 6.12 | Reconstrucción de una unidad fallida en menos de 4 horas por cada 10 TB sin degradar la operación. | | |

## 7. Red y seguridad perimetral del centro de datos

> Omitir los numerales que la Gobernación ya provea, indicándolo en el pliego.

| N.° | Descripción | Cumple | No cumple |
|---|---|---|---|
| 7.1 | **Switches** de centro de datos: 2 unidades en agregación de enlaces entre sí (MLAG o equivalente), cada una con mínimo 24 puertos 10/25 GbE y 4 puertos 100 GbE, con todos los módulos y cables necesarios. | | |
| 7.2 | **Firewall** de nueva generación: 2 equipos en alta disponibilidad, con rendimiento mínimo de 10 Gbps con inspección de amenazas activa y VPN para al menos `[N_A·2 + N_B + 20]` túneles simultáneos. | | |
| 7.3 | **Balanceo de carga** con terminación TLS y cortafuegos de aplicaciones web, en alta disponibilidad, con rendimiento mínimo de 5 Gbps. Puede ser una función del firewall del 7.2 o software en los servidores, siempre que cumpla la alta disponibilidad. | | |
| 7.4 | Segmentación de red: al menos tres zonas (publicación, aplicación, datos) y una de gestión, con reglas de entrada y salida mínimas. | | |
| 7.5 | Certificados de servidor para el dominio del servicio, con renovación automática. | | |

## 8. Respaldo y recuperación

| N.° | Descripción | Cumple | No cumple |
|---|---|---|---|
| 8.1 | Software de respaldo con licenciamiento para mínimo **8 servidores** físicos o virtuales, con soporte del fabricante 7x24 por 3 años. | | |
| 8.2 | Debe respaldar bases de datos PostgreSQL con recuperación a un punto en el tiempo, archivos y servidores completos. | | |
| 8.3 | Cifrado de los respaldos y copia inmutable en el almacenamiento de la ficha 6. | | |
| 8.4 | Verificación automática de que el respaldo se puede restaurar, con informe. | | |
| 8.5 | Objetivos mínimos: **RPO** ≤ 5 minutos para base de datos y ≤ 24 horas para grabaciones; **RTO** ≤ 4 horas en el sitio principal. | | |
| 8.6 | Bolsa de 60 horas de soporte 8x5 para actualizaciones y pruebas durante la garantía. | | |

## 9. Condiciones generales

| N.° | Descripción | Cumple | No cumple |
|---|---|---|---|
| 9.1 | Todo el hardware con garantía del fabricante de mínimo **3 años**, extendible a 5, con repuestos iguales o superiores sin costo. | | |
| 9.2 | Atención en el centro de datos principal (`[Medellín]`): respuesta en sitio en **máximo 4 horas**, 7x24. En los CAD locales: máximo el siguiente día hábil, con repuestos críticos en la sede para los Tipo A. | | |
| 9.3 | Instalación, configuración y puesta en producción a cargo del contratista, sin costo adicional, con cableado estructurado certificado, rotulación y distribución eléctrica (PDU y protecciones) conforme a TIA-942. | | |
| 9.4 | Capacitación certificada al personal técnico de la entidad: mínimo 40 horas en administración de plataforma, bases de datos, respaldo y recuperación. | | |
| 9.5 | Documentación técnica (memoria, diagramas, procedimientos, guías de incidentes) en formato editable, aprobada por el supervisor. | | |
| 9.6 | Seguridad: cifrado de datos en reposo y en tránsito, auditoría de accesos y cumplimiento de la Ley 1581 de 2012 y de los lineamientos ISO/IEC 27001 y 27002 de la entidad. | | |
| 9.7 | **Escalabilidad:** el diseño debe permitir agregar después un nodo de procesamiento de inteligencia artificial, más servidores de aplicación o más sedes edge sin rediseñar la red ni el centro de datos. | | |

## 10. Sitio alterno de contingencia (opcional, recomendado)

| N.° | Descripción | Cumple | No cumple |
|---|---|---|---|
| 10.1 | Ubicación: un sitio distinto del principal, en `[otra sede / servicio de alojamiento]`, con enlace dedicado al principal. | | |
| 10.2 | Equipos: 1 servidor del núcleo (ficha 1) y 1 sistema de almacenamiento con capacidad mínima de 150 TB útiles (ficha 6). | | |
| 10.3 | Replicación asíncrona continua de bases de datos y almacenamiento: **RPO ≤ 5 minutos**. | | |
| 10.4 | Recuperación ante desastre: **RTO ≤ 60 minutos**, con procedimiento documentado y una prueba de conmutación por año. | | |

## 11. Exclusiones de esta etapa

| N.° | Descripción |
|---|---|
| 11.1 | **Inteligencia artificial** (transcripción, extracción de entidades, resúmenes): no se suministra servidor de procesamiento de IA. La ficha 9.7 deja la puerta abierta para incorporarlo. |
| 11.2 | **Telefonía** (troncales, controlador de sesión SIP, grabación de voz): no hace parte de este anexo. Debe indicarse en el pliego quién la provee. |
| 11.3 | **Sistemas de video de las cámaras** (VMS) y las cámaras mismas. Solo se suministra el nodo edge que las conecta. |
| 11.4 | **Enlaces de comunicaciones** entre el núcleo, el sitio alterno y los CAD. |
| 11.5 | **Puestos de trabajo** de los operadores. |
