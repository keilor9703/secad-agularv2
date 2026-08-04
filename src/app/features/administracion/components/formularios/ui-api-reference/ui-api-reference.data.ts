import type { UiApiCategoryDoc, UiApiComponentDoc, UiApiMemberDoc } from './ui-api-reference.model';

// Definición compartida por los controles que admiten dimensiones responsive.
const controlSize: UiApiMemberDoc = {
  name: 'controlSize',
  kind: 'directive',
  type: 'UiFormControlSize',
  defaultValue: 'heredado',
  description:
    'Limita alto y ancho mediante min/preferido/max. Si se omite, usa las variables CSS del contenedor y luego las globales.',
};

const requiredMarker: UiApiMemberDoc = {
  name: 'showRequiredMarker',
  kind: 'input',
  type: 'boolean',
  defaultValue: 'true',
  description:
    'Muestra u oculta únicamente el asterisco. No agrega ni elimina Validators.required.',
};

const labelMode: UiApiMemberDoc = {
  name: 'labelMode',
  kind: 'input',
  type: "'fixed' | 'floating'",
  defaultValue: "'fixed'",
  description:
    'Define si la etiqueta permanece sobre el borde o inicia dentro del control y se eleva con foco o valor.',
};

export const UI_API_CATEGORIES: readonly UiApiCategoryDoc[] = [
  {
    id: 'forms',
    label: 'Formularios normales',
    icon: 'fa-solid fa-pen-to-square',
    description:
      'Campos compatibles con Reactive Forms, validación, dimensiones responsive y etiquetas fijas o animadas.',
  },
  {
    id: 'data',
    label: 'Datos y carga',
    icon: 'fa-solid fa-table-list',
    description:
      'Tabla, paginación y spinner: modos cliente/servidor, prioridades visuales y eventos.',
  },
  {
    id: 'actions',
    label: 'Acciones y estados',
    icon: 'fa-solid fa-toggle-on',
    description:
      'Botones, modal, badges y chips con variantes semánticas, accesibilidad y salidas.',
  },
  {
    id: 'structure',
    label: 'Estructura visual',
    icon: 'fa-solid fa-object-group',
    description:
      'Tabs y encabezados para organizar páginas, secciones y paneles sin duplicar estilos.',
  },
];

