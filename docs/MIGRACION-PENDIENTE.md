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

> **Modo oscuro: `:host-context()`, nunca `html.dark-mode` a secas**
>
> En un SCSS de componente, `html.dark-mode { .foo { … } }` compila a
> `html.dark-mode[_ngcontent-x] .foo[_ngcontent-x]`. El elemento `<html>` nunca
> lleva ese atributo, así que **la regla no se aplica jamás** — y no falla el
> build ni avisa nada: simplemente el modo oscuro se queda a medias.
>
> La plantilla ya usa `:host-context(html.dark-mode)` en todos sus componentes.
> Al portar una pantalla desde secad_angular hay que convertirlo, porque allí
> funcionaba por venir de hojas globales.

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

## Operación — 9 de 9

| Pantalla | Estado | Líneas |
|---|---|---|
| `video-ciudadano` | ✅ portada | 773 |
| `anotaciones-turno` | ✅ portada | 1.076 |
| `mapa-incidentes` | ✅ portada | 1.655 |
| `mapa-estadistico` | ✅ portada | 2.044 |
| `reportes` | ✅ portada | 2.405 |
| `turnos` | ✅ portada | 2.763 |
| `recepcion` | ✅ portada | 4.073 |
| `pedido` | ✅ portada | 5.053 |
| `eventos` | ✅ portada | 8.896 |

Los 12 servicios de `core/services/operacion/` sí están portados completos.

**Operación queda completa.** Las nueve pantallas están portadas.

**`eventos` — portada.** La consola de despacho, y la pantalla más grande del
sistema. Bandeja en vivo con semáforo por umbrales SLA, filtros por estado con
contadores, búsqueda en todo el histórico y alerta sonora de casos nuevos; y,
por cada caso, datos, canales y agencias que lo atienden, mapa con las
patrullas moviéndose y la ubicación del ciudadano, videollamada con chat y
grabación, despacho en cuatro pasos con solicitud de apoyo, asistente de
preguntas, anotaciones y siete modales.

**Se partió en cuatro piezas.** El origen era un único componente de 2.832
líneas de TypeScript con una hoja de 3.700 y una plantilla de 2.364: cola,
detalle, mapa, WebRTC, despacho y todos los modales en el mismo archivo. Aquí
son:

| Pieza | Qué hace | Líneas |
|---|---|---|
| `pages/eventos-page` | Bandeja, filtros, búsqueda, canal y alerta sonora | 1.106 |
| `components/evento-detalle` | Todo lo de un caso, con sus modales | 4.803 |
| `components/adjuntos-caso` | Galería de archivos, compartida con `pedido` | 127 |
| `utils/eventos-sla.util` | Semáforo y etiquetas, que usan las dos vistas | 153 |

Correcciones respecto del origen:

- El asistente de preguntas orientadoras no estaba enlazado a nada: sus radios
  y campos no tenían `ngModel`, así que el despachador podía contestarlas todas
  y lo escrito se perdía al cambiar de categoría o cerrar el caso. Ahora se
  guardan y hay un botón que las pasa al formulario de anotación.
- El mapa se montaba desde `ngAfterViewChecked`, que corre en cada ciclo de
  detección durante toda la vida del componente, buscando `getElementById`. Y
  `L` venía de un `declare const` sobre un script de CDN que el CSP bloquea.
  Ahora es un import real, el contenedor se resuelve por referencia y lo monta
  un `effect`.
- La línea de despacho pintaba las marcas de tiempo crudas del backend
  (`2026-08-29T08:14:00Z`) en vez de una hora legible.
- `Promise.allSettled` sobre `toPromise()`, que RxJS 7 deprecó y 8 elimina.
- El `AudioContext` de la alerta sonora no se cerraba nunca: quedaba uno vivo
  por cada visita a la pantalla.
- Las tarjetas de la bandeja eran `<div (click)>`, inalcanzables con el
  teclado; ahora son botones.
