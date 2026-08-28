# Migración secad_angular → secad-agularv2: qué falta

Inventario completo y verificado contra el código de los dos repositorios.
Se actualiza a medida que se porta cada cosa.

> ## ⚠️ Al portar una pantalla hay que tocar DOS sitios
>
> 1. El `*.routes.ts` que corresponda.
> 2. **`core/navigation/app-route-catalog.ts`.**
>
> El menú se arma desde la base, pero pasa cada ítem por `isKnownAppRoute()`
> contra ese catálogo. Si la ruta no está ahí, el ítem **se descarta en
> silencio** y el grupo sale vacío, aunque en la base esté sembrado, vigente y
> otorgado al rol. El síntoma parece un problema de permisos o de datos, y no
> lo es.
>
> Es a propósito —evita que el menú publique enlaces que darían 404— y por eso
> las pantallas aún no portadas deben seguir fuera del catálogo.

> **Por qué el menú muestra "Operación" y "Super Admin" vacíos**
>
> El menú lateral **se arma desde la base de datos** (`navigation-menu.service.ts`
> lee de `MenuService`), no desde las rutas de Angular. Las migraciones sembraron
> los ítems padre y sus hijos, así que el menú los pinta; pero al hacer clic no
> hay nada porque el componente todavía no está portado. Es decir: lo que se ve
> en el menú es lo que la base dice que debería existir, no lo que ya existe.
>
> Por eso el menú es una buena lista de verificación: cuando todos los ítems de
> abajo estén portados, el menú dejará de tener huecos.

---

## Operación — 3 de 9

| Pantalla | Estado | Líneas |
|---|---|---|
| `video-ciudadano` | ✅ portada | 773 |
| `anotaciones-turno` | ✅ portada | 1.076 |
| `mapa-incidentes` | ✅ portada | 1.655 |
| `mapa-estadistico` | ⬜ pendiente | 2.044 |
| `reportes` | ⬜ pendiente | 2.405 |
| `turnos` | ⬜ pendiente | 2.763 |
| `recepcion` | ⬜ pendiente | 4.073 |
| `pedido` | ⬜ pendiente | 5.053 |
| `eventos` | ⬜ pendiente | 8.896 |

Los 12 servicios de `core/services/operacion/` sí están portados completos.

**Pendiente: 25.234 líneas.** `eventos` y `pedido` son más de la mitad.

---

## Super Admin — 0 de 1

| Pantalla | Estado | Líneas |
|---|---|---|
| `super/salud-cads` | ⬜ pendiente | — |

Falta también `super-admin.service.ts` y el `super-admin.guard`.

---

## Administración — 10 de 16

Estas 9 ya existen en la plantilla, reconstruidas: `administracion-inicio`,
`configuracion-sistema`, `cuentas-email`, `dominio`, `formularios`,
`linea-mando`, `menu-admin`, `roles-admin`, `usuarios`.

Faltan 6 por portar:

| Pantalla | Estado |
|---|---|
| `agencias-externas` | ⬜ pendiente |
| `asistente` | ⬜ pendiente |
| `casos` | ⬜ pendiente |
| `config-sms` | ⬜ pendiente |
| `integraciones` | ⬜ pendiente |
| `tenants` | ⬜ pendiente |

**`entidades` — portada.** Maestro–detalle: a la izquierda la lista de fuerzas
(código, nombre, abreviatura y contadores de canales/usuarios); a la derecha el
detalle con pestañas Canales y Usuarios. Alta y edición de fuerzas y de canales,
y activar/desactivar ambos. Es la pantalla que da de alta las fuerzas y canales
que consume la pestaña de asignación operativa de `usuarios`.

HTML 418 → 244 líneas y SCSS 441 → 234 apoyándose en `ui-page-header`,
`ui-panel-header`, `ui-section-header`, `ui-tabs`, `ui-input`, `ui-select`,
`ui-button`, `ui-badge`, `ui-chip` y `ui-spinner`. Las tres listas (fuerzas,
canales, usuarios) se dejaron como listas y no como `ui-table`: son filas con
acciones, no tablas ordenables ni paginadas.

Dos correcciones respecto del origen, verificadas en el navegador:

- Al editar una fuerza el origen dejaba visible su detalle sin haber cargado
  canales ni usuarios, así que mostraba «esta fuerza no tiene canales» en
  fuerzas que sí los tenían. Ahora `editarFuerza()` carga las dos listas y el
  detalle queda oculto mientras el formulario está abierto.
- La lista de fuerzas partía el nombre en tres líneas en nombres largos
  («POLICIA METROPOLITANA DE BOGOTA»). Ahora cada fila son dos líneas: nombre
  arriba, abreviatura y contadores abajo.

