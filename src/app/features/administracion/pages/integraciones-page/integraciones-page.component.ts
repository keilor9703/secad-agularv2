import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  TemplateRef,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiSectionHeaderComponent } from '../../../../shared/components/ui-section-header/ui-section-header.component';
import { UiExpansionPanelComponent } from '../../../../shared/components/ui-expansion-panel/ui-expansion-panel.component';
import { UiSegmentedTabsComponent } from '../../../../shared/components/ui-segmented-tabs/ui-segmented-tabs.component';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiInputComponent } from '../../../../shared/components/ui-input/ui-input.component';
import { UiSelectComponent } from '../../../../shared/components/ui-select/ui-select.component';
import { UiToggleComponent } from '../../../../shared/components/ui-toggle/ui-toggle.component';
import { UiBadgeComponent } from '../../../../shared/components/ui-badge/ui-badge.component';
import { UiSpinnerComponent } from '../../../../shared/components/ui-spinner/ui-spinner.component';
import { UiTableComponent } from '../../../../shared/components/ui-table/ui-table.component';
import { UiModalComponent } from '../../../../shared/components/ui-modal/ui-modal.component';
import { AlertService } from '../../../../shared/services/alert.service';
import {
  UiTableAction,
  UiTableActionEvent,
  UiTableColumn,
} from '../../../../shared/interfaces/ui-table.interface';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';
import { UiSegmentedTabItem } from '../../../../shared/components/ui-segmented-tabs/ui-segmented-tabs.types';
import {
  IntegracionesService,
  DtoIntegracionEntrante,
  DtoIntegracionEntranteRequest,
  DtoDespachoAuditoria,
  DtoRecepcionAuditoria,
  TIPOS_CANAL_ENTRANTE
} from '../../services/integraciones.service';
import {
  AgenciaExternaService,
  DtoAgenciaExterna,
  DtoAgenciaExternaRequest,
  TIPOS_AGENCIA
} from '../../../../core/services/operacion/agencia-externa.service';
import {
  CamaraIntegracionService,
  DtoCamaraIntegracion,
  DtoCamaraIntegracionRequest,
  DtoVmsDriverDescriptor
} from '../../services/camara-integracion.service';
import { ActivatedRoute } from '@angular/router';
import { ToastService } from '../../../../core/services/toast.service';
import { AuthService }   from '../../../../core/auth/auth.service';
import {
  ConfigSmsService,
  DtoConfigSms,
  ProveedorSms
} from '../../services/config-sms.service';

/** Contexto que ui-table pasa a cada cellTemplate. */
interface Celda<T> {
  $implicit: T;
  row: T;
  column: UiTableColumn<T>;
}

interface ProveedorSmsInfo {
  readonly value: ProveedorSms;
  readonly label: string;
  readonly baseUrlPorDefecto: string;
  readonly usaSender: boolean;
}

const PROVEEDORES_SMS: readonly ProveedorSmsInfo[] = [
  { value: 'INFOBIP', label: 'Infobip', baseUrlPorDefecto: '', usaSender: true },
  {
    value: 'INALAMBRIA_EXPRESS',
    label: 'Inalambria Express',
    baseUrlPorDefecto: 'https://api.inalambria.express/v1',
    usaSender: false,
  },
];

type Tab     = 'salientes' | 'entrantes' | 'sms' | 'camaras' | 'auditoria';
type ModalT  = 'saliente-create' | 'saliente-edit'
             | 'entrante-create' | 'entrante-edit'
             | 'camara-create'   | 'camara-edit'
             | 'payload-viewer'  | null;