- Los estilos de los marcadores de Leaflet estaban tras un `::ng-deep`
  (deprecado). Son DOM que Leaflet inyecta fuera de la encapsulación, así que
  viven en la hoja global.

**`pedido` — portada.** Seguimiento de incidentes: panel con el turno vigente,
tarjetas de estado, distribución por prioridad y por canal de origen y lista de
críticos; lista paginada con semáforo, filtros y búsqueda; trazabilidad completa
de un incidente —identificadores, canales de atención, datos, historia con el
ciclo de cada recurso despachado (asignado → en camino → en sitio → cerrado),
equipo de la actuación, archivos y videollamadas con su chat—; e indicadores con
tabla por operador. HTML 1.410 → 1.024 líneas y SCSS 2.474 → 1.010 sobre
`ui-page-header`, `ui-segmented-tabs`, `ui-section-header`, `ui-search-input`,
`ui-select`, `ui-input`, `ui-pagination`, `ui-table`, `ui-badge`, `ui-chip`,
`ui-spinner` y `ui-button`.

Correcciones respecto del origen:

- El panel y los indicadores se calculan sobre la página cargada, pero se
  rotulaban «cola CAD completa»: con 412 incidentes en tres páginas, eso era
  sencillamente falso. Ahora dicen sobre cuántos se calcularon, y los filtros de
  la lista avisan de que actúan sobre la página, no sobre el histórico.
- La meta del indicador de críticos se leía «Meta: < 0», imposible de cumplir ni
  con cero críticos. Cada indicador lleva ahora su meta escrita.
- El enlace directo `?id=` guardaba el id y esperaba a que el incidente
  apareciera en la página cargada. Si era antiguo no aparecía nunca y el enlace
  no hacía nada, sin decirlo; ahora se abre por id contra el backend.
- Ni la carga del detalle ni su refresco cortaban la suscripción al destruirse
  el componente: salir de la pantalla con la petición en vuelo seguía
  escribiendo señales de un componente ya destruido.
- La línea de tiempo usaba `track $index`, así que al refrescar reordenaba las
  tarjetas. Cada evento lleva ahora una clave estable.
- El tipo de anotación se pintaba con el valor crudo del backend
  (`NOVEDAD_PERSONAL`), y sin título propio la anotación repetía la misma frase
  como título y como distintivo.
- El botón de cerrar del encabezado ocultaba la pantalla entera y dejaba la ruta
  en blanco sin forma de volver; se quitó.
- La hoja de estilos del origen (2.474 líneas) duplicaba cada regla bajo el
  modo oscuro. Aquí el tema se resuelve redefiniendo una capa de tokens: esa
  lista paralela costaba más de tres kilobytes y se desincronizaba en cuanto se
  tocaba el tema claro.

**`recepcion` — portada.** La toma del incidente: cierres rápidos sin caso,
detección de duplicados, identificación de la llamada, tipificación con
autocompletado de casos y asistente de preguntas orientadoras, relato armado
solo, datos del caso con canal de origen, mapa Leaflet con búsqueda de
dirección y geocodificación inversa, canales SECAD agrupados por fuerza,
agencias externas, prioridad e importancia, galería de fotos y asociación con
otra llamada. HTML 1.105 → 672 líneas y SCSS 1.407 → 741 apoyándose en
`ui-page-header`, `ui-section-header`, `ui-input`, `ui-select`, `ui-textarea`,
`ui-file-upload`, `ui-modal`, `ui-badge`, `ui-chip`, `ui-spinner` y
`ui-button`. Se quedan a medida los chips de canal, las preguntas del
asistente, el aviso de duplicados y la galería.

Correcciones respecto del origen:

- El mapa se montaba con `L.map('mapaDiv')` buscando el `id` en todo el
  documento, y `L` venía de un `declare const` sobre un script de CDN que el
  CSP de la plantilla bloquea. Ahora Leaflet es un import real y el contenedor
  se resuelve con `viewChild.required`, así que dos instancias de la pantalla
  no se pisan.
