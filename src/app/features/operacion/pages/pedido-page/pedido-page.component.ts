import {
  Component, ChangeDetectionStrategy, OnInit, OnDestroy,
  computed, inject, signal
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DatePipe } from '@angular/common';
import { Subject, forkJoin, interval, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';

import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiSectionHeaderComponent } from '../../../../shared/components/ui-section-header/ui-section-header.component';
import { UiSegmentedTabsComponent } from '../../../../shared/components/ui-segmented-tabs/ui-segmented-tabs.component';
import { UiSegmentedTabItem } from '../../../../shared/components/ui-segmented-tabs/ui-segmented-tabs.types';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiInputComponent } from '../../../../shared/components/ui-input/ui-input.component';
import { UiDateTimePickerComponent } from '../../../../shared/components/ui-date-time-picker/ui-date-time-picker.component';
import { UiSelectComponent } from '../../../../shared/components/ui-select/ui-select.component';
import { UiSearchInputComponent } from '../../../../shared/components/ui-search-input/ui-search-input.component';
import { UiBadgeComponent } from '../../../../shared/components/ui-badge/ui-badge.component';
import { UiChipComponent } from '../../../../shared/components/ui-chip/ui-chip.component';
import { UiSpinnerComponent } from '../../../../shared/components/ui-spinner/ui-spinner.component';
import { UiPaginationComponent } from '../../../../shared/components/ui-pagination/ui-pagination.component';
import { UiTableComponent } from '../../../../shared/components/ui-table/ui-table.component';
import { UiTableColumn } from '../../../../shared/interfaces/ui-table.interface';
import { AdjuntosCasoComponent } from '../../components/adjuntos-caso/adjuntos-caso.component';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';

import { ToastService } from '../../../../core/services/toast.service';
import {
  PedidoService, DtoPedidoListItem, DtoPedidoDetalle, DtoAnotacionRequest
} from '../../../../core/services/operacion/pedido.service';
import {
  EventoService, DtoEventoListItem, DtoEventoConteos
} from '../../../../core/services/operacion/evento.service';
import {
  ActuacionesService, DtoActuacionListItem, DtoActuacionUnidad
} from '../../../../core/services/operacion/actuaciones.service';
import { RecepcionService, DtoAdjunto } from '../../../../core/services/operacion/recepcion.service';
import {
  VideoLlamadaService, DtoVideoSesionResumen
} from '../../../../core/services/operacion/video-llamada.service';

type VistaCad      = 'dashboard' | 'incidentes' | 'kpis';
type SemaforoColor = 'semaforo-verde' | 'semaforo-amarillo' | 'semaforo-rojo';

// ─── Tipos locales ───────────────────────────────────────────────────────────

interface DashStat {
  total:      number;
  activos:    number;
  pendientes: number;
  cerrados:   number;
  flash:      number;
  inmediata:  number;
  rutina:     number;
  criticos:   number;
  porOrigen:  Record<string, number>;
}

/** Una fase del ciclo operativo de una actuación (Asignado → Despacho → Sitio → Cierre). */
interface ActuacionFase {
  label:     string;
  icono:     string;
  timestamp: string | null;
  /** Tiempo desde la fase anterior; null cuando la fase todavía no se cumplió. */
  deltaMin:  number | null;
  cumplida:  boolean;
}

/** Datos operativos completos de una actuación para el bloque del timeline. */
interface ActuacionBloque {
  actId:         string;
  canal:         string;
  unidad:        string;
  placa:         string;
  despachador:   string;
  fases:         ActuacionFase[];
  totalMin:      number | null;
  estado:        string;
  caliPedido:    string;
  totalUnidades: number;
}

interface TimelineItem {
  /** Clave estable para el @for: el índice reordenaba las tarjetas al refrescar. */
  key:           string;
  timestamp:     string | null;
  tipo:          'CREACION' | 'ANOTACION' | 'CIERRE' | 'SUPERVISION' | 'ACTUACION';
  titulo:        string;
  descripcion:   string;
  actor:         string;
  icono:         string;
  colorClass:    string;
  tipoAnotacion?: string;
  /** Presente solo cuando tipo === 'ACTUACION' — reemplaza la tarjeta genérica. */
  actuacion?:    ActuacionBloque;
}

interface KpiItem {
  label:      string;
  valor:      number | string;
  unidad:     string;
  meta:       number;
  /**
   * Cómo se lee la meta. El origen anteponía «<» a todas menos a los
   * porcentajes, y el indicador de críticos acababa pidiendo «menos de 0»,
   * que no se puede cumplir ni con cero críticos.
   */
  metaTexto:  string;
  cumple:     boolean;
  prioridad?: string;
  icon:       string;
}

interface OperadorStat {
  username:       string;
  total:          number;
  activos:        number;
  cerrados:       number;
  tiempoPromedio: number;
  criticos:       number;
}