### Auditoría de las 9 pantallas que ya existen — hecha

Se compararon una por una contra secad_angular: campos de formulario, métodos
de servicio y volumen de código. **El resultado es mejor de lo esperado: 8 de
las 9 están completas**, y de hecho son bastante más elaboradas que las del
origen.

| Pantalla | Origen | Plantilla | Veredicto |
|---|---|---|---|
| `formularios` | 492 | 11.746 | ✅ completa |
| `menu-admin` | 712 | 4.052 | ✅ completa |
| `roles-admin` | 506 | 3.704 | ✅ completa |
| `configuracion-sistema` | 868 | 2.827 | ✅ completa |
| `dominio` | 566 | 2.241 | ✅ completa |
| `linea-mando` | 736 | 1.822 | ✅ completa |
| `cuentas-email` | 742 | 805 | ✅ completa |
| `administracion-inicio` | 104 | 297 | ✅ completa |
| `usuarios` | 2.265 | 4.069 | ✅ completa |

Dos falsas alarmas que conviene dejar anotadas, porque el método las produce:

- `cuentas-email` usa `ngModel` en vez de `formControlName`, así que comparar
  por `formControlName` la daba por vacía. No lo está.
- `configuracion-sistema` sí maneja el video, en el componente
  `configuracion-video`, solo que los campos se llaman `descripcion` y
  `observaciones` en vez de `videoDescripcion` y `videoObservaciones`.

Moraleja: comparar por nombre de campo detecta huecos, pero también inventa
algunos. Cada "falta" hay que confirmarla mirando el archivo.

### Usuarios: cerrada

La versión de la plantilla **no tiene la sección "Asignación de Fuerza, Canal y
ACD"** que sí tiene secad_angular (`usuarios.html`, línea 311). Sin ella no se
puede asignar a un usuario su fuerza, su canal de despacho ni su ACD — y esos
son justamente los datos que el backend usa para decidir qué ve cada despachador.

Incluye un selector en cascada: al elegir fuerza se cargan sus canales.
Depende de `fuerza.service.ts`, que tampoco está portado.

✅ **Resuelto: la asignación de Fuerza, Canal y ACD.** Vive en el componente
`components/usuarios/usuario-operacion/`, embebido bajo el formulario. De paso
hubo que devolverle `idUsuario` a `DtoFuncionario` y a `UserProfile`: el backend
lo devuelve pero la plantilla lo descartaba al mapear, y sin él ningún endpoint
que opere sobre el usuario (y no sobre la persona) tiene a quién apuntar.

✅ **Resuelto: el flujo de usuario civil.** Faltan los campos `username`,
`password` y `entidad`, y en el servicio faltan `createCivilUsuario`,
`getLocalUsuario` y `eliminarRol`. La plantilla solo contempla el usuario
institucional (el que valida contra OUD con `usuarioEmpresarial`); no se puede
crear un usuario civil con usuario y contraseña propios.

Fuera de estos dos flujos, el resto de la pantalla está completo — el formulario
institucional de la plantilla tiene incluso más campos que el del origen
(`situacionLaboral`, `unidadFisica`, `justificacion`, `fechaFin`).

---

## Servicios de administración — 12 de 20

Faltan 8, y varios bloquean pantallas de la lista de arriba:

| Servicio | Bloquea |
|---|---|
| ~~`fuerza.service.ts`~~ | ✅ portado |
| ~~`usuario-admin.service.ts`~~ | ✅ completado (createCivilUsuario, getLocalUsuario) |
| `roles-admin.service.ts` | Roles (idem) |
| `camara-integracion.service.ts` | Integraciones |
| `caso.service.ts` | Casos |
| `config-sms.service.ts` | Proveedor SMS |
| `cuenta-email.service.ts` | Cuentas de correo |
| `dominio.service.ts` | Dominio |
| `integraciones.service.ts` | Integraciones |

---

## Resumen

| Área | Portado | Total |
|---|---|---|
| Servicios de operación | 12 | 12 |
| Pantallas de operación | 3 | 9 |
| Pantallas de administración | 9 | 16 |
| Servicios de administración | 12 | 20 |
| Super Admin | 0 | 1 |

**Cimientos ya resueltos** (no hay que repetirlos): multi-tenant en
`auth.service`, dependencias (SignalR 8, Leaflet, Chart.js, ExcelJS,
`@policia/mfa`), CSP ampliada, política de Trusted Types para Leaflet, proxy con
`ws:true`, y las 55 migraciones en `docs/sql/master/`.