- La barra de envío vivía dentro de la columna derecha: en un formulario de dos
  pantallas y media, el botón principal quedaba a media página, encima de
  campos todavía sin llenar. Ahora ocupa el ancho completo y se queda pegada al
  borde inferior.
- La validación devolvía un aviso por vez, así que el operador descubría los
  campos faltantes de a uno y volvía a subir el formulario en cada intento. La
  barra resume ahora todo lo que falta; `validarYGuardar()` sigue validando
  igual.
- El estado de los pedidos cercanos se mostraba con el código crudo del
  backend; ahora se traduce, igual que la prioridad.

**Un aviso sobre `styles.scss`.** La regla genérica de botones del modo oscuro
(`html.dark-mode button:not(...)`) lleva cinco `:not()` de atributo, así que
pesa más que cualquier regla de componente —`:host-context` sólo suma un
atributo—. Le borraba el color a los chips seleccionados de esta pantalla y
dejaba la selección marcada sólo por la negrita. Se le añadió
`:not([class*='--sel'])`: una regla general no debe pisar un estado
seleccionado que el componente define aparte. Si al portar otra pantalla un
estado marcado se ve igual que uno sin marcar en oscuro, es esto.

**`turnos` — portada.** Tres columnas encadenadas —turnos del día, unidades del
turno, medios de la unidad— y seis modales: crear turno, copiarlo a otra
franja, agregar unidad, agregar medio, editar medio e importar unidades desde
la minuta GESPO. HTML 920 → 585 líneas y SCSS 888 → 430 usando
`ui-page-header`, `ui-panel-header`, `ui-modal`, `ui-input`, `ui-select`,
`ui-toggle`, `ui-badge`, `ui-chip`, `ui-spinner` y `ui-button`. Las tarjetas de
turno, unidad y medio se quedan a medida.

Correcciones respecto del origen:

- Tenía un `bloquearScroll()` propio que ponía y quitaba una clase en el
  `<body>`. `ui-modal` ya lo hace, y duplicarlo dejaba la clase pegada si el
  modal se cerraba con Escape en vez de con el botón.
- El estado del turno se pintaba con la letra cruda que manda el backend: `A`,
  `C` o `V`. Ahora dice Activo, Cerrado o Anulado. Ojo con `V`: es **anulado**,
  no «vigente».
- Los seis modales eran `<div class="ui-modal">` con su propio backdrop,
  `stopPropagation` y botón de cerrar. Ahora son `ui-modal`, que trae el foco
  atrapado y el cierre con Escape.

**`reportes` — portada.** Dos vistas: el panel general (seis KPI, cuatro
tarjetas de tiempos, tres gráficas, aros de SLA y dos rankings) y cinco
reportes detallados con exportación a CSV. HTML 825 → 484 líneas y SCSS 994 →
360 usando `ui-page-header`, `ui-section-header`, `ui-segmented-tabs`,
`ui-input`, `ui-select`, `ui-badge`, `ui-spinner`, `ui-button` y, sobre todo,
`ui-table` para las tres tablas. Los KPI, las tarjetas de tiempos, los aros de
SLA y las listas con barra se quedan a medida.

Correcciones respecto del origen:

- Chart.js llegaba por CDN con `declare const Chart`; con `script-src 'self'`
  no cargaría. Ahora es importación real, con `Chart.register(...registerables)`
  porque la v4 no auto-registra escalas.
- Mismo problema de tema que el GIS: las gráficas se repintan al cambiar de
  tema. Medido: el texto de los ejes pasa de rgb(14,22,41) a rgb(228,231,235).
- Las tres tablas tenían barra de paginación propia con botones de anterior y
  siguiente. Ahora usan `ui-table` en modo `external`, que es lo correcto:
  quien pagina es el backend y la tabla no debe volver a recortar.
- El eje del gráfico por prioridad llevaba `stepSize: 1`. Con una decena de
  incidentes servía; con mil producía treinta y pico de marcas amontonadas y
  giradas. Sustituido por `maxTicksLimit`.

