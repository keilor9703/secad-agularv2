import {
  Component, ChangeDetectionStrategy, OnDestroy,
  ElementRef, HostListener, computed, effect, inject, input, output, signal, viewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Subject, Subscription, firstValueFrom, interval } from 'rxjs';
import { debounceTime, distinctUntilChanged, startWith, switchMap } from 'rxjs/operators';
// El origen usaba `declare const L` sobre un <script> de CDN. La CSP de la
// plantilla es script-src 'self', así que ese script nunca cargaría.
import * as L from 'leaflet';

import { UiSectionHeaderComponent } from '../../../../shared/components/ui-section-header/ui-section-header.component';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiInputComponent } from '../../../../shared/components/ui-input/ui-input.component';
import { UiSelectComponent } from '../../../../shared/components/ui-select/ui-select.component';
import { UiModalComponent } from '../../../../shared/components/ui-modal/ui-modal.component';
import { UiBadgeComponent } from '../../../../shared/components/ui-badge/ui-badge.component';
import { UiChipComponent } from '../../../../shared/components/ui-chip/ui-chip.component';
import { UiSpinnerComponent } from '../../../../shared/components/ui-spinner/ui-spinner.component';
import { AdjuntosCasoComponent } from '../adjuntos-caso/adjuntos-caso.component';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';
import { animarMarcadorHasta, detenerAnimacionMarcador } from '../../../../shared/utils/leaflet-marker-animator';

import { ToastService } from '../../../../core/services/toast.service';
import {
  EventoService, DtoEventoListItem, DtoCanalesAsignadosResult,
  DtoEstadoHistorialItem, DtoPedidoCercano
} from '../../../../core/services/operacion/evento.service';
import {
  DtoAnotacionRequest, DtoPedidoDetalle
} from '../../../../core/services/operacion/pedido.service';
import {
  AsistenteService, AsistenteCategoria, AsistentePregunta, parsearOpciones
} from '../../../../core/services/operacion/asistente.service';
import {
  TurnosService, DtoMedioDisponibleResumen, DtoRecursoCercano
} from '../../../../core/services/operacion/turnos.service';
import {
  ActuacionesService, DtoActuacionListItem, DtoCrearActuacionRequest,
  DtoCierreActuacionRequest, DtoActividadPolicial, DtoDelitoItem,
  DtoCodigoCasoItem, DtoCodigoCierreActuacion
} from '../../../../core/services/operacion/actuaciones.service';
import {
  AgenciaExternaService, DtoAgenciaExterna
} from '../../../../core/services/operacion/agencia-externa.service';
import {
  RecepcionService, DtoCanalRecepcion, DtoCanalSeleccionado, DtoAdjunto
} from '../../../../core/services/operacion/recepcion.service';
import {
  VideoLlamadaService, EstadoLlamada, ChatMensaje, UbicacionCiudadano, DtoVideoSesionActiva
} from '../../../../core/services/operacion/video-llamada.service';
import {
  ESTADOS_EVENTO, UmbralesSla, escaparHtml, etiquetaEstadoEvento, etiquetaFechaCreacion,
  etiquetaPrioridad, etiquetaTiempo, formatHora, haversineKm, semaforoDe,
  varianteEstadoEvento, variantePrioridad
} from '../../utils/eventos-sla.util';

interface GrupoCanalRemitir {
  fuerza:   string;
  fuerzaId: number;
  canales:  DtoCanalRecepcion[];
}

/** Cambio de estado que la bandeja debe reflejar sin esperar su propio poll. */
export interface CambioEstadoEvento {
  pedidoId: string;
  estado:   string;
}

/**
 * Panel de gestión de UN evento: datos, canales, mapa con recursos y
 * videollamada, línea de despacho, asistente y anotaciones, con sus modales.
 *
 * Vive aparte de la bandeja a propósito. En el origen todo esto —cola,
 * detalle, mapa, WebRTC, despacho y siete modales— era un solo componente de
 * 2.832 líneas con una hoja de estilos de 3.700.
 */