@Component({
  selector: 'app-pedido-page',
  standalone: true,
  imports: [
    FormsModule,
    DatePipe,
    UiPageHeaderComponent,
    UiSectionHeaderComponent,
    UiSegmentedTabsComponent,
    UiButtonComponent,
    UiInputComponent,
    UiSelectComponent,
    UiSearchInputComponent,
    UiBadgeComponent,
    UiChipComponent,
    UiSpinnerComponent,
    UiPaginationComponent,
    UiTableComponent,
    AdjuntosCasoComponent,
    UiDateTimePickerComponent,
  ],
  templateUrl: './pedido-page.component.html',
  styleUrls: ['./pedido-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PedidoPageComponent implements OnInit, OnDestroy {

  // ── Vista ─────────────────────────────────────────────────────────────────
  readonly vista = signal<VistaCad>('dashboard');

  readonly pestanas: UiSegmentedTabItem[] = [
    { id: 'dashboard',  label: 'Panel',      icon: 'fa-solid fa-chart-line',  description: 'Estado de la cola' },
    { id: 'incidentes', label: 'Incidentes', icon: 'fa-solid fa-list-check',  description: 'Lista y trazabilidad' },
    { id: 'kpis',       label: 'Indicadores',icon: 'fa-solid fa-chart-bar',   description: 'Tiempos y operadores' },
  ];

  // ── UI ────────────────────────────────────────────────────────────────────
  readonly loading = signal(false);
  /** Contador mudo: obliga a recalcular el semáforo cada minuto sin recargar datos. */
  readonly tick    = signal(0);

  // ── Filtros (locales, sobre la página cargada) ───────────────────────────
  readonly filtroEstado    = signal('');
  readonly filtroTexto     = signal('');
  readonly filtroPrioridad = signal('');
  readonly filtroTurno     = signal(0);
  /** Rango de fechas (YYYY-MM-DD) — filtro de SERVIDOR, no local. */
  readonly filtroFechaDesde = signal('');
  readonly filtroFechaHasta = signal('');

  readonly opcionesEstado: UiSelectOption<string>[] = [
    { value: '',  label: 'Todos los estados' },
    { value: 'A', label: 'Activos' },
    { value: 'P', label: 'Pendientes' },
    { value: 'E', label: 'En proceso' },
    { value: 'T', label: 'Seguimiento' },
    { value: 'R', label: 'Para revisión' },
    { value: 'C', label: 'Cerrados' },
  ];

  readonly opcionesPrioridad: UiSelectOption<string>[] = [
    { value: '',          label: 'Toda prioridad' },
    { value: 'FLASH',     label: 'Flash' },
    { value: 'INMEDIATA', label: 'Inmediata' },
    { value: 'RUTINA',    label: 'Rutina' },
  ];

  readonly turnosVigilancia = [
    { value: 0, label: 'Todos los turnos',            icono: 'fa-clock',     color: '#64748b' },
    { value: 1, label: 'Primer turno (22:00–05:59)',  icono: 'fa-moon',      color: '#dc2626' },
    { value: 2, label: 'Segundo turno (06:00–13:59)', icono: 'fa-sun',       color: '#2563eb' },
    { value: 3, label: 'Tercer turno (14:00–21:59)',  icono: 'fa-cloud-sun', color: '#7c3aed' },
  ];

  readonly opcionesTurno: UiSelectOption<string>[] =
    this.turnosVigilancia.map(t => ({ value: String(t.value), label: t.label }));

  // ── Paginación (servidor) ─────────────────────────────────────────────────
  // cad_pedidos puede tener millones de filas: la lista trae una página a la vez.
  readonly paginaActual = signal(1);
  readonly pageSize     = signal(150);
  readonly totalPedidos = signal(0);

  // ── Datos ─────────────────────────────────────────────────────────────────
  readonly listaPedidos = signal<DtoPedidoListItem[]>([]);
  /**
   * Mapa de enriquecimiento cad_pedidos.id → evento. Aporta prioridad, origen,
   * numeEvento y descPedido, que el listado de /Pedido no devuelve.
   */
  private eventoMap: Record<string, DtoEventoListItem> = {};
  readonly selectedId     = signal<string | null>(null);
  readonly detalle        = signal<DtoPedidoDetalle | null>(null);
  readonly actuaciones    = signal<DtoActuacionListItem[]>([]);
  readonly adjuntos       = signal<DtoAdjunto[]>([]);
  readonly videoSesiones  = signal<DtoVideoSesionResumen[]>([]);
  readonly loadingDetalle = signal(false);
  readonly timeline       = signal<TimelineItem[]>([]);
  readonly lastRefresh    = signal<Date>(new Date());

  // ── Panel ─────────────────────────────────────────────────────────────────
  readonly stats   = signal<DashStat>(this.emptyStats());
  readonly conteos = signal<DtoEventoConteos | null>(null);

  // ── Indicadores ───────────────────────────────────────────────────────────
  readonly kpis       = signal<KpiItem[]>([]);
  readonly operadores = signal<OperadorStat[]>([]);

  readonly columnasOperador: UiTableColumn<OperadorStat>[] = [
    { key: 'username',       label: 'Operador',   sortable: true, fontWeight: 700 },
    { key: 'total',          label: 'Total',      sortable: true, align: 'center' },
    { key: 'activos',        label: 'Activos',    sortable: true, align: 'center' },
    { key: 'cerrados',       label: 'Cerrados',   sortable: true, align: 'center' },
    {
      key: 'tiempoPromedio', label: 'T. prom. activos', sortable: true, align: 'center',
      value: op => op.activos > 0 ? `${op.tiempoPromedio} min` : '—',
    },
    {
      key: 'criticos',       label: 'Críticos',   sortable: true, align: 'center',
      badge: op => op.criticos > 0
        ? { text: String(op.criticos), variant: 'danger', icon: 'fa-solid fa-triangle-exclamation' }
        : { text: 'Ninguno', variant: 'success' },
    },
  ];

  // ── Anotación supervisora ─────────────────────────────────────────────────
  anotacionForm: DtoAnotacionRequest = this.emptyAnotacion();
  readonly savingAnotacion = signal(false);
  readonly showAnotForm    = signal(false);

  // ── Equipo de actuaciones (carga bajo demanda) ────────────────────────────
  readonly equipoExpandido = signal<Record<string, boolean>>({});
  readonly equipoDetalle   = signal<Record<string, DtoActuacionUnidad[]>>({});
  readonly equipoCargando  = signal<Record<string, boolean>>({});

  private readonly destroy$ = new Subject<void>();

  private readonly pedidoService      = inject(PedidoService);
  private readonly eventoService      = inject(EventoService);
  private readonly actuacionesService = inject(ActuacionesService);
  private readonly recepcionSvc       = inject(RecepcionService);
  private readonly videoSvc           = inject(VideoLlamadaService);
  private readonly toast              = inject(ToastService);
  private readonly route              = inject(ActivatedRoute);

  // ══════════════════════════════════════════════════════════════════════════
  //  Ciclo de vida
  // ══════════════════════════════════════════════════════════════════════════

  ngOnInit(): void {
    // Enlace directo desde otros módulos (ej. Mapa de incidentes: ?id=...).
    // El origen guardaba el id y esperaba a que el incidente apareciera en la
    // página cargada; si era antiguo, no aparecía nunca y el enlace no hacía
    // nada, sin decirlo. Ahora se abre por id contra el backend.
    this.route.queryParamMap
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        const id = params.get('id');
        if (id) this.abrirIncidente(id);
      });

    this.cargarLista();

    // Refresco de la lista cada 30 s. Se salta el fetch con la pestaña oculta
    // para no gastar ancho de banda ni carga del backend sin nadie mirando.
    interval(30_000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => { if (!document.hidden) this.cargarLista(true); });

    // Cada minuto se recalcula el semáforo y con él stats y KPIs.
    interval(60_000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => { this.tick.update(t => t + 1); this.computarStats(); this.computarKpis(); });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Carga de datos
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Carga UNA página de pedidos y, en paralelo, los eventos del módulo de
   * despacho, que enriquecen la lista con prioridad, origen, numeEvento y
   * descPedido que el endpoint /Pedido no devuelve en el listado.
   */
  cargarLista(silencioso = false): void {
    if (!silencioso) this.loading.set(true);

    forkJoin({
      pedidos: this.pedidoService.getList(
        undefined, undefined,
        this.filtroFechaDesde() || undefined, this.filtroFechaHasta() || undefined,
        this.paginaActual(), this.pageSize()
      ),
      eventos: this.eventoService.getEventos()
        .pipe(catchError(() => of([] as DtoEventoListItem[]))),
      conteos: this.eventoService.getConteos()
        .pipe(catchError(() => of(null as DtoEventoConteos | null)))
    })
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: ({ pedidos, eventos, conteos }) => {
        // Todo el armado va en try/finally: una excepción aquí NO llega al
        // callback de error de RxJS, así que dejaría el loading en true para
        // siempre. En un puesto de operación una pantalla congelada sin
        // explicación es lo peor que puede pasar.
        try {
          this.conteos.set(conteos);

          this.eventoMap = {};
          for (const ev of (Array.isArray(eventos) ? eventos : [])) {
            this.eventoMap[String(ev.id)] = ev;
          }

          const items = Array.isArray(pedidos?.items) ? pedidos.items : [];
          const lista = items.map(p => this.normalizarListItem(p));
          this.listaPedidos.set(lista);
          this.totalPedidos.set(pedidos?.total ?? lista.length);
          this.lastRefresh.set(new Date());
          this.computarStats();
          this.computarKpis();
        } catch (e) {
          console.error('[Pedido] Error procesando la respuesta del listado:', e);
          if (!silencioso) {
            this.toast.error('Seguimiento CAD', 'Los datos llegaron en un formato inesperado.');
          }
        } finally {
          this.loading.set(false);
        }
      },
      error: () => {
        this.loading.set(false);
        if (!silencioso) {
          this.toast.error('Seguimiento CAD', 'No se pudo cargar la lista de incidentes.');
        }
      }
    });
  }

  irAPagina(pagina: number): void {
    const total = this.totalPaginas();
    if (pagina < 1 || pagina > total || pagina === this.paginaActual()) return;
    this.paginaActual.set(pagina);
    this.cargarLista();
  }

  aplicarFiltroFecha(): void {
    this.paginaActual.set(1);
    this.cargarLista();
  }

  limpiarFiltroFecha(): void {
    this.filtroFechaDesde.set('');
    this.filtroFechaHasta.set('');
    this.paginaActual.set(1);
    this.cargarLista();
  }

  readonly totalPaginas = computed(() =>
    Math.max(1, Math.ceil(this.totalPedidos() / this.pageSize()))
  );

  // ══════════════════════════════════════════════════════════════════════════
  //  Detalle de un incidente
  // ══════════════════════════════════════════════════════════════════════════

  seleccionarIncidente(item: DtoPedidoListItem): void {
    this.abrirIncidente(item.id, item);
  }

  /**
   * Abre el detalle por id. El listItem es opcional: cuando viene de la lista
   * aporta numeEvento, prioridad y origen del eventoMap; cuando viene de un
   * enlace directo, esos campos salen del propio detalle.
   */
  abrirIncidente(id: string, listItem?: DtoPedidoListItem): void {
    if (this.selectedId() === id && this.detalle()) return;
    this.selectedId.set(id);
    this.loadingDetalle.set(true);
    this.detalle.set(null);
    this.timeline.set([]);
    this.actuaciones.set([]);
    this.adjuntos.set([]);
    this.videoSesiones.set([]);
    this.showAnotForm.set(false);
    this.equipoExpandido.set({});
    this.equipoDetalle.set({});
    this.equipoCargando.set({});
    this.vista.set('incidentes');

    forkJoin({
      detalle: this.pedidoService.getById(id),
      // El backend filtra cad_actuaciones por pedido_id (= cad_pedidos.id),
      // NO por evento_id: por eso se pasa el id del pedido.
      actsResp: this.actuacionesService.getActuacionesEvento(id)
        .pipe(catchError(() => of({ success: true, data: [] as DtoActuacionListItem[] })))
    })
    // Sin takeUntil, salir de la pantalla con la petición en vuelo seguía
    // ejecutando el callback y escribiendo señales de un componente destruido.
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: ({ detalle, actsResp }) => {
        const normalizado = this.normalizarDetalle(detalle, listItem ?? null);
        const actuaciones = actsResp.data ?? [];
        this.detalle.set(normalizado);
        this.actuaciones.set(actuaciones);
        this.loadingDetalle.set(false);
        this.buildTimeline(normalizado, actuaciones);

        this.recepcionSvc.getAdjuntos(id)
          .pipe(takeUntil(this.destroy$), catchError(() => of({ success: false, data: [] as DtoAdjunto[] })))
          .subscribe({ next: r => { if (r.success) this.adjuntos.set(r.data); } });

        // Trazabilidad de videollamadas: en un caso cerrado esto es todo lo que
        // queda de la llamada. Un fallo aquí no debe tumbar el detalle — la
        // mayoría de casos ni siquiera tuvo videollamada.
        this.videoSvc.getSesionesPorPedido(id)
          .pipe(takeUntil(this.destroy$), catchError(() => of([] as DtoVideoSesionResumen[])))
          .subscribe({ next: r => this.videoSesiones.set(Array.isArray(r) ? r : []) });
      },
      error: () => {
        this.loadingDetalle.set(false);
        this.selectedId.set(null);
        this.toast.error('Seguimiento CAD', 'No se pudo cargar el detalle del incidente.');
      }
    });
  }

  volverALista(): void {
    this.selectedId.set(null);
    this.detalle.set(null);
    this.timeline.set([]);
    this.actuaciones.set([]);
    this.adjuntos.set([]);
    this.videoSesiones.set([]);
    this.showAnotForm.set(false);
    this.equipoExpandido.set({});
    this.equipoDetalle.set({});
    this.equipoCargando.set({});
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Trazabilidad — historia del incidente
  // ══════════════════════════════════════════════════════════════════════════

  buildTimeline(d: DtoPedidoDetalle, actuaciones: DtoActuacionListItem[] = []): void {
    const items: TimelineItem[] = [];

    // ── 1. Creación ────────────────────────────────────────────────────────
    const codiDesc1 = d.codiPedido
      ? `${d.codiPedido}${d.descPedido ? ' — ' + d.descPedido : ''}` : null;
    const codiDesc2 = d.codiPedido2
      ? `${d.codiPedido2}${d.descPedido2 ? ' — ' + d.descPedido2 : ''}` : null;

    items.push({
      key:       'creacion',
      timestamp: d.fechaCreacion,
      tipo:      'CREACION',
      titulo:    'Incidente creado',
      descripcion: [
        codiDesc1   ? `Código: ${codiDesc1}` : null,
        codiDesc2   ? `/ ${codiDesc2}`       : null,
        d.direCaso  ? `Dir: ${d.direCaso}`   : null,
        d.prioridad ? `Prioridad: ${this.getPrioridadLabel(d.prioridad)}` : null,
        d.origen    ? `Canal: ${this.getOrigenLabel(d.origen)}`           : null,
      ].filter(Boolean).join(' · '),
      actor:      d.usernameCreacion || '—',
      icono:      'fa-solid fa-circle-plus',
      colorClass: 'tl-creacion',
    });

    // ── 2. Actuaciones — bloque por recurso despachado ─────────────────────
    for (const act of actuaciones) {
      const canal    = [act.fuerzaDesc, act.canalDesc].filter(Boolean).join(' / ');
      const despacha = act.despachadorUsuario ?? '';

      const tAsig     = this.diffMin(act.fechaCreacion, act.fechaDespacho);
      const tTransito = this.diffMin(act.fechaDespacho ?? act.fechaCreacion, act.fechaLlegada);
      const tSitio    = this.diffMin(act.fechaLlegada ?? act.fechaDespacho ?? act.fechaCreacion, act.fechaCierre);
      const tTotal    = this.diffMin(act.fechaCreacion, act.fechaCierre);

      const fases: ActuacionFase[] = [
        { label: 'Asignado',  icono: 'fa-solid fa-hand-point-right', timestamp: act.fechaCreacion ?? null, deltaMin: null,                                  cumplida: true },
        { label: 'En camino', icono: 'fa-solid fa-truck-fast',       timestamp: act.fechaDespacho ?? null, deltaMin: act.fechaDespacho ? tAsig     : null,  cumplida: !!act.fechaDespacho },
        { label: 'En sitio',  icono: 'fa-solid fa-location-dot',     timestamp: act.fechaLlegada  ?? null, deltaMin: act.fechaLlegada  ? tTransito : null,  cumplida: !!act.fechaLlegada },
        {
          label:     act.estado === 'V' ? 'Anulado' : 'Cerrado',
          icono:     act.estado === 'V' ? 'fa-solid fa-circle-xmark' : 'fa-solid fa-flag-checkered',
          timestamp: act.fechaCierre ?? null,
          deltaMin:  act.fechaCierre ? tSitio : null,
          cumplida:  !!act.fechaCierre,
        },
      ];

      items.push({
        key:         'act-' + act.id,
        timestamp:   act.fechaCreacion ?? null,
        tipo:        'ACTUACION',
        titulo:      canal || 'Recurso despachado',
        descripcion: '',
        actor:       despacha || '—',
        icono:       'fa-solid fa-shield-halved',
        colorClass:  act.estado === 'V' ? 'tl-general' : 'tl-despacho',
        actuacion: {
          actId:         String(act.id),
          canal,
          unidad:        act.unidadAsignada ?? '',
          placa:         act.placaUnidad    ?? '',
          despachador:   despacha,
          fases,
          totalMin:      act.fechaCierre ? tTotal : null,
          estado:        act.estado,
          caliPedido:    act.caliPedido ?? '',
          totalUnidades: act.totalUnidades ?? 1,
        }
      });
    }

    // ── 3. Anotaciones tipificadas ─────────────────────────────────────────
    const tipoMap: Record<string, { icon: string; clase: string }> = {
      OPERATIVA:        { icon: 'fa-solid fa-shield-halved',        clase: 'tl-operativa'   },
      PREVENTIVA:       { icon: 'fa-solid fa-triangle-exclamation', clase: 'tl-preventiva'  },
      DESPACHO:         { icon: 'fa-solid fa-paper-plane',          clase: 'tl-despacho'    },
      NOVEDAD_PERSONAL: { icon: 'fa-solid fa-user-shield',          clase: 'tl-novedad'     },
      CIERRE:           { icon: 'fa-solid fa-flag-checkered',       clase: 'tl-cierre'      },
      SUPERVISION:      { icon: 'fa-solid fa-eye',                  clase: 'tl-supervision' },
      GENERAL:          { icon: 'fa-solid fa-comment',              clase: 'tl-general'     },
    };

    for (const a of (d.anotaciones ?? [])) {
      const meta = tipoMap[(a.tipoAnotacion ?? '').toUpperCase()] ?? tipoMap['GENERAL'];
      const etiquetaTipo = this.getLabelTipoAnotacion(a.tipoAnotacion);
      const titulo = a.titulo?.trim() || etiquetaTipo;
      items.push({
        key:         'anot-' + a.id,
        timestamp:   a.fechaCreacion,
        tipo:        a.tipoAnotacion === 'CIERRE'      ? 'CIERRE'
                   : a.tipoAnotacion === 'SUPERVISION' ? 'SUPERVISION' : 'ANOTACION',
        titulo,
        descripcion: a.anotacion,
        actor:       a.usernameCreacion || '—',
        icono:       meta.icon,
        colorClass:  meta.clase,
        // El origen pintaba aquí el valor crudo del backend (NOVEDAD_PERSONAL).
        // Además, sin título propio la anotación acababa mostrando la misma
        // frase dos veces seguidas, como título y como distintivo.
        tipoAnotacion: titulo === etiquetaTipo ? undefined : etiquetaTipo,
      });
    }

    // ── 4. Cierre del evento ───────────────────────────────────────────────
    // d.estado es cad_pedidos.estado (dominio A/P/E/T/R/C, sin 'V'); la
    // anulación real vive en cad_eventos.estado (d.eventoEstado).
    if (d.estado === 'C' && d.fechaCierre) {
      const codigosStr = d.codigosCierre?.length
        ? d.codigosCierre
            .map(c => c.descripcionLibre ? `${c.codigoCierre} — ${c.descripcionLibre}` : c.codigoCierre)
            .join(' · ')
        : null;

      const partes: string[] = [];
      if (d.canalDescripcion || d.fuerzaDescripcion) {
        partes.push(`Canal: ${[d.fuerzaDescripcion, d.canalDescripcion].filter(Boolean).join(' / ')}`);
      }
      if (codigosStr)          partes.push(`Códigos: ${codigosStr}`);
      if (d.observacionCierre) partes.push(`Obs: ${d.observacionCierre}`);

      items.push({
        key:         'cierre',
        timestamp:   d.fechaCierre,
        tipo:        'CIERRE',
        titulo:      d.eventoEstado === 'V' ? 'Evento anulado' : 'Evento cerrado',
        descripcion: partes.join(' · '),
        actor:       d.usuarioCierre || d.usernameCreacion || '—',
        icono:       d.eventoEstado === 'V' ? 'fa-solid fa-circle-xmark' : 'fa-solid fa-flag-checkered',
        colorClass:  'tl-cierre',
      });
    }

    items.sort((a, b) => {
      if (!a.timestamp) return -1;
      if (!b.timestamp) return  1;
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });

    this.timeline.set(items);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Anotación supervisora (Jefe de Turno)
  // ══════════════════════════════════════════════════════════════════════════

  guardarAnotacion(): void {
    const detalle = this.detalle();
    if (!detalle || !this.anotacionForm.anotacion?.trim()) {
      this.toast.warning('Anotación', 'El texto de la observación es requerido.');
      return;
    }
    this.savingAnotacion.set(true);
    this.anotacionForm.tipoAnotacion = 'SUPERVISION';

    this.pedidoService.createAnotacion(detalle.id, this.anotacionForm)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: resp => {
          this.savingAnotacion.set(false);
          if (resp.success) {
            this.toast.success('Supervisión', resp.message || 'Observación registrada en la trazabilidad.');
            this.anotacionForm = this.emptyAnotacion();
            this.showAnotForm.set(false);
            this.refreshDetalle(detalle.id);
          } else {
            this.toast.warning('Anotación', resp.message);
          }
        },
        error: err => {
          this.savingAnotacion.set(false);
          this.toast.error('Anotación', err?.error?.detail ?? 'Error al registrar la observación.');
        }
      });
  }

  private refreshDetalle(pedidoId: string): void {
    const listItem = this.listaPedidos().find(p => p.id === pedidoId) ?? null;
    forkJoin({
      detalle: this.pedidoService.getById(pedidoId),
      actsResp: this.actuacionesService.getActuacionesEvento(pedidoId)
        .pipe(catchError(() => of({ success: true, data: [] as DtoActuacionListItem[] })))
    })
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: ({ detalle, actsResp }) => {
        const normalizado = this.normalizarDetalle(detalle, listItem);
        const actuaciones = actsResp.data ?? [];
        this.detalle.set(normalizado);
        this.actuaciones.set(actuaciones);
        this.buildTimeline(normalizado, actuaciones);
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Estadísticas del panel
  // ══════════════════════════════════════════════════════════════════════════

  computarStats(): void {
    const s = this.emptyStats();
    const lista = this.listaPedidos();
    s.total = lista.length;

    for (const p of lista) {
      if      (p.estado === 'A') s.activos++;
      else if (p.estado === 'P') s.pendientes++;
      else if (p.estado === 'C') s.cerrados++;

      const prio = this.normPrio(p);
      if      (prio === 'FLASH')     s.flash++;
      else if (prio === 'INMEDIATA') s.inmediata++;
      else if (prio === 'RUTINA')    s.rutina++;

      const origen = p.origen ?? 'MANUAL';
      s.porOrigen[origen] = (s.porOrigen[origen] ?? 0) + 1;

      if (p.estado !== 'C' && this.getSemaforoClass(p) === 'semaforo-rojo') s.criticos++;
    }

    this.stats.set(s);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Indicadores
  // ══════════════════════════════════════════════════════════════════════════

  computarKpis(): void {
    const activos = this.listaPedidos().filter(p => p.estado !== 'C');

    const tFlash  = activos.filter(p => this.normPrio(p) === 'FLASH')    .map(p => this.getMinutos(p));
    const tInmd   = activos.filter(p => this.normPrio(p) === 'INMEDIATA').map(p => this.getMinutos(p));
    const tRutina = activos.filter(p => this.normPrio(p) === 'RUTINA')   .map(p => this.getMinutos(p));

    const avg = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

    const avgFlash  = avg(tFlash);
    const avgInmd   = avg(tInmd);
    const avgRutina = avg(tRutina);
    const stats     = this.stats();
    const tasaRes   = stats.total > 0 ? Math.round((stats.cerrados / stats.total) * 100) : 0;

    this.kpis.set([
      { label: 'Tiempo promedio de los activos Flash',     valor: avgFlash,  unidad: ' min', meta: 20, metaTexto: 'menos de 20 min', cumple: tFlash.length  === 0 || avgFlash  < 20, prioridad: 'flash',     icon: 'fa-bolt' },
      { label: 'Tiempo promedio de los activos Inmediata', valor: avgInmd,   unidad: ' min', meta: 45, metaTexto: 'menos de 45 min', cumple: tInmd.length   === 0 || avgInmd   < 45, prioridad: 'inmediata', icon: 'fa-gauge-high' },
      { label: 'Tiempo promedio de los activos Rutina',    valor: avgRutina, unidad: ' min', meta: 60, metaTexto: 'menos de 60 min', cumple: tRutina.length === 0 || avgRutina < 60, prioridad: 'rutina',    icon: 'fa-clock' },
      { label: 'Incidentes críticos (tiempo excedido)', valor: stats.criticos, unidad: '', meta: 0, metaTexto: 'ninguno', cumple: stats.criticos === 0, icon: 'fa-triangle-exclamation' },
      { label: 'Incidentes activos / pendientes',       valor: stats.activos + stats.pendientes, unidad: '', meta: 9999, metaTexto: '', cumple: true, icon: 'fa-circle-dot' },
      { label: 'Tasa de resolución',                    valor: tasaRes, unidad: '%', meta: 80, metaTexto: '80 % o más', cumple: tasaRes >= 80 || stats.total === 0, icon: 'fa-check-double' },
    ]);

    this.computarOperadores();
  }

  computarOperadores(): void {
    const mapa: Record<string, OperadorStat> = {};

    for (const p of this.listaPedidos()) {
      const usr = p.usernameCreacion?.trim() || '(sin usuario)';
      mapa[usr] ??= { username: usr, total: 0, activos: 0, cerrados: 0, tiempoPromedio: 0, criticos: 0 };
      const op = mapa[usr];
      op.total++;
      if (p.estado === 'C') {
        op.cerrados++;
      } else {
        op.activos++;
        op.tiempoPromedio = Math.round(
          (op.tiempoPromedio * (op.activos - 1) + this.getMinutos(p)) / op.activos
        );
        if (this.getSemaforoClass(p) === 'semaforo-rojo') op.criticos++;
      }
    }

    this.operadores.set(Object.values(mapa).sort((a, b) => b.total - a.total));
  }

  /**
   * Los indicadores y el panel se calculan sobre la página cargada, no sobre el
   * histórico. El origen los rotulaba «cola CAD completa», que con más de una
   * página es sencillamente falso: aquí se dice sobre cuántos se calcularon.
   */
  readonly alcanceCalculo = computed(() => {
    const enPagina = this.listaPedidos().length;
    const total    = this.totalPedidos();
    if (total <= enPagina) return `${enPagina} incidente${enPagina === 1 ? '' : 's'} en la cola`;
    return `${enPagina} de ${total} incidentes · página ${this.paginaActual()} de ${this.totalPaginas()}`;
  });

  // ══════════════════════════════════════════════════════════════════════════
  //  Lista filtrada
  // ══════════════════════════════════════════════════════════════════════════

  readonly listadoFiltrado = computed<DtoPedidoListItem[]>(() => {
    let list = this.listaPedidos();

    const estado = this.filtroEstado();
    if (estado) list = list.filter(p => p.estado === estado);

    const prio = this.filtroPrioridad().toUpperCase();
    if (prio) list = list.filter(p => this.normPrio(p) === prio);

    const turno = this.filtroTurno();
    if (turno) list = list.filter(p => this.turnoDeIncidente(p.horaCaso) === turno);

    const txt = this.filtroTexto().toLowerCase().trim();
    if (txt) {
      list = list.filter(p =>
        p.direCaso?.toLowerCase().includes(txt)         ||
        p.codiPedido?.toLowerCase().includes(txt)       ||
        p.descPedido?.toLowerCase().includes(txt)       ||
        p.codiPedido2?.toLowerCase().includes(txt)      ||
        p.usernameCreacion?.toLowerCase().includes(txt) ||
        String(p.id).includes(txt)                      ||
        (p.numeEvento ? String(p.numeEvento).includes(txt) : false)
      );
    }

    return list;
  });

  readonly hayFiltrosLocales = computed(() =>
    !!(this.filtroEstado() || this.filtroPrioridad() || this.filtroTurno() || this.filtroTexto().trim())
  );

  limpiarFiltrosLocales(): void {
    this.filtroEstado.set('');
    this.filtroPrioridad.set('');
    this.filtroTurno.set(0);
    this.filtroTexto.set('');
  }

  readonly incidentesCriticos = computed(() =>
    this.listaPedidos()
      .filter(p => p.estado !== 'C' && this.getSemaforoClass(p) === 'semaforo-rojo')
      .slice(0, 10)
  );

  // ── Turnos de vigilancia ──────────────────────────────────────────────────

  /**
   * Turno de vigilancia (1/2/3) a partir de hora_caso (ISO UTC):
   * 1 = 22:00–05:59, 2 = 06:00–13:59, 3 = 14:00–21:59 — misma numeración que
   * GetTurnoActual() del backend.
   */
  turnoDeIncidente(horaCaso: string | null | undefined): number {
    if (!horaCaso) return 0;
    const d = new Date(horaCaso);
    if (isNaN(d.getTime())) return 0;
    const h = ((d.getUTCHours() - 5) + 24) % 24;   // Colombia es UTC-5 todo el año
    if (h >= 22 || h < 6) return 1;
    if (h >= 6 && h <= 13) return 2;
    return 3;
  }

  turnoLabel(n: number): string { return this.turnosVigilancia.find(t => t.value === n)?.label ?? '—'; }
  turnoColor(n: number): string { return this.turnosVigilancia.find(t => t.value === n)?.color ?? '#64748b'; }
  turnoIcono(n: number): string { return this.turnosVigilancia.find(t => t.value === n)?.icono ?? 'fa-clock'; }
  turnoRango(n: number): string { return ['', '22:00–05:59', '06:00–13:59', '14:00–21:59'][n] ?? ''; }

  // ══════════════════════════════════════════════════════════════════════════
  //  Semáforo
  // ══════════════════════════════════════════════════════════════════════════

  getSemaforoClass(item: DtoPedidoListItem): SemaforoColor {
    void this.tick();   // dependencia reactiva: refresca el color cada minuto
    if (item.estado === 'C') return 'semaforo-verde';
    const prio = this.normPrio(item);
    const min  = this.getMinutos(item);
    if (prio === 'FLASH')     return 'semaforo-rojo';
    if (prio === 'INMEDIATA') return min >= 30 ? 'semaforo-rojo' : 'semaforo-amarillo';
    if (min >= 60) return 'semaforo-rojo';
    if (min >= 30) return 'semaforo-amarillo';
    return 'semaforo-verde';
  }

  getMinutos(item: DtoPedidoListItem): number {
    const ref = item.horaCaso ?? item.fechaCreacion;
    if (!ref) return 0;
    return Math.floor((Date.now() - new Date(ref).getTime()) / 60_000);
  }

  getElapsedLabel(item: DtoPedidoListItem): string {
    const m = this.getMinutos(item);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return m % 60 > 0 ? `${h}h ${m % 60}m` : `${h}h`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Etiquetas
  // ══════════════════════════════════════════════════════════════════════════

  getEstadoLabel(e: string): string {
    return ({ A: 'Activo', P: 'Pendiente', E: 'En proceso',
              T: 'Seguimiento', R: 'Para revisión', C: 'Cerrado' } as Record<string, string>)[e] ?? e;
  }

  /** Variante del ui-badge por estado del pedido. */
  getEstadoVariant(e: string): 'info' | 'warning' | 'success' | 'secondary' | 'danger' {
    return ({ A: 'info', P: 'warning', E: 'info',
              T: 'secondary', R: 'warning', C: 'success' } as const)[e as 'A'] ?? 'secondary';
  }

  getPrioridadLabel(p: string): string {
    const n = this.normPrio({ prioridad: p });
    return ({ FLASH: 'Flash', INMEDIATA: 'Inmediata', RUTINA: 'Rutina' } as Record<string, string>)[n]
           ?? (n || p || '—');
  }

  getPrioridadClass(p: string): string {
    const n = this.normPrio({ prioridad: p });
    return ({ FLASH: 'prio-flash', INMEDIATA: 'prio-inmediata', RUTINA: 'prio-rutina' } as Record<string, string>)[n]
           ?? 'prio-default';
  }

  getPrioridadVariant(p: string): 'danger' | 'warning' | 'info' | 'secondary' {
    const n = this.normPrio({ prioridad: p });
    return ({ FLASH: 'danger', INMEDIATA: 'warning', RUTINA: 'info' } as const)[n as 'FLASH'] ?? 'secondary';
  }

  getLabelTipoAnotacion(tipo: string): string {
    return ({
      OPERATIVA:        'Anotación operativa',
      PREVENTIVA:       'Anotación preventiva',
      DESPACHO:         'Despacho de recurso',
      NOVEDAD_PERSONAL: 'Novedad de personal',
      CIERRE:           'Cierre del incidente',
      SUPERVISION:      'Supervisión — Jefe de Turno',
      GENERAL:          'Anotación general',
    } as Record<string, string>)[(tipo ?? '').toUpperCase()] ?? 'Anotación';
  }

  getOrigenLabel(origen: string): string {
    return ({
      PLANTATEL:   'Llamada 112/123',
      RECEPCION:   'Recepción telefónica',
      RADIO:       'Radio policial',
      CAMPO:       'Reporte de campo',
      SUPERVISION: 'Supervisión / Iniciativa',
      INTERNO:     'Canal interno',
      INTEGRACION: 'Otra entidad / Traslado',
      SIEDCO:      'SIEDCO',
      APP_MOVIL:   'App móvil',
      MANUAL:      'Ingreso manual',
    } as Record<string, string>)[(origen ?? '').toUpperCase()] ?? origen ?? '—';
  }

  getOrigenKeys(): string[] {
    return Object.keys(this.stats().porOrigen);
  }

  /** Etiqueta legible del turno vigente ("1ro turno · desde 06:00"). */
  getTurnoLabel(): string {
    const c = this.conteos();
    if (!c) return '';
    const desde = c.turnoDesde
      ? new Date(c.turnoDesde).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
      : '';
    return `${c.turnoActual} turno${desde ? ' · desde ' + desde : ''}`;
  }

  /** Etiqueta legible del estado de una actuación. */
  getEstadoActuacionLabel(estado: string): string {
    return ({ P: 'Pendiente', D: 'En camino', A: 'En sitio', C: 'Cerrada', V: 'Anulada' } as Record<string, string>)[estado]
           ?? estado;
  }

  /** Estado de una unidad dentro del equipo de la actuación. */
  getEstadoUnidadLabel(estado: string): string {
    return ({ D: 'En camino', A: 'En sitio', L: 'Libre', V: 'Anulada' } as Record<string, string>)[estado] ?? estado;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Vista y filtros
  // ══════════════════════════════════════════════════════════════════════════

  setVista(v: VistaCad): void { this.vista.set(v); }

  /** Desde una tarjeta del panel: filtra por estado y salta a la lista. */
  verPorEstado(estado: string): void {
    this.filtroEstado.set(estado);
    this.vista.set('incidentes');
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Videollamadas
  // ══════════════════════════════════════════════════════════════════════════

  /** Segundos → "m:ss" (o "h:mm:ss" si pasó de la hora). */
  formatDuracion(segundos: number | null | undefined): string {
    if (segundos == null || segundos < 0) return '—';
    const h = Math.floor(segundos / 3600);
    const m = Math.floor((segundos % 3600) / 60);
    const s = segundos % 60;
    const dd = (n: number) => n.toString().padStart(2, '0');
    return h > 0 ? `${h}:${dd(m)}:${dd(s)}` : `${m}:${dd(s)}`;
  }

  formatFechaHora(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  /** Solo la hora del mensaje: la fecha ya la da la cabecera de la sesión. */
  formatHoraChat(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  etiquetaEstadoVideo(estado: string): string {
    return ({
      CONECTADA:  'Conectada',
      FINALIZADA: 'Finalizada',
      PENDIENTE:  'Nunca contestada',
      EXPIRADA:   'Enlace expirado',
      CANCELADA:  'Cancelada',
    } as Record<string, string>)[estado] ?? estado;
  }

  variantEstadoVideo(estado: string): 'success' | 'info' | 'secondary' {
    if (estado === 'FINALIZADA') return 'success';
    if (estado === 'CONECTADA')  return 'info';
    return 'secondary';
  }

  urlMapaUbicacion(lat: number, lng: number): string {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Equipo de una actuación (carga bajo demanda)
  // ══════════════════════════════════════════════════════════════════════════

  toggleEquipo(actId: string): void {
    if (this.equipoExpandido()[actId]) {
      this.equipoExpandido.update(m => ({ ...m, [actId]: false }));
      return;
    }
    if (this.equipoDetalle()[actId]) {
      this.equipoExpandido.update(m => ({ ...m, [actId]: true }));
      return;
    }
    this.equipoCargando.update(m => ({ ...m, [actId]: true }));
    this.actuacionesService.getActuacion(actId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: resp => {
          this.equipoCargando.update(m => ({ ...m, [actId]: false }));
          this.equipoDetalle.update(m => ({ ...m, [actId]: resp.data?.unidades ?? [] }));
          this.equipoExpandido.update(m => ({ ...m, [actId]: true }));
        },
        error: () => {
          this.equipoCargando.update(m => ({ ...m, [actId]: false }));
          this.toast.error('Equipo', 'No se pudo cargar el equipo de la actuación.');
        }
      });
  }

  equipoDe(actId: string): DtoActuacionUnidad[] {
    return this.equipoDetalle()[actId] ?? [];
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Utilidades
  // ══════════════════════════════════════════════════════════════════════════

  /** Diferencia en minutos entre dos marcas ISO. Siempre ≥ 0. */
  diffMin(from: string | null | undefined, to: string | null | undefined): number {
    if (!from || !to) return 0;
    const a = new Date(from).getTime();
    const b = new Date(to).getTime();
    if (isNaN(a) || isNaN(b)) return 0;
    return Math.max(0, Math.round((b - a) / 60_000));
  }

  /** Minutos como "5m", "1h 12m". */
  fmtDur(min: number | null): string {
    if (min === null || min < 0) return '—';
    if (min === 0) return '< 1m';
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  porcentaje(parte: number, total: number): number {
    return total > 0 ? (parte / total) * 100 : 0;
  }

  /** Normaliza la prioridad a FLASH | INMEDIATA | RUTINA. */
  private normPrio(item: { prioridad?: string }): string {
    const p = (item.prioridad ?? '').toUpperCase().trim();
    if (p === 'FLASH'     || p === '01') return 'FLASH';
    if (p === 'INMEDIATA' || p === '02') return 'INMEDIATA';
    if (p === 'RUTINA'    || p === '03') return 'RUTINA';
    return p;
  }

  private emptyStats(): DashStat {
    return { total: 0, activos: 0, pendientes: 0, cerrados: 0,
             flash: 0, inmediata: 0, rutina: 0, criticos: 0, porOrigen: {} };
  }

  private emptyAnotacion(): DtoAnotacionRequest {
    return { titulo: '', anotacion: '', tipoAnotacion: 'SUPERVISION' };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Normalización
  // ══════════════════════════════════════════════════════════════════════════

  /** Enriquece un item de lista con lo que aporta el eventoMap. */
  private normalizarListItem(item: Record<string, any>): DtoPedidoListItem {
    const ev = this.eventoMap[String(item?.['id'] ?? '')];
    const v = (camel: string, snake: string) => item?.[camel] ?? item?.[snake];
    return {
      id:           String(item?.['id'] ?? ''),
      sitioGraba:   Number(v('sitioGraba', 'sitio_graba') ?? 0),
      numeLlamada:  v('numeLlamada', 'nume_llamada') ?? null,
      horaCaso:     v('horaCaso', 'hora_caso') ?? null,
      numeTelefono: v('numeTelefono', 'nume_telefono') ?? null,
      direCaso:     String(v('direCaso', 'dire_caso') ?? ''),
      estado:       String(item?.['estado'] ?? ''),
      enviar:       String(item?.['enviar'] ?? 'N'),
      codiPedido:   String(v('codiPedido', 'codi_pedido') ?? ''),
      codiPedido2:  String(v('codiPedido2', 'codi_pedido2') ?? ''),
      comentario:   String(item?.['comentario'] ?? ''),
      // Se prefiere el usuario del pedido; si viene vacío, el del evento.
      usernameCreacion: String(
        String(v('usernameCreacion', 'username_creacion') ?? '').trim() || (ev?.usernameCreacion ?? '')
      ),
      fechaCreacion: v('fechaCreacion', 'fecha_creacion') ?? null,
      prioridad:   item?.['prioridad']  || ev?.prioridad  || undefined,
      origen:      item?.['origen']     || ev?.origen     || undefined,
      numeEvento:  ev?.numeEvento   ?? undefined,
      descPedido:  item?.['descPedido'] ?? ev?.descPedido ?? undefined,
      descPedido2: item?.['descPedido2'] ?? undefined,
    };
  }

  /** Combina el detalle del backend con lo enriquecido del listItem. */
  private normalizarDetalle(item: Record<string, any>, listItem?: DtoPedidoListItem | null): DtoPedidoDetalle {
    const base = this.normalizarListItem(item);
    const v = (camel: string, snake: string) => item?.[camel] ?? item?.[snake];
    return {
      ...base,
      prioridad:  String(item?.['prioridad'] ?? listItem?.prioridad ?? ''),
      origen:     base.origen     ?? listItem?.origen     ?? undefined,
      numeEvento: base.numeEvento ?? listItem?.numeEvento ?? undefined,
      propTelefono:   String(v('propTelefono', 'prop_telefono') ?? ''),
      nombLlamante:   String(v('nombLlamante', 'nomb_llamante') ?? ''),
      barrio:         String(item?.['barrio'] ?? ''),
      ciudad:         String(item?.['ciudad'] ?? ''),
      direLlamante:   String(v('direLlamante', 'dire_llamante') ?? ''),
      latitudCaso:    String(v('latitudCaso', 'latitud_caso') ?? ''),
      longitudCaso:   String(v('longitudCaso', 'longitud_caso') ?? ''),
      cordx:          String(item?.['cordx'] ?? ''),
      cordy:          String(item?.['cordy'] ?? ''),
      tiposhape:      String(item?.['tiposhape'] ?? ''),
      radio:          Number(item?.['radio'] ?? 0),
      tipoPedido:     String(v('tipoPedido', 'tipo_pedido') ?? ''),
      caliPedido:     String(v('caliPedido', 'cali_pedido') ?? ''),
      importancia:    String(item?.['importancia'] ?? ''),
      dispTelefonico: String(v('dispTelefonico', 'disp_telefonico') ?? ''),
      celdaMarcacion: String(v('celdaMarcacion', 'celda_marcacion') ?? ''),
      canales:        String(item?.['canales'] ?? ''),
      canalFuerza:    String(v('canalFuerza', 'canal_fuerza') ?? ''),
      pedidoPadreSitio: v('pedidoPadreSitio', 'pedido_padre_sitio') ?? null,
      pedidoPadreNum:   v('pedidoPadreNum', 'pedido_padre_num') ?? null,
      descPedido:     String(v('descPedido', 'desc_pedido') ?? listItem?.descPedido ?? ''),
      descPedido2:    String(v('descPedido2', 'desc_pedido2') ?? listItem?.descPedido2 ?? ''),
      eventoId:          v('eventoId', 'evento_id') ?? null,
      canalCodigo:       Number(v('canalCodigo', 'canal_codigo') ?? 0),
      canalDescripcion:  String(v('canalDescripcion', 'canal_descripcion') ?? ''),
      fuerzaDescripcion: String(v('fuerzaDescripcion', 'fuerza_descripcion') ?? ''),
      fechaCierre:       v('fechaCierre', 'fecha_cierre') ?? null,
      observacionCierre: String(v('observacionCierre', 'observacion_cierre') ?? ''),
      usuarioCierre:     String(v('usuarioCierre', 'usuario_cierre') ?? ''),
      ultimoAccesoUsername: v('ultimoAccesoUsername', 'ultimo_acceso_username') ?? null,
      ultimoAccesoFecha:    v('ultimoAccesoFecha', 'ultimo_acceso_fecha') ?? null,
      eventoEstado:         v('eventoEstado', 'evento_estado') ?? null,
      codigosCierre: (v('codigosCierre', 'codigos_cierre') ?? []).map((c: Record<string, any>) => ({
        orden:            Number(c?.['orden'] ?? 0),
        codigoCierre:     String(c?.['codigoCierre']     ?? c?.['codigo_cierre']     ?? ''),
        tipoCodigo:       String(c?.['tipoCodigo']       ?? c?.['tipo_codigo']       ?? ''),
        descripcionLibre: String(c?.['descripcionLibre'] ?? c?.['descripcion_libre'] ?? ''),
      })),
      anotaciones: (item?.['anotaciones'] ?? []).map((a: Record<string, any>) => ({
        id:               Number(a?.['id'] ?? 0),
        idPedido:         Number(a?.['idPedido'] ?? a?.['id_pedido'] ?? 0),
        titulo:           String(a?.['titulo'] ?? ''),
        anotacion:        String(a?.['anotacion'] ?? ''),
        tipoAnotacion:    String(a?.['tipoAnotacion'] ?? a?.['tipo_anotacion'] ?? 'GENERAL'),
        usuarioCreacion:  a?.['usuarioCreacion'] ?? a?.['usuario_creacion'] ?? null,
        usernameCreacion: String(a?.['usernameCreacion'] ?? a?.['username_creacion'] ?? ''),
        fechaCreacion:    a?.['fechaCreacion'] ?? a?.['fecha_creacion'] ?? null,
        maquinaCreacion:  String(a?.['maquinaCreacion'] ?? a?.['maquina_creacion'] ?? ''),
      })),
    };
  }
}