**`mapa-estadistico` (GIS estadístico) — portada.** Filtros a la izquierda,
mapa Leaflet con tres capas (calor, grupos y puntos) y cinco gráficas de
Chart.js debajo, más el informe imprimible. HTML 389 → 318 líneas y SCSS 588 →
330 usando `ui-page-header`, `ui-section-header`, `ui-input`, `ui-select`,
`ui-toggle`, `ui-button` y `ui-spinner`. Las leyendas del mapa, el resumen y
las cajas de las gráficas se quedan a medida: no tienen equivalente en el kit.

Cuatro correcciones respecto del origen, todas verificadas en el navegador:

- Leaflet y Chart.js llegaban por `<script>` de un CDN con `declare const L` /
  `declare const Chart`. Con `script-src 'self'` esos scripts no cargan: ahora
  son importaciones reales del paquete, y de paso tipan.
- Los plugins `leaflet.heat` y `leaflet.markercluster` se enganchan al `L`
  global, no al módulo. Importarlos arriba no basta —los import se elevan y
  `window.L` aún no existe—, así que se publica `L` y se cargan bajo demanda
  con `import()` antes de dibujar la primera capa. Sin esto, calor y grupos
  lanzaban `L.heatLayer is not a function` y la excepción se llevaba por
  delante el repintado de las cinco gráficas.
- El informe traía `<script>window.onload = () => print()</script>` dentro del
  HTML generado. La ventana hereda la CSP de la que la abre, así que ese script
  quedaba bloqueado y el informe no se imprimía solo; ahora la impresión se
  dispara desde la ventana padre.
- Chart.js fija el color del texto al construir cada gráfica: al cambiar a modo
  oscuro después de analizar, las etiquetas quedaban invisibles. Ahora se
  repintan al cambiar el tema. Comprobado midiendo el color de los ejes: pasa
  de rgb(14,22,41) a rgb(228,231,235).

También se añadió a `angular.json` el CSS de markercluster y el `<div>` del
mapa dejó de identificarse por un `id` global —que se rompe si dos vistas
coexisten en una transición de ruta— para usar una referencia de plantilla.

---

## Super Admin — completo

| Pantalla | Estado |
|---|---|
| `super/tenants` | ✅ portada |
| `super/salud-cads` | ✅ portada |

Con ellas van `super-admin.service.ts`, `super-admin.guard` y el **selector de
CAD** del superadministrador, que faltaba por completo aunque la capa
multi-tenant de `auth.service` ya estuviera portada.

**Selector de CAD** (`core/layout/topbar/topbar-tenant-switcher/`). El backend
elige la base de datos según el claim `cod_dane` del JWT, así que cambiar de CAD
es pedir un token nuevo a `POST /super/switch-context` y recargar: cualquier dato
ya cargado pertenece al CAD anterior. Vive en la barra superior junto al menú de
usuario y sólo pinta algo para el superadministrador. Cuando el contexto está
cambiado el disparador se marca en amarillo institucional y dice «Administrando
otro CAD» — administrar datos de otra unidad sin darse cuenta es el riesgo real
de esta función, no el clic de más.

En el origen esto era un `context-banner` con estilos propios; aquí reutiliza el
lenguaje de `.profile-trigger` / `.user-dropdown` del menú de usuario.

**Corregido respecto del origen:** `takeUntilDestroyed()` se llamaba dentro de
`ngOnInit` y del manejador de clic sin `DestroyRef`. Fuera de un contexto de
inyección eso lanza NG0203, es decir el cambio de CAD habría fallado siempre.
Aquí el `DestroyRef` se captura como campo y se le pasa.

**`salud-cads` reescrita sobre el kit.** El origen traía 387 líneas de SCSS y las
clases globales `ui-panel` / `ui-btn` / `ui-control` de secad_angular, que en la
plantilla no existen. Ahora usa `ui-page-header`, `ui-search-input`, `ui-select`,
`ui-badge`, `ui-spinner`, y el historial pasó de ser un segundo panel con tabla
a mano a un `ui-modal` con `ui-table`. Otra corrección: el aviso de CADs en
alerta se disparaba en cada refresco, o sea dos toasts por minuto mientras un
CAD siguiera caído; ahora sólo avisa por los que acaban de degradarse.

