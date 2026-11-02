# Despliegue departamental de Antioquia — recomendación y notas internas

> **Documento interno. No va al pliego.** Las fichas para publicar están en
> [`Especficaciones/FICHAS_TECNICAS_ANTIOQUIA.md`](../../Especficaciones/FICHAS_TECNICAS_ANTIOQUIA.md).
>
> Escrito el 02/11/2026 tras revisar las especificaciones nacionales (servidores y
> almacenamiento) y el estado real del repositorio. Lo que aquí se afirma sobre
> el código viene de leerlo; lo que se afirma sobre cifras de Antioquia son
> **supuestos** que hay que confirmar (ver §6).

---

## 1. El dilema, dicho claro

Antioquia compra el SECAD y su infraestructura **solo para Antioquia**. Los demás
departamentos y municipios, si lo quieren, compran **solo la infraestructura de
su lugar**. El gobernador lo aceptó.

Eso deja cuatro preguntas abiertas: qué pasa con la lógica edge, con las
funcionalidades generales, con las integraciones, y quién paga que el producto
siga evolucionando.

## 2. Recomendación: un producto, una instancia por departamento

**No** partir el producto en «el de Antioquia» y «el nacional». Partir la
**infraestructura**, no el código:

| Capa | Cómo queda |
|---|---|
| **Código del producto** | Uno solo, con una sola línea de versiones. Antioquia recibe las mismas versiones que el resto. |
| **Instancia / núcleo** | **Uno por departamento.** El de Antioquia vive en su propio centro de datos (Medellín), no en la OFTIC. El nacional de Bogotá atiende a quien no tenga el suyo. |
| **Nodos edge** | Cuelgan del núcleo de **su** departamento. Un CAD de Antioquia habla con el núcleo de Antioquia. |
| **Funcionalidades** | Se activan por inquilino y por instancia (banderas). Antioquia arranca con la IA apagada; encenderla después es una configuración más el hardware, no un desarrollo nuevo. |
| **Integraciones** | Son adaptadores configurables por instancia (cámaras, telefonía, WhatsApp, etc.). Cada departamento configura los suyos. |

Qué hay que cuidar para que las instancias no se separen:

1. **Catálogos y tipificación nacional** compartidos (misma versión).
2. **Un contrato de interoperabilidad**: traspaso de un caso entre departamentos
   (una llamada en la frontera) y envío de indicadores consolidados a un núcleo
   nacional. Los identificadores `Snowflake` del repositorio ya están pensados
   para poder combinar datos de varios nodos sin choques.
3. **Una sola línea de versiones**, con una ventana de actualización común.

## 3. Lo que debe quedar escrito (para el abogado, no es asesoría jurídica)

Lo más frágil del arreglo no es técnico: es que **si los demás solo pagan
infraestructura, nadie financia la evolución del software**. Hay que resolverlo
en papel antes de firmar:

- **Qué compra Antioquia, exactamente.** Una licencia de uso territorial de una
  versión del software, no la propiedad del código. La propiedad intelectual
  sigue siendo de quien lo desarrolla, salvo que se decida otra cosa expresamente.
- **Autorización a terceros.** Que los demás departamentos puedan usar la misma
  versión sin pagar licencia de nuevo, y bajo qué condiciones.
- **Soporte y evolución.** Una cuota recurrente (de Antioquia, de los demás, o
  mixta). Sin ella, las correcciones de seguridad y las mejoras se quedan sin
  dueño.
- **Los datos de Antioquia son de Antioquia**, incluidos los respaldos y la
  posibilidad de exportarlos.
- **Código fuente.** Si Antioquia lo pide, la fórmula habitual es un depósito en
  custodia (*escrow*), con entrega solo si el proveedor desaparece.
- **La vía de contratación.** Si el software es de un único proveedor, la figura
  es distinta de una licitación abierta. Es un tema legal: consultar.

## 4. Lo que NO debe prometerse: el edge de verdad

El pliego nacional habla de un edge con tres niveles (normal, degradado,
desconectado) donde el servidor local opera como primario. Según
`Bakcend/backend/docs/RESILIENCIA_ESTADO_ACTUAL.md` (mayo de 2026):

| | Estado |
|---|---|
| Detectar el estado de cada CAD (normal, degradado, offline) | ✅ Hecho |
| Réplica local de base de datos en la sede | ❌ No existe |
| Conmutación a la réplica local | ❌ No existe |
| Operación completa sin conexión con Bogotá | ❌ No existe |
| Reconciliación al volver el enlace | ❌ No existe (los IDs `Snowflake` son el prerrequisito, ya hecho) |

Lo que **sí** existe como edge es el de **cámaras**: un servidor en la sede que
reenvía las peticiones al sistema de video y republica RTSP como WebRTC sin que
el video pase por el núcleo (`docs/Documentacion/CCTV_NODO_EDGE.md`), y un
servicio mínimo de contingencia para la planta telefónica
(`edge-plantatel-service`).