@Component({
  selector: 'app-integraciones-page',
  standalone:  true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    UiPageHeaderComponent,
    UiSectionHeaderComponent,
    UiExpansionPanelComponent,
    UiSegmentedTabsComponent,
    UiButtonComponent,
    UiInputComponent,
    UiSelectComponent,
    UiToggleComponent,
    UiBadgeComponent,
    UiSpinnerComponent,
    UiTableComponent,
    UiModalComponent,
  ],
  templateUrl: './integraciones-page.component.html',
  styleUrls: ['./integraciones-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IntegracionesPageComponent implements OnInit {
  private readonly svc    = inject(IntegracionesService);
  private readonly agSvc  = inject(AgenciaExternaService);
  private readonly camSvc = inject(CamaraIntegracionService);
  private readonly smsSvc = inject(ConfigSmsService);
  private readonly route  = inject(ActivatedRoute);
  private readonly toast  = inject(ToastService);
  private readonly auth   = inject(AuthService);
  private readonly fb     = inject(FormBuilder);
  private readonly alert  = inject(AlertService);

  // ── Tab activa ──────────────────────────────────────────────────────────────
  readonly tab = signal<Tab>('salientes');

  // ── Estado de carga ─────────────────────────────────────────────────────────
  readonly loadingSal = signal(false);
  readonly loadingEnt = signal(false);
  readonly loadingAud = signal(false);
  readonly saving     = signal(false);

  // ── Tab Proveedor SMS ───────────────────────────────────────────────────────
  readonly loadingSms        = signal(false);
  readonly savingSms         = signal(false);
  readonly probandoSms       = signal(false);
  readonly configSms         = signal<DtoConfigSms | null>(null);
  readonly telefonoPruebaSms = signal('');
  readonly proveedorActualSms = signal<ProveedorSms>('INFOBIP');

  readonly formSms = this.fb.nonNullable.group({
    proveedor: ['INFOBIP' as ProveedorSms, [Validators.required]],
    baseUrl:   [''],
    apiKey:    [''],
    sender:    [''],
  });

  readonly opcionesProveedorSms: UiSelectOption<ProveedorSms>[] = PROVEEDORES_SMS.map((p) => ({
    label: p.label,
    value: p.value,
  }));

  readonly proveedorSmsSeleccionado = computed(
    () => PROVEEDORES_SMS.find((p) => p.value === this.proveedorActualSms()) ?? PROVEEDORES_SMS[0],
  );

  readonly placeholderUrlSms = computed(
    () => this.proveedorSmsSeleccionado().baseUrlPorDefecto || 'Host asignado por el proveedor',
  );

  readonly pistaApiKeySms = computed(() => {
    const c = this.configSms();
    return c?.tieneApiKey
      ? `Actual: ${c.apiKeyMascara ?? '••••'} — deje el campo vacío para conservarla.`
      : 'Todavía no hay ninguna API Key guardada.';
  });

  readonly ultimaModificacionSms = computed(() => {
    const c = this.configSms();
    if (!c?.fechaModifica) return '';
    const fecha = new Date(c.fechaModifica);
    const cuando = Number.isNaN(fecha.getTime()) ? c.fechaModifica : fecha.toLocaleString('es-CO');
    return c.usuarioModifica ? `${cuando} · por ${c.usuarioModifica}` : cuando;
  });

  // ── Tab Salientes ───────────────────────────────────────────────────────────
  readonly salientes = signal<DtoAgenciaExterna[]>([]);
  readonly tiposAgencia = TIPOS_AGENCIA;
  readonly mostrarEjemploSal = signal(false);

  // ── Ejemplos por modo de auth (strings en TS para evitar conflictos con {} en plantilla) ──
  readonly authModes = [
    { value: 'NONE'      as const, label: 'Sin auth',        icon: 'fa-ban'              },
    { value: 'BEARER'    as const, label: 'Bearer',          icon: 'fa-key'              },
    { value: 'BASIC'     as const, label: 'Basic Auth',      icon: 'fa-user-lock'        },
    { value: 'OAUTH2'    as const, label: 'OAuth2',          icon: 'fa-rotate'           },
    { value: 'API_KEY'   as const, label: 'API Key',         icon: 'fa-hashtag'          },
    { value: 'CREDS_BODY'as const, label: 'Creds en body',   icon: 'fa-file-code'        },
    { value: 'PIP_TOKEN' as const, label: 'PIP Institucional',icon: 'fa-shield-halved'   },
  ];
  readonly formSalAuthExampleTab = signal<'NONE'|'BEARER'|'BASIC'|'OAUTH2'|'API_KEY'|'CREDS_BODY'|'PIP_TOKEN'>('BEARER');

  readonly ejemploSalCabeceras = '{\n  "X-Sistema-Origen": "SECAD-POLICIA",\n  "X-Version": "2"\n}';
  readonly ejemploSalMapeo     = '{\n  "direCaso":      "direccion_emergencia",\n  "codiPedido":    "tipo_incidente",\n  "latitudCaso":   "gps.latitud",\n  "longitudCaso":  "gps.longitud",\n  "prioridad":     "nivel_urgencia",\n  "nomb_llamante": "reportado_por"\n}';

  readonly ejNone =
    'POST https://api.agencia.gov.co/casos/recibir\n' +
    'Content-Type: application/json\n\n' +
    '{ "direCaso": "Cra 7 # 32-16", "prioridad": "INMEDIATA", ... }';

  readonly ejBearer =
    'POST https://api.bomberos.bogota.gov.co/api/v2/casos/recibir\n' +
    'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…\n' +
    'Content-Type: application/json\n\n' +
    '{ "direccion_emergencia": "Cra 7 # 32-16", "nivel_urgencia": "INMEDIATA", ... }';

  readonly ejBasic =
    '# SECAD codifica: base64("bomberos_user:s3cr3t") = "Ym9tYmVyb3NfdXNlcjpzM2NyM3Q="\n\n' +
    'POST https://api.transito.gov.co/incidentes\n' +
    'Authorization: Basic Ym9tYmVyb3NfdXNlcjpzM2NyM3Q=\n' +
    'Content-Type: application/json\n\n' +
    '{ "direCaso": "Cra 7 # 32-16", "codiPedido": "310", ... }';

  readonly ejOAuth2 =
    '# PASO 1 — SECAD pide token automáticamente:\n' +
    'POST https://auth.agencia.gov.co/oauth2/token\n' +
    'Content-Type: application/x-www-form-urlencoded\n\n' +
    'grant_type=client_credentials&client_id=secad_client&client_secret=abc123\n\n' +
    '# Respuesta del servidor de auth:\n' +
    '{ "access_token": "eyJhbGci…", "token_type": "bearer", "expires_in": 3600 }\n\n' +
    '# PASO 2 — SECAD envía el caso con el token obtenido:\n' +
    'POST https://api.agencia.gov.co/casos/recibir\n' +
    'Authorization: Bearer eyJhbGci…\n' +
    'Content-Type: application/json\n\n' +
    '{ "direCaso": "Cra 7 # 32-16", "prioridad": "INMEDIATA", ... }';

  readonly ejApiKey =
    '# La agencia entrega una API Key; se envía en el header configurado:\n\n' +
    'POST https://api.cruzroja.org.co/emergencias/nueva\n' +
    'X-Api-Key: sk-cr-8f4a2c1e9b3d7f0e5a6c\n' +
    'Content-Type: application/json\n\n' +
    '{ "direCaso": "Cra 7 # 32-16", "prioridad": "INMEDIATA", ... }';

  readonly ejPip =
    '# SECAD usa automáticamente el token técnico institucional ya cacheado.\n' +
    '# No se configuran credenciales — el token se renueva solo cada 25 min.\n' +
    '# La URL debe ser el endpoint de PIP para esa integración.\n\n' +
    'POST https://internalpip.policia.gov.co:8080/api/{servicio}/{operacion}\n' +
    'Authorization: Bearer <token_tecnico_SECAD_en_PIP>  ← obtenido automáticamente\n' +
    'Content-Type: application/json\n\n' +
    '{ "direCaso": "Cra 7 # 32-16", "prioridad": "INMEDIATA", ... }\n\n' +
    '# PIP luego reenvía a la agencia externa con las credenciales\n' +
    '# que el equipo de PIP configuró en su plataforma.\n\n' +
    '# Para configurar esta agencia necesitas:\n' +
    '#  1. Solicitar al equipo de PIP el endpoint para la integración\n' +
    '#  2. Pegar esa URL en el campo "URL del endpoint"\n' +
    '#  3. Seleccionar modo "PIP — Canal institucional"\n' +
    '#  4. PIP maneja la auth con la agencia — no configuras nada más';

  readonly ejCredsBody =
    '# Las credenciales van dentro del body del caso (sin cabecera Authorization):\n' +
    '# Configura los nombres de campo que espera la agencia.\n\n' +
    'POST https://api.defensa.civil.co/recibir-emergencia\n' +
    'Content-Type: application/json\n\n' +
    '{\n' +
    '  "usuario":    "secad_despacho",\n' +
    '  "contrasena": "s3cr3t_key",\n' +
    '  "direCaso":   "Cra 7 # 32-16",\n' +
    '  "prioridad":  "INMEDIATA",\n' +
    '  ...\n' +
    '}';

  readonly formSal = this.fb.nonNullable.group({
    nombre:         ['', [Validators.required]],
    descripcion:    [''],
    tipoAgencia:    ['OTRA'],
    apiUrl:         [''],
    apiMetodo:      ['POST'],
    tipoAuth:       ['BEARER'],
    apiToken:       [''],
    apiUsuario:     [''],
    apiPassword:    [''],
    formatoPayload: ['PLANO'],
    activa:         [true]
  });
  readonly formSalCabeceras = signal('');
  readonly formSalMapeo     = signal('');
  readonly editSalId        = signal('');

  // ── Campos de auth descompuestos (se serializan a authExtra al guardar) ────
  readonly formSalTokenUrl      = signal('');   // OAUTH2
  readonly formSalKeyHeader     = signal('X-Api-Key');  // API_KEY
  readonly formSalBodyUserField = signal('usuario');    // CREDS_BODY
  readonly formSalBodyPassField = signal('contrasena'); // CREDS_BODY

  // ── Tab Entrantes ───────────────────────────────────────────────────────────
  readonly entrantes = signal<DtoIntegracionEntrante[]>([]);
  readonly tiposCanal = TIPOS_CANAL_ENTRANTE;

  readonly formEnt = this.fb.nonNullable.group({
    nombre:            ['', [Validators.required]],
    descripcion:       [''],
    tipoCanal:         ['OTRA'],
    endpointRelativo:  ['', [Validators.required]],
    sitioGrabaDefecto: [0],
    activa:            [true],
    notas:             ['']
  });
  readonly formEntHeaders = signal('');
  readonly formEntPayload = signal('');
  readonly editEntId      = signal('');

  // ── Tab Cámaras (integraciones VMS) ─────────────────────────────────────────
  readonly camaras   = signal<DtoCamaraIntegracion[]>([]);
  readonly loadingCam = signal(false);
  readonly drivers    = signal<DtoVmsDriverDescriptor[]>([]);
  /** Driver seleccionado en el formulario (para pintar sus campos). */
  readonly camDriver  = signal<DtoVmsDriverDescriptor | null>(null);
  /** Valores del formulario dinámico (config + secretos), por key de campo — el
   *  set de claves depende del driver elegido, así que no encaja en un FormGroup
   *  de forma fija; se mantiene como registro simple mutado por fila (mismo
   *  criterio que loginItems en configuracion-sistema). */
  camForm: Record<string, string> = {};
  readonly camNombre      = signal('');
  readonly camDescripcion = signal('');
  readonly camActiva      = signal(true);
  readonly editCamId      = signal('');
  readonly camPrueba      = signal('');        // resultado de "validar configuración"

  // ── Tab Auditoría ───────────────────────────────────────────────────────────
  readonly audTab       = signal<'salientes' | 'entrantes'>('salientes');
  readonly audSalientes = signal<DtoDespachoAuditoria[]>([]);
  readonly audEntrantes = signal<DtoRecepcionAuditoria[]>([]);
  readonly audSalLimit  = signal(50);
  readonly audEntLimit  = signal(50);
  audCanalFiltro = '';

  // ── Modal ───────────────────────────────────────────────────────────────────
  readonly modal = signal<ModalT>(null);
  readonly payloadViewer      = signal('');
  readonly payloadViewerTitle = signal('Payload JSON');  // se cambia al abrir cada modal

  // ══ Piezas del kit ═══════════════════════════════════════════════════════
  // Las pestañas, los selectores y las tablas se declaran aquí para que la
  // plantilla no repita listas de <option> ni cabeceras de <table> a mano.

  readonly pestanas = computed<UiSegmentedTabItem[]>(() => [
    {
      id: 'salientes',
      label: 'Salientes',
      icon: 'fa-solid fa-arrow-up-right-from-square',
      badge: this.salientes().length,
    },
    { id: 'entrantes', label: 'Entrantes', icon: 'fa-solid fa-inbox', badge: this.entrantes().length },
    { id: 'sms', label: 'Proveedor SMS', icon: 'fa-solid fa-comment-sms' },
    { id: 'camaras', label: 'Cámaras (VMS)', icon: 'fa-solid fa-video', badge: this.camaras().length },
    { id: 'auditoria', label: 'Auditoría', icon: 'fa-solid fa-clock-rotate-left' },
  ]);

  readonly pestanasAuditoria = computed<UiSegmentedTabItem[]>(() => [
    {
      id: 'salientes',
      label: 'Despachos salientes',
      icon: 'fa-solid fa-arrow-up-right-from-square',
      badge: this.audSalientes().length,
    },
    {
      id: 'entrantes',
      label: 'Recepciones entrantes',
      icon: 'fa-solid fa-inbox',
      badge: this.audEntrantes().length,
    },
  ]);

  readonly pestanasAuth = this.authModes.map<UiSegmentedTabItem>((m) => ({
    id: m.value,
    label: m.label,
    icon: `fa-solid ${m.icon}`,
  }));

  readonly opcionesTipoAgencia: UiSelectOption<string>[] = TIPOS_AGENCIA.map((t) => ({
    label: t.label,
    value: t.value,
  }));

  readonly opcionesTipoCanal: UiSelectOption<string>[] = TIPOS_CANAL_ENTRANTE.map((t) => ({
    label: t.label,
    value: t.value,
  }));

  readonly opcionesMetodo: UiSelectOption<string>[] = [
    { label: 'POST', value: 'POST' },
    { label: 'PUT', value: 'PUT' },
  ];

  readonly opcionesAuth: UiSelectOption<string>[] = [
    { label: 'Sin autenticación', value: 'NONE' },
    { label: 'Bearer token estático', value: 'BEARER' },
    { label: 'Basic Auth (usuario + contraseña)', value: 'BASIC' },
    { label: 'OAuth2 — client credentials', value: 'OAUTH2' },
    { label: 'API Key en cabecera', value: 'API_KEY' },
    { label: 'Credenciales en el body', value: 'CREDS_BODY' },
    { label: 'PIP — canal institucional', value: 'PIP_TOKEN' },
  ];

  readonly opcionesFormato: UiSelectOption<string>[] = [
    { label: 'Plano — solo los campos del caso, con el mapeo aplicado', value: 'PLANO' },
    { label: 'Estructurado — body jerárquico completo', value: 'ESTRUCTURADO' },
  ];

  readonly opcionesCanalAuditoria: UiSelectOption<string>[] = [
    { label: 'Todos los canales', value: '' },
    { label: 'CHAT', value: 'CHAT' },
    { label: 'SMS', value: 'SMS' },
  ];

  readonly opcionesDriver = computed<UiSelectOption<string>[]>(() =>
    this.drivers().map((d) => ({ label: d.nombre, value: d.driver })),
  );

  /**
   * El tipo de auth decide qué campos del formulario se pintan. Vive también en
   * una señal porque un valueChanges del formulario no repinta con OnPush.
   */
  readonly authSeleccionado = signal('BEARER');

  // ── Tablas ───────────────────────────────────────────────────────────────
  @ViewChild('celdaAgencia', { static: true }) celdaAgencia!: TemplateRef<Celda<DtoAgenciaExterna>>;
  @ViewChild('celdaAuth', { static: true }) celdaAuth!: TemplateRef<Celda<DtoAgenciaExterna>>;
  @ViewChild('celdaCamara', { static: true }) celdaCamara!: TemplateRef<Celda<DtoCamaraIntegracion>>;
  @ViewChild('celdaRespuesta', { static: true })
  celdaRespuesta!: TemplateRef<Celda<DtoDespachoAuditoria>>;
  @ViewChild('celdaErrorEnt', { static: true })
  celdaErrorEnt!: TemplateRef<Celda<DtoRecepcionAuditoria>>;

  columnasSalientes: UiTableColumn<DtoAgenciaExterna>[] = [];
  columnasCamaras: UiTableColumn<DtoCamaraIntegracion>[] = [];
  columnasAudSal: UiTableColumn<DtoDespachoAuditoria>[] = [];
  columnasAudEnt: UiTableColumn<DtoRecepcionAuditoria>[] = [];

  readonly accionesSalientes: UiTableAction<DtoAgenciaExterna>[] = [
    { id: 'payload', label: 'Ver payload', icon: 'fa-solid fa-file-code' },
    { id: 'editar', label: 'Editar', icon: 'fa-solid fa-pen' },
    { id: 'toggle', label: 'Activar / desactivar', icon: 'fa-solid fa-power-off' },
  ];

  readonly accionesCamaras: UiTableAction<DtoCamaraIntegracion>[] = [
    { id: 'editar', label: 'Editar', icon: 'fa-solid fa-pen' },
    { id: 'toggle', label: 'Activar / desactivar', icon: 'fa-solid fa-power-off' },
    { id: 'eliminar', label: 'Eliminar', icon: 'fa-solid fa-trash' },
  ];

  readonly accionesAudSal: UiTableAction<DtoDespachoAuditoria>[] = [
    { id: 'payload', label: 'Ver payload enviado', icon: 'fa-solid fa-paper-plane' },
    { id: 'respuesta', label: 'Ver respuesta de la API', icon: 'fa-solid fa-reply-all' },
  ];

  readonly accionesAudEnt: UiTableAction<DtoRecepcionAuditoria>[] = [
    { id: 'payload', label: 'Ver payload recibido', icon: 'fa-solid fa-eye' },
  ];

  private construirColumnas(): void {
    this.columnasSalientes = [
      { key: 'nombre', label: 'Agencia', cellTemplate: this.celdaAgencia },
      { key: 'tipoAgencia', label: 'Tipo', value: (a) => this.getTipoAgenciaLabel(a.tipoAgencia) },
      { key: 'apiUrl', label: 'Endpoint', value: (a) => a.apiUrl ?? '—' },
      { key: 'apiMetodo', label: 'Método', align: 'center' },
      { key: 'tipoAuth', label: 'Autenticación', cellTemplate: this.celdaAuth },
      {
        key: 'activa',
        label: 'Estado',
        align: 'center',
        badge: (a) =>
          a.activa ? { text: 'Activa', variant: 'success' } : { text: 'Inactiva', variant: 'danger' },
      },
    ];

    this.columnasCamaras = [
      { key: 'nombre', label: 'Nombre', cellTemplate: this.celdaCamara },
      { key: 'driverNombre', label: 'Driver / VMS' },
      { key: 'baseUrl', label: 'URL', value: (c) => c.baseUrl || '—' },
      { key: 'totalCamaras', label: 'Cámaras', align: 'center' },
      {
        key: 'activa',
        label: 'Estado',
        align: 'center',
        badge: (c) =>
          c.activa ? { text: 'Activa', variant: 'success' } : { text: 'Inactiva', variant: 'danger' },
      },
    ];

    this.columnasAudSal = [
      { key: 'fechaEnvio', label: 'Fecha' },
      { key: 'agenciaNombre', label: 'Agencia' },
      { key: 'pedidoId', label: 'Pedido', align: 'center' },
      {
        key: 'httpStatus',
        label: 'HTTP',
        align: 'center',
        badge: (d) =>
          d.httpStatus
            ? { text: String(d.httpStatus), variant: d.exitoso ? 'success' : 'danger' }
            : null,
      },
      {
        key: 'exitoso',
        label: 'Resultado',
        align: 'center',
        badge: (d) =>
          d.exitoso
            ? { text: 'Exitoso', variant: 'success' }
            : { text: 'Fallido', variant: 'danger' },
      },
      { key: 'respuestaApi', label: 'Respuesta API', cellTemplate: this.celdaRespuesta },
      { key: 'enviadoPor', label: 'Despachado por', value: (d) => d.enviadoPor || '—' },
    ];

    this.columnasAudEnt = [
      { key: 'fechaRecepcion', label: 'Fecha' },
      { key: 'canal', label: 'Canal', align: 'center', badge: (r) => ({ text: r.canal, variant: 'info' }) },
      { key: 'pedidoId', label: 'Pedido creado', align: 'center', value: (r) => r.pedidoId || '—' },
      {
        key: 'procesado',
        label: 'Estado',
        align: 'center',
        badge: (r) =>
          r.procesado
            ? { text: 'Procesado', variant: 'success' }
            : r.error
              ? { text: 'Error', variant: 'danger' }
              : { text: 'Pendiente', variant: 'warning' },
      },
      { key: 'ipOrigen', label: 'IP', value: (r) => r.ipOrigen || '—' },
      { key: 'error', label: 'Error', cellTemplate: this.celdaErrorEnt },
    ];
  }

  onAccionSaliente(ev: UiTableActionEvent<DtoAgenciaExterna>): void {
    if (ev.actionId === 'payload') this.verPayloadSaliente(ev.row);
    else if (ev.actionId === 'editar') this.openEditSal(ev.row);
    else if (ev.actionId === 'toggle') this.toggleSal(ev.row);
  }

  onAccionCamara(ev: UiTableActionEvent<DtoCamaraIntegracion>): void {
    if (ev.actionId === 'editar') this.openEditCam(ev.row);
    else if (ev.actionId === 'toggle') this.toggleCam(ev.row);
    else if (ev.actionId === 'eliminar') this.deleteCam(ev.row);
  }

  onAccionAudSal(ev: UiTableActionEvent<DtoDespachoAuditoria>): void {
    if (ev.actionId === 'payload') this.verPayload(ev.row.payloadEnviado);
    else if (ev.actionId === 'respuesta') this.verRespuestaApi(ev.row);
  }

  onAccionAudEnt(ev: UiTableActionEvent<DtoRecepcionAuditoria>): void {
    if (ev.actionId === 'payload') this.verPayload(ev.row.payloadCrudo);
  }

  /** Valor tipado de los textarea JSON y del formulario dinámico de cámaras. */
  valorDe(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  /** cod_dane del usuario logueado — se embebe en la callbackUrl del preview. */
  private readonly codDane: string;

  constructor() {
    this.codDane = this.auth.getJwtClaims().codDane ?? '';
    this.formSms.controls.proveedor.valueChanges.subscribe((v) => this.proveedorActualSms.set(v));
  }

  ngOnInit(): void {
    this.construirColumnas();
    this.formSal.controls.tipoAuth.valueChanges.subscribe((v) => this.authSeleccionado.set(v));
    this.loadSalientes();
    this.loadEntrantes();

    // Permite abrir directamente una pestaña vía URL (ej: /administracion/integraciones?tab=sms)
    const tabParam = this.route.snapshot.queryParamMap.get('tab') as Tab | null;
    if (tabParam && ['salientes', 'entrantes', 'sms', 'camaras', 'auditoria'].includes(tabParam)) {
      this.setTab(tabParam);
    }
  }

  // ── Navegación de tabs ──────────────────────────────────────────────────────

  setTab(t: Tab): void {
    this.tab.set(t);
    if (t === 'sms' && !this.configSms()) {
      this.loadSms();
    }
    if (t === 'auditoria' && !this.audSalientes().length && !this.audEntrantes().length)
      this.loadAuditoria();
    if (t === 'camaras') {
      if (!this.drivers().length) this.loadDrivers();
      this.loadCamaras();
    }
  }

  setAudTab(t: 'salientes' | 'entrantes'): void {
    this.audTab.set(t);
    if (t === 'salientes' && !this.audSalientes().length) this.loadAudSalientes();
    if (t === 'entrantes' && !this.audEntrantes().length) this.loadAudEntrantes();
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  TAB SALIENTES
  // ════════════════════════════════════════════════════════════════════════════

  loadSalientes(): void {
    this.loadingSal.set(true);
    this.svc.getSalientes().subscribe({
      next:  d => { this.salientes.set(d); this.loadingSal.set(false); },
      error: () => { this.loadingSal.set(false); this.toast.error('Error', 'No se pudieron cargar las agencias.'); }
    });
  }

  openCreateSal(): void {
    this.formSal.reset(this.emptySal());
    this.formSalCabeceras.set('');
    this.formSalMapeo.set('');
    this.formSalTokenUrl.set('');
    this.formSalKeyHeader.set('X-Api-Key');
    this.formSalBodyUserField.set('usuario');
    this.formSalBodyPassField.set('contrasena');
    this.editSalId.set('');
    this.modal.set('saliente-create');
    document.body.classList.add('ui-modal-open');
  }

  openEditSal(a: DtoAgenciaExterna): void {
    this.editSalId.set(a.id);
    // Deserializar authExtra para los campos individuales
    const extra = this.parseAuthExtra(a.authExtra);
    this.formSalTokenUrl.set(extra['tokenUrl']      ?? '');
    this.formSalKeyHeader.set(extra['keyHeader']     ?? 'X-Api-Key');
    this.formSalBodyUserField.set(extra['bodyUserField'] ?? 'usuario');
    this.formSalBodyPassField.set(extra['bodyPassField'] ?? 'contrasena');
    this.formSal.reset({
      nombre:         a.nombre,
      descripcion:    a.descripcion ?? '',
      tipoAgencia:    a.tipoAgencia,
      apiUrl:         a.apiUrl ?? '',
      apiMetodo:      a.apiMetodo,
      tipoAuth:       a.tipoAuth ?? 'BEARER',
      apiToken:       '',         // vacío = mantener existente
      apiUsuario:     a.apiUsuario ?? '',
      apiPassword:    '',         // vacío = mantener existente
      formatoPayload: a.formatoPayload ?? 'PLANO',
      activa:         a.activa,
    });
    this.formSalCabeceras.set(a.apiCabeceras ?? '');
    this.formSalMapeo.set(a.campoMapeo ?? '');
    this.modal.set('saliente-edit');
    document.body.classList.add('ui-modal-open');
  }

  saveSal(): void {
    const v = this.formSal.getRawValue();
    if (!v.nombre.trim())
      return void this.toast.warning('Validar', 'El nombre es obligatorio.');

    const cabeceras = this.formSalCabeceras();
    const mapeo     = this.formSalMapeo();
    if (cabeceras.trim() && !this.isValidJson(cabeceras))
      return void this.toast.warning('JSON inválido', 'Las cabeceras HTTP no son un JSON válido.');
    if (mapeo.trim() && !this.isValidJson(mapeo))
      return void this.toast.warning('JSON inválido', 'El mapeo de campos no es un JSON válido.');

    const request: DtoAgenciaExternaRequest = {
      ...v,
      apiCabeceras: cabeceras.trim() || undefined,
      campoMapeo:   mapeo.trim()     || undefined,
      // Serializar campos específicos de auth extra
      authExtra:    this.buildAuthExtra(v.tipoAuth),
    };

    this.saving.set(true);
    const editId = this.editSalId();
    const obs = editId
      ? this.svc.actualizarSaliente(editId, request)
      : this.svc.crearSaliente(request);

    obs.subscribe({
      next: r => {
        this.saving.set(false);
        if (r.success) {
          this.toast.success('Agencia', r.message);
          this.closeModal();
          this.loadSalientes();
        } else {
          this.toast.warning('Agencia', r.message);
        }
      },
      error: () => { this.saving.set(false); this.toast.error('Error', 'No se pudo guardar.'); }
    });
  }

  toggleSal(a: DtoAgenciaExterna): void {
    this.svc.toggleSaliente(a.id).subscribe({
      next: r => {
        if (r.success) { this.toast.success('Agencia', r.message); this.loadSalientes(); }
        else this.toast.warning('Agencia', r.message);
      },
      error: () => this.toast.error('Error', 'No se pudo cambiar el estado.')
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  TAB ENTRANTES
  // ════════════════════════════════════════════════════════════════════════════

  loadEntrantes(): void {
    this.loadingEnt.set(true);
    this.svc.getEntrantes().subscribe({
      next:  r => { this.entrantes.set(r.data ?? []); this.loadingEnt.set(false); },
      error: () => { this.loadingEnt.set(false); this.toast.error('Error', 'No se pudieron cargar las integraciones entrantes.'); }
    });
  }

  openCreateEnt(): void {
    this.formEnt.reset(this.emptyEnt());
    this.formEntHeaders.set('');
    this.formEntPayload.set('');
    this.editEntId.set('');
    this.modal.set('entrante-create');
    document.body.classList.add('ui-modal-open');
  }

  openEditEnt(e: DtoIntegracionEntrante): void {
    this.editEntId.set(e.id);
    this.formEnt.reset({
      nombre:            e.nombre,
      descripcion:       e.descripcion ?? '',
      tipoCanal:         e.tipoCanal,
      endpointRelativo:  e.endpointRelativo,
      sitioGrabaDefecto: e.sitioGrabaDefecto,
      activa:            e.activa,
      notas:             e.notas ?? '',
    });
    this.formEntHeaders.set(e.headersRequeridos ?? '');
    this.formEntPayload.set(e.ejemploPayload ?? '');
    this.modal.set('entrante-edit');
    document.body.classList.add('ui-modal-open');
  }

  saveEnt(): void {
    const v = this.formEnt.getRawValue();
    if (!v.nombre.trim())
      return void this.toast.warning('Validar', 'El nombre es obligatorio.');
    if (!v.endpointRelativo.trim())
      return void this.toast.warning('Validar', 'El endpoint es obligatorio.');

    const headers = this.formEntHeaders();
    const payload = this.formEntPayload();
    if (headers.trim() && !this.isValidJson(headers))
      return void this.toast.warning('JSON inválido', 'Los headers requeridos no son un JSON válido.');
    if (payload.trim() && !this.isValidJson(payload))
      return void this.toast.warning('JSON inválido', 'El payload de ejemplo no es un JSON válido.');

    const request: DtoIntegracionEntranteRequest = {
      ...v,
      headersRequeridos: headers.trim() || undefined,
      ejemploPayload:    payload.trim() || undefined,
    };

    this.saving.set(true);
    const editId = this.editEntId();
    const obs = editId
      ? this.svc.actualizarEntrante(editId, request)
      : this.svc.crearEntrante(request);

    obs.subscribe({
      next: r => {
        this.saving.set(false);
        if (r.success) {
          this.toast.success('Integración', r.message);
          this.closeModal();
          this.loadEntrantes();
        } else {
          this.toast.warning('Integración', r.message);
        }
      },
      error: () => { this.saving.set(false); this.toast.error('Error', 'No se pudo guardar.'); }
    });
  }

  toggleEnt(e: DtoIntegracionEntrante): void {
    this.svc.toggleEntrante(e.id).subscribe({
      next: r => {
        if (r.success) { this.toast.success('Integración', r.message); this.loadEntrantes(); }
        else this.toast.warning('Integración', r.message);
      },
      error: () => this.toast.error('Error', 'No se pudo cambiar el estado.')
    });
  }

  verEjemplo(e: DtoIntegracionEntrante): void {
    this.payloadViewer.set(e.ejemploPayload
      ? this.prettyJson(e.ejemploPayload)
      : '{}');
    this.modal.set('payload-viewer');
    document.body.classList.add('ui-modal-open');
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  TAB PROVEEDOR SMS
  // ════════════════════════════════════════════════════════════════════════════

  loadSms(): void {
    this.loadingSms.set(true);
    this.smsSvc.get().subscribe({
      next: (r) => {
        this.loadingSms.set(false);
        const data = r?.data;
        if (!data) {
          this.toast.error('Proveedor SMS', 'La respuesta del servidor no trae la configuración.');
          return;
        }
        this.configSms.set(data);
        this.formSms.reset({
          proveedor: data.proveedor,
          baseUrl:   data.baseUrl ?? '',
          apiKey:    '',
          sender:    data.sender ?? '',
        });
        this.proveedorActualSms.set(data.proveedor);
      },
      error: () => {
        this.loadingSms.set(false);
        this.toast.error('Proveedor SMS', 'No se pudo cargar la configuración.');
      },
    });
  }

  guardarSms(): void {
    if (this.formSms.invalid) {
      this.formSms.markAllAsTouched();
      return;
    }

    const v = this.formSms.getRawValue();
    this.savingSms.set(true);
    this.smsSvc
      .actualizar({
        proveedor: v.proveedor,
        baseUrl:   v.baseUrl.trim() || null,
        apiKey:    v.apiKey.trim() || null,
        sender:    v.sender.trim() || null,
      })
      .subscribe({
        next: (resp) => {
          this.savingSms.set(false);
          if (!resp.success) {
            this.toast.warning('Proveedor SMS', resp.message);
            return;
          }
          this.toast.success('Proveedor SMS', resp.message);
          this.loadSms();
        },
        error: (err) => {
          this.savingSms.set(false);
          this.toast.error('Proveedor SMS', err?.error?.message ?? 'Error al guardar.');
        },
      });
  }

  probarEnvioSms(): void {
    const numero = this.telefonoPruebaSms().trim();
    if (!numero) {
      this.toast.warning('Proveedor SMS', 'Escriba un número de teléfono para la prueba.');
      return;
    }

    this.probandoSms.set(true);
    this.smsSvc.probar(numero).subscribe({
      next: (resp) => {
        this.probandoSms.set(false);
        if (resp.success) {
          this.toast.success('Proveedor SMS', resp.message);
        } else {
          this.toast.warning('Proveedor SMS', resp.message);
        }
      },
      error: (err) => {
        this.probandoSms.set(false);
        this.toast.error('Proveedor SMS', err?.error?.message ?? 'Error al enviar el SMS de prueba.');
      },
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  TAB CÁMARAS (integraciones VMS)
  // ════════════════════════════════════════════════════════════════════════════

  loadDrivers(): void {
    this.camSvc.getDrivers().subscribe({
      next:  d => { this.drivers.set(d); },
      error: () => { this.toast.error('Error', 'No se pudieron cargar los drivers de VMS.'); }
    });
  }

  loadCamaras(): void {
    this.loadingCam.set(true);
    this.camSvc.getAll().subscribe({
      next:  d => { this.camaras.set(d); this.loadingCam.set(false); },
      error: () => { this.loadingCam.set(false); this.toast.error('Error', 'No se pudieron cargar las integraciones de cámaras.'); }
    });
  }

  /** Campo actual del driver seleccionado (para el template). */
  get camCampos() { return this.camDriver()?.campos ?? []; }

  onCamDriverChange(driverId: string): void {
    this.camDriver.set(this.drivers().find(d => d.driver === driverId) ?? null);
    // Reiniciar valores del formulario a los campos del nuevo driver.
    this.camForm = {};
    for (const c of this.camDriver()?.campos ?? []) this.camForm[c.key] = '';
  }

  openCreateCam(): void {
    this.editCamId.set('');
    this.camNombre.set('');
    this.camDescripcion.set('');
    this.camActiva.set(true);
    this.camPrueba.set('');
    this.camDriver.set(null);
    this.camForm = {};
    if (!this.drivers().length) this.loadDrivers();
    this.modal.set('camara-create');
    document.body.classList.add('ui-modal-open');
  }

  openEditCam(c: DtoCamaraIntegracion): void {
    this.editCamId.set(c.id);
    this.camNombre.set(c.nombre);
    this.camDescripcion.set(c.descripcion ?? '');
    this.camActiva.set(c.activa);
    this.camPrueba.set('');
    const driver = this.drivers().find(d => d.driver === c.driver) ?? null;
    this.camDriver.set(driver);
    // Cargar valores no secretos; los secretos quedan vacíos (write-only).
    this.camForm = {};
    for (const campo of driver?.campos ?? [])
      this.camForm[campo.key] = campo.secreto ? '' : (c.config[campo.key] ?? '');
    this.modal.set('camara-edit');
    document.body.classList.add('ui-modal-open');
  }

  /** Arma el request separando config (no secreto) de secretos. */
  private buildCamRequest(): DtoCamaraIntegracionRequest {
    const config: Record<string, string> = {};
    const secretos: Record<string, string> = {};
    const driver = this.camDriver();
    for (const campo of driver?.campos ?? []) {
      const v = (this.camForm[campo.key] ?? '').trim();
      if (campo.secreto) { if (v) secretos[campo.key] = v; }
      else               { config[campo.key] = v; }
    }
    return {
      nombre:      this.camNombre().trim(),
      descripcion: this.camDescripcion().trim() || undefined,
      driver:      driver?.driver ?? '',
      config,
      secretos,
      activa:      this.camActiva()
    };
  }

  probarCam(): void {
    if (!this.camDriver()) { this.toast.warning('Cámaras', 'Seleccione un driver.'); return; }
    this.camSvc.validar(this.buildCamRequest()).subscribe({
      next:  r => { this.camPrueba.set(r.mensaje); if (r.ok) this.toast.success('Validación', r.mensaje); else this.toast.warning('Validación', r.mensaje); },
      error: e => { this.camPrueba.set(e.error?.mensaje ?? 'Error al validar.'); }
    });
  }

  saveCam(): void {
    if (!this.camNombre().trim()) { this.toast.warning('Cámaras', 'El nombre es obligatorio.'); return; }
    if (!this.camDriver())        { this.toast.warning('Cámaras', 'Seleccione un driver.'); return; }
    this.saving.set(true);
    const req = this.buildCamRequest();
    const editId = this.editCamId();
    const obs = editId
      ? this.camSvc.actualizar(editId, req)
      : this.camSvc.crear(req);
    obs.subscribe({
      next: r => {
        this.saving.set(false);
        if (r.success) { this.toast.success('Cámaras', r.message); this.closeModal(); this.loadCamaras(); }
        else           { this.toast.warning('Cámaras', r.message); }
      },
      error: e => { this.saving.set(false); this.toast.error('Cámaras', e.error?.message ?? 'Error al guardar.'); }
    });
  }

  toggleCam(c: DtoCamaraIntegracion): void {
    this.camSvc.toggle(c.id).subscribe({
      next:  () => { this.camaras.update(items => items.map(x => x.id === c.id ? { ...x, activa: !x.activa } : x)); },
      error: () => { this.toast.error('Cámaras', 'No se pudo cambiar el estado.'); }
    });
  }

  /**
   * El confirm() del navegador bloquea el hilo y no respeta ni el tema ni la
   * escala de fuente; el resto de administración ya usa el diálogo del kit.
   */
  async deleteCam(c: DtoCamaraIntegracion): Promise<void> {
    const confirmado = await this.alert.confirm({
      title: 'Eliminar la integración de cámaras',
      message: `¿Desea eliminar “${c.nombre}”? También se quita su catálogo de cámaras.`,
      confirmText: 'Sí, eliminar',
      cancelText: 'No, cancelar',
      icon: 'warning',
      intent: 'danger',
      focusCancel: true,
    });
    if (!confirmado) return;

    this.camSvc.eliminar(c.id).subscribe({
      next:  r => { if (r.success) { this.toast.success('Cámaras', r.message); this.loadCamaras(); } },
      error: () => { this.toast.error('Cámaras', 'No se pudo eliminar.'); }
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  TAB AUDITORÍA
  // ════════════════════════════════════════════════════════════════════════════

  loadAuditoria(): void {
    this.loadAudSalientes();
    this.loadAudEntrantes();
  }

  loadAudSalientes(): void {
    this.loadingAud.set(true);
    this.svc.getAuditoriaSalientes(this.audSalLimit()).subscribe({
      next:  r => { this.audSalientes.set(r.data ?? []); this.loadingAud.set(false); },
      error: () => { this.loadingAud.set(false); }
    });
  }

  loadAudEntrantes(): void {
    this.loadingAud.set(true);
    this.svc.getAuditoriaEntrantes(this.audEntLimit(), this.audCanalFiltro || undefined).subscribe({
      next:  r => { this.audEntrantes.set(r.data ?? []); this.loadingAud.set(false); },
      error: () => { this.loadingAud.set(false); }
    });
  }

  verPayload(json: string | null): void {
    this.payloadViewerTitle.set('Payload enviado → agencia externa');
    this.payloadViewer.set(json ? this.prettyJson(json) : '{}');
    this.modal.set('payload-viewer');
    document.body.classList.add('ui-modal-open');
  }

  verRespuestaApi(d: DtoDespachoAuditoria): void {
    this.payloadViewerTitle.set(
      `Respuesta API — ${d.agenciaNombre} · HTTP ${d.httpStatus ?? '—'}`);
    this.payloadViewer.set(d.respuestaApi
      ? this.prettyJson(d.respuestaApi)
      : '(sin respuesta)');
    this.modal.set('payload-viewer');
    document.body.classList.add('ui-modal-open');
  }

  /** Recorta la respuesta de la API para mostrarla inline en la tabla. */
  snippetRespuesta(resp: string | null, max = 120): string {
    if (!resp) return '';
    const s = resp.replace(/\s+/g, ' ').trim();
    return s.length > max ? s.slice(0, max) + '…' : s;
  }

  /** Muestra el payload REAL que SECAD enviaría a esta agencia, con el mapeo aplicado. */
  verPayloadSaliente(a: DtoAgenciaExterna): void {
    this.payloadViewerTitle.set(`Payload que SECAD envía → ${a.nombre}`);
    this.payloadViewer.set(this.generarPayloadSaliente(a));
    this.modal.set('payload-viewer');
    document.body.classList.add('ui-modal-open');
  }

  /** Etiqueta legible del modo de autenticación. */
  labelAuthMode(mode: string): string {
    const labels: Record<string, string> = {
      NONE: 'Sin auth', BEARER: 'Bearer', BASIC: 'Basic Auth',
      OAUTH2: 'OAuth2', API_KEY: 'API Key',
      CREDS_BODY: 'Creds en body', PIP_TOKEN: 'PIP Institucional'
    };
    return labels[mode] ?? mode;
  }

  /** Genera el cuerpo HTTP completo (headers + JSON body) que SECAD enviaría a la agencia,
   *  con datos de ejemplo realistas y el campo_mapeo real aplicado. */
  private generarPayloadSaliente(a: DtoAgenciaExterna): string {
    const ts  = new Date().toISOString().slice(0, 19) + '-05:00';
    const url = a.apiUrl || 'https://api.agencia.gov.co/recibir-caso';
    const extra = this.parseAuthExtra(a.authExtra ?? null);

    // ── 1. Líneas de request ──────────────────────────────────────────────────
    const lines: string[] = [`${a.apiMetodo} ${url}`];

    switch ((a.tipoAuth ?? 'BEARER').toUpperCase()) {
      case 'BEARER':
        lines.push('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…');
        break;
      case 'BASIC':
        lines.push('Authorization: Basic ' +
          btoa(`${a.apiUsuario || 'usuario'}:<contraseña>`));
        break;
      case 'OAUTH2':
        lines.push('Authorization: Bearer <token_obtenido_de_tokenUrl>');
        if (extra['tokenUrl'])
          lines.push(`# Token obtenido de: ${extra['tokenUrl']}`);
        break;
      case 'API_KEY':
        lines.push(`${extra['keyHeader'] || 'X-Api-Key'}: <api_key_configurada>`);
        break;
      case 'PIP_TOKEN':
        lines.push('Authorization: Bearer <token_técnico_institucional_PIP>');
        break;
      case 'NONE':
        lines.push('# Sin cabecera de autenticación');
        break;
    }

    lines.push('Content-Type: application/json');

    if (a.apiCabeceras) {
      try {
        const cabs: Record<string, string> = JSON.parse(a.apiCabeceras);
        for (const [k, v] of Object.entries(cabs)) lines.push(`${k}: ${v}`);
      } catch { /* cabeceras malformadas */ }
    }

    lines.push(''); // línea en blanco antes del body

    // ── 2. Campos planos del pedido (mismos nombres que el backend) ───────────
    const casoFlat: Record<string, unknown> = {
      id:               '1234567890123456789',
      sitioGraba:       1,
      horaCaso:         ts,
      fechaCreacion:    ts,
      fechaPrimerAcceso: ts,
      codiPedido:       '310',
      codiPedido2:      null,
      tipoPedido:       'INCIDENTE',
      caliPedido:       'REAL',
      importancia:      '01',
      prioridad:        'INMEDIATA',
      estado:           'A',
      descripcion:      'Ciudadano reporta incendio en bodega',
      nombLlamante:     'Juan Gómez',
      numeTelefono:     '3001234567',
      propTelefono:     'Juan Gómez',
      direLlamante:     'Cra 7 # 32-16',
      barrio:           'Chapinero',
      ciudad:           'Bogotá',
      direCaso:         'Cra 7 # 32-16, Chapinero',
      latitudCaso:      '4.6451',
      longitudCaso:     '-74.0624',
      cordX:            null,
      cordY:            null,
      dispTelefonico:   null,
      celdaMarcacion:   null,
      descCaso:         'Incendio en estructura habitacional',
    };

    // ── 3. Aplicar campo_mapeo y filtrar nulos (igual que el backend) ──────────
    const camposMapeadosRaw = this.aplicarMapeoFront(casoFlat, a.campoMapeo);
    const camposMapeados    = this.filtrarNulos(camposMapeadosRaw);

    // ── 4. Construir body según formato configurado en la agencia ─────────────
    let body: Record<string, unknown>;

    const codDaneSufijo = this.codDane ? `?codDane=${this.codDane}` : '';
    if ((a.formatoPayload ?? 'PLANO') === 'ESTRUCTURADO') {
      // ESTRUCTURADO: body jerárquico completo con _secad, caso, ubicacion, etc.
      body = {
        _secad: {
          version:       '2.0',
          sistemaOrigen: 'SECAD',
          timestamp:     ts,
          callbackUrl:   `https://secad.policia.gov.co/api/ActualizacionExterna/1234567890123456789${codDaneSufijo}`
        },
        caso: {
          id:               '1234567890123456789',
          sitioGraba:       1,
          codigoCaso:       '310',
          descripcionCaso:  'Incendio en estructura habitacional',
          tipoCaso:         'INCIDENTE',
          prioridad:        'INMEDIATA',
          calidad:          'REAL',
          estado:           'A',
          horaCaso:         ts,
          fechaCreacion:    ts,
          fechaPrimerAcceso: ts,
          descripcion:      'Ciudadano reporta incendio en bodega'
        },
        ubicacion: {
          direccion: 'Cra 7 # 32-16, Chapinero',
          barrio:    'Chapinero',
          ciudad:    'Bogotá',
          latitud:   '4.6451',
          longitud:  '-74.0624'
        },
        reportante: {
          nombre:              'Juan Gómez',
          telefono:            '3001234567',
          propietarioTelefono: 'Juan Gómez',
          direccion:           'Cra 7 # 32-16'
        },
        despacho: {
          eventoId:      '9876543210987654321',
          origen:        'RECEPCION',
          fuerzaId:      65920007,
          fuerza:        'Policía Metropolitana Bogotá',
          estado:        'D',
          despachador:   'OPC-001',
          fechaDespacho: ts
        },
        actuaciones: [{
          fuerza:        'Policía',
          canal:         'CAI Centro',
          unidad:        'PTL-001',
          placa:         'ABC123',
          estado:        'D',
          fechaDespacho: ts
        }],
        camposMapeados
      };
    } else {
      // PLANO (default): _secad para callback bidireccional + campos del caso sin nulos
      const codDaneSufijo = this.codDane ? `?codDane=${this.codDane}` : '';
      body = {
        _secad: {
          version:       '2.0',
          sistemaOrigen: 'SECAD',
          timestamp:     ts,
          callbackUrl:   `https://secad.policia.gov.co/api/ActualizacionExterna/1234567890123456789${codDaneSufijo}`
        },
        ...camposMapeados
      };
    }

    // CREDS_BODY: inyectar credenciales en el body (aplica a ambos formatos)
    if ((a.tipoAuth ?? '').toUpperCase() === 'CREDS_BODY') {
      body[extra['bodyUserField'] || 'usuario']    = a.apiUsuario || '<usuario>';
      body[extra['bodyPassField'] || 'contrasena'] = '<contraseña>';
    }

    lines.push(JSON.stringify(body, null, 2));
    return lines.join('\n');
  }

  /** Elimina claves con valor null/undefined — espeja el comportamiento del backend. */
  private filtrarNulos(campos: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(campos).filter(([, v]) => v !== null && v !== undefined)
    );
  }

  /** Aplica el campo_mapeo: renombra las claves del objeto según la configuración. */
  private aplicarMapeoFront(
    campos: Record<string, unknown>,
    mapeoJson: string | null | undefined
  ): Record<string, unknown> {
    if (!mapeoJson?.trim()) return { ...campos };
    try {
      const mapeo: Record<string, string> = JSON.parse(mapeoJson);
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(campos)) {
        const dest = (mapeo[k]?.trim()) ? mapeo[k] : k;
        result[dest] = v;
      }
      return result;
    } catch { return { ...campos }; }
  }

  // ── Modal helpers ────────────────────────────────────────────────────────────

  closeModal(): void {
    this.modal.set(null);
    document.body.classList.remove('ui-modal-open');
  }

  // ── UI helpers ───────────────────────────────────────────────────────────────

  getTipoAgenciaLabel  = (t: string) => this.agSvc.getTipoLabel(t);
  getTipoAgenciaIcon   = (t: string) => this.agSvc.getTipoIcon(t);
  getTipoCanalLabel    = (t: string) => this.svc.getTipoCanalLabel(t);
  getTipoCanalIcon     = (t: string) => this.svc.getTipoCanalIcon(t);
  getStatusClass       = (s: number | null) => this.svc.getHttpStatusClass(s);

  isValidJson(s: string): boolean {
    try { JSON.parse(s); return true; } catch { return false; }
  }

  prettyJson(s: string): string {
    try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
  }

  // ── Builders ──────────────────────────────────────────────────────────────────

  private emptySal() {
    return { nombre: '', descripcion: '', tipoAgencia: 'OTRA',
             apiUrl: '', apiMetodo: 'POST',
             tipoAuth: 'BEARER', apiToken: '', apiUsuario: '', apiPassword: '',
             formatoPayload: 'PLANO',
             activa: true };
  }

  /** Serializa los campos individuales de authExtra al JSON que espera el backend. */
  private buildAuthExtra(mode: string): string | undefined {
    const obj: Record<string, string> = {};
    if (mode === 'OAUTH2'     && this.formSalTokenUrl().trim())
      obj['tokenUrl']      = this.formSalTokenUrl().trim();
    if (mode === 'API_KEY'    && this.formSalKeyHeader().trim())
      obj['keyHeader']     = this.formSalKeyHeader().trim();
    if (mode === 'CREDS_BODY') {
      if (this.formSalBodyUserField().trim()) obj['bodyUserField'] = this.formSalBodyUserField().trim();
      if (this.formSalBodyPassField().trim()) obj['bodyPassField'] = this.formSalBodyPassField().trim();
    }
    return Object.keys(obj).length ? JSON.stringify(obj) : undefined;
  }

  /** Deserializa authExtra JSON a un objeto plano para rellenar los campos del form. */
  private parseAuthExtra(json: string | null): Record<string, string> {
    if (!json) return {};
    try { return JSON.parse(json); } catch { return {}; }
  }

  private emptyEnt() {
    return { nombre: '', descripcion: '', tipoCanal: 'OTRA',
             endpointRelativo: '', sitioGrabaDefecto: 0, activa: true, notas: '' };
  }
}