---

## Administración — completa (16 de 16)

Estas 9 ya existen en la plantilla, reconstruidas: `administracion-inicio`,
`configuracion-sistema`, `cuentas-email`, `dominio`, `formularios`,
`linea-mando`, `menu-admin`, `roles-admin`, `usuarios`.

Ya no falta ninguna; `tenants` quedó bajo Super Admin.

**`asistente` — reescrita sobre el kit.** Maestro–detalle: categorías a la
izquierda con su formulario, y a la derecha las preguntas de la elegida. El
icono de la categoría pasó de un campo de texto libre a `ui-icon-picker`. Dos
correcciones respecto del origen: los `confirm()` del navegador para borrar
—bloquean el hilo y no respetan el tema ni la escala de fuente— ahora son un
`ui-modal`, y los errores de validación, que salían por toast al pulsar
guardar, se muestran en el campo que falla.

**`integraciones` (Hub) — reescrita sobre el kit.** Es la pantalla más grande
de administración: 876 líneas de TS, 1.149 de HTML y 925 de SCSS, con cuatro
pestañas (salientes, entrantes, cámaras VMS y auditoría) y cuatro modales. La
lógica se porta 1:1; el HTML baja a 409 líneas y el SCSS a 300 apoyándose en
`ui-segmented-tabs`, `ui-table`, `ui-modal`, `ui-expansion-panel` —la guía de
configuración, que antes era un desplegable a mano— y los campos del kit.

**`agencias-externas` — portada.** Ya venía sobre el kit desde el repo
congelado, así que solo hubo que adaptar rutas y quitar el `CommonModule` que
importaba sin usar ninguna pipe.

**`config-sms` (Proveedor SMS) — reescrita sobre el kit.** El origen usaba las
clases globales `ui-card` / `ui-btn` / `ui-control`, que en la plantilla no
existen. Además imprimía `fechaModifica` cruda —una marca ISO— y ahora se
formatea. El campo de proveedor se replica en una señal porque un `valueChanges`
del formulario no repinta por sí solo un componente `OnPush`.

**`casos` (Códigos de caso) — reescrita sobre el kit.** El origen llevaba la
paginación a mano (señales de página, rango, recorte y botones propios); ahora
la resuelve `ui-table`. La importación de Excel pasó de un `<input type=file>`
oculto a `ui-file-upload`, y el resultado muestra creados/actualizados con la
lista de errores en un bloque con desplazamiento propio: una importación de
cientos de filas puede fallar en muchas y no debe empujar la página.

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

## Servicios de administración — 20 de 20

Están los 20 del origen. La tabla anterior daba 12 y el resumen 18: ambas cifras
eran incorrectas y varios servicios listados como faltantes existían desde hacía
tiempo. El recuento fallaba porque miraba solo
`features/administracion/services/`, y la plantilla reparte los servicios en dos
carpetas según su alcance.

| Ubicación en v2 | Servicios |
|---|---|
| `features/administracion/services/` | `camara-integracion`, `caso`, `config-sms`, `cuenta-email`, `dominio`, `fuerza`, `integraciones`, `roles-admin`, `usuario-admin` (+ `funcionarios-demo-table`, propio de la plantilla) |
| `core/services/` | `branding`, `linea-mando`, `login-visual`, `menu`, `modal`, `noticia`, `radio`, `slider`, `video-institucional`, `video-unidad` |
| `core/services/operacion/` | `evento` — el origen lo tenía bajo administración, pero quien lo consume es Operación |

Comprobado comparando los nombres de método de cada pareja origen/destino: la
única diferencia es que la plantilla usa `inject()` en lugar de constructor.

---

## Verificación empírica de administración (01/09/2026)