**Consecuencia para la ficha 5:** el hardware está especificado, pero la
numeral 5.14 (operar 72 horas sin enlace y sincronizar al volver) **es trabajo
de desarrollo pendiente**, no algo entregado. Hay dos formas honestas de
manejarlo:

- Dejarlo como **hito de desarrollo** del contrato, con fecha y con la prueba
  0.3.5 como criterio de aceptación; o
- Reducir el 5.14 a lo que ya funciona (edge de cámaras y contingencia de
  llamadas entrantes) y dejar la operación autónoma como fase siguiente.

Mi recomendación es la primera, pero **no firmar 5.14 sin una estimación de
cuánto cuesta construirlo**.

## 5. Un hallazgo técnico: aplicación activa en varios nodos

> **Con la opción B (dos servidores, aplicación activa en uno y en espera en el
> otro) esto NO bloquea el despliegue.** Aplica solo si algún día se pasa a
> aplicación activa en varios nodos a la vez (opción C de la conversación, o más
> nodos en el futuro). Se deja documentado para ese momento.

Una aplicación activa en **varios** servidores detrás de un balanceador no funciona hoy. El
SECAD está hecho para correr en un solo servidor (`docker-compose.yml`), y
`Program.cs` registra `AddSignalR()` **sin** un respaldo compartido entre
instancias (no hay Redis ni equivalente en el código).

Qué rompe: la videollamada y las notificaciones en vivo pasan por un hub
(`VideoSignalingHub`) que reenvía la señalización del despachador al ciudadano.
Si el despachador está conectado al nodo 1 y el ciudadano al nodo 2, **no se ven
entre ellos**, y es justo el tipo de falla que solo aparece en producción con
carga.

Hay que construir, antes del despliegue de tres nodos:

- Un **respaldo compartido** para SignalR (el servicio de caché y mensajería
  distribuida que la ficha 4.7 ya incluye).
- Una **plataforma de despliegue multinodo** (el `docker-compose` actual no
  sirve para eso).
- Que el estado que hoy viva en la memoria de un proceso salga de ahí.

Hasta entonces, la aplicación solo puede estar activa en un nodo a la vez; el
otro queda en espera y asume si el primero falla. Eso es lo que pide la ficha 1.

## 6. Supuestos que hay que confirmar con datos reales

Las fichas tienen cifras que escribí yo, no que medimos:

| Supuesto | Valor usado | Por qué |
|---|---|---|
| Llamadas al día en Antioquia | 6.000 (diseño) | Antioquia es alrededor del 15 a 20 % de la población; con el 123 nacional en ~20.000 al día daría 3.000–4.000. Se usó 6.000 para dejar margen. **Pedir la cifra real del último año.** |
| Hora pico | 12 % del día | Convención habitual en centros de atención. |
| Duración | 4 min por llamada | Estimado. |
| Llamadas simultáneas | 100 | 48 en pico normal, doblado por el peor momento. |
| Videollamadas | 25 | 20 % de las llamadas, una fracción del pico. |
| Retención | 3 años (entre corchetes) | **La norma o la política de la entidad decide.** |
| Grabaciones | ~78 GB al día | Voz estéreo a 128 kbps más 20 % de video a 1,5 Mbps. Da unos 28 TB al año y unos 85 TB a 3 años; 5 años son unos 140 TB, por eso los 150 TB de la ficha 6. |

Datos que **necesito de usted** para dejar las fichas listas:

1. El número de llamadas reales de Antioquia (último año, y el día más alto).
2. Cuántos CAD hay y de qué tamaño (`[N_A]` y `[N_B]` de la ficha 5), y cuántos
   puestos de operador.
3. Dónde va el núcleo: la Gobernación (¿tiene centro de datos?) o un servicio
   alquilado en Medellín.
4. Si hay sitio alterno y si el presupuesto cubre la ficha 10.
5. Quién provee la telefonía (¿el SBC va en otro contrato?) y los sistemas de
   video de las cámaras.
6. Los enlaces de comunicaciones: capacidad y quién los paga.
7. Si Antioquia quiere IA más adelante, para dejar ya la capacidad eléctrica.

## 7. Qué cambió frente a las especificaciones nacionales y por qué abarata