@Component({
  selector: 'app-evento-detalle',
  standalone: true,
  imports: [
    FormsModule,
    DatePipe,
    DecimalPipe,
    UiSectionHeaderComponent,
    UiButtonComponent,
    UiInputComponent,
    UiSelectComponent,
    UiModalComponent,
    UiBadgeComponent,
    UiChipComponent,
    UiSpinnerComponent,
    AdjuntosCasoComponent,
  ],
  templateUrl: './evento-detalle.component.html',
  styleUrls: ['./evento-detalle.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EventoDetalleComponent implements OnDestroy {

  // ══════════════════════════════════════════════════════════════════════════
  //  Entradas y salidas
  // ══════════════════════════════════════════════════════════════════════════

  /** Evento elegido en la bandeja. Al cambiar se recarga todo el panel. */
  readonly evento     = input.required<DtoEventoListItem>();
  readonly canalCodigo = input(0);
  readonly fuerzaId    = input(0);
  readonly sitioGraba  = input(0);
  readonly umbrales    = input.required<UmbralesSla>();
  /** Latido de un minuto de la página: mantiene vivos semáforo y cronómetros. */
  readonly tick        = input(0);

  /** El caso dejó de estar abierto aquí: la bandeja vuelve a su estado vacío. */
  readonly cerrado         = output<void>();
  readonly estadoCambiado  = output<CambioEstadoEvento>();
  readonly recargarBandeja = output<void>();

  // ══════════════════════════════════════════════════════════════════════════
  //  Servicios
  // ══════════════════════════════════════════════════════════════════════════
  private readonly eventoSvc    = inject(EventoService);
  private readonly turnosSvc    = inject(TurnosService);
  private readonly actuacionSvc = inject(ActuacionesService);
  private readonly asistenteSvc = inject(AsistenteService);
  private readonly agenciaSvc   = inject(AgenciaExternaService);
  private readonly recepcionSvc = inject(RecepcionService);
  private readonly videoSvc     = inject(VideoLlamadaService);
  private readonly toast        = inject(ToastService);

  readonly ESTADOS = ESTADOS_EVENTO;

  private readonly subs = new Subscription();
  /** Caso ya cargado en el panel. */
  private idCargado = '';

  constructor() {
    // El panel se recarga cuando la bandeja elige OTRO caso. Se compara por id
    // y no por identidad del objeto: la bandeja reemplaza sus items en cada
    // refresco, y recargar por eso tiraría el mapa y los pollings cada 15 s.
    effect(() => {
      const ev = this.evento();
      if (ev && ev.id !== this.idCargado) {
        this.idCargado = ev.id;
        this.cargarEvento(ev);
      }
    });

    // El mapa se monta en cuanto coexisten el contenedor y el detalle. El
    // origen lo intentaba desde ngAfterViewChecked, que corre en cada ciclo de
    // detección durante toda la vida del componente.
    effect(() => {
      const el = this.mapaRef()?.nativeElement;
      const d  = this.detalle();
      if (!el || !d || this.mapa) return;
      this.montarMapa(el, d);
    });

    // Auto-cambiar el tab de media al conectar/desconectar la videollamada:
    // la cámara del ciudadano pasa a primer plano y al colgar el mapa vuelve.
    effect(() => {
      const estado = this.videollamadaEstado();
      if (estado === 'conectada' || estado === 'conectando' || estado === 'esperando') {
        this.tabMedia.set('video');
      } else if (estado === 'inactiva') {
        this.tabMedia.set('mapa');
      }
    });

    this.suscribirVideollamada();
    this.suscribirAutocompletados();
  }

  /**
   * El despachador cierra la pestaña o navega fuera. Se usa 'pagehide' y no
   * 'beforeunload' porque es el que sí dispara de forma fiable en móviles y al
   * restaurar desde caché. Aquí no hay tiempo de esperar promesas: la garantía
   * real son los trozos ya subidos más el barrido del servidor.
   */
  @HostListener('window:pagehide')
  onPageHide(): void {
    if (this.videollamadaEstado() !== 'inactiva') this.videoSvc.abandonar();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.videoSubs.unsubscribe();
    // abandonar() dispara el guardado de la grabación antes de desmontar. Los
    // trozos ya subidos están a salvo igual, y si este cierre no alcanza, el
    // barrido del servidor finaliza la grabación por su cuenta.
    if (this.videollamadaEstado() !== 'inactiva') this.videoSvc.abandonar();
    this.limpiar();
  }

  private suscribirVideollamada(): void {
    const s = this.videoSvc;
    this.videoSubs.add(s.estado$.subscribe(e => this.videollamadaEstado.set(e)));
    this.videoSubs.add(s.remoteStream$.subscribe(v => this.videollamadaRemoteStream.set(v)));
    this.videoSubs.add(s.error$.subscribe(m => { if (m) this.toast.error('Videollamada', m); }));
    this.videoSubs.add(s.microfonoActivo$.subscribe(a => this.videollamadaMicActivo.set(a)));
    this.videoSubs.add(s.chatDisponible$.subscribe(d => this.videollamadaChatDisponible.set(d)));
    this.videoSubs.add(s.chatMensajes$.subscribe(m => this.videollamadaChatMensajes.set(m)));
    this.videoSubs.add(s.grabando$.subscribe(g => this.grabandoVideollamada.set(g)));
    this.videoSubs.add(s.ubicacion$.subscribe(u => {
      this.videollamadaUbicacion.set(u);
      if (u) this.dibujarUbicacionCiudadano(u);
    }));
  }

  private suscribirAutocompletados(): void {
    this.subs.add(
      this.cierreCodSubj.pipe(debounceTime(300), distinctUntilChanged()).subscribe(q => {
        if (!q.trim()) { this.cierreSugerencias.set([]); return; }
        this.actuacionSvc.buscarCodigosCierre(q).subscribe({
          next: r  => this.cierreSugerencias.set(r.data ?? []),
          error: () => this.cierreSugerencias.set([])
        });
      })
    );
    this.subs.add(
      this.cierreDelitoSubj.pipe(debounceTime(300), distinctUntilChanged()).subscribe(q => {
        if (!q.trim()) { this.cierreDelitoSugs.set([]); return; }
        this.actuacionSvc.buscarDelitos(q).subscribe({
          next: r  => this.cierreDelitoSugs.set(r.data ?? []),
          error: () => this.cierreDelitoSugs.set([])
        });
      })
    );
    this.subs.add(
      this.eventoCodSubj.pipe(debounceTime(300), distinctUntilChanged()).subscribe(q => {
        if (!q.trim()) { this.eventoSugerencias.set([]); return; }
        this.actuacionSvc.buscarCodigosCierre(q).subscribe({
          next: r  => this.eventoSugerencias.set(r.data ?? []),
          error: () => this.eventoSugerencias.set([])
        });
      })
    );
  }

  // ── Paneles del detalle ───────────────────────────────────────────────────
  datosAbierto            = true;
  recursosAbierto         = true;
  despachoAbierto         = true;
  fotosAbierto            = true;
  anotacionesAbierto      = true;
  canalesAsignadosAbierto = true;
  asistenteAbierto        = false;

  // ── Tabs del nuevo layout ─────────────────────────────────────────────────
  /** PiP de video: 'video' = PiP expandido mostrando el stream; 'mapa' = PiP minimizado (solo badge de estado). */
  readonly tabMedia = signal<'mapa' | 'video'>('mapa');
  /** Panel derecho: tab activo de información secundaria. */
  readonly tabInfo  = signal<'despacho' | 'anotaciones' | 'asistente'>('despacho');

  readonly canalesAsignados = signal<DtoCanalesAsignadosResult | null>(null);


  // ── Detalle ───────────────────────────────────────────────────────────────
  readonly detalle         = signal<DtoPedidoDetalle | null>(null);
  readonly cargandoDetalle = signal(false);

  // ── Anotaciones ───────────────────────────────────────────────────────────
  readonly nuevaAnotacion     = signal<DtoAnotacionRequest>({ titulo: '', anotacion: '', tipoAnotacion: 'GENERAL' });
  readonly guardandoAnotacion = signal(false);
  readonly mensajeAnotacion   = signal('');

  readonly opcionesTipoAnotacion: UiSelectOption<string>[] = [
    { value: 'GENERAL',          label: 'General' },
    { value: 'OPERATIVA',        label: 'Operativa' },
    { value: 'PREVENTIVA',       label: 'Preventiva' },
    { value: 'DESPACHO',         label: 'Despacho' },
    { value: 'NOVEDAD_PERSONAL', label: 'Novedad de personal' },
    { value: 'CIERRE',           label: 'Cierre' },
  ];

  readonly plantillasAnotacion: { label: string; texto: string }[] = [
    { label: 'Sin novedad',           texto: 'Sin novedad en el sitio.' },
    { label: 'No ubica la dirección', texto: 'El recurso no logra ubicar la dirección reportada.' },
    { label: 'Sitio abandonado',      texto: 'Al llegar al sitio no se encontró a nadie; novedad no verificada.' },
    { label: 'Requiere apoyo',        texto: 'Se requiere apoyo de otra unidad para atender el caso.' },
    { label: 'Vía obstruida',         texto: 'Demora por vía obstruida o tráfico en la ruta al sitio.' },
  ];

  // ── Cierre del evento ─────────────────────────────────────────────────────
  readonly modalCerrarVisible = signal(false);
  cerrarComentario  = '';
  readonly cerrandoEvento = signal(false);
  /** Acción sin deshacer: el operador debe confirmarla explícitamente. */
  cierreConfirmado  = false;
  private readonly eventoCodSubj = new Subject<string>();
  eventoCodBusqueda = '';
  readonly eventoSugerencias = signal<DtoCodigoCasoItem[]>([]);
  eventoCodsSelec: { codigo: string; descripcion: string }[] = [];
  readonly mostrarSugerenciasEvento = signal(false);

  // ── Cambio de estado ──────────────────────────────────────────────────────
  readonly cambiandoEstado           = signal(false);
  readonly modalCambiarEstadoVisible = signal(false);
  readonly estadoNuevoPendiente      = signal('');
  motivoCambioEstado = '';
  readonly errorCambioEstado = signal('');
  readonly estadoHistorial   = signal<DtoEstadoHistorialItem[]>([]);
  historialEstadoAbierto = false;

  // ── Duplicados ────────────────────────────────────────────────────────────
  readonly duplicados          = signal<DtoPedidoCercano[]>([]);
  readonly cargandoDuplicados  = signal(false);
  readonly duplicadosDescartados = signal(false);
  readonly vinculandoId        = signal<string | null>(null);

  // ── Presencia ─────────────────────────────────────────────────────────────
  readonly presenciaUsuarios = signal<string[]>([]);
  private presenciaSub: Subscription | null = null;

  // ── Apoyo urgente ─────────────────────────────────────────────────────────
  readonly solicitandoApoyoId = signal<string | null>(null);

  // ── Mapa ──────────────────────────────────────────────────────────────────
  // El origen hacía L.map('mapaEvento') buscando el id en todo el documento y
  // repetía el intento desde ngAfterViewChecked, que corre en cada ciclo de
  // detección. Aquí el contenedor se resuelve por referencia y un effect lo
  // monta en cuanto existen a la vez el elemento y el detalle.
  readonly mapaRef = viewChild<ElementRef<HTMLDivElement>>('mapaEvento');
  private mapa: L.Map | null = null;
  private marcadorIncidente: L.Marker | null = null;

  // ── Recursos en turno ─────────────────────────────────────────────────────
  readonly recursos          = signal<DtoMedioDisponibleResumen[]>([]);
  readonly cargandoRecursos  = signal(false);
  readonly errorRecursos     = signal('');
  readonly ultimaActRecursos = signal<Date | null>(null);
  readonly asignandoMedioId  = signal<string | null>(null);
  private readonly marcadoresRecurso = new Map<string, L.Marker>();
  private recursosSub: Subscription | null = null;

  // ── Sugerencia de cuadrante ───────────────────────────────────────────────
  readonly sugerenciasRecurso = signal<DtoRecursoCercano[]>([]);
  readonly cargandoSugerencia = signal(false);
  readonly mostrarSugerencia  = signal(false);
  readonly errorSugerencia    = signal('');
  /** Actuaciones en ruta cuyo recurso ya está a menos de 100 m del incidente. */
  private readonly sugerenciasLlegada = signal(new Set<string>());

  // ── Actuaciones ───────────────────────────────────────────────────────────
  readonly actuaciones         = signal<DtoActuacionListItem[]>([]);
  readonly cargandoActuaciones = signal(false);
  readonly errorActuaciones    = signal('');
  readonly operandoActuacionId = signal<string | null>(null);
  private actuacionesSub: Subscription | null = null;

  // ── Modal: cierre de actuación ────────────────────────────────────────────
  readonly modalCierreActuacion = signal(false);
  readonly actuacionACerrar     = signal<DtoActuacionListItem | null>(null);
  readonly cerrandoActuacion    = signal(false);
  readonly errorCierreActuacion = signal('');

  private readonly cierreCodSubj = new Subject<string>();
  cierreCodBusqueda = '';
  readonly cierreSugerencias = signal<DtoCodigoCasoItem[]>([]);
  cierreCodsSeleccionados: DtoCodigoCierreActuacion[] = [];
  readonly mostrarSugerenciasCierre = signal(false);

  readonly actividadesPoliciales = signal<DtoActividadPolicial[]>([]);
  readonly actividadesFiltradas  = signal<DtoActividadPolicial[]>([]);
  readonly cierreClasifActividad = signal<'O' | 'P' | ''>('');
  readonly cierreActividadSelec  = signal<DtoActividadPolicial | null>(null);

  private readonly cierreDelitoSubj = new Subject<string>();
  cierreDelitoBusqueda = '';
  readonly cierreDelitoSugs  = signal<DtoDelitoItem[]>([]);
  readonly cierreDelitoSelec = signal<DtoDelitoItem | null>(null);
  readonly mostrarSugerenciasDelito = signal(false);

  cierreObservacion = '';
  readonly cerrarEventoAlAtender = signal<boolean | null>(null);

  // ── Sub-campos de una anotación OPERATIVA ─────────────────────────────────
  readonly anotActividadCodigo = signal('');
  readonly anotActividadDesc   = signal('');
  readonly anotRequiereDelito  = signal(false);
  readonly anotDelitoArticulo  = signal('');
  readonly anotDelitoDesc      = signal('');

  // ── Modal: desasignar ─────────────────────────────────────────────────────
  readonly modalDesasignarVisible = signal(false);
  readonly actuacionADesasignar   = signal<DtoActuacionListItem | null>(null);
  desasignarMotivo = '';
  readonly desasignando    = signal(false);
  readonly errorDesasignar = signal('');

  // ── Modal: novedad operativa ──────────────────────────────────────────────
  readonly modalNovedadVisible = signal(false);
  readonly actuacionNovedad    = signal<DtoActuacionListItem | null>(null);
  novedadTexto = '';
  readonly novedadTipo = signal<'GENERAL' | 'NOVEDAD' | 'ALERTA'>('NOVEDAD');
  readonly guardandoNovedad = signal(false);
  readonly errorNovedad     = signal('');

  readonly opcionesTipoNovedad: UiSelectOption<string>[] = [
    { value: 'NOVEDAD', label: 'Novedad' },
    { value: 'ALERTA',  label: 'Alerta' },
    { value: 'GENERAL', label: 'General' },
  ];

  readonly errorAsignacion = signal('');

  // ── Modal: remitir ────────────────────────────────────────────────────────
  readonly modalRemitirVisible = signal(false);
  readonly remitirTab = signal<'secad' | 'externa'>('secad');
  readonly remitirCanalesGrupos = signal<GrupoCanalRemitir[]>([]);
  /** Clave compuesta «codigo:fuerzaId»: el código solo no es único entre fuerzas. */
  readonly remitirCanalesSelec  = signal(new Set<string>());
  readonly remitirAgencias      = signal<DtoAgenciaExterna[]>([]);
  readonly remitirAgenciasSelec = signal(new Set<string>());
  readonly remitirEnviando = signal(false);
  readonly remitirError    = signal('');
  /** true = gestión conjunta; false = remisión exclusiva (sale de mi canal). */
  readonly remitirMantenerCanalOrigen = signal(true);
  remitirConfirmado = false;

  // ── Adjuntos ──────────────────────────────────────────────────────────────
  readonly adjuntos = signal<DtoAdjunto[]>([]);

  // ── Videollamada ──────────────────────────────────────────────────────────
  readonly videollamadaEstado         = signal<EstadoLlamada>('inactiva');
  readonly videollamadaLink           = signal('');
  readonly videollamadaMensaje        = signal('');
  videollamadaTelefono = '';
  readonly creandoVideollamada        = signal(false);
  readonly videollamadaRemoteStream   = signal<MediaStream | null>(null);
  readonly videollamadaMicActivo      = signal(true);
  readonly videollamadaChatDisponible = signal(false);
  readonly videollamadaChatMensajes   = signal<ChatMensaje[]>([]);
  videollamadaChatTexto = '';
  /** Lo publica el servicio: la grabación puede detenerse sola si se cae la red. */
  readonly grabandoVideollamada     = signal(false);
  readonly videollamadaReconectable = signal<DtoVideoSesionActiva | null>(null);
  readonly reconectandoVideollamada = signal(false);
  private videoSesionId = '';
  private readonly videoSubs = new Subscription();
  readonly videoRemotoRef = viewChild<ElementRef<HTMLVideoElement>>('videoRemoto');
  readonly videollamadaUbicacion = signal<UbicacionCiudadano | null>(null);
  private ciudadanoMarker: L.CircleMarker | null = null;
  private ciudadanoTrail:  L.Polyline | null = null;
  private ciudadanoHistorial: [number, number][] = [];

  // ── Asistente ─────────────────────────────────────────────────────────────
  readonly asistenteCategorias  = signal<AsistenteCategoria[]>([]);
  readonly asistenteLoadingCat  = signal(false);
  readonly asistenteCategoriaSel = signal('');
  readonly asistentePreguntas   = signal<AsistentePregunta[]>([]);
  readonly asistenteLoadingPreg = signal(false);
  /**
   * Respuestas del despachador. En el origen los campos del asistente no
   * estaban enlazados a nada: se podían contestar y lo escrito se perdía al
   * cambiar de categoría o cerrar el caso.
   */
  readonly asistenteRespuestas = signal<Record<string, string>>({});
  readonly asisParseOpc = parsearOpciones;

  readonly opcionesCategoriaAsistente = computed<UiSelectOption<string>[]>(() => [
    { value: '', label: '— Elija el tipo de incidente —' },
    ...this.asistenteCategorias().map(c => ({
      value: c.id,
      label: c.totalPreguntas ? `${c.descripcion} (${c.totalPreguntas})` : c.descripcion,
    })),
  ]);

  /** Preguntas obligatorias del asistente todavía sin responder. */
  readonly asistentePendientes = computed(() => {
    const r = this.asistenteRespuestas();
    return this.asistentePreguntas().filter(p => p.obligatoria && !(r[p.id] ?? '').trim()).length;
  });

  readonly asistenteRespondidas = computed(() => {
    const r = this.asistenteRespuestas();
    return this.asistentePreguntas().filter(p => (r[p.id] ?? '').trim()).length;
  });


  // ══════════════════════════════════════════════════════════════════════════
  //  Detalle del evento
  // ══════════════════════════════════════════════════════════════════════════

  private cargarEvento(evento: DtoEventoListItem): void {
    // Limpiar el evento anterior ANTES de pedir el nuevo: si no, sus datos
    // siguen a la vista mientras llega la respuesta y los dos pollings compiten
    // escribiendo los mismos arreglos.
    this.detalle.set(null);
    this.actuaciones.set([]);
    this.recursos.set([]);
    this.errorAsignacion.set('');
    this.errorActuaciones.set('');
    this.errorRecursos.set('');
    this.cargandoDetalle.set(true);
    this.mensajeAnotacion.set('');
    this.nuevaAnotacion.set({ titulo: '', anotacion: '', tipoAnotacion: 'GENERAL' });

    this.destruirMapa();
    this.detenerPollingRecursos();
    this.detenerPollingActuaciones();
    this.detenerPollingPresencia();
    this.resetAsistente();
    this.resetVideollamada();

    this.adjuntos.set([]);
    this.canalesAsignados.set(null);
    this.estadoHistorial.set([]);
    this.duplicados.set([]);
    this.duplicadosDescartados.set(false);
    this.videollamadaTelefono = String(evento.numeTelefono ?? '');
    this.verificarVideollamadaEnCurso(evento.id);

    // Si el despachador elige otro evento antes de que llegue esta respuesta,
    // una respuesta fuera de orden no debe pisar el panel más reciente.
    const pedido = evento.id;
    this.eventoSvc.getById(evento.id).subscribe({
      next: d => {
        if (this.evento()?.id !== pedido) return;
        this.detalle.set(d);
        this.cargandoDetalle.set(false);
        // El backend promueve el estado a 'E' al abrir: reflejarlo en la
        // bandeja sin esperar el siguiente poll de 15 s.
        if (d) this.aplicarEstadoActualizado(d.id, d.estado);
        if (d?.id) {
          this.recepcionSvc.getAdjuntos(d.id)
            .subscribe({ next: r => { if (r.success) this.adjuntos.set(r.data); }, error: () => { /* sin fotos */ } });
        }
        this.iniciarPollingRecursos();
        this.iniciarPollingActuaciones(evento.id);
        this.cargarCanalesAsignados();
        this.cargarHistorialEstado();
        this.cargarDuplicados();
        this.iniciarPollingPresencia(evento.id);
      },
      error: () => {
        if (this.evento()?.id !== pedido) return;
        this.cargandoDetalle.set(false);
        this.toast.error('Evento', 'No se pudo cargar el detalle del evento.');
      }
    });
  }

  /** Cierra el panel y devuelve la bandeja a su estado vacío. */
  volverLista(): void {
    this.limpiar();
    this.cerrado.emit();
  }

  private limpiar(): void {
    this.destruirMapa();
    this.detenerPollingRecursos();
    this.detenerPollingActuaciones();
    this.detenerPollingPresencia();
    this.detalle.set(null);
    this.actuaciones.set([]);
    this.adjuntos.set([]);
    this.canalesAsignados.set(null);
    this.estadoHistorial.set([]);
    this.duplicados.set([]);
    this.resetAsistente();
    this.resetVideollamada();
  }

  /**
   * Qué canales SECAD y agencias externas conocen este evento. Se recarga tras
   * cerrar o remitir, para no tener que reabrir el detalle.
   */
  cargarCanalesAsignados(): void {
    const d = this.detalle();
    if (!d) return;
    this.eventoSvc.getCanalesAsignados(d.id).subscribe({
      next: r  => this.canalesAsignados.set(r),
      error: () => { /* no crítico: el panel no se muestra */ }
    });
  }

  /**
   * Actuaciones que cuentan como despacho activo: P (asignada), D (en ruta) y
   * A (en sitio). Excluye C (cerradas) y V (anuladas).
   */
  readonly actuacionesActivas = computed(() =>
    this.actuaciones().filter(a => a.estado === 'P' || a.estado === 'D' || a.estado === 'A')
  );

  /** El evento abierto es de prioridad alta — lo usa la sugerencia de recurso. */
  get prioridadAltaActual(): boolean {
    const p = this.detalle()?.prioridad?.toUpperCase();
    return p === 'FLASH' || p === 'INMEDIATA';
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Cambio de estado
  // ══════════════════════════════════════════════════════════════════════════

  abrirModalCambiarEstado(nuevoEstado: string): void {
    if (!this.detalle() || this.cambiandoEstado()) return;
    this.estadoNuevoPendiente.set(nuevoEstado);
    this.motivoCambioEstado = '';
    this.errorCambioEstado.set('');
    this.modalCambiarEstadoVisible.set(true);
  }

  cancelarCambiarEstado(): void {
    this.modalCambiarEstadoVisible.set(false);
    this.estadoNuevoPendiente.set('');
  }

  confirmarCambiarEstado(): void {
    const d = this.detalle();
    if (!d || this.cambiandoEstado() || !this.estadoNuevoPendiente()) return;
    if (!this.motivoCambioEstado.trim()) {
      this.errorCambioEstado.set('Indique el motivo del cambio de estado.');
      return;
    }
    this.cambiandoEstado.set(true);
    this.errorCambioEstado.set('');
    const nuevo = this.estadoNuevoPendiente();

    this.eventoSvc.setEstado(d.id, nuevo, this.motivoCambioEstado.trim()).subscribe({
      next: r => {
        this.cambiandoEstado.set(false);
        if (r.success && this.detalle()) {
          this.aplicarEstadoActualizado(d.id, nuevo);
          this.modalCambiarEstadoVisible.set(false);
          this.estadoNuevoPendiente.set('');
          this.cargarHistorialEstado();
          this.recargarBandeja.emit();
        } else {
          this.errorCambioEstado.set(r.message ?? 'No se pudo cambiar el estado.');
        }
      },
      error: e => {
        this.cambiandoEstado.set(false);
        this.errorCambioEstado.set(e.error?.message ?? 'Error al cambiar el estado.');
      }
    });
  }

  cargarHistorialEstado(): void {
    const d = this.detalle();
    if (!d) return;
    this.eventoSvc.getEstadoHistorial(d.id).subscribe({
      next: h  => this.estadoHistorial.set(h),
      error: () => this.estadoHistorial.set([])
    });
  }

  /** Devuelve un evento cerrado a Seguimiento, con motivo obligatorio. */
  reabrirEvento(): void {
    if (this.detalle()?.estado !== 'C') return;
    this.abrirModalCambiarEstado('T');
  }

  /**
   * Refleja de inmediato un cambio de estado en el detalle y en su tarjeta de
   * la bandeja. `nuevoEstado` puede venir vacío si el backend indica que no
   * hubo cambio; en ese caso no se toca nada.
   */
  private aplicarEstadoActualizado(pedidoId: string, nuevoEstado: string | null | undefined): void {
    if (!nuevoEstado) return;
    const d = this.detalle();
    if (d && d.id === pedidoId) this.detalle.set({ ...d, estado: nuevoEstado });
    // La bandeja vive en el componente padre: se le avisa para que refresque la
    // tarjeta sin esperar su propio ciclo de quince segundos.
    this.estadoCambiado.emit({ pedidoId, estado: nuevoEstado });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Duplicados
  // ══════════════════════════════════════════════════════════════════════════

  /** Casos recientes en la misma zona. No bloquea nada: es contexto. */
  cargarDuplicados(): void {
    this.duplicados.set([]);
    const d = this.detalle();
    if (!d?.latitudCaso || !d?.longitudCaso) return;
    const lat = parseFloat(d.latitudCaso);
    const lng = parseFloat(d.longitudCaso);
    if (!isFinite(lat) || !isFinite(lng)) return;

    this.cargandoDuplicados.set(true);
    this.eventoSvc.getDuplicados(d.id, lat, lng).subscribe({
      next: r  => { this.cargandoDuplicados.set(false); this.duplicados.set(r); },
      error: () => this.cargandoDuplicados.set(false)
    });
  }

  descartarDuplicados(): void { this.duplicadosDescartados.set(true); }

  /** Vincula el caso abierto con otro: mismo incidente, llamadas distintas. */
  vincularCaso(candidato: DtoPedidoCercano): void {
    const d = this.detalle();
    if (!d || this.vinculandoId()) return;
    this.vinculandoId.set(candidato.id);
    this.eventoSvc.vincular(d.id, candidato.sitioGraba, Number(candidato.id)).subscribe({
      next: r => {
        this.vinculandoId.set(null);
        if (r.success && this.detalle()) {
          this.detalle.update(x => x
            ? { ...x, pedidoPadreSitio: candidato.sitioGraba, pedidoPadreNum: Number(candidato.id) } : x);
          this.toast.success('Vinculación', 'Caso vinculado correctamente.');
        } else {
          this.toast.error('Vinculación', r.message ?? 'No se pudo vincular el caso.');
        }
      },
      error: e => {
        this.vinculandoId.set(null);
        this.toast.error('Vinculación', e.error?.message ?? 'Error al vincular el caso.');
      }
    });
  }

  desvincularCaso(): void {
    const d = this.detalle();
    if (!d || this.vinculandoId()) return;
    this.vinculandoId.set(d.id);
    this.eventoSvc.desvincular(d.id).subscribe({
      next: r => {
        this.vinculandoId.set(null);
        if (r.success && this.detalle()) {
          this.detalle.update(x => x ? { ...x, pedidoPadreSitio: null, pedidoPadreNum: null } : x);
        }
      },
      error: () => this.vinculandoId.set(null)
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Presencia
  // ══════════════════════════════════════════════════════════════════════════

  private iniciarPollingPresencia(eventoId: string): void {
    this.detenerPollingPresencia();
    this.presenciaSub = interval(30_000)
      .pipe(startWith(0), switchMap(() => this.eventoSvc.getPresencia(eventoId)))
      .subscribe({ next: u => this.presenciaUsuarios.set(u), error: () => { /* no crítico */ } });
  }

  private detenerPollingPresencia(): void {
    this.presenciaSub?.unsubscribe();
    this.presenciaSub = null;
    this.presenciaUsuarios.set([]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Apoyo urgente (seguridad del funcionario)
  // ══════════════════════════════════════════════════════════════════════════

  solicitarApoyo(act: DtoActuacionListItem): void {
    if (this.solicitandoApoyoId()) return;
    this.solicitandoApoyoId.set(act.id);
    this.actuacionSvc.solicitarApoyo(act.id).subscribe({
      next: r => {
        this.solicitandoApoyoId.set(null);
        if (r.success) this.recargarActuaciones();
        else this.toast.error('Apoyo', r.message ?? 'No se pudo registrar la solicitud de apoyo.');
      },
      error: e => {
        this.solicitandoApoyoId.set(null);
        this.toast.error('Apoyo', e.error?.message ?? 'Error al solicitar apoyo.');
      }
    });
  }

  atenderApoyo(act: DtoActuacionListItem): void {
    if (this.solicitandoApoyoId()) return;
    this.solicitandoApoyoId.set(act.id);
    this.actuacionSvc.atenderApoyo(act.id).subscribe({
      next: r  => { this.solicitandoApoyoId.set(null); if (r.success) this.recargarActuaciones(); },
      error: () => this.solicitandoApoyoId.set(null)
    });
  }

  /** Minutos que lleva el recurso en su estado actual. */
  minutosEnEstadoActual(act: DtoActuacionListItem): number {
    void this.tick();
    const ref = act.estado === 'A' ? act.fechaLlegada
              : act.estado === 'D' ? act.fechaDespacho
              : act.fechaCreacion;
    if (!ref) return 0;
    const ms = Date.now() - new Date(ref).getTime();
    return ms > 0 ? Math.floor(ms / 60000) : 0;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Videollamada
  // ══════════════════════════════════════════════════════════════════════════

  private resetVideollamada(): void {
    // colgar() asegura la grabación antes de desmontar la conexión.
    if (this.videollamadaEstado() !== 'inactiva') void this.videoSvc.colgar();
    this.videollamadaLink.set('');
    this.videollamadaMensaje.set('');
    this.videoSesionId = '';
    this.videollamadaChatTexto = '';
    this.videollamadaUbicacion.set(null);
    this.videollamadaReconectable.set(null);
    this.limpiarUbicacionCiudadano();
  }

  /**
   * Al abrir un caso se pregunta si ya hay una videollamada en curso. Si la
   * hay se ofrece reconectarse en lugar de generar otro enlace: el despachador
   * pudo refrescar, cambiar de pestaña o ser un relevo de turno. El ciudadano
   * sigue en la misma llamada.
   */
  private verificarVideollamadaEnCurso(pedidoId: string): void {
    this.videollamadaReconectable.set(null);
    this.videoSvc.getSesionActiva(pedidoId)
      .then(activa => {
        if (!activa?.hay || this.videollamadaEstado() !== 'inactiva') return;
        this.videollamadaReconectable.set(activa);
      })
      .catch(() => { /* no crítico: simplemente no se ofrece reconectar */ });
  }

  reconectarVideollamada(): void {
    const activa = this.videollamadaReconectable();
    if (!activa || this.reconectandoVideollamada()) return;

    this.reconectandoVideollamada.set(true);
    this.videoSesionId = activa.sesionId;
    this.videollamadaLink.set(`${window.location.origin}/video/${activa.sessionToken}`);

    this.videoSvc.reconectar(activa.sesionId)
      .then(() => {
        this.videollamadaReconectable.set(null);
        this.toast.success('Videollamada', 'Reconectado a la llamada en curso.');
        if (activa.grabando) {
          this.toast.warning('Videollamada',
            'Había una grabación abierta; el servidor la cerrará y quedará guardada en el caso.');
        }
      })
      .catch(() => this.toast.error('Videollamada', 'No fue posible reconectarse a la llamada.'))
      .finally(() => this.reconectandoVideollamada.set(false));
  }

  /** Crea la sesión, manda el enlace por SMS y abre la señalización. */
  iniciarVideollamada(): void {
    const d = this.detalle();
    if (!d || this.creandoVideollamada()) return;
    if (!this.videollamadaTelefono.trim()) {
      this.toast.warning('Videollamada', 'Escriba el teléfono del ciudadano.');
      return;
    }
    this.creandoVideollamada.set(true);
    this.videoSvc.crearSesion(d.id, this.videollamadaTelefono.trim())
      .then(async r => {
        this.creandoVideollamada.set(false);
        if (!r.success) {
          this.toast.error('Videollamada', r.message || 'No se pudo crear la sesión.');
          return;
        }
        this.videoSesionId = r.sesionId;
        this.videollamadaLink.set(`${window.location.origin}/video/${r.sessionToken}`);
        this.videollamadaMensaje.set(r.message);
        this.toast[r.smsEnviado ? 'success' : 'warning']('Videollamada', r.message);
        await this.videoSvc.iniciar(r.sesionId);
      })
      .catch(e => {
        this.creandoVideollamada.set(false);
        this.toast.error('Videollamada', e?.error?.message ?? 'Error al crear la videollamada.');
      });
  }

  copiarLinkVideollamada(): void {
    const link = this.videollamadaLink();
    if (!link) return;
    navigator.clipboard?.writeText(link)
      .then(() => this.toast.success('Videollamada', 'Enlace copiado al portapapeles.'))
      .catch(() => this.toast.warning('Videollamada', 'El navegador no permitió copiar el enlace.'));
  }

  toggleGrabacionVideollamada(): void {
    if (this.grabandoVideollamada()) {
      this.videoSvc.finalizarGrabacion()
        .then(ok => ok
          ? this.toast.success('Videollamada', 'Grabación guardada en el caso.')
          : this.toast.warning('Videollamada', 'La grabación quedó en el servidor y se registrará sola.'))
        .catch(() => this.toast.error('Videollamada', 'Error al cerrar la grabación.'));
    } else {
      this.videoSvc.iniciarGrabacion()
        .then(() => this.toast.success('Videollamada', 'Grabando — el video se resguarda mientras avanza.'))
        .catch(() => this.toast.error('Videollamada', 'No se pudo iniciar la grabación.'));
    }
  }

  colgarVideollamada(): void {
    void this.videoSvc.colgar();
    this.videollamadaLink.set('');
    this.videollamadaMensaje.set('');
    this.videollamadaChatTexto = '';
    this.videollamadaUbicacion.set(null);
    this.limpiarUbicacionCiudadano();
  }

  /**
   * Silencia el micrófono del despachador sin colgar: sirve cuando el ciudadano
   * no puede recibir audio del CAD sin delatarse, pero sí puede escribir.
   */
  toggleMicVideollamada(): void { this.videoSvc.toggleMicrofono(); }

  enviarChatVideollamada(): void {
    const texto = this.videollamadaChatTexto.trim();
    if (!texto) return;
    this.videoSvc.enviarChat(texto);
    this.videollamadaChatTexto = '';
  }

  /**
   * Hay llamada realmente en curso y el caso no está cerrado. Decide si el
   * panel de videollamada ocupa su columna o si el mapa se lleva ese espacio.
   */
  llamadaEnCurso(d: DtoPedidoDetalle): boolean {
    return d.estado !== 'C'
      && this.videollamadaEstado() !== 'inactiva'
      && this.videollamadaEstado() !== 'finalizada';
  }

  /**
   * Pantalla completa del video del ciudadano. No es «abrir en otra pestaña»:
   * el stream vive dentro de este RTCPeerConnection y un MediaStream no se
   * puede pasar a otra pestaña.
   */
  verVideollamadaPantallaCompleta(): void {
    const el = this.videoRemotoRef()?.nativeElement;
    if (!el) return;
    el.requestFullscreen?.().catch(() =>
      this.toast.warning('Videollamada', 'El navegador no permitió abrir pantalla completa.'));
  }

  centrarEnCiudadano(): void {
    if (!this.mapa || !this.ciudadanoMarker) return;
    this.mapa.flyTo(this.ciudadanoMarker.getLatLng(), 16, { duration: 0.6 });
    this.ciudadanoMarker.openPopup();
  }

  /**
   * Dibuja la posición en vivo del ciudadano y su recorrido sobre el MISMO
   * mapa de recursos, no uno aparte: el despachador ve en un solo sitio el
   * incidente, las patrullas y al ciudadano.
   */
  private dibujarUbicacionCiudadano(u: UbicacionCiudadano): void {
    this.ciudadanoHistorial.push([u.lat, u.lng]);
    if (this.ciudadanoHistorial.length > 500) this.ciudadanoHistorial.shift();
    if (!this.mapa) return;

    if (!this.ciudadanoMarker) {
      this.ciudadanoMarker = L.circleMarker([u.lat, u.lng], {
        radius: 9, color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 1
      }).addTo(this.mapa).bindPopup('<b>Ciudadano</b><br>Ubicación en vivo (videollamada)');
      this.ciudadanoTrail = L.polyline(this.ciudadanoHistorial, {
        color: '#2563eb', weight: 3, opacity: 0.55, dashArray: '4 6'
      }).addTo(this.mapa);
    } else {
      this.ciudadanoMarker.setLatLng([u.lat, u.lng]);
      this.ciudadanoTrail?.setLatLngs(this.ciudadanoHistorial);
    }
  }

  private limpiarUbicacionCiudadano(): void {
    try { this.ciudadanoMarker?.remove(); } catch { /* mapa ya destruido */ }
    try { this.ciudadanoTrail?.remove(); }  catch { /* mapa ya destruido */ }
    this.ciudadanoMarker = null;
    this.ciudadanoTrail  = null;
    this.ciudadanoHistorial = [];
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Anotaciones
  // ══════════════════════════════════════════════════════════════════════════

  setAnotacionTitulo(titulo: string): void { this.nuevaAnotacion.update(a => ({ ...a, titulo })); }
  setAnotacionTexto(anotacion: string): void { this.nuevaAnotacion.update(a => ({ ...a, anotacion })); }

  aplicarPlantillaAnotacion(texto: string): void {
    this.nuevaAnotacion.update(a => ({
      ...a, anotacion: a.anotacion ? `${a.anotacion} ${texto}` : texto
    }));
  }

  guardarAnotacion(): void {
    const d = this.detalle();
    const nueva = this.nuevaAnotacion();
    if (!d || !nueva.anotacion.trim()) return;
    this.guardandoAnotacion.set(true);
    this.mensajeAnotacion.set('');

    // Título enriquecido para las anotaciones operativas.
    let titulo = nueva.titulo;
    if (nueva.tipoAnotacion === 'OPERATIVA' && this.anotActividadCodigo()) {
      const partes: string[] = [this.anotActividadDesc() || this.anotActividadCodigo()];
      if (this.anotDelitoArticulo()) partes.push(`${this.anotDelitoArticulo()}: ${this.anotDelitoDesc() || ''}`);
      titulo = titulo ? `${partes.join(' | ')} — ${titulo}` : partes.join(' | ');
    }

    this.eventoSvc.createAnotacion(d.id, { ...nueva, titulo }).subscribe({
      next: r => {
        this.guardandoAnotacion.set(false);
        if (r.success) {
          this.mensajeAnotacion.set('Anotación registrada.');
          this.aplicarEstadoActualizado(d.id, r.estadoActual);
          this.nuevaAnotacion.set({ titulo: '', anotacion: '', tipoAnotacion: 'GENERAL' });
          this.resetSubcamposOperativa();
          this.eventoSvc.getAnotaciones(d.id).subscribe(anots =>
            this.detalle.update(x => x ? { ...x, anotaciones: anots } : x));
        } else {
          this.mensajeAnotacion.set(r.message || 'No se pudo guardar la anotación.');
        }
      },
      error: () => {
        this.guardandoAnotacion.set(false);
        this.mensajeAnotacion.set('Error al guardar la anotación.');
      }
    });
  }

  private resetSubcamposOperativa(): void {
    this.anotActividadCodigo.set('');
    this.anotActividadDesc.set('');
    this.anotRequiereDelito.set(false);
    this.anotDelitoArticulo.set('');
    this.anotDelitoDesc.set('');
  }

  onTipoAnotacionChange(tipo: string): void {
    this.nuevaAnotacion.update(a => ({ ...a, tipoAnotacion: tipo }));
    this.resetSubcamposOperativa();
    if (tipo === 'OPERATIVA' && !this.actividadesPoliciales().length) {
      this.actuacionSvc.getActividadesPoliciales().subscribe({
        next: r  => this.actividadesPoliciales.set(r.data ?? []),
        error: () => { /* el selector queda vacío */ }
      });
    }
  }

  readonly opcionesActividadAnotacion = computed<UiSelectOption<string>[]>(() => [
    { value: '', label: '— Elija la actividad —' },
    ...this.actividadesPoliciales().map(a => ({
      value: a.codigo,
      label: `${a.tipo === 'O' ? 'Operativa' : 'Preventiva'} — ${a.descripcion}`,
    })),
  ]);

  onAnotActividadChange(codigo: string): void {
    const act = this.actividadesPoliciales().find(a => a.codigo === codigo);
    this.anotActividadCodigo.set(act?.codigo ?? '');
    this.anotActividadDesc.set(act?.descripcion ?? '');
    this.anotRequiereDelito.set(act?.requiereDelito ?? false);
    if (!this.anotRequiereDelito()) {
      this.anotDelitoArticulo.set('');
      this.anotDelitoDesc.set('');
    }
  }

  getTipoAnotacionLabel(tipo: string): string {
    return ({
      GENERAL: 'General', OPERATIVA: 'Operativa', PREVENTIVA: 'Preventiva',
      DESPACHO: 'Despacho', NOVEDAD_PERSONAL: 'Novedad de personal',
      CIERRE: 'Cierre',
      // La genera confirmarRemitir() al remitir el evento a otro canal o agencia.
      REMISION: 'Remisión',
    } as Record<string, string>)[tipo] ?? tipo;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Cierre del evento
  // ══════════════════════════════════════════════════════════════════════════

  abrirModalCerrar(): void {
    this.cerrarComentario = '';
    this.eventoCodsSelec  = [];
    this.eventoCodBusqueda = '';
    this.eventoSugerencias.set([]);
    this.mostrarSugerenciasEvento.set(false);
    this.cierreConfirmado = false;
    this.modalCerrarVisible.set(true);
  }

  cancelarCierre(): void { this.modalCerrarVisible.set(false); }

  onEventoCodInput(valor: string): void {
    this.eventoCodBusqueda = valor;
    this.eventoCodSubj.next(valor);
    this.mostrarSugerenciasEvento.set(true);
  }

  seleccionarEventoCod(item: DtoCodigoCasoItem): void {
    if (!this.eventoCodsSelec.some(c => c.codigo === item.codigo)) {
      this.eventoCodsSelec.push({ codigo: item.codigo, descripcion: item.descripcion });
    }
    this.eventoCodBusqueda = '';
    this.eventoSugerencias.set([]);
    this.mostrarSugerenciasEvento.set(false);
  }

  agregarEventoCodManual(): void {
    const cod = this.eventoCodBusqueda.trim().toUpperCase();
    if (!cod) return;
    if (!this.eventoCodsSelec.some(c => c.codigo === cod)) {
      this.eventoCodsSelec.push({ codigo: cod, descripcion: '' });
    }
    this.eventoCodBusqueda = '';
    this.eventoSugerencias.set([]);
    this.mostrarSugerenciasEvento.set(false);
  }

  quitarEventoCod(idx: number): void { this.eventoCodsSelec.splice(idx, 1); }

  cerrarSugerenciasEvento(): void {
    setTimeout(() => this.mostrarSugerenciasEvento.set(false), 200);
  }

  confirmarCierre(): void {
    const d = this.detalle();
    if (!d || this.cerrandoEvento() || !this.cierreConfirmado) return;

    this.cerrandoEvento.set(true);
    this.eventoSvc.cerrar(d.id, {
      estado: 'C',
      observacionCierre: this.cerrarComentario.trim() || undefined,
      codigosCierre: this.eventoCodsSelec.map((c, i) => ({
        orden: i + 1, codigoCierre: c.codigo, tipoCodigo: 'CIERRE',
        descripcionLibre: c.descripcion || undefined
      }))
    }, this.canalCodigo(), this.fuerzaId()).subscribe({
      next: r => {
        this.cerrandoEvento.set(false);
        this.modalCerrarVisible.set(false);
        if (r.success) {
          // Con varios canales esto puede ser un cierre parcial (solo el mío) o
          // el definitivo; el mensaje del backend distingue cuál fue.
          this.toast.success('Evento', r.message || 'Evento cerrado.');
          this.volverLista();
          this.recargarBandeja.emit();
        } else {
          this.toast.warning('Cerrar evento', r.message || 'No se pudo cerrar el evento.');
        }
      },
      error: e => {
        this.cerrandoEvento.set(false);
        this.toast.error('Cerrar evento', e.error?.message ?? 'Error al cerrar el evento.');
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Recursos en turno
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Polling de recursos cada 8 s del canal activo. Este mismo ciclo dispara la
   * sincronización de GPS con GESPO bajo demanda: solo corre mientras el
   * operador tiene un canal abierto aquí, y pide únicamente el GPS de las
   * patrullas de este canal, no las de toda la fuerza.
   */
  private iniciarPollingRecursos(): void {
    this.detenerPollingRecursos();
    if (this.canalCodigo() <= 0) return;

    this.recursosSub = interval(8_000).pipe(
      startWith(0),
      switchMap(() => {
        this.cargandoRecursos.set(true);
        this.turnosSvc.sincronizarGps(this.canalCodigo(), this.fuerzaId() || undefined)
          .subscribe({ error: () => { /* silencioso: no es crítico para la UI */ } });
        return this.turnosSvc.getResumenRecursosCanal(
          this.canalCodigo(), this.sitioGraba() || 1, this.fuerzaId() || undefined);
      })
    ).subscribe({
      next: data => {
        this.cargandoRecursos.set(false);
        this.errorRecursos.set('');
        this.ultimaActRecursos.set(new Date());
        this.recursos.set(this.ordenarPorDistancia(data));
        this.actualizarSugerenciasLlegada();
        this.pintarRecursosEnMapa();
      },
      error: () => {
        this.cargandoRecursos.set(false);
        this.errorRecursos.set('No se pudieron obtener los recursos del canal.');
      }
    });
  }

  private detenerPollingRecursos(): void {
    this.recursosSub?.unsubscribe();
    this.recursosSub = null;
    this.recursos.set([]);
  }

  /**
   * Calcula la distancia al incidente y ordena SOLO por ella: la posición de
   * cada patrulla queda estable aunque cambie de estado, y al asignarla no
   * salta al final de la lista.
   */
  private ordenarPorDistancia(data: DtoMedioDisponibleResumen[]): DtoMedioDisponibleResumen[] {
    const d = this.detalle();
    if (!d?.latitudCaso || !d?.longitudCaso) return data;
    const lat0 = parseFloat(d.latitudCaso);
    const lng0 = parseFloat(d.longitudCaso);
    if (!isFinite(lat0) || !isFinite(lng0)) return data;
    data.forEach(r => {
      r.distanciaKm = (r.lat != null && r.lng != null) ? haversineKm(lat0, lng0, r.lat, r.lng) : undefined;
    });
    return [...data].sort((a, b) => (a.distanciaKm ?? 9999) - (b.distanciaKm ?? 9999));
  }

  private recargarRecursos(): void {
    if (this.canalCodigo() <= 0) return;
    this.turnosSvc.getResumenRecursosCanal(
      this.canalCodigo(), this.sitioGraba() || 1, this.fuerzaId() || undefined
    ).subscribe({
      next: data => {
        this.errorRecursos.set('');
        this.ultimaActRecursos.set(new Date());
        this.recursos.set(this.ordenarPorDistancia(data));
        this.pintarRecursosEnMapa();
      },
      error: () => { /* el ciclo de 8 s lo reintenta */ }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Despacho — cuatro pasos
  // ══════════════════════════════════════════════════════════════════════════

  /** Paso 1: crea la actuación en estado P y vincula el medio al evento. */
  asignarRecursoAlEvento(r: DtoMedioDisponibleResumen): void {
    const d = this.detalle();
    if (!d || this.asignandoMedioId()) return;
    this.asignandoMedioId.set(r.id);
    this.errorAsignacion.set('');

    const req: DtoCrearActuacionRequest = {
      eventoId:       d.id,
      sitioGraba:     this.sitioGraba(),
      fuerzaId:       this.fuerzaId() || undefined,
      canalCodigo:    this.canalCodigo() || undefined,
      unidadAsignada: r.patrullaCodigo,
      medioId:        r.id,
    };
    this.actuacionSvc.crearActuacion(req).subscribe({
      next: res => {
        this.asignandoMedioId.set(null);
        if (res.success) {
          this.errorAsignacion.set('');
          this.aplicarEstadoActualizado(d.id, res.estadoEventoActual);
          this.recargarActuaciones();
          this.recargarRecursos();
        } else {
          this.errorAsignacion.set(res.message ?? 'No se pudo asignar el recurso.');
        }
      },
      error: e => {
        this.asignandoMedioId.set(null);
        this.errorAsignacion.set(e.error?.message ?? 'Error al asignar el recurso.');
      }
    });
  }

  /** Paso 2: P → D, registra la salida y pone el medio en ruta. */
  marcarEnRuta(act: DtoActuacionListItem): void { this.cambiarEstadoActuacion(act, 'D'); }

  /** Paso 3: D → A, registra la llegada al lugar. */
  marcarEnSitio(act: DtoActuacionListItem): void { this.cambiarEstadoActuacion(act, 'A'); }

  private cambiarEstadoActuacion(act: DtoActuacionListItem, estado: 'D' | 'A'): void {
    if (this.operandoActuacionId()) return;
    this.operandoActuacionId.set(act.id);
    this.actuacionSvc.actualizarEstado(act.id, { estado }).subscribe({
      next: () => {
        this.operandoActuacionId.set(null);
        this.recargarActuaciones();
        this.recargarRecursos();
      },
      error: e => {
        this.operandoActuacionId.set(null);
        this.toast.error('Actuación', e.error?.message ?? 'No se pudo actualizar el recurso.');
      }
    });
  }

  /**
   * Sugerencia por proximidad: si el medio de una actuación en ruta ya está a
   * menos de 100 m del incidente, se ofrece confirmar la llegada. Nunca cambia
   * el estado solo: siempre requiere el clic del despachador.
   */
  private actualizarSugerenciasLlegada(): void {
    const d = this.detalle();
    if (!d?.latitudCaso || !d?.longitudCaso) return;
    const lat0 = parseFloat(d.latitudCaso);
    const lng0 = parseFloat(d.longitudCaso);
    if (!isFinite(lat0) || !isFinite(lng0)) return;

    const nuevas = new Set<string>();
    const recursos = this.recursos();
    for (const act of this.actuaciones()) {
      if (act.estado !== 'D' || !act.unidadAsignada) continue;
      const recurso = recursos.find(r => r.patrullaCodigo === act.unidadAsignada);
      if (recurso?.lat == null || recurso?.lng == null) continue;
      if (haversineKm(lat0, lng0, recurso.lat, recurso.lng) <= 0.1) nuevas.add(act.id);
    }
    this.sugerenciasLlegada.set(nuevas);
  }

  sugiereLlegada(act: DtoActuacionListItem): boolean { return this.sugerenciasLlegada().has(act.id); }

  /**
   * Solo el canal que asignó el recurso puede gestionarlo en un evento
   * multi-canal; el backend es quien lo hace cumplir. Aquí solo se usa para no
   * ofrecer botones que van a fallar: las actuaciones antiguas sin canal se
   * dejan visibles, con el mismo criterio del backend.
   */
  puedeGestionarActuacion(act: DtoActuacionListItem): boolean {
    if (act.canalCodigo == null || act.fuerzaId == null) return true;
    if (!this.canalCodigo() || !this.fuerzaId()) return true;
    return act.canalCodigo === this.canalCodigo() && act.fuerzaId === this.fuerzaId();
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Sugerencia de cuadrante más cercano
  // ══════════════════════════════════════════════════════════════════════════

  sugerirRecursoCercano(): void {
    const d = this.detalle();
    if (!d || this.canalCodigo() <= 0) return;
    const lat = parseFloat(d.latitudCaso  || '');
    const lng = parseFloat(d.longitudCaso || '');
    this.mostrarSugerencia.set(true);
    if (!isFinite(lat) || !isFinite(lng)) {
      this.errorSugerencia.set('El incidente no tiene coordenadas registradas.');
      return;
    }

    this.cargandoSugerencia.set(true);
    this.errorSugerencia.set('');
    this.turnosSvc.getSugerenciaRecurso(
      this.canalCodigo(), lat, lng, this.sitioGraba() || 1,
      this.fuerzaId() || undefined, 5, this.prioridadAltaActual
    ).subscribe({
      next: data => {
        this.sugerenciasRecurso.set(data);
        this.cargandoSugerencia.set(false);
        if (data.length === 0) this.errorSugerencia.set('No hay recursos libres con GPS reciente en este canal.');
      },
      error: () => {
        this.cargandoSugerencia.set(false);
        this.errorSugerencia.set('No se pudo obtener la sugerencia.');
      }
    });
  }

  asignarSugerido(s: DtoRecursoCercano): void {
    const match = this.recursos().find(r => r.id === s.medioId);
    if (!match) {
      this.errorSugerencia.set('El recurso ya no está disponible; actualizando la lista…');
      this.recargarRecursos();
      return;
    }
    this.mostrarSugerencia.set(false);
    this.asignarRecursoAlEvento(match);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Desasignar
  // ══════════════════════════════════════════════════════════════════════════

  abrirModalDesasignar(act: DtoActuacionListItem): void {
    this.actuacionADesasignar.set(act);
    this.desasignarMotivo = '';
    this.errorDesasignar.set('');
    this.desasignando.set(false);
    this.modalDesasignarVisible.set(true);
  }

  cancelarDesasignar(): void {
    this.modalDesasignarVisible.set(false);
    this.actuacionADesasignar.set(null);
  }

  confirmarDesasignar(): void {
    const act = this.actuacionADesasignar();
    if (!act || this.desasignando()) return;
    // En P el motivo es opcional. En D/A (recurso ya en ruta o en sitio) es
    // obligatorio: quien cancela un recurso que ya está actuando debe explicarlo.
    if (act.estado !== 'P' && !this.desasignarMotivo.trim()) {
      this.errorDesasignar.set('Indique el motivo para cancelar un recurso que ya salió o está en sitio.');
      return;
    }
    this.desasignando.set(true);
    this.errorDesasignar.set('');

    this.actuacionSvc.desasignarActuacion(act.id, this.desasignarMotivo.trim() || undefined).subscribe({
      next: res => {
        this.desasignando.set(false);
        if (res.success) {
          this.modalDesasignarVisible.set(false);
          this.actuacionADesasignar.set(null);
          this.recargarActuaciones();
          this.recargarRecursos();
        } else {
          this.errorDesasignar.set(res.message ?? 'No se pudo desasignar el recurso.');
        }
      },
      error: e => {
        this.desasignando.set(false);
        this.errorDesasignar.set(e.error?.message ?? 'Error al desasignar el recurso.');
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Novedad operativa
  // ══════════════════════════════════════════════════════════════════════════

  abrirModalNovedad(act: DtoActuacionListItem): void {
    this.actuacionNovedad.set(act);
    this.novedadTexto = '';
    this.novedadTipo.set('NOVEDAD');
    this.errorNovedad.set('');
    this.guardandoNovedad.set(false);
    this.modalNovedadVisible.set(true);
  }

  cancelarNovedad(): void {
    this.modalNovedadVisible.set(false);
    this.actuacionNovedad.set(null);
  }

  confirmarNovedad(): void {
    const act = this.actuacionNovedad();
    if (!act || this.guardandoNovedad()) return;
    if (!this.novedadTexto.trim()) {
      this.errorNovedad.set('Escriba el texto de la novedad.');
      return;
    }
    this.guardandoNovedad.set(true);
    this.errorNovedad.set('');

    this.actuacionSvc.agregarNota(act.id, {
      nota: this.novedadTexto.trim(), tipoNota: this.novedadTipo()
    }).subscribe({
      next: res => {
        this.guardandoNovedad.set(false);
        if (res.success) {
          this.modalNovedadVisible.set(false);
          this.actuacionNovedad.set(null);
          this.recargarActuaciones();
        } else {
          this.errorNovedad.set(res.message ?? 'No se pudo registrar la novedad.');
        }
      },
      error: e => {
        this.guardandoNovedad.set(false);
        this.errorNovedad.set(e.error?.message ?? 'Error al registrar la novedad.');
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Cierre de la actuación (paso 4 — «Atendió»)
  // ══════════════════════════════════════════════════════════════════════════

  abrirCierreActuacion(act: DtoActuacionListItem): void {
    this.actuacionACerrar.set(act);
    this.cerrandoActuacion.set(false);
    this.errorCierreActuacion.set('');
    this.cierreCodBusqueda = '';
    this.cierreSugerencias.set([]);
    this.cierreCodsSeleccionados = [];
    this.mostrarSugerenciasCierre.set(false);
    this.cierreClasifActividad.set('');
    this.cierreActividadSelec.set(null);
    this.actividadesFiltradas.set([]);
    this.cierreDelitoBusqueda = '';
    this.cierreDelitoSugs.set([]);
    this.cierreDelitoSelec.set(null);
    this.mostrarSugerenciasDelito.set(false);
    this.cierreObservacion = '';
    this.cerrarEventoAlAtender.set(null);

    if (!this.actividadesPoliciales().length) {
      this.actuacionSvc.getActividadesPoliciales().subscribe({
        next: r  => this.actividadesPoliciales.set(r.data ?? []),
        error: () => { /* el selector queda vacío */ }
      });
    }

    this.modalCierreActuacion.set(true);
  }

  cancelarCierreActuacion(): void {
    this.modalCierreActuacion.set(false);
    this.actuacionACerrar.set(null);
  }

  onCierreCodInput(valor: string): void {
    this.cierreCodBusqueda = valor;
    this.cierreCodSubj.next(valor);
    this.mostrarSugerenciasCierre.set(true);
  }

  seleccionarCierreCod(item: DtoCodigoCasoItem): void {
    if (!this.cierreCodsSeleccionados.some(c => c.codigoCierre === item.codigo)) {
      this.cierreCodsSeleccionados.push({
        orden: this.cierreCodsSeleccionados.length + 1,
        codigoCierre: item.codigo,
        tipoCodigo: 'CIERRE',
        descripcionLibre: item.descripcion || undefined
      });
    }
    this.cierreCodBusqueda = '';
    this.cierreSugerencias.set([]);
    this.mostrarSugerenciasCierre.set(false);
  }

  agregarCierreCodManual(): void {
    const cod = this.cierreCodBusqueda.trim().toUpperCase();
    if (!cod) return;
    if (!this.cierreCodsSeleccionados.some(c => c.codigoCierre === cod)) {
      this.cierreCodsSeleccionados.push({
        orden: this.cierreCodsSeleccionados.length + 1, codigoCierre: cod, tipoCodigo: 'CIERRE'
      });
    }
    this.cierreCodBusqueda = '';
    this.cierreSugerencias.set([]);
    this.mostrarSugerenciasCierre.set(false);
  }

  quitarCierreCod(idx: number): void {
    this.cierreCodsSeleccionados.splice(idx, 1);
    this.cierreCodsSeleccionados.forEach((c, i) => c.orden = i + 1);
  }

  cerrarSugerenciasCierre(): void {
    setTimeout(() => this.mostrarSugerenciasCierre.set(false), 200);
  }

  onClasifActividadChange(tipo: 'O' | 'P' | ''): void {
    this.cierreClasifActividad.set(tipo);
    this.cierreActividadSelec.set(null);
    this.cierreDelitoSelec.set(null);
    this.cierreDelitoBusqueda = '';
    this.actividadesFiltradas.set(tipo ? this.actividadesPoliciales().filter(a => a.tipo === tipo) : []);
  }

  readonly opcionesActividadCierre = computed<UiSelectOption<string>[]>(() => [
    { value: '', label: '— Elija la actividad —' },
    ...this.actividadesFiltradas().map(a => ({ value: a.codigo, label: a.descripcion })),
  ]);

  onActividadChange(codigo: string): void {
    this.cierreActividadSelec.set(this.actividadesFiltradas().find(a => a.codigo === codigo) ?? null);
    this.cierreDelitoSelec.set(null);
    this.cierreDelitoBusqueda = '';
    this.cierreDelitoSugs.set([]);
  }

  onCierreDelitoInput(valor: string): void {
    this.cierreDelitoBusqueda = valor;
    this.cierreDelitoSubj.next(valor);
    this.mostrarSugerenciasDelito.set(true);
  }

  seleccionarCierreDelito(item: DtoDelitoItem): void {
    this.cierreDelitoSelec.set(item);
    this.cierreDelitoBusqueda = `${item.articulo} – ${item.descripcion}`;
    this.cierreDelitoSugs.set([]);
    this.mostrarSugerenciasDelito.set(false);
  }

  quitarCierreDelito(): void {
    this.cierreDelitoSelec.set(null);
    this.cierreDelitoBusqueda = '';
  }

  cerrarSugerenciasDelito(): void {
    setTimeout(() => this.mostrarSugerenciasDelito.set(false), 200);
  }

  /**
   * Cierra la actuación (A → C) y, si el despachador lo pidió, encadena el
   * cierre del evento.
   */
  confirmarCierreActuacion(): void {
    const act = this.actuacionACerrar();
    if (!act || this.cerrandoActuacion()) return;
    if (!this.cierreCodsSeleccionados.length) {
      this.errorCierreActuacion.set('Agregue al menos un código de cierre.');
      return;
    }
    if (this.cerrarEventoAlAtender() === null) {
      this.errorCierreActuacion.set('Indique si desea cerrar también el evento.');
      return;
    }

    this.cerrandoActuacion.set(true);
    this.errorCierreActuacion.set('');

    const req: DtoCierreActuacionRequest = {
      estado: 'C',
      observacionCierre: this.cierreObservacion.trim() || undefined,
      codigosCierre:     this.cierreCodsSeleccionados,
      actividadCodigo:   this.cierreActividadSelec()?.codigo,
      actividadTipo:     this.cierreClasifActividad() || undefined,
      actividadDesc:     this.cierreActividadSelec()?.descripcion,
      delitoArticulo:    this.cierreDelitoSelec()?.articulo,
      delitoDesc:        this.cierreDelitoSelec()?.descripcion,
    };

    this.actuacionSvc.cerrarActuacion(act.id, req).subscribe({
      next: () => {
        this.cerrandoActuacion.set(false);
        this.modalCierreActuacion.set(false);
        this.actuacionACerrar.set(null);

        const d = this.detalle();
        if (this.cerrarEventoAlAtender() && d) {
          this.cerrarEventoTrasAtender(d.id, req);
        } else {
          this.recargarActuaciones();
          this.recargarRecursos();
          this.recargarBandeja.emit();
        }
      },
      error: e => {
        this.cerrandoActuacion.set(false);
        this.errorCierreActuacion.set(e.error?.message ?? 'Error al cerrar la actuación.');
      }
    });
  }

  /**
   * Si esta era la última actuación abierta, el backend ya cerró el evento por
   * su cuenta antes de que llegue esta petición. Aun así hace falta: es la
   * única que persiste los códigos de cierre y la observación.
   */
  private cerrarEventoTrasAtender(pedidoId: string, req: DtoCierreActuacionRequest): void {
    this.eventoSvc.cerrar(pedidoId, {
      estado: 'C',
      observacionCierre: req.observacionCierre?.trim() || 'Cerrado al atender.',
      codigosCierre: req.codigosCierre.map((c, i) => ({
        orden: i + 1,
        codigoCierre: c.codigoCierre,
        tipoCodigo: c.tipoCodigo ?? 'CIERRE',
        descripcionLibre: c.descripcionLibre || undefined
      }))
    }, this.canalCodigo(), this.fuerzaId()).subscribe({
      next: r => {
        if (r.success) {
          this.toast.success('Evento cerrado', r.message || 'El evento se cerró correctamente.');
          this.volverLista();
        } else {
          this.toast.warning('Cerrar evento', r.message || 'No se pudo cerrar el evento.');
          this.recargarBandeja.emit();
        }
      },
      error: e => {
        // Sin este aviso el despachador nunca se enteraba de que el evento
        // quedó cerrado pero SIN los códigos ni la observación que acababa de
        // escribir, porque esta petición es la única que los persiste.
        this.toast.error('Cerrar evento', e.error?.message
          ?? 'La actuación se cerró, pero no se pudo cerrar el evento. Ciérrelo a mano.');
        this.recargarBandeja.emit();
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Polling de actuaciones
  // ══════════════════════════════════════════════════════════════════════════

  private iniciarPollingActuaciones(eventoId: string): void {
    this.detenerPollingActuaciones();
    this.actuacionesSub = interval(8_000).pipe(
      startWith(0),
      switchMap(() => {
        this.cargandoActuaciones.set(true);
        return this.actuacionSvc.getActuacionesEvento(eventoId);
      })
    ).subscribe({
      next: r => {
        this.actuaciones.set(r.data ?? []);
        this.cargandoActuaciones.set(false);
        this.errorActuaciones.set('');
      },
      error: () => {
        this.cargandoActuaciones.set(false);
        this.errorActuaciones.set('No se pudieron cargar las actuaciones.');
      }
    });
  }

  private detenerPollingActuaciones(): void {
    this.actuacionesSub?.unsubscribe();
    this.actuacionesSub = null;
  }

  private recargarActuaciones(): void {
    const d = this.detalle();
    if (!d) return;
    this.actuacionSvc.getActuacionesEvento(d.id).subscribe({
      next: r  => this.actuaciones.set(r.data ?? []),
      error: () => { /* el ciclo de 8 s lo reintenta */ }
    });
  }

  etiquetaEstadoActuacion(estado: string): string {
    return this.actuacionSvc.etiquetaEstado(estado as never);
  }

  varianteEstadoActuacion(estado: string): 'warning' | 'info' | 'success' | 'danger' | 'secondary' {
    return ({ P: 'warning', D: 'info', A: 'info', C: 'success', V: 'danger' } as const)[estado as 'P']
           ?? 'secondary';
  }

  /** El medio ya está asignado a ESTE evento. */
  medioAsignadoAEsteEvento(r: DtoMedioDisponibleResumen): boolean {
    const d = this.detalle();
    if (!d || !r.eventoId) return false;
    return String(r.eventoId) === String(d.id);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Nombres y formatos
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * El identificador oficial del cuadrante (patrullaDesc), no el código
   * interno, que al despachador no le dice nada.
   */
  nombrePatrulla(r: { patrullaDesc?: string; patrullaCodigo?: string }): string {
    return r.patrullaDesc?.trim() ? r.patrullaDesc : (r.patrullaCodigo ?? '');
  }

  /** Número corto para la etiqueta del marcador (EMEBOGC03E08C13027 → «27»). */
  numeroCuadrante(r: { patrullaDesc?: string; patrullaCodigo?: string }): string {
    const nombre = this.nombrePatrulla(r);
    return nombre.length >= 2 ? nombre.slice(-2) : nombre;
  }

  nombreUnidad(act: { unidadDesc?: string; unidadAsignada?: string }): string {
    return act.unidadDesc?.trim() ? act.unidadDesc : (act.unidadAsignada ?? '—');
  }

  etaMin(distanciaKm: number | undefined | null, tipoMedio: number): number | null {
    return this.turnosSvc.estimarEtaMin(distanciaKm, tipoMedio as never);
  }

  formatDistancia(km?: number): string { return this.turnosSvc.formatearDistancia(km); }
  iconoTipo(tipo: number): string      { return this.turnosSvc.iconoTipoMedio(tipo as never); }
  etiquetaEstadoMedio(estado: number): string { return this.turnosSvc.etiquetaEstadoMedio(estado as never); }

  etiquetaTipoMedio(tipo: number): string {
    return ({
      20: 'Motocicleta', 21: 'Bicicleta', 22: 'Patrulla', 23: 'Ambulancia',
      24: 'Camión de bomberos', 25: 'Helicóptero', 26: 'Lancha',
    } as Record<number, string>)[tipo] ?? `Tipo ${tipo}`;
  }

  varianteEstadoMedio(estado: number): 'success' | 'danger' | 'warning' | 'info' | 'secondary' {
    return ({ 27: 'success', 28: 'danger', 29: 'secondary', 30: 'warning', 31: 'info' } as const)[estado as 27]
           ?? 'secondary';
  }

  /** Segundos como m:ss — duración de una grabación. */
  formatDuracion(segundos: number): string {
    const m = Math.floor(segundos / 60);
    const s = segundos % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }



  private haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
            + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private escaparHtml(valor: unknown): string {
    if (!valor) return '';
    return String(valor)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Mapa
  // ══════════════════════════════════════════════════════════════════════════

  private montarMapa(el: HTMLDivElement, d: DtoPedidoDetalle): void {
    const lat = parseFloat(d.latitudCaso  || '0');
    const lng = parseFloat(d.longitudCaso || '0');
    const hayCoords = lat !== 0 && lng !== 0;
    const centro: [number, number] = hayCoords ? [lat, lng] : [4.711, -74.0721];

    try {
      this.mapa = L.map(el, { zoomControl: true }).setView(centro, hayCoords ? 15 : 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '© OpenStreetMap'
      }).addTo(this.mapa);

      if (hayCoords) {
        this.marcadorIncidente = L.marker([lat, lng])
          .addTo(this.mapa)
          .bindPopup(`<b>${escaparHtml(d.direCaso)}</b>`)
          .openPopup();
      }
      this.pintarRecursosEnMapa();
    } catch (e) {
      console.warn('[Eventos] No se pudo inicializar el mapa:', e);
      this.toast.error('Mapa', 'No se pudo cargar el mapa. Recargue la página.');
    }
  }

  private destruirMapa(): void {
    // El marcador y el recorrido del ciudadano son capas de este mapa: al
    // destruirlo sus referencias quedan apuntando a capas ya removidas.
    this.ciudadanoMarker = null;
    this.ciudadanoTrail  = null;
    this.marcadorIncidente = null;
    for (const m of this.marcadoresRecurso.values()) detenerAnimacionMarcador(m);
    this.marcadoresRecurso.clear();
    if (this.mapa) {
      try { this.mapa.remove(); } catch { /* ya removido */ }
      this.mapa = null;
    }
  }

  private static readonly COLOR_ESTADO_RECURSO: Record<number, string> = {
    27: '#22c55e', 28: '#ef4444', 29: '#6b7280', 30: '#f59e0b', 31: '#3b82f6'
  };

  private iconoRecurso(r: DtoMedioDisponibleResumen): L.DivIcon {
    const color = EventoDetalleComponent.COLOR_ESTADO_RECURSO[r.estado] ?? '#94a3b8';
    return L.divIcon({
      className: '',
      html: `<div class="ev-pin" style="background:${color}">
               <i class="${escaparHtml(this.iconoTipo(r.tipoMedio))}"></i>
             </div>
             <div class="ev-pin__label">${escaparHtml(this.numeroCuadrante(r))}</div>`,
      iconSize:    [34, 56],
      iconAnchor:  [17, 17],
      popupAnchor: [0, -20],
    });
  }

  /** Popup del marcador, con asignación rápida desde el propio mapa. */
  private popupRecurso(r: DtoMedioDisponibleResumen): HTMLElement {
    const caja = document.createElement('div');
    caja.className = 'ev-popup';

    const linea = (clase: string, texto: string) => {
      const el = document.createElement('div');
      el.className = clase;
      el.textContent = texto;
      caja.appendChild(el);
    };

    linea('ev-popup__titulo', this.nombrePatrulla(r));
    linea('ev-popup__estado', r.estadoDesc);
    linea('ev-popup__personal', r.personalResumen || 'Sin personal asignado');
    if (r.distanciaKm != null) {
      linea('ev-popup__dist', `${this.turnosSvc.formatearDistancia(r.distanciaKm)} al incidente`);
    }

    const asignado = this.medioAsignadoAEsteEvento(r);
    const puede = r.estado === 27 && !r.eventoId && !asignado && this.detalle()?.estado !== 'C';

    if (asignado) {
      linea('ev-popup__badge', 'Asignado a este evento');
    } else if (puede) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ev-popup__btn';
      btn.disabled = !!this.asignandoMedioId();
      btn.textContent = this.asignandoMedioId() === r.id ? 'Asignando…' : 'Asignar a este evento';
      btn.addEventListener('click', () => this.asignarRecursoAlEvento(r));
      caja.appendChild(btn);
    } else if (r.eventoId) {
      linea('ev-popup__badge ev-popup__badge--otro', 'Vinculado a otro caso');
    }

    return caja;
  }

  private pintarRecursosEnMapa(): void {
    const mapa = this.mapa;
    if (!mapa) return;

    const vistos = new Set<string>();
    for (const r of this.recursos()) {
      if (r.lat == null || r.lng == null) continue;
      vistos.add(r.patrullaCodigo);

      const existente = this.marcadoresRecurso.get(r.patrullaCodigo);
      if (existente) {
        // Deslizar a la nueva posición en vez de saltar: el GPS se refresca
        // cada 10-15 s y este panel además consulta cada 8 s.
        existente.setIcon(this.iconoRecurso(r));
        existente.setPopupContent(this.popupRecurso(r));
        animarMarcadorHasta(existente, r.lat, r.lng, 2500);
        continue;
      }

      const marcador = L.marker([r.lat, r.lng], { icon: this.iconoRecurso(r) })
        .addTo(mapa)
        .bindPopup(this.popupRecurso(r));
      this.marcadoresRecurso.set(r.patrullaCodigo, marcador);
    }

    for (const [codigo, marcador] of this.marcadoresRecurso.entries()) {
      if (vistos.has(codigo)) continue;
      detenerAnimacionMarcador(marcador);
      try { marcador.remove(); } catch { /* ya removido */ }
      this.marcadoresRecurso.delete(codigo);
    }
  }

  centrarEnRecurso(r: DtoMedioDisponibleResumen): void {
    if (!this.mapa || r.lat == null || r.lng == null) return;
    this.mapa.flyTo([r.lat, r.lng], 16, { duration: 0.6 });
    this.marcadoresRecurso.get(r.patrullaCodigo)?.openPopup();
  }

  centrarEnIncidente(): void {
    if (!this.mapa || !this.marcadorIncidente) return;
    this.mapa.flyTo(this.marcadorIncidente.getLatLng(), 16, { duration: 0.6 });
    this.marcadorIncidente.openPopup();
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Remitir el caso
  // ══════════════════════════════════════════════════════════════════════════

  abrirModalRemitir(): void {
    this.remitirCanalesSelec.set(new Set());
    this.remitirAgenciasSelec.set(new Set());
    this.remitirError.set('');
    this.remitirEnviando.set(false);
    this.remitirTab.set('secad');
    this.remitirMantenerCanalOrigen.set(true);
    this.remitirConfirmado = false;

    this.recepcionSvc.getCanales(this.sitioGraba()).subscribe({
      next: canales => {
        const mapa: Record<string, GrupoCanalRemitir> = {};
        for (const c of (canales ?? [])) {
          const key = c.fuerza || 'SIN FUERZA';
          mapa[key] ??= { fuerza: key, fuerzaId: c.fuerzaId, canales: [] };
          mapa[key].canales.push(c);
        }
        this.remitirCanalesGrupos.set(
          Object.values(mapa).sort((a, b) => a.fuerza.localeCompare(b.fuerza, 'es')));
      },
      error: () => this.remitirCanalesGrupos.set([])
    });

    if (this.remitirAgencias().length === 0) {
      this.agenciaSvc.getActivas().subscribe({
        next: data => this.remitirAgencias.set(data ?? []),
        error: ()   => this.remitirAgencias.set([])
      });
    }

    this.modalRemitirVisible.set(true);
  }

  cancelarRemitir(): void { this.modalRemitirVisible.set(false); }

  canalKey(c: DtoCanalRecepcion): string { return `${c.codigo}:${c.fuerzaId}`; }

  toggleRemitirCanal(c: DtoCanalRecepcion): void {
    const key = this.canalKey(c);
    this.remitirCanalesSelec.update(s => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  }

  toggleRemitirAgencia(id: string): void {
    this.remitirAgenciasSelec.update(s => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  readonly remitirTotalSelec = computed(() =>
    this.remitirTab() === 'secad' ? this.remitirCanalesSelec().size : this.remitirAgenciasSelec().size
  );

  confirmarRemitir(): void {
    const d = this.detalle();
    if (!d || this.remitirEnviando()) return;
    if (!this.remitirConfirmado) {
      this.remitirError.set('Marque la casilla de confirmación antes de remitir.');
      return;
    }
    this.remitirEnviando.set(true);
    this.remitirError.set('');

    const pedidoId   = d.id;
    const sitioGraba = d.sitioGraba ?? this.sitioGraba();
    // numeEvento es cad_eventos.id, distinto de .id, que es cad_pedidos.id.
    const eventoId   = this.evento()?.numeEvento ?? d.numeEvento ?? d.id;

    if (this.remitirTab() === 'secad') {
      this.remitirASecad(d, pedidoId, sitioGraba, eventoId);
    } else {
      void this.remitirAExternas(d, pedidoId, sitioGraba);
    }
  }

  private remitirASecad(d: DtoPedidoDetalle, pedidoId: string, sitioGraba: number, eventoId: string): void {
    const seleccion = this.remitirCanalesSelec();
    if (seleccion.size === 0) {
      this.remitirError.set('Elija al menos un canal.');
      this.remitirEnviando.set(false);
      return;
    }

    const canales: DtoCanalSeleccionado[] = [...seleccion].map(key => {
      const [codigo, fuerzaId] = key.split(':').map(Number);
      return { codigo, fuerzaId };
    });
    const removerCanalOrigen = !this.remitirMantenerCanalOrigen();

    this.recepcionSvc.remitirCanal({
      pedidoId, sitioGraba, eventoId, canales, removerCanalOrigen,
      canalOrigenCodigo:   this.canalCodigo() || undefined,
      canalOrigenFuerzaId: this.fuerzaId() || undefined,
    }).subscribe({
      next: r => {
        this.remitirEnviando.set(false);
        if (!r.success) { this.remitirError.set(r.message); return; }

        this.toast.success('Remisión SECAD', r.message);
        const nombres = [...seleccion].map(key => {
          for (const g of this.remitirCanalesGrupos()) {
            for (const c of g.canales) if (this.canalKey(c) === key) return `${g.fuerza} – ${c.descripcion}`;
          }
          return key;
        }).join(', ');
        const modo = removerCanalOrigen
          ? ' (remisión exclusiva — sale de mi canal)'
          : ' (gestión conjunta — sigue también en mi canal)';
        this.eventoSvc.createAnotacion(d.id, {
          titulo: 'Caso remitido a canal SECAD',
          anotacion: `Remitido a: ${nombres}${modo}`,
          tipoAnotacion: 'REMISION'
        }).subscribe({ next: () => { /* trazabilidad */ }, error: () => { /* no crítico */ } });

        this.cancelarRemitir();
        // Si salió de mi canal ya no tiene sentido seguir viendo su detalle.
        if (removerCanalOrigen) this.volverLista();
        else this.cargarCanalesAsignados();
      },
      error: () => {
        this.remitirEnviando.set(false);
        this.remitirError.set('Error de comunicación con el servidor.');
      }
    });
  }

  private async remitirAExternas(d: DtoPedidoDetalle, pedidoId: string, sitioGraba: number): Promise<void> {
    const seleccion = this.remitirAgenciasSelec();
    if (seleccion.size === 0) {
      this.remitirError.set('Elija al menos una agencia.');
      this.remitirEnviando.set(false);
      return;
    }

    // firstValueFrom en vez de toPromise(), que RxJS 7 deprecó y 8 elimina.
    const envios = [...seleccion].map(agenciaId =>
      firstValueFrom(this.agenciaSvc.despachar({ pedidoId, sitioGraba, agenciaId })));

    const resultados = await Promise.allSettled(envios);
    this.remitirEnviando.set(false);

    const ok = resultados.filter(r => r.status === 'fulfilled' && r.value?.success).length;
    const err = resultados.length - ok;
    if (ok)  this.toast.success('Remisión externa', `${ok} agencia(s) notificada(s).`);
    if (err) this.toast.warning('Remisión parcial', `${err} agencia(s) no se pudieron contactar.`);

    if (ok) {
      this.eventoSvc.getAnotaciones(d.id).subscribe(a =>
        this.detalle.update(x => x ? { ...x, anotaciones: a } : x));
      this.cancelarRemitir();
    }
  }

  getAgenciaIcon(tipo: string): string  { return this.agenciaSvc.getTipoIcon(tipo); }
  getAgenciaLabel(tipo: string): string { return this.agenciaSvc.getTipoLabel(tipo); }

  // ══════════════════════════════════════════════════════════════════════════
  //  Asistente de preguntas orientadoras
  // ══════════════════════════════════════════════════════════════════════════

  onAsistenteAbiertoChange(abierto: boolean): void {
    this.asistenteAbierto = abierto;
    if (abierto && this.asistenteCategorias().length === 0) this.cargarAsistenteCategorias();
  }

  private cargarAsistenteCategorias(): void {
    this.asistenteLoadingCat.set(true);
    this.asistenteSvc.getCategorias(true).subscribe({
      next: r  => { this.asistenteCategorias.set(r.data ?? []); this.asistenteLoadingCat.set(false); },
      error: () => this.asistenteLoadingCat.set(false)
    });
  }

  onAsistenteCategoriaChange(categoriaId: string): void {
    this.asistenteCategoriaSel.set(categoriaId);
    this.asistentePreguntas.set([]);
    this.asistenteRespuestas.set({});
    if (!categoriaId) return;

    this.asistenteLoadingPreg.set(true);
    this.asistenteSvc.getPreguntas(categoriaId, true).subscribe({
      next: r  => { this.asistentePreguntas.set(r.data ?? []); this.asistenteLoadingPreg.set(false); },
      error: () => this.asistenteLoadingPreg.set(false)
    });
  }

  responderAsistente(preguntaId: string, valor: string): void {
    this.asistenteRespuestas.update(r => ({ ...r, [preguntaId]: valor }));
  }

  opcionesPregunta(preg: AsistentePregunta): UiSelectOption<string>[] {
    return [
      { value: '', label: '— Elija —' },
      ...parsearOpciones(preg.opciones ?? '').map(o => ({ value: o, label: o })),
    ];
  }

  /**
   * Pasa lo respondido al formulario de anotación. En el origen los campos del
   * asistente no estaban enlazados a nada: el despachador podía contestarlos
   * todos y lo escrito se perdía sin dejar rastro en el caso.
   */
  pasarAsistenteAAnotacion(): void {
    const respuestas = this.asistenteRespuestas();
    const lineas = this.asistentePreguntas()
      .filter(p => (respuestas[p.id] ?? '').trim())
      .map(p => `${p.pregunta} ${respuestas[p.id].trim()}`);

    if (!lineas.length) {
      this.toast.warning('Asistente', 'Responda al menos una pregunta antes de pasarla a la anotación.');
      return;
    }

    const categoria = this.asistenteCategorias().find(c => c.id === this.asistenteCategoriaSel());
    this.nuevaAnotacion.update(a => ({
      ...a,
      titulo: a.titulo || (categoria ? `Asistente — ${categoria.descripcion}` : 'Asistente'),
      anotacion: a.anotacion ? `${a.anotacion}\n${lineas.join('\n')}` : lineas.join('\n'),
    }));
    this.anotacionesAbierto = true;
    this.toast.success('Asistente', 'Respuestas copiadas al formulario de anotación.');
  }

  private resetAsistente(): void {
    this.asistenteAbierto = false;
    this.asistenteCategorias.set([]);
    this.asistenteCategoriaSel.set('');
    this.asistentePreguntas.set([]);
    this.asistenteRespuestas.set({});
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Etiquetas compartidas con la bandeja
  // ══════════════════════════════════════════════════════════════════════════

  getEstadoLabel     = etiquetaEstadoEvento;
  getEstadoVariante  = varianteEstadoEvento;
  getPrioridadLabel  = etiquetaPrioridad;
  getPrioridadVariante = variantePrioridad;
  getFechaCreacionLabel = etiquetaFechaCreacion;
  readonly formatHora = formatHora;

  getSemaforoClass(item: DtoEventoListItem | DtoPedidoDetalle) {
    void this.tick();
    return semaforoDe(item, this.umbrales());
  }

  getElapsedLabel(item: DtoEventoListItem | DtoPedidoDetalle): string {
    void this.tick();
    return etiquetaTiempo(item);
  }

  get slaUmbralCritico(): number { return this.umbrales().critico; }
}