Las 15 pantallas del área se montaron una a una en un navegador sin cabeza, en
tema claro y oscuro, midiendo errores en consola, alto renderizado, desborde
horizontal y color real de cada superficie. Lo que salió:

**Defectos reales corregidos**

| Dónde | Qué pasaba |
|---|---|
| `form-control-sizing-demo` | Un `+` suelto dentro de la etiqueta `<app-ui-search-input>` se interpretaba como nombre de atributo: `setAttribute` lanzaba y tumbaba **toda** la pantalla de formularios. |
| `ui-icon-picker` | Usaba `--ui-control-bg` y `--ui-control-border`, dos variables que no existen en ninguna parte, así que el disparador y su buscador quedaban blancos siempre. En oscuro, texto claro sobre blanco. Ahora usa `--form-bg` / `--form-border-color`, que sí están definidas en los dos temas (mismos valores en claro: no cambia nada ahí). |
| `ui-api-reference` | Igual con `--ui-surface-muted`, tampoco definida. La variable se ha creado en `styles.scss` para los dos temas. |
| `.ui-table-wrap` (global) | El bloque oscuro le cambiaba el borde pero no el `background: #fff` de la regla general: el blanco asomaba bajo las tablas cortas y en la franja de scroll. |
| `ui-segmented-tabs` | El bloque oscuro cubría barra e ítems pero no el contador, que seguía siendo una píldora casi blanca. |
| `ui-table` variante `plain` | El componente escribía `--ui-table-header-text-color: #263247` **en línea**, sin poder saber el tema; como el estilo en línea gana a cualquier regla, en oscuro los encabezados quedaban en azul oscuro sobre fondo oscuro: contraste medido **1,14:1**. El valor por defecto pasó a la hoja de estilos, por variante y por tema → **11,42:1** en oscuro, 12,89:1 en claro (sin cambios). Afectaba a las 4 tablas `plain` de la aplicación. |
| `config-sms` | Leía `r.data.proveedor` sin comprobar `data`. El backend siempre lo envía, pero una respuesta inesperada tumbaba la pantalla con un `TypeError` en vez de mostrar el aviso de error. |

**Falsos positivos de la propia prueba** (no eran defectos): el `AuthService`
simulado no tenía `isCurrentUserSuperAdmin`, y el `HttpClient` simulado
devolvía una lista donde `ConfigSms` espera un objeto. Además, el pomo del
`ui-toggle` es claro a propósito en tema oscuro, y el encabezado institucional
pinta un degradado, de modo que su `backgroundColor` calculado es transparente:
hubo que decodificar el píxel pintado — rgb(0, 78, 112) — para comprobarlo.

**`cuentas-email` rehecha sobre el kit.** Era la única pantalla del área que
seguía con el marcado del origen: `<input>` y `<select>` nativos con clases
`ui-control`, un botón de subida a mano, un buscador con su propio botón de lupa
y un diálogo de confirmación escrito en la plantilla (con su estado, su
`@HostListener` de Escape y su marcado `.ui-alert` duplicados). Ahora usa
`ui-page-header`, `ui-section-header`, `ui-input`, `ui-select`, `ui-file-upload`,
`ui-search-input`, `ui-table` y el diálogo del kit, con formulario reactivo,
señales y `OnPush`. De paso: los errores de validación se muestran en el campo
que los causa y no como un toast genérico, y los parámetros SMTP fijos dejan de
reescribirse a mano por duplicado en cada guardado.

---

## Resumen

| Área | Portado | Total |
|---|---|---|
| Servicios de operación | 12 | 12 |
| Pantallas de operación | 9 | 9 |
| Pantallas de administración | 16 | 16 |
| Servicios de administración | 20 | 20 |
| Super Admin | 2 | 2 |

**Cimientos ya resueltos** (no hay que repetirlos): multi-tenant en
`auth.service`, dependencias (SignalR 8, Leaflet, Chart.js, ExcelJS,
`@policia/mfa`), CSP ampliada, política de Trusted Types para Leaflet, proxy con
`ws:true`, y las 55 migraciones en `docs/sql/master/`.