export const UI_API_COMPONENTS: readonly UiApiComponentDoc[] = [
  {
    selector: 'app-ui-input',
    name: 'Input y textarea',
    category: 'forms',
    summary:
      'Control de texto reutilizable. Actúa como input o textarea y se integra directamente con formControlName.',
    controlValueAccessor: true,
    notes: [
      'La validación vive en el FormControl; error recibe únicamente el mensaje que se mostrará.',
      'Cuando multiline es true, rows define el alto inicial y controlSize conserva el ancho.',
      'required aporta semántica accesible; showRequiredMarker solo controla la presentación.',
    ],
    example: `<app-ui-input
  formControlName="nombres"
  label="Nombres"
  placeholder="Ingrese nombres"
  type="text"
  icon="fa-solid fa-user"
  [required]="true"
  [showRequiredMarker]="true"
  [maxlength]="80"
  [error]="error('nombres')"
/>`,
    members: [
      {
        name: 'label',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Nombre visible y accesible del campo.',
      },
      {
        name: 'type',
        kind: 'input',
        type: 'string',
        defaultValue: "'text'",
        description: 'Tipo HTML: text, email, password, number, tel, date, entre otros.',
      },
      {
        name: 'placeholder',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Ayuda breve dentro del control cuando no existe valor.',
      },
      {
        name: 'autocomplete',
        kind: 'input',
        type: 'string',
        defaultValue: "'off'",
        description: 'Valor del atributo autocomplete del navegador.',
      },
      {
        name: 'hint',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Texto de ayuda inferior. Se oculta visualmente cuando existe error.',
      },
      {
        name: 'error',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Mensaje inferior y estado visual inválido cuando contiene texto.',
      },
      {
        name: 'icon',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Clases Font Awesome del icono ubicado dentro del campo.',
      },
      {
        name: 'inputId',
        kind: 'input',
        type: 'string',
        defaultValue: 'autogenerado',
        description: 'Id estable para relacionar label, hint, error y pruebas.',
      },
      {
        name: 'maxlength',
        kind: 'input',
        type: 'number | null',
        defaultValue: 'null',
        description: 'Cantidad máxima de caracteres aceptada por el control.',
      },
      {
        name: 'rows',
        kind: 'input',
        type: 'number',
        defaultValue: '4',
        description: 'Número de filas iniciales cuando se utiliza como textarea.',
      },
      {
        name: 'multiline',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Cambia el elemento interno de input a textarea.',
      },
      {
        name: 'readonly',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Permite consultar y copiar el valor, pero impide editarlo.',
      },
      {
        name: 'disabled',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Deshabilita interacción. También respeta disable() del FormControl.',
      },
      {
        name: 'required',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description:
          'Expone el estado requerido al HTML y al lector de pantalla; no reemplaza Validators.required.',
      },
      requiredMarker,
      labelMode,
      controlSize,
      {
        name: 'enterPressed',
        kind: 'output',
        type: 'void',
        defaultValue: '—',
        description: 'Se emite al presionar Enter en un input de una sola línea.',
      },
    ],
  },
  {
    selector: '[appUiFormSpacing]',
    name: 'Separación responsive del formulario',
    category: 'forms',
    summary:
      'Directiva de layout que controla de forma independiente filas y columnas en escritorio y móvil.',
    notes: [
      'Aplíquela al contenedor que ya utiliza display grid o flex; la directiva no decide la estructura.',
      'Los valores se limitan entre 0 y 48 px para evitar separaciones negativas o desproporcionadas.',
      'En pantallas de hasta 768 px se activan automáticamente las entradas mobile.',
    ],
    example: `<div
  class="form-grid"
  appUiFormSpacing
  [formRowGap]="20"
  [formColumnGap]="14"
  [formMobileRowGap]="22"
  [formMobileColumnGap]="0"
>
  <!-- Controles del formulario -->
</div>`,
    members: [
      {
        name: 'formRowGap',
        kind: 'input',
        type: 'number',
        defaultValue: '18',
        description: 'Separación vertical en escritorio.',
      },
      {
        name: 'formColumnGap',
        kind: 'input',
        type: 'number',
        defaultValue: '14',
        description: 'Separación horizontal en escritorio.',
      },
      {
        name: 'formMobileRowGap',
        kind: 'input',
        type: 'number',
        defaultValue: '18',
        description: 'Separación vertical hasta 768 px.',
      },
      {
        name: 'formMobileColumnGap',
        kind: 'input',
        type: 'number',
        defaultValue: '10',
        description: 'Separación horizontal hasta 768 px.',
      },
    ],
  },
  {
    selector: 'app-ui-search-input',
    name: 'Buscador',
    category: 'forms',
    summary:
      'Campo de búsqueda con botón opcional, diseño unido o separado y comportamiento móvil configurable.',
    controlValueAccessor: true,
    notes: [
      'search se emite al presionar el botón o Enter; entrega el valor sin espacios extremos.',
      'Con showButton=false funciona como búsqueda reactiva y el icono se muestra dentro del campo.',
      'iconOnly=true oculta siempre el texto; hideButtonTextOnMobile lo oculta únicamente en móvil.',
    ],
    example: `<app-ui-search-input
  formControlName="criterio"
  label="Buscar usuario"
  placeholder="Nombre, identificación o correo"
  buttonText="Filtrar"
  buttonLayout="detached"
  [buttonGap]="10"
  [hideButtonTextOnMobile]="true"
  (search)="buscar($event)"
/>`,
    members: [
      {
        name: 'label',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Etiqueta visible del buscador.',
      },
      {
        name: 'ariaLabel',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Nombre accesible alternativo cuando no se presenta label.',
      },
      {
        name: 'placeholder',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Ejemplo o instrucción breve dentro del campo.',
      },
      {
        name: 'buttonText',
        kind: 'input',
        type: 'string',
        defaultValue: "'Buscar'",
        description: 'Texto visible y nombre accesible del botón.',
      },
      {
        name: 'icon',
        kind: 'input',
        type: 'string',
        defaultValue: "'fa-solid fa-magnifying-glass'",
        description: 'Icono del botón o icono inicial cuando showButton es false.',
      },
      {
        name: 'error',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Mensaje y estado visual inválido.',
      },
      {
        name: 'hint',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Texto complementario debajo del buscador.',
      },
      {
        name: 'inputId',
        kind: 'input',
        type: 'string',
        defaultValue: 'autogenerado',
        description: 'Id para label, mensajes y automatización.',
      },
      {
        name: 'maxlength',
        kind: 'input',
        type: 'number | null',
        defaultValue: 'null',
        description: 'Longitud máxima del criterio.',
      },
      {
        name: 'iconOnly',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Deja únicamente el icono del botón en todos los tamaños.',
      },
      {
        name: 'required',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Semántica requerida; Validators.required continúa en el FormControl.',
      },
      {
        name: 'disabled',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Deshabilita campo, limpiar y búsqueda.',
      },
      {
        name: 'clearable',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'true',
        description: 'Muestra la acción para borrar cuando existe valor.',
      },
      {
        name: 'hideButtonTextOnMobile',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'true',
        description: 'Oculta solo el texto del botón en pantallas pequeñas.',
      },
      {
        name: 'showButton',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'true',
        description: 'Permite retirar el botón para buscar conforme cambia el FormControl.',
      },
      requiredMarker,
      {
        name: 'buttonVariant',
        kind: 'input',
        type: 'UiButtonVariant',
        defaultValue: "'secondary'",
        description: 'Tono semántico del ui-button integrado.',
      },
      {
        name: 'buttonAppearance',
        kind: 'input',
        type: "'solid' | 'soft' | 'outline' | 'ghost'",
        defaultValue: "'solid'",
        description: 'Tratamiento visual del botón.',
      },
      {
        name: 'buttonLayout',
        kind: 'input',
        type: "'attached' | 'detached'",
        defaultValue: "'attached'",
        description: 'Une el botón al campo o lo separa como una acción independiente.',
      },
      {
        name: 'buttonGap',
        kind: 'input',
        type: 'string | number',
        defaultValue: '8',
        description: 'Separación del botón detached; los números se interpretan en px.',
      },
      {
        name: 'buttonBackgroundColor',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Sobrescribe el fondo del botón; vacío conserva la variante.',
      },
      {
        name: 'buttonTextColor',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Color personalizado del texto del botón.',
      },
      {
        name: 'buttonBorderColor',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Color personalizado del borde.',
      },
      {
        name: 'buttonIconColor',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Color personalizado del icono del botón.',
      },
      {
        name: 'leadingIconColor',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Color del icono ubicado dentro del campo cuando no hay botón.',
      },
      controlSize,
      {
        name: 'search',
        kind: 'output',
        type: 'string',
        defaultValue: '—',
        description: 'Entrega el criterio normalizado cuando se solicita buscar.',
      },
      {
        name: 'cleared',
        kind: 'output',
        type: 'void',
        defaultValue: '—',
        description: 'Notifica que el usuario limpió el campo.',
      },
    ],
  },
  {
    selector: 'app-ui-select',
    name: 'Select',
    category: 'forms',
    summary:
      'Lista desplegable tipada, buscable y adaptativa. El panel cambia arriba/abajo según el espacio disponible.',
    controlValueAccessor: true,
    notes: [
      'options usa UiSelectOption<T> con label, value y disabled opcional.',
      'El panel flota sobre el contenido, limita su altura y genera scroll sin ensanchar el formulario.',
      'El overlay de Angular CDK evita recortes y desplazamientos dentro de modales, tabs y expansion panels.',
      'La selección se compara con Object.is; utilice valores primitivos o referencias estables.',
    ],
    example: `<app-ui-select
  formControlName="unidad"
  label="Unidad"
  placeholder="Seleccione una unidad"
  searchPlaceholder="Buscar unidad..."
  [options]="unidadOptions"
  [searchable]="true"
  [clearable]="true"
  [required]="true"
  [error]="error('unidad')"
/>`,
    members: [
      {
        name: 'label',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Etiqueta del selector.',
      },
      {
        name: 'placeholder',
        kind: 'input',
        type: 'string',
        defaultValue: "'Seleccione'",
        description: 'Texto cuando no existe selección.',
      },
      {
        name: 'searchPlaceholder',
        kind: 'input',
        type: 'string',
        defaultValue: "'Buscar...'",
        description: 'Texto del filtro interno del panel.',
      },
      {
        name: 'hint',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Ayuda inferior del selector.',
      },
      {
        name: 'error',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Mensaje inferior y estado inválido.',
      },
      {
        name: 'inputId',
        kind: 'input',
        type: 'string',
        defaultValue: 'autogenerado',
        description: 'Id accesible del control.',
      },
      {
        name: 'options',
        kind: 'input',
        type: 'UiSelectOption<T>[]',
        defaultValue: '[]',
        description: 'Opciones disponibles con label, value y disabled opcional.',
      },
      {
        name: 'disabled',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Bloquea apertura, limpieza y selección.',
      },
      {
        name: 'required',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Comunica visual y semánticamente que se requiere una selección.',
      },
      {
        name: 'clearable',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'true',
        description: 'Permite volver el valor a null.',
      },
      {
        name: 'searchable',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'true',
        description: 'Muestra u oculta el buscador del panel.',
      },
      requiredMarker,
      labelMode,
      controlSize,
    ],
  },
  {
    selector: 'app-ui-date-time-picker',
    name: 'Fecha, hora y fecha-hora',
    category: 'forms',
    summary:
      'Adaptador de Flatpickr protegido para seleccionar fecha, hora o ambas sin exponer la biblioteca al consumidor.',
    controlValueAccessor: true,
    notes: [
      'mode decide formato, icono y opciones de Flatpickr mediante configuración centralizada.',
      'minDate/maxDate limitan fechas; minTime/maxTime limitan horas.',
      'allowManualInput=false evita formatos inconsistentes y mantiene la selección mediante el panel.',
    ],
    example: `<app-ui-date-time-picker
  formControlName="fechaHora"
  label="Fecha y hora de cita"
  mode="datetime"
  [minDate]="today"
  [minuteStep]="5"
  [allowManualInput]="false"
  [required]="true"
  [error]="error('fechaHora')"
/>`,
    members: [
      {
        name: 'label',
        kind: 'input',
        type: 'string',
        defaultValue: 'requerido',
        description: 'Nombre visible y accesible del selector.',
      },
      {
        name: 'mode',
        kind: 'input',
        type: "'date' | 'time' | 'datetime'",
        defaultValue: "'date'",
        description: 'Define qué información se selecciona y el formato emitido.',
      },
      {
        name: 'controlId',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Id personalizado; vacío genera uno interno.',
      },
      {
        name: 'placeholder',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Texto vacío; el modo proporciona un respaldo localizado.',
      },
      {
        name: 'hint',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Ayuda de formato o negocio.',
      },
      {
        name: 'error',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Mensaje de validación presentado debajo del control.',
      },
      {
        name: 'icon',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Icono personalizado; vacío usa el correspondiente al modo.',
      },
      {
        name: 'minDate',
        kind: 'input',
        type: 'string | Date | null',
        defaultValue: 'null',
        description: 'Primera fecha habilitada.',
      },
      {
        name: 'maxDate',
        kind: 'input',
        type: 'string | Date | null',
        defaultValue: 'null',
        description: 'Última fecha habilitada.',
      },
      {
        name: 'minTime',
        kind: 'input',
        type: 'string | null',
        defaultValue: 'null',
        description: 'Hora mínima HH:mm para modos con tiempo.',
      },
      {
        name: 'maxTime',
        kind: 'input',
        type: 'string | null',
        defaultValue: 'null',
        description: 'Hora máxima HH:mm para modos con tiempo.',
      },
      {
        name: 'minuteStep',
        kind: 'input',
        type: 'number',
        defaultValue: '5',
        description: 'Intervalo de minutos del selector.',
      },
      {
        name: 'required',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Estado requerido visual y accesible.',
      },
      requiredMarker,
      labelMode,
      {
        name: 'disabled',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Desactiva entrada y apertura del calendario.',
      },
      {
        name: 'allowManualInput',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description:
          'Permite escribir además de seleccionar. Úselo solo si el formato está claramente indicado.',
      },
      controlSize,
    ],
  },
  {
    selector: 'app-ui-time-picker',
    name: 'Selector de horas',
    category: 'forms',
    summary:
      'Lista de horas en formato 12 o 24 horas. Conserva en el FormControl un valor normalizado HH:mm.',
    controlValueAccessor: true,
    notes: [
      'hourFormat cambia la presentación, no el formato guardado.',
      'minuteStep debe dividir una hora de forma razonable: 5, 10, 15, 20 o 30 son valores habituales.',
      'El panel se despliega arriba cuando no hay espacio inferior suficiente.',
    ],
    example: `<app-ui-time-picker
  formControlName="hora"
  label="Hora de inicio"
  hourFormat="12"
  [minuteStep]="30"
  minTime="08:00"
  maxTime="18:00"
  [clearable]="true"
  (valueChange)="horaCambiada($event)"
/>`,
    members: [
      {
        name: 'label',
        kind: 'input',
        type: 'string',
        defaultValue: 'requerido',
        description: 'Nombre del campo.',
      },
      {
        name: 'hourFormat',
        kind: 'input',
        type: "'12' | '24'",
        defaultValue: "'24'",
        description: 'Presentación AM/PM o 24 horas.',
      },
      {
        name: 'controlId',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Id personalizado o autogenerado.',
      },
      {
        name: 'placeholder',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Texto visible sin selección.',
      },
      {
        name: 'icon',
        kind: 'input',
        type: 'string',
        defaultValue: "'fa-solid fa-clock'",
        description: 'Icono del disparador.',
      },
      {
        name: 'hint',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Ayuda inferior.',
      },
      {
        name: 'error',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Mensaje y estado inválido.',
      },
      {
        name: 'minTime',
        kind: 'input',
        type: 'string | null',
        defaultValue: 'null',
        description: 'Primera hora disponible en formato HH:mm.',
      },
      {
        name: 'maxTime',
        kind: 'input',
        type: 'string | null',
        defaultValue: 'null',
        description: 'Última hora disponible en formato HH:mm.',
      },
      {
        name: 'minuteStep',
        kind: 'input',
        type: 'number',
        defaultValue: '30',
        description: 'Separación en minutos entre opciones.',
      },
      {
        name: 'required',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Estado requerido visual y accesible.',
      },
      requiredMarker,
      labelMode,
      {
        name: 'disabled',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Deshabilita apertura y limpieza.',
      },
      {
        name: 'clearable',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'true',
        description: 'Permite retirar la hora seleccionada.',
      },
      controlSize,
      {
        name: 'valueChange',
        kind: 'output',
        type: 'string',
        defaultValue: '—',
        description: 'Emite HH:mm cada vez que cambia la selección.',
      },
    ],
  },
  {
    selector: 'app-ui-file-upload',
    name: 'Carga de archivos',
    category: 'forms',
    summary:
      'Selector visual que valida extensión, MIME y tamaño antes de entregar el File al consumidor.',
    notes: [
      'El componente no sube archivos por sí mismo; fileSelected entrega el File al servicio de la funcionalidad.',
      'accept orienta el diálogo del navegador; allowedMimeTypes y allowedExtensions realizan la validación real.',
      'fileName pertenece al estado consumidor y permite mostrar el archivo actualmente seleccionado o publicado.',
    ],
    example: `<app-ui-file-upload
  label="Logo institucional"
  accept=".png,.jpg,.webp"
  [allowedExtensions]="['png', 'jpg', 'webp']"
  [allowedMimeTypes]="['image/png', 'image/jpeg', 'image/webp']"
  [maxSizeBytes]="10 * 1024 * 1024"
  [fileName]="logoName()"
  (fileSelected)="seleccionarLogo($event)"
  (validationError)="mostrarError($event)"
/>`,
    members: [
      {
        name: 'label',
        kind: 'input',
        type: 'string',
        defaultValue: 'requerido',
        description: 'Nombre accesible de la carga.',
      },
      {
        name: 'inputId',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Id personalizado o generado internamente.',
      },
      {
        name: 'accept',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Filtro del diálogo nativo, por ejemplo .png,image/jpeg.',
      },
      {
        name: 'hint',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Formatos y límites explicados al usuario.',
      },
      {
        name: 'error',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Error externo que debe presentar el consumidor.',
      },
      {
        name: 'icon',
        kind: 'input',
        type: 'string',
        defaultValue: "'fa-solid fa-cloud-arrow-up'",
        description: 'Icono principal.',
      },
      {
        name: 'buttonText',
        kind: 'input',
        type: 'string',
        defaultValue: "'Seleccionar archivo'",
        description: 'Texto de la acción.',
      },
      {
        name: 'emptyText',
        kind: 'input',
        type: 'string',
        defaultValue: "'Ningún archivo seleccionado'",
        description: 'Estado sin archivo.',
      },
      {
        name: 'fileName',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Nombre controlado por la página consumidora.',
      },
      {
        name: 'allowedMimeTypes',
        kind: 'input',
        type: 'readonly string[]',
        defaultValue: '[]',
        description: 'Lista blanca MIME. Vacía no restringe por MIME.',
      },
      {
        name: 'allowedExtensions',
        kind: 'input',
        type: 'readonly string[]',
        defaultValue: '[]',
        description: 'Lista blanca de extensiones sin punto.',
      },
      {
        name: 'maxSizeBytes',
        kind: 'input',
        type: 'number',
        defaultValue: '0',
        description: 'Tamaño máximo en bytes; 0 no aplica límite.',
      },
      {
        name: 'required',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Presenta semántica requerida; la lógica de negocio debe validar existencia.',
      },
      requiredMarker,
      {
        name: 'disabled',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Impide seleccionar o limpiar.',
      },
      {
        name: 'loading',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Bloquea temporalmente y presenta estado durante una operación.',
      },
      {
        name: 'clearable',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'true',
        description: 'Muestra la acción para solicitar limpieza.',
      },
      {
        name: 'fileSelected',
        kind: 'output',
        type: 'File',
        defaultValue: '—',
        description: 'Entrega un archivo que superó las validaciones locales.',
      },
      {
        name: 'clearRequested',
        kind: 'output',
        type: 'void',
        defaultValue: '—',
        description: 'Solicita al consumidor borrar archivo y nombre.',
      },
      {
        name: 'validationError',
        kind: 'output',
        type: 'string',
        defaultValue: '—',
        description: 'Entrega el motivo de rechazo por tipo, extensión o tamaño.',
      },
    ],
  },
  {
    selector: 'app-ui-icon-picker',
    name: 'Selector de iconos',
    category: 'forms',
    summary:
      'Selector visual de Font Awesome con búsqueda, categorías, vista previa y panel adaptativo.',
    controlValueAccessor: true,
    notes: [
      'El FormControl conserva la clase completa, por ejemplo fa-solid fa-house.',
      'Las opciones antiguas continúan visibles mediante el catálogo central del componente.',
      'El panel detecta el borde de la ventana y se abre hacia arriba cuando es necesario.',
    ],
    example: `<app-ui-icon-picker
  formControlName="icono"
  label="Icono del menú"
  placeholder="Seleccione un icono"
  hint="La vista previa corresponde al icono que verá el usuario."
  density="compact"
  [clearable]="true"
  [required]="true"
  [error]="error('icono')"
/>`,
    members: [
      {
        name: 'label',
        kind: 'input',
        type: 'string',
        defaultValue: "'Icono'",
        description: 'Nombre visible del selector.',
      },
      {
        name: 'placeholder',
        kind: 'input',
        type: 'string',
        defaultValue: "'Seleccione un icono'",
        description: 'Texto cuando no existe selección.',
      },
      {
        name: 'hint',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Ayuda inferior.',
      },
      {
        name: 'error',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Mensaje y estado inválido.',
      },
      {
        name: 'required',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Marca visual y semánticamente el selector como requerido.',
      },
      {
        name: 'clearable',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'true',
        description: 'Permite retirar el icono seleccionado.',
      },
      {
        name: 'density',
        kind: 'input',
        type: "'default' | 'compact'",
        defaultValue: "'default'",
        description: 'Controla altura y espacios del disparador.',
      },
    ],
  },
  {
    selector: 'app-ui-table',
    name: 'Tabla de datos',
    category: 'data',
    summary:
      'Grilla tipada con filtros, ordenamiento, paginación, estilos por tabla/columna/fila y acciones configurables.',
    notes: [
      'dataMode=client filtra, ordena y pagina rows dentro del componente; external delega esas operaciones al consumidor.',
      'La prioridad visual es columna → fila → tabla → tema.',
      'page y pageSize son models: pueden utilizarse como [(page)] y [(pageSize)] o dejarse autocontrolados.',
      'En modo external, rows debe contener únicamente la página recibida y total debe contener el total del backend.',
    ],
    example: `<app-ui-table
  dataMode="client"
  variant="institutional"
  [columns]="columns"
  [rows]="usuarios()"
  [filters]="filters"
  [actions]="actions"
  [pageSize]="10"
  contentAlign="left"
  bodyTextColor="#44566c"
  [bodyFontSize]="13"
  bodyFontWeight="semibold"
  [rowPadding]="10"
  headerColor="#207fae"
  headerColorMiddle="#17678f"
  headerColorEnd="#0b4b73"
  (actionClick)="resolverAccion($event)"
/>`,
    members: [
      {
        name: 'labelledBy',
        kind: 'input',
        type: 'string | null',
        defaultValue: 'null',
        description: 'Id de un título externo que nombra accesiblemente la tabla.',
      },
      {
        name: 'title',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Título interno opcional.',
      },
      {
        name: 'titleIcon',
        kind: 'input',
        type: 'string',
        defaultValue: "'fa-solid fa-table-list'",
        description: 'Icono del título interno.',
      },
      {
        name: 'emptyMessage',
        kind: 'input',
        type: 'string',
        defaultValue: "'No hay registros para mostrar.'",
        description: 'Mensaje cuando la página visible no contiene filas.',
      },
      {
        name: 'loading',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Reemplaza el cuerpo con ui-spinner durante la carga.',
      },
      {
        name: 'loadingMessage',
        kind: 'input',
        type: 'string',
        defaultValue: "'Cargando registros...'",
        description: 'Texto accesible y visual del estado de carga.',
      },
      {
        name: 'loadingSpinnerSize',
        kind: 'input',
        type: 'UiSpinnerSize',
        defaultValue: "'lg'",
        description: 'Tamaño del indicador usado por loading.',
      },
      {
        name: 'loadingSpinnerVariant',
        kind: 'input',
        type: 'UiSpinnerVariant',
        defaultValue: "'primary'",
        description: 'Color semántico del indicador.',
      },
      {
        name: 'columns',
        kind: 'input',
        type: 'UiTableColumn<T>[]',
        defaultValue: '[]',
        description: 'Esquema tipado de columnas, formato, alineación y plantillas.',
      },
      {
        name: 'rows',
        kind: 'input',
        type: 'T[]',
        defaultValue: '[]',
        description: 'Registros completos en client o página actual en external.',
      },
      {
        name: 'filters',
        kind: 'input',
        type: 'UiTableFilter[]',
        defaultValue: '[]',
        description: 'Campos de filtro ubicados sobre la tabla.',
      },
      {
        name: 'dataMode',
        kind: 'input',
        type: "'client' | 'external'",
        defaultValue: "'client'",
        description: 'Define quién procesa filtros, ordenamiento y paginación.',
      },
      {
        name: 'actions',
        kind: 'input',
        type: 'UiTableAction<T>[]',
        defaultValue: '[]',
        description: 'Acciones visibles, deshabilitables y tipadas por registro.',
      },
      {
        name: 'variant',
        kind: 'input',
        type: "'institutional' | 'plain'",
        defaultValue: "'institutional'",
        description: 'Encabezado institucional con color o apariencia limpia.',
      },
      {
        name: 'actionDisplay',
        kind: 'input',
        type: "'menu' | 'row-hover'",
        defaultValue: "'menu'",
        description: 'Tres puntos desplegables o botones flotantes al pasar/enfocar una fila.',
      },
      {
        name: 'actionsPosition',
        kind: 'input',
        type: "'left' | 'right' | 'start' | 'end'",
        defaultValue: "'left'",
        description: 'Ubicación física de la columna de acciones; start/end son alias compatibles.',
      },
      {
        name: 'total',
        kind: 'input',
        type: 'number',
        defaultValue: '0',
        description: 'Total remoto en external; en client se calcula desde las filas filtradas.',
      },
      {
        name: 'page',
        kind: 'model',
        type: 'number',
        defaultValue: '1',
        description: 'Página actual autocontrolada o enlazable con [(page)].',
      },
      {
        name: 'pageSize',
        kind: 'model',
        type: 'number',
        defaultValue: '10',
        description: 'Registros por página, enlazable con [(pageSize)].',
      },
      {
        name: 'pageSizeOptions',
        kind: 'input',
        type: 'number[]',
        defaultValue: '[5, 10, 20, 50]',
        description: 'Tamaños disponibles; el tamaño actual se agrega si no está presente.',
      },
      {
        name: 'actionMenuLabel',
        kind: 'input',
        type: 'string',
        defaultValue: "'Acciones disponibles para el registro'",
        description: 'Nombre accesible del menú de cada fila.',
      },
      {
        name: 'showRecordBadge',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'true',
        description:
          'Muestra el distintivo numérico asociado al disparador de acciones cuando corresponde.',
      },
      {
        name: 'showPagination',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'true',
        description: 'Activa el paginador; false presenta todas las filas recibidas.',
      },
      {
        name: 'paginationVariant',
        kind: 'input',
        type: "'standard' | 'numbered' | 'minimal'",
        defaultValue: "'standard'",
        description: 'Apariencia del ui-pagination integrado.',
      },
      {
        name: 'paginationShowSummary',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'true',
        description: 'Muestra el rango y total de registros.',
      },
      {
        name: 'paginationShowPageSize',
        kind: 'input',
        type: 'boolean | null',
        defaultValue: 'null',
        description: 'Controla el selector de tamaño; null usa la decisión de la variante.',
      },
      {
        name: 'paginationMaxVisiblePages',
        kind: 'input',
        type: 'number',
        defaultValue: '5',
        description: 'Máximo de páginas numéricas simultáneas.',
      },
      {
        name: 'stickyHeader',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'true',
        description: 'Mantiene el encabezado visible dentro del scroll de la tabla.',
      },
      {
        name: 'stickyActions',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'true',
        description: 'Fija la columna de acciones al desplazarse horizontalmente.',
      },
      {
        name: 'contentAlign',
        kind: 'input',
        type: "'left' | 'center' | 'right'",
        defaultValue: "'left'",
        description: 'Alineación general; UiTableColumn.align tiene prioridad.',
      },
      {
        name: 'bodyTextColor',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Color general de celdas en tema claro.',
      },
      {
        name: 'darkBodyTextColor',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Color general de celdas en tema oscuro.',
      },
      {
        name: 'bodyFontSize',
        kind: 'input',
        type: 'string | number',
        defaultValue: '13',
        description: 'Tamaño general; un número se interpreta en px.',
      },
      {
        name: 'bodyFontWeight',
        kind: 'input',
        type: 'UiTableFontWeight',
        defaultValue: '600',
        description:
          'Peso general entre 100–900 o preset light/normal/regular/medium/semibold/bold.',
      },
      {
        name: 'bodyTextTransform',
        kind: 'input',
        type: "'none' | 'uppercase' | 'lowercase' | 'capitalize'",
        defaultValue: "'none'",
        description: 'Transformación solo visual; no modifica datos, filtros ni backend.',
      },
      {
        name: 'rowHeight',
        kind: 'input',
        type: 'string | number | null',
        defaultValue: 'null',
        description: 'Alto mínimo general de fila.',
      },
      {
        name: 'rowPadding',
        kind: 'input',
        type: 'string | number',
        defaultValue: '14',
        description: 'Espacio vertical de las celdas; permite compactar realmente la tabla.',
      },
      {
        name: 'tableMinWidth',
        kind: 'input',
        type: 'string | number | null',
        defaultValue: 'null',
        description: 'Ancho mínimo antes de activar desplazamiento horizontal.',
      },
      {
        name: 'rowAppearance',
        kind: 'input',
        type: 'UiTableRowAppearanceResolver<T> | null',
        defaultValue: 'null',
        description: 'Resuelve selección, colores, fondo, fuente, alto y padding por fila.',
      },
      {
        name: 'headerColor',
        kind: 'input',
        type: 'string',
        defaultValue: "'#005478'",
        description: 'Primer tono del encabezado.',
      },
      {
        name: 'headerColorMiddle',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Tono central opcional del degradado.',
      },
      {
        name: 'headerColorEnd',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Tono final; vacío reutiliza el inicial.',
      },
      {
        name: 'headerTextColor',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Color del texto y ordenamiento del encabezado.',
      },
      {
        name: 'embedded',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description:
          'Retira solo la tarjeta exterior cuando la tabla ya está dentro de otro panel.',
      },
      {
        name: 'filterChange',
        kind: 'output',
        type: 'Record<string, string>',
        defaultValue: '—',
        description: 'Entrega los filtros; es obligatorio procesarlo en external.',
      },
      {
        name: 'sortChange',
        kind: 'output',
        type: 'UiTableSortEvent<T>',
        defaultValue: '—',
        description: 'Entrega columna y dirección del ordenamiento.',
      },
      {
        name: 'actionClick',
        kind: 'output',
        type: 'UiTableActionEvent<T>',
        defaultValue: '—',
        description: 'Entrega actionId y la fila completa.',
      },
    ],
  },
  {
    selector: 'UiTableColumn<T>',
    name: 'Configuración de columna',
    category: 'data',
    summary:
      'Modelo utilizado dentro de columns para definir cada columna sin lógica condicional en el HTML.',
    example: `readonly columns: UiTableColumn<Usuario>[] = [
  {
    key: 'nombre',
    label: 'Nombre',
    width: '32%',
    sortable: true,
    align: 'center',
    textColor: '#005478',
    fontSize: 13,
    fontWeight: 'semibold',
    textTransform: 'capitalize',
    value: (row) => row.nombre || 'N/A',
  },
];`,
    members: [
      {
        name: 'key',
        kind: 'input',
        type: 'keyof T & string',
        defaultValue: 'requerido',
        description: 'Clave tipada usada para valor, filtro y ordenamiento.',
      },
      {
        name: 'label',
        kind: 'input',
        type: 'string',
        defaultValue: 'requerido',
        description: 'Texto del encabezado.',
      },
      {
        name: 'align',
        kind: 'input',
        type: "'left' | 'center' | 'right'",
        defaultValue: 'heredado',
        description: 'Sobrescribe contentAlign para encabezado y celdas de la columna.',
      },
      {
        name: 'textColor',
        kind: 'input',
        type: 'string',
        defaultValue: 'heredado',
        description: 'Sobrescribe fila y tabla en tema claro.',
      },
      {
        name: 'darkTextColor',
        kind: 'input',
        type: 'string',
        defaultValue: 'heredado',
        description: 'Sobrescribe el color de la columna en tema oscuro.',
      },
      {
        name: 'fontSize',
        kind: 'input',
        type: 'string | number',
        defaultValue: 'heredado',
        description: 'Tamaño de celdas de la columna.',
      },
      {
        name: 'fontWeight',
        kind: 'input',
        type: 'UiTableFontWeight',
        defaultValue: 'heredado',
        description: 'Peso de celdas de la columna.',
      },
      {
        name: 'textTransform',
        kind: 'input',
        type: 'UiTableTextTransform',
        defaultValue: 'heredado',
        description: 'Transformación visual específica.',
      },
      {
        name: 'sortable',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Habilita el botón y eventos de ordenamiento.',
      },
      {
        name: 'width',
        kind: 'input',
        type: 'string',
        defaultValue: 'automático',
        description: 'Ancho CSS sugerido de la columna.',
      },
      {
        name: 'value',
        kind: 'input',
        type: '(row: T) => valor',
        defaultValue: 'row[key]',
        description: 'Resuelve y formatea texto; también participa en filtros y ordenamiento.',
      },
      {
        name: 'badge',
        kind: 'input',
        type: '(row: T) => UiTableBadge | null',
        defaultValue: 'null',
        description: 'Presenta una celda con ui-badge según el registro.',
      },
      {
        name: 'cellTemplate',
        kind: 'input',
        type: 'TemplateRef',
        defaultValue: 'null',
        description: 'Plantilla para contenido complejo. Recibe row y column.',
      },
    ],
  },
  {
    selector: 'app-ui-pagination',
    name: 'Paginación',
    category: 'data',
    summary: 'Paginador reutilizable independiente o integrado automáticamente por ui-table.',
    example: `<app-ui-pagination
  [total]="total()"
  [page]="page()"
  [pageSize]="pageSize()"
  variant="numbered"
  [showSummary]="true"
  [showPageSize]="false"
  (pageChange)="page.set($event)"
  (pageSizeChange)="cambiarTamano($event)"
/>`,
    members: [
      {
        name: 'total',
        kind: 'input',
        type: 'number',
        defaultValue: '0',
        description: 'Cantidad total de registros.',
      },
      {
        name: 'page',
        kind: 'input',
        type: 'number',
        defaultValue: '1',
        description: 'Página actual, comenzando en 1.',
      },
      {
        name: 'pageSize',
        kind: 'input',
        type: 'number',
        defaultValue: '10',
        description: 'Cantidad de registros por página.',
      },
      {
        name: 'pageSizeOptions',
        kind: 'input',
        type: 'readonly number[]',
        defaultValue: '[5, 10, 20, 50]',
        description: 'Opciones del selector de tamaño.',
      },
      {
        name: 'variant',
        kind: 'input',
        type: "'standard' | 'numbered' | 'minimal'",
        defaultValue: "'standard'",
        description: 'Distribución visual del paginador.',
      },
      {
        name: 'showSummary',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'true',
        description: 'Muestra rango actual y total.',
      },
      {
        name: 'showPageSize',
        kind: 'input',
        type: 'boolean | null',
        defaultValue: 'null',
        description: 'Fuerza el selector; null permite que la variante decida.',
      },
      {
        name: 'maxVisiblePages',
        kind: 'input',
        type: 'number',
        defaultValue: '5',
        description: 'Máximo de botones numéricos.',
      },
      {
        name: 'ariaLabel',
        kind: 'input',
        type: 'string',
        defaultValue: "'Paginación'",
        description: 'Nombre accesible del bloque de navegación.',
      },
      {
        name: 'pageChange',
        kind: 'output',
        type: 'number',
        defaultValue: '—',
        description: 'Nueva página solicitada.',
      },
      {
        name: 'pageSizeChange',
        kind: 'output',
        type: 'number',
        defaultValue: '—',
        description: 'Nuevo tamaño solicitado; el consumidor debe volver a página 1.',
      },
    ],
  },
  {
    selector: 'app-ui-spinner',
    name: 'Indicador de carga',
    category: 'data',
    summary: 'Estado de espera accesible para contenido, tablas, tarjetas u overlays.',
    example: `<app-ui-spinner
  type="ring"
  size="lg"
  variant="info"
  layout="stacked"
  label="Consultando información..."
  [contained]="true"
  [speed]="760"
  [thickness]="4"
/>`,
    members: [
      {
        name: 'type',
        kind: 'input',
        type: "'ring' | 'dots' | 'bars' | 'pulse'",
        defaultValue: "'ring'",
        description: 'Animación del indicador.',
      },
      {
        name: 'size',
        kind: 'input',
        type: "'xs' | 'sm' | 'md' | 'lg' | 'xl'",
        defaultValue: "'md'",
        description: 'Escala visual.',
      },
      {
        name: 'variant',
        kind: 'input',
        type: 'UiSpinnerVariant',
        defaultValue: "'primary'",
        description: 'Tono semántico institucional.',
      },
      {
        name: 'layout',
        kind: 'input',
        type: "'stacked' | 'inline'",
        defaultValue: "'stacked'",
        description: 'Texto debajo o al lado de la animación.',
      },
      {
        name: 'label',
        kind: 'input',
        type: 'string',
        defaultValue: "'Cargando...'",
        description: 'Mensaje visual de la operación.',
      },
      {
        name: 'ariaLabel',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Mensaje alternativo para lectores; vacío utiliza label.',
      },
      {
        name: 'ariaLive',
        kind: 'input',
        type: "'off' | 'polite' | 'assertive'",
        defaultValue: "'polite'",
        description: 'Prioridad con la que se anuncia la carga.',
      },
      {
        name: 'showLabel',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'true',
        description: 'Oculta visualmente el texto sin perder ariaLabel.',
      },
      {
        name: 'contained',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Centra el spinner dentro de una superficie con altura segura.',
      },
      {
        name: 'overlay',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Cubre el contenedor posicionado más cercano.',
      },
      {
        name: 'backdrop',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'true',
        description: 'Agrega velo al utilizar overlay.',
      },
      {
        name: 'color',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Color CSS personalizado; vacío conserva variant.',
      },
      {
        name: 'speed',
        kind: 'input',
        type: 'number',
        defaultValue: '900',
        description: 'Duración de la animación en milisegundos.',
      },
      {
        name: 'thickness',
        kind: 'input',
        type: 'number',
        defaultValue: '3',
        description: 'Grosor del indicador donde el tipo lo admite.',
      },
    ],
  },
  {
    selector: 'app-ui-button',
    name: 'Botón',
    category: 'actions',
    summary: 'Acción semántica con variantes, loading, tooltip, modo icono y colores opcionales.',
    example: `<app-ui-button
  type="submit"
  variant="primary"
  appearance="solid"
  size="sm"
  icon="fa-solid fa-floppy-disk"
  [loading]="guardando()"
  (buttonClick)="guardar()"
>
  Guardar
</app-ui-button>`,
    members: [
      {
        name: 'type',
        kind: 'input',
        type: "'button' | 'submit' | 'reset'",
        defaultValue: "'button'",
        description: 'Comportamiento HTML dentro de formularios.',
      },
      {
        name: 'variant',
        kind: 'input',
        type: 'UiButtonVariant',
        defaultValue: "'secondary'",
        description:
          'Intención: primary, secondary, info, success, warning, danger, outline o ghost.',
      },
      {
        name: 'appearance',
        kind: 'input',
        type: "'solid' | 'soft' | 'outline' | 'ghost'",
        defaultValue: "'solid'",
        description: 'Tratamiento de fondo y borde.',
      },
      {
        name: 'size',
        kind: 'input',
        type: "'sm' | 'md' | 'lg'",
        defaultValue: "'md'",
        description: 'Altura, padding e icono.',
      },
      {
        name: 'icon',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Clases Font Awesome.',
      },
      {
        name: 'iconPosition',
        kind: 'input',
        type: "'start' | 'end'",
        defaultValue: "'start'",
        description: 'Posición del icono respecto al contenido.',
      },
      {
        name: 'title',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Título nativo; prefiera tooltip para ayuda visual consistente.',
      },
      {
        name: 'tooltip',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Ayuda flotante, especialmente importante en iconOnly.',
      },
      {
        name: 'tooltipAlign',
        kind: 'input',
        type: "'start' | 'center' | 'end'",
        defaultValue: "'center'",
        description: 'Alineación horizontal del tooltip.',
      },
      {
        name: 'ariaLabel',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Nombre accesible requerido para botones sin texto.',
      },
      {
        name: 'disabled',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Bloquea activación.',
      },
      {
        name: 'loading',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Bloquea, presenta spinner y evita doble envío.',
      },
      {
        name: 'block',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Ocupa todo el ancho disponible.',
      },
      {
        name: 'iconOnly',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Presenta únicamente el icono en todos los breakpoints.',
      },
      {
        name: 'hideTextOnMobile',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Conserva texto en escritorio y deja icono en móvil.',
      },
      {
        name: 'backgroundColor',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Fondo por instancia; vacío usa variant/appearance.',
      },
      {
        name: 'textColor',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Color personalizado del texto.',
      },
      {
        name: 'borderColor',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Color personalizado del borde.',
      },
      {
        name: 'iconColor',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Color personalizado del icono.',
      },
      {
        name: 'buttonClick',
        kind: 'output',
        type: 'MouseEvent',
        defaultValue: '—',
        description: 'Evento de activación; no se emite si disabled o loading.',
      },
    ],
  },
  {
    selector: 'app-ui-modal',
    name: 'Modal',
    category: 'actions',
    summary: 'Diálogo accesible con cuerpo y footer proyectados, cierre controlado y animación.',
    example: `<app-ui-modal
  [open]="modalOpen()"
  title="Editar registro"
  subtitle="Actualice la información requerida."
  icon="fa-solid fa-pen-to-square"
  size="lg"
  (closeRequested)="cerrarModal($event)"
>
  <form modal-body>...</form>
  <div modal-actions>...</div>
</app-ui-modal>`,
    members: [
      {
        name: 'open',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Estado controlado de visibilidad.',
      },
      {
        name: 'closeOnBackdrop',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'true',
        description: 'Permite solicitar cierre al pulsar fuera.',
      },
      {
        name: 'closeOnEscape',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'true',
        description: 'Permite solicitar cierre con Escape.',
      },
      {
        name: 'showCloseButton',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'true',
        description: 'Muestra la acción X del encabezado.',
      },
      {
        name: 'title',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Título del diálogo.',
      },
      {
        name: 'subtitle',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Contexto breve bajo el título.',
      },
      {
        name: 'icon',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Icono del encabezado.',
      },
      {
        name: 'ariaLabel',
        kind: 'input',
        type: 'string',
        defaultValue: "'Ventana de diálogo'",
        description: 'Nombre accesible de respaldo.',
      },
      {
        name: 'dialogClass',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Clase adicional para una necesidad de layout puntual.',
      },
      {
        name: 'size',
        kind: 'input',
        type: "'sm' | 'md' | 'lg' | 'xl'",
        defaultValue: "'md'",
        description: 'Ancho máximo responsive del diálogo.',
      },
      {
        name: 'modal-body',
        kind: 'slot',
        type: 'contenido proyectado',
        defaultValue: '—',
        description: 'Cuerpo desplazable del modal.',
      },
      {
        name: 'modal-actions',
        kind: 'slot',
        type: 'contenido proyectado',
        defaultValue: '—',
        description: 'Footer para ui-button u otras acciones.',
      },
      {
        name: 'closeRequested',
        kind: 'output',
        type: 'UiModalCloseEvent',
        defaultValue: '—',
        description:
          'Solicita cierre e indica close-button, backdrop o escape. El padre actualiza open.',
      },
    ],
  },
  {
    selector: 'app-ui-badge',
    name: 'Badge',
    category: 'actions',
    summary: 'Estado corto y no interactivo para tablas, encabezados o resúmenes.',
    example: `<app-ui-badge
  label="Activo"
  variant="success"
  appearance="soft"
  size="sm"
  icon="fa-solid fa-check"
  [uppercase]="true"
/>`,
    members: [
      {
        name: 'label',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Texto del estado.',
      },
      {
        name: 'variant',
        kind: 'input',
        type: 'UiStatusVariant',
        defaultValue: "'neutral'",
        description: 'Tono primary, secondary, success, info, warning, danger o neutral.',
      },
      {
        name: 'appearance',
        kind: 'input',
        type: 'UiStatusAppearance',
        defaultValue: "'soft'",
        description: 'Tratamiento visual disponible en el sistema de estados.',
      },
      {
        name: 'size',
        kind: 'input',
        type: 'UiStatusSize',
        defaultValue: "'sm'",
        description: 'Escala del distintivo.',
      },
      {
        name: 'icon',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Icono opcional.',
      },
      {
        name: 'iconPosition',
        kind: 'input',
        type: "'start' | 'end'",
        defaultValue: "'end'",
        description: 'Posición del icono.',
      },
      {
        name: 'uppercase',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Transformación visual a mayúsculas.',
      },
      {
        name: 'ariaLabel',
        kind: 'input',
        type: 'string | null',
        defaultValue: 'null',
        description: 'Nombre accesible alternativo.',
      },
    ],
  },
  {
    selector: 'app-ui-chip',
    name: 'Chip',
    category: 'actions',
    summary: 'Cápsula para etiquetas, filtros o valores removibles.',
    example: `<app-ui-chip
  label="Marca configurada"
  variant="success"
  appearance="outline"
  [dot]="true"
  [removable]="true"
  (removeRequested)="retirarMarca()"
/>`,
    members: [
      {
        name: 'label',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Texto principal.',
      },
      {
        name: 'value',
        kind: 'input',
        type: 'string | number | null',
        defaultValue: 'null',
        description: 'Valor complementario mostrado junto a label.',
      },
      {
        name: 'variant',
        kind: 'input',
        type: 'UiStatusVariant',
        defaultValue: "'neutral'",
        description: 'Tono semántico.',
      },
      {
        name: 'appearance',
        kind: 'input',
        type: 'UiChipAppearance',
        defaultValue: "'outline'",
        description: 'Tratamiento visual de la cápsula.',
      },
      {
        name: 'size',
        kind: 'input',
        type: 'UiStatusSize',
        defaultValue: "'sm'",
        description: 'Escala visual.',
      },
      {
        name: 'icon',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Icono opcional.',
      },
      {
        name: 'dot',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Muestra un punto de estado antes del contenido.',
      },
      {
        name: 'removable',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Muestra la acción de retirar.',
      },
      {
        name: 'disabled',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Bloquea la acción de retirar.',
      },
      {
        name: 'ariaLabel',
        kind: 'input',
        type: 'string | null',
        defaultValue: 'null',
        description: 'Nombre accesible alternativo.',
      },
      {
        name: 'removeRequested',
        kind: 'output',
        type: 'void',
        defaultValue: '—',
        description: 'Solicita al padre retirar el elemento.',
      },
    ],
  },
  {
    selector: 'app-ui-tabs / app-ui-tab',
    name: 'Tabs',
    category: 'structure',
    summary: 'Navegación interna accesible con contenido proyectado, variantes y panel opcional.',
    example: `<app-ui-tabs
  variant="navigation"
  size="md"
  [(activeTabId)]="activeTab"
  [stretch]="true"
  [showPanelAccent]="true"
>
  <app-ui-tab id="datos" label="Datos personales" icon="fa-solid fa-address-card">
    Contenido del primer tab
  </app-ui-tab>
  <app-ui-tab id="roles" label="Roles" icon="fa-solid fa-key" [badge]="3">
    Contenido del segundo tab
  </app-ui-tab>
</app-ui-tabs>`,
    members: [
      {
        name: 'variant',
        kind: 'input',
        type: "'navigation' | 'pills' | 'contained' | 'underline'",
        defaultValue: "'contained'",
        description:
          'Apariencia: navegación modular, píldora institucional, contenido unido o subrayado.',
      },
      {
        name: 'size',
        kind: 'input',
        type: "'xs' | 'sm' | 'md' | 'lg' | 'xl'",
        defaultValue: "'md'",
        description: 'Altura y tipografía de tabs.',
      },
      {
        name: 'ariaLabel',
        kind: 'input',
        type: 'string',
        defaultValue: "'Secciones'",
        description: 'Nombre accesible de la navegación.',
      },
      {
        name: 'tabsId',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Prefijo estable para ids; vacío genera uno.',
      },
      {
        name: 'stretch',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Distribuye tabs a lo ancho disponible.',
      },
      {
        name: 'showPanel',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'true',
        description: 'Presenta u oculta el contenedor del contenido.',
      },
      {
        name: 'showPanelAccent',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'true',
        description: 'Controla la línea lateral institucional del panel.',
      },
      {
        name: 'activeTabId',
        kind: 'model',
        type: 'string',
        defaultValue: "''",
        description: 'Tab activo, compatible con [(activeTabId)].',
      },
      {
        name: 'selectionChange',
        kind: 'output',
        type: 'UiTabSelectionChange',
        defaultValue: '—',
        description: 'Notifica id y metadatos del tab elegido.',
      },
      {
        name: 'ui-tab.id',
        kind: 'input',
        type: 'string',
        defaultValue: 'requerido',
        description: 'Identificador único del tab.',
      },
      {
        name: 'ui-tab.label',
        kind: 'input',
        type: 'string',
        defaultValue: 'requerido',
        description: 'Texto del tab.',
      },
      {
        name: 'ui-tab.icon',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Icono opcional; no es necesario usarlo en todos.',
      },
      {
        name: 'ui-tab.badge',
        kind: 'input',
        type: 'string | number | null',
        defaultValue: 'null',
        description: 'Contador o estado corto opcional situado al final del tab.',
      },
      {
        name: 'ui-tab.disabled',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Impide seleccionar el tab.',
      },
    ],
  },
  {
    selector: 'app-ui-page-header',
    name: 'Cabecera principal',
    category: 'structure',
    summary: 'Encabezado institucional oscuro para el inicio de una página administrativa.',
    example: `<app-ui-page-header
  eyebrow="Administración central"
  title="Configuración del sistema"
  description="Gestione contenido e identidad institucional."
  icon="fa-solid fa-sliders"
  [(minimized)]="minimized"
>
  <div page-header-actions>...</div>
</app-ui-page-header>`,
    members: [
      {
        name: 'eyebrow',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Categoría superior corta.',
      },
      {
        name: 'title',
        kind: 'input',
        type: 'string',
        defaultValue: 'requerido',
        description: 'Título principal de la página.',
      },
      {
        name: 'description',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Propósito de la pantalla.',
      },
      {
        name: 'icon',
        kind: 'input',
        type: 'string',
        defaultValue: "'fa-solid fa-layer-group'",
        description: 'Icono institucional.',
      },
      {
        name: 'showIcon',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'true',
        description: 'Permite retirar el icono sin alterar el layout.',
      },
      {
        name: 'minimizable',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'true',
        description: 'Muestra el control de minimizar.',
      },
      {
        name: 'minimized',
        kind: 'model',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Estado enlazable con [(minimized)].',
      },
      {
        name: 'headingId',
        kind: 'input',
        type: 'string',
        defaultValue: 'autogenerado',
        description: 'Id del h1/h2 para relaciones accesibles.',
      },
      {
        name: 'page-header-actions',
        kind: 'slot',
        type: 'contenido proyectado',
        defaultValue: '—',
        description: 'Acciones, chips o contadores del extremo derecho.',
      },
    ],
  },
  {
    selector: 'app-ui-section-header',
    name: 'Cabecera suave de sección',
    category: 'structure',
    summary: 'Encabezado claro para introducir una sección funcional dentro de la página.',
    example: `<app-ui-section-header
  eyebrow="Gestión jerárquica"
  title="Integrantes y posiciones"
  description="Organice la cadena de mando."
  icon="fa-solid fa-sitemap"
  [compact]="true"
>
  <app-ui-badge header-actions label="3 activos" />
</app-ui-section-header>`,
    members: [
      {
        name: 'eyebrow',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Categoría superior opcional.',
      },
      {
        name: 'title',
        kind: 'input',
        type: 'string',
        defaultValue: 'requerido',
        description: 'Nombre de la sección.',
      },
      {
        name: 'description',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Explicación breve.',
      },
      {
        name: 'icon',
        kind: 'input',
        type: 'string',
        defaultValue: "'fa-solid fa-layer-group'",
        description: 'Icono visual.',
      },
      {
        name: 'headingId',
        kind: 'input',
        type: 'string',
        defaultValue: 'autogenerado',
        description: 'Id accesible del encabezado.',
      },
      {
        name: 'compact',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'true',
        description: 'Reduce altura y espacios para pantallas densas.',
      },
      {
        name: 'appearance',
        kind: 'input',
        type: "'boxed' | 'divider'",
        defaultValue: "'boxed'",
        description: 'Usa icono institucional en caja o separador liviano con línea lateral.',
      },
      {
        name: 'showAccent',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'true',
        description: 'Muestra u oculta la línea lateral en appearance divider.',
      },
      {
        name: 'accentWidth',
        kind: 'input',
        type: 'number',
        defaultValue: '4',
        description: 'Grosor de la línea lateral, limitado entre 0 y 8 px.',
      },
      {
        name: 'header-actions',
        kind: 'slot',
        type: 'contenido proyectado',
        defaultValue: '—',
        description: 'Acciones o resumen en el extremo derecho.',
      },
    ],
  },
  {
    selector: 'app-ui-expansion-panel',
    name: 'Panel de expansión',
    category: 'structure',
    summary: 'Acordeón accesible con animación suave, estado signal y contenido persistente.',
    notes: [
      'El contenido permanece montado al cerrar; Reactive Forms conserva valores, errores y foco pendiente.',
      'Use [(expanded)] con una signal cuando otro flujo necesite abrir o cerrar el panel.',
      'showAccent y accentScope controlan la línea azul; frame controla por separado el marco neutro.',
      'Respeta prefers-reduced-motion y bloquea el contenido cerrado mediante inert.',
    ],
    example: `<app-ui-expansion-panel
  title="Presentación en el menú"
  description="Ajuste nombres extensos sin modificar la identidad."
  icon="fa-solid fa-bars"
  appearance="divider"
  density="compact"
  indicator="plus-minus"
  accentScope="header"
  frame="header"
  [accentWidth]="2"
  [contentRowGap]="20"
  [contentColumnGap]="14"
  [(expanded)]="menuExpansionOpen"
>
  <form [formGroup]="form">...</form>
</app-ui-expansion-panel>`,
    members: [
      {
        name: 'title',
        kind: 'input',
        type: 'string',
        defaultValue: 'requerido',
        description: 'Título visible y accesible del panel.',
      },
      {
        name: 'description',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Resumen opcional de su contenido.',
      },
      {
        name: 'icon',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Icono inicial opcional.',
      },
      {
        name: 'appearance',
        kind: 'input',
        type: "'card' | 'divider'",
        defaultValue: "'divider'",
        description: 'Tarjeta clásica o separador institucional liviano.',
      },
      {
        name: 'density',
        kind: 'input',
        type: "'compact' | 'comfortable'",
        defaultValue: "'compact'",
        description: 'Altura y espaciado de cabecera y contenido.',
      },
      {
        name: 'indicator',
        kind: 'input',
        type: "'plus-minus' | 'chevron' | 'custom'",
        defaultValue: "'plus-minus'",
        description: 'Indicador situado al extremo derecho.',
      },
      {
        name: 'collapsedIcon',
        kind: 'input',
        type: 'string',
        defaultValue: "'fa-solid fa-plus'",
        description: 'Icono cerrado cuando indicator es custom.',
      },
      {
        name: 'expandedIcon',
        kind: 'input',
        type: 'string',
        defaultValue: "'fa-solid fa-minus'",
        description: 'Icono abierto cuando indicator es custom.',
      },
      {
        name: 'disabled',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Impide cambiar el estado del panel.',
      },
      {
        name: 'showAccent',
        kind: 'input',
        type: 'boolean',
        defaultValue: 'true',
        description: 'Muestra u oculta la línea azul de la apariencia divider.',
      },
      {
        name: 'accentWidth',
        kind: 'input',
        type: 'number',
        defaultValue: '4',
        description: 'Grosor lateral limitado entre 0 y 8 px; cero también elimina la línea.',
      },
      {
        name: 'accentScope',
        kind: 'input',
        type: "'header' | 'panel'",
        defaultValue: "'panel'",
        description: 'Limita el acento a la cabecera o lo extiende por la cabecera y el contenido.',
      },
      {
        name: 'frame',
        kind: 'input',
        type: "'panel' | 'header' | 'none'",
        defaultValue: "'panel'",
        description: 'Marco neutro completo, solo alrededor de la cabecera o totalmente ausente.',
      },
      {
        name: 'contentRowGap',
        kind: 'input',
        type: 'number',
        defaultValue: '18',
        description: 'Separación vertical heredable, limitada entre 0 y 48 px.',
      },
      {
        name: 'contentColumnGap',
        kind: 'input',
        type: 'number',
        defaultValue: '14',
        description: 'Separación horizontal heredable, limitada entre 0 y 48 px.',
      },
      {
        name: 'panelId',
        kind: 'input',
        type: 'string',
        defaultValue: 'autogenerado',
        description: 'Prefijo estable para relaciones ARIA.',
      },
      {
        name: 'expanded',
        kind: 'model',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Estado abierto, compatible con [(expanded)].',
      },
      {
        name: 'contenido',
        kind: 'slot',
        type: 'contenido proyectado',
        defaultValue: '—',
        description: 'Formulario, tabla o información mostrada dentro del panel.',
      },
    ],
  },
  {
    selector: 'app-ui-panel-header',
    name: 'Cabecera de panel',
    category: 'structure',
    summary: 'Título compacto para tarjetas internas, con apariencia institucional o suave.',
    example: `<app-ui-panel-header
  title="Publicar un video"
  description="El archivo reemplazará el contenido activo."
  icon="fa-solid fa-video"
  appearance="institutional"
>
  <app-ui-chip panel-header-actions label="Sin video" />
</app-ui-panel-header>`,
    members: [
      {
        name: 'title',
        kind: 'input',
        type: 'string',
        defaultValue: 'requerido',
        description: 'Título del panel.',
      },
      {
        name: 'description',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Contexto breve.',
      },
      {
        name: 'icon',
        kind: 'input',
        type: 'string',
        defaultValue: "''",
        description: 'Icono opcional.',
      },
      {
        name: 'appearance',
        kind: 'input',
        type: "'institutional' | 'soft'",
        defaultValue: "'institutional'",
        description: 'Fondo oscuro o cabecera clara.',
      },
      {
        name: 'headingId',
        kind: 'input',
        type: 'string',
        defaultValue: 'autogenerado',
        description: 'Id accesible del h3.',
      },
      {
        name: 'panel-header-actions',
        kind: 'slot',
        type: 'contenido proyectado',
        defaultValue: '—',
        description: 'Estado o acciones del panel.',
      },
    ],
  },
];