| | Nacional | Antioquia | Efecto |
|---|---|---|---|
| Aplicación + base de datos | 3 de aplicación (2 CPU de 24 núcleos, 1 TB) + 2 de BD (2 CPU de 32 núcleos, 512 GB) con motor comercial propietario | **2 servidores idénticos** (1 CPU de 32 núcleos, 256 GB), cada uno con aplicación y BD, con PostgreSQL con soporte | De 5 equipos a 2; sin licencia del motor propietario; la placa admite crecer |
| Servidor de IA | 1 con GPU de 141 GB | **Eliminado** | La partida más cara |
| CCTV/WebRTC | 1 con Windows | **2 de medios, Linux, sin Windows** | Resiliencia y sin licencia Windows |
| Seguridad/monitoreo | 1 con 1 TB, 30 TB, Windows | **1 pequeño (o máquina virtual), Linux, con testigo**; los secretos van en los 2 del núcleo | Resiliencia a menor costo |
| Almacenamiento | 512 TB todo NVMe, 2 sistemas (principal y alterno) | 150 TB con nivel de capacidad más barato, 1 sistema | Mucho más barato |
| Red | Dependía de switches existentes de marca | Switches y firewall incluidos, omisibles | Se acota por quién los provee |
| Respaldo | 20 instancias de un producto nombrado | Genérico, 12 servidores | Sin direccionamiento |
| Edge | No aparecía | Tipo A y B | Nuevo, y es un componente que el pliego nacional no tenía |

**No estimo precios**: dependen del fabricante y de la fecha. Con esto se
pueden pedir cotizaciones.

## 8. Opción A, B o C: cómo quedó

La ficha 1 está escrita para la **opción B** (2 servidores idénticos, ambos con
aplicación y BD, conmutación automática y un testigo). El numeral 1.16 describe
la **opción A** (un servidor de aplicación y otro de BD, sin conmutación
automática) usando **el mismo hardware**, así que se puede cambiar de opinión
antes de adjudicar sin reescribir la ficha ni cambiar la cotización.

Para volver a la **opción C** (3 de aplicación + 2 de BD) habría que reabrir la
ficha, y primero resolver lo de §5.

## 9. Lo que corrige de las especificaciones nacionales

Las fichas de Antioquia ya incluyen los arreglos que señalé en la revisión
anterior: más de un servidor en las capas críticas, nodo testigo en la base de
datos, Linux en lugar de Windows, criterios de capacidad con prueba de carga,
objetivos RPO/RTO, definición de la plataforma de ejecución, y sitio alterno.
Si esos cambios también se quieren en el pliego nacional, hay que llevarlos allá.

## 10. Próximos pasos sugeridos

1. Contestar la lista de §6.
2. Decidir el manejo del edge (§4): hito de desarrollo o alcance reducido.
3. Estimar el trabajo de §5 (SignalR multinodo y despliegue multinodo) antes de
   comprometer la alta disponibilidad de aplicación.
4. Revisión jurídica de §3.
5. Con eso, cerrar las fichas y pedir cotizaciones.

## 11. Cuánto puede costar cada servidor

> **Esto NO son cotizaciones.** Son órdenes de magnitud de precio de lista de
> marcas empresariales, de mi conocimiento general hasta mediados de 2026. Los
> precios de la memoria y de los discos NVMe han variado mucho en el último año,
> así que la brecha entre un cotizante y otro puede ser grande. No incluyen IVA
> (19 %), importación, fletes ni la instalación en sitio. Multiplique los dólares
> por la TRM del día. **Pida al menos tres cotizaciones.**

| Equipo | Cantidad | Precio de lista por unidad (USD), con 3 años de soporte | Observación |
|---|---|---|---|
| Servidor del núcleo (1 CPU 32 núcleos, 256 GB, 2×1,92 TB + 4×3,84 TB NVMe, 4×25 GbE) | 2 | 18.000 – 32.000 | Lo más caro es la memoria y los discos. Es el mismo modelo en la opción A y en la B |
| Servidor de medios (1 CPU 24 núcleos, 128 GB, 2×1,92 TB NVMe) | 2 | 10.000 – 16.000 | |
| Servidor de plataforma (16 núcleos, 128 GB, 4 NVMe) | 1 | 8.000 – 13.000 | Si se usa una máquina virtual existente, este costo desaparece |
| Edge Tipo A (16 núcleos, 128 GB, 4 NVMe) | 2 por sede | 8.000 – 13.000 | Más UPS de 3 kVA: 2.000 – 3.500 |
| Edge Tipo B (12 núcleos, 64 GB, 4 NVMe) | 1 por sede | 5.000 – 8.000 | Más UPS de 1,5 kVA: 800 – 1.500 |

**Resumen del núcleo con opción B:** los 2 servidores del núcleo suman unos
**36.000 a 64.000 USD**, y con los 2 de medios y el de plataforma, unos
**64.000 a 109.000 USD**. En la opción A el precio de los 2 servidores es el
mismo; lo que cambia es el riesgo, no la compra.

**Lo que no está en esas cifras y puede pesar tanto o más:**

- Almacenamiento de 150 TB, red, firewall y respaldo (fichas 6 a 8).
- Soporte anual de PostgreSQL y de Linux después del tercer año.
- Instalación, capacitación y pruebas del contratista.
- El desarrollo pendiente del edge (§4) y del despliegue multinodo (§5).
