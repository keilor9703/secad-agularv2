import {
  Component, ChangeDetectionStrategy, OnInit, OnDestroy,
  AfterViewInit, ElementRef,
  computed, inject, signal,
  viewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { distinctUntilChanged, map, skip, takeUntil } from 'rxjs/operators';
// Antes era `declare const Chart` y Chart.js llegaba por un <script> del CDN.
// La CSP de la plantilla es script-src 'self', así que ese script no cargaría.
import { Chart, registerables } from 'chart.js';
import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiSectionHeaderComponent } from '../../../../shared/components/ui-section-header/ui-section-header.component';
import { UiSegmentedTabsComponent } from '../../../../shared/components/ui-segmented-tabs/ui-segmented-tabs.component';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiInputComponent } from '../../../../shared/components/ui-input/ui-input.component';
import { UiDateTimePickerComponent } from '../../../../shared/components/ui-date-time-picker/ui-date-time-picker.component';
import { UiSelectComponent } from '../../../../shared/components/ui-select/ui-select.component';
import { UiBadgeComponent } from '../../../../shared/components/ui-badge/ui-badge.component';
import { UiSpinnerComponent } from '../../../../shared/components/ui-spinner/ui-spinner.component';
import { UiTableComponent } from '../../../../shared/components/ui-table/ui-table.component';
import { UiTableColumn } from '../../../../shared/interfaces/ui-table.interface';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';
import { UiSegmentedTabItem } from '../../../../shared/components/ui-segmented-tabs/ui-segmented-tabs.types';
import { AccessibilityService } from '../../../../core/services/accessibility.service';
import {
  ReportesService,
  DtoReporteCompleto, DtoResumenReporte, DtoTiemposAtencion,
  DtoPorOrigen, DtoPorFuerza, DtoTopCaso, DtoSlaItem, DtoPorHora,
  DtoPorCalidad, DtoPedidoEfectivo, DtoTiempoDetalleItem,
  DtoTrabajoOperador, DtoPagedResult
} from '../../../../core/services/operacion/reportes.service';
import { FuerzaService, DtoFuerza } from '../../../administracion/services/fuerza.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { ToastService } from '../../../../core/services/toast.service';

// Chart.js v4 no auto-registra escalas ni tipos: sin esto las gráficas lanzan
// «"category" is not a registered scale» en tiempo de ejecución.
Chart.register(...registerables);

@Component({
  selector: 'app-reportes-page',
  standalone:  true,
  imports: [
    FormsModule,
    UiPageHeaderComponent,
    UiSectionHeaderComponent,
    UiSegmentedTabsComponent,
    UiButtonComponent,
    UiSelectComponent,
    UiBadgeComponent,
    UiSpinnerComponent,
    UiTableComponent,
    UiDateTimePickerComponent,
  ],
  templateUrl: './reportes-page.component.html',
  styleUrls: ['./reportes-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReportesPageComponent implements OnInit, AfterViewInit, OnDestroy {

  // ── Canvas refs para Chart.js ────────────────────────────────────────────
  readonly canvasOrigen = viewChild.required<ElementRef<HTMLCanvasElement>>('canvasOrigen');
  readonly canvasHoras = viewChild.required<ElementRef<HTMLCanvasElement>>('canvasHoras');
  readonly canvasPrio = viewChild.required<ElementRef<HTMLCanvasElement>>('canvasPrio');

  // ── Sección activa: dashboard o reportes detallados ───────────────────────
  seccion: 'dashboard' | 'detallados' = 'dashboard';

  // ── Estado dashboard ──────────────────────────────────────────────────────
  readonly cargando = signal(false);
  readonly error    = signal('');
  readonly datos    = signal<DtoReporteCompleto | null>(null);

  // ── Filtros compartidos ───────────────────────────────────────────────────
  desde            = this.hoy();
  hasta            = this.hoy();
  fuerzaId         = 0;
  turnoVigilancia  = 0;   // 0=Todos, 1=Segundo, 2=Tercer, 3=Cuarto
  readonly fuerzas = signal<DtoFuerza[]>([]);

  readonly turnos = ReportesService.TURNOS;

  // ── Reportes detallados — selector ───────────────────────────────────────
  reporteActivo: 'calidad' | 'efectivos' | 'tiempos' | 'operadores' | 'codigos' = 'calidad';

  readonly reportesMenu = [
    { key: 'calidad'   as const, label: 'Llamadas por Calidad',           icon: 'fa-tags'            },
    { key: 'efectivos' as const, label: 'Pedidos con Detalle',            icon: 'fa-list-check'      },
    { key: 'tiempos'   as const, label: 'Tiempos de Atención',            icon: 'fa-stopwatch'       },
    { key: 'operadores'as const, label: 'Trabajo Operadores/Despachadores',icon: 'fa-users-between-lines'},
    { key: 'codigos'   as const, label: 'Llamadas por Código',            icon: 'fa-chart-bar'       },
  ];

  // ── R1 — Calidad ─────────────────────────────────────────────────────────
  readonly calidad    = signal<DtoPorCalidad[]>([]);
  readonly cargandoCal = signal(false);

  // ── R2 — Pedidos efectivos / con detalle ─────────────────────────────────
  readonly efectivos  = signal<DtoPagedResult<DtoPedidoEfectivo> | null>(null);
  readonly cargandoEfe = signal(false);
  filtroCalidad = '';    // vacío = todos; 'REAL' = solo efectivos
  paginaEfe     = 1;
  limitEfe      = 100;

  readonly opcionesCalidad = [
    { value: '',                   label: 'Todos los pedidos'    },
    { value: 'REAL',               label: 'Pedido Efectivo'      },
    { value: 'INFORMACION',        label: 'Información General'  },
    { value: 'LLAMADA CORTADA',    label: 'Llamada Cortada'      },
    { value: 'NIÑO MOLESTANDO',    label: 'Niño Molestando'      },
    { value: 'PERSONAS MOLESTANDO',label: 'Personas Molestando'  },
    { value: 'NO CULTAS',          label: 'No Cultas'            },
  ];

  // ── R3 — Tiempos detalle ──────────────────────────────────────────────────
  readonly tiemposDetalle = signal<DtoPagedResult<DtoTiempoDetalleItem> | null>(null);
  readonly cargandoTieDet = signal(false);
  paginaTieDet    = 1;
  limitTieDet     = 100;

  // ── R4 — Operadores ───────────────────────────────────────────────────────
  readonly operadores = signal<DtoTrabajoOperador[]>([]);
  readonly cargandoOpe = signal(false);

  // ── R5 — Códigos ─────────────────────────────────────────────────────────
  readonly codigos    = signal<DtoTopCaso[]>([]);
  readonly cargandoCod = signal(false);
  topCodigos    = 50;

  // ── Charts ───────────────────────────────────────────────────────────────
  private chartOrigen: Chart | null = null;
  private chartHoras:  Chart | null = null;
  private chartPrio:   Chart | null = null;
  private chartsListo  = false;
  private chartsTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // ══ Piezas del kit ═══════════════════════════════════════════════════════
  // Pestañas, selectores y tablas se declaran aquí para que la plantilla no
  // repita listas de <option> ni cabeceras de <table> a mano.

  readonly pestanas: UiSegmentedTabItem[] = [
    { id: 'dashboard',  label: 'Panel general',     icon: 'fa-solid fa-gauge-high' },
    { id: 'detallados', label: 'Reportes detallados', icon: 'fa-solid fa-table-list' },
  ];

  readonly pestanasReporte = this.reportesMenu.map<UiSegmentedTabItem>(m => ({
    id: m.key,
    label: m.label,
    icon: `fa-solid ${m.icon}`,
  }));

  readonly opcionesTurno: UiSelectOption<number>[] = this.turnos.map(t => ({
    label: t.label,
    value: t.value,
  }));

  readonly opcionesFuerza = computed<UiSelectOption<number>[]>(() => [
    { label: 'Todas las fuerzas', value: 0 },
    ...this.fuerzas().map(f => ({ label: f.descripcion, value: f.id })),
  ]);

  readonly opcionesCalidadSelect: UiSelectOption<string>[] = this.opcionesCalidad.map(o => ({
    label: o.label,
    value: o.value,
  }));

  // ── Columnas de las tres tablas ──────────────────────────────────────────
  // Las de pedidos y tiempos vienen paginadas por el backend, así que la tabla
  // va en modo external: recorta el servidor, no el componente.
  readonly columnasEfectivos: UiTableColumn<DtoPedidoEfectivo>[] = [
    { key: 'numeTelefono',   label: 'Teléfono',   value: r => r.numeTelefono || '—' },
    { key: 'numeLlamada',    label: 'Llamada' },
    { key: 'horaLlamada',    label: 'Hora llamada' },
    { key: 'codigoCaso',     label: 'Código',     value: r => `${r.codigoCaso} · ${r.descCaso}` },
    {
      key: 'caliPedido', label: 'Calidad', align: 'center',
      badge: r => ({
        text: this.calidadLbl(r.caliPedido),
        // El pedido efectivo es el que interesa contar; el resto es ruido.
        variant: r.caliPedido === 'REAL' ? 'success' : 'neutral',
      }),
    },
    { key: 'prioridad',      label: 'Prioridad',  value: r => this.prioLbl(r.prioridad) || '—' },
    { key: 'canal',          label: 'Canal',      value: r => r.canal  || '—' },
    { key: 'unidad',         label: 'Patrulla',   value: r => r.unidad || '—' },
    { key: 'horaAsignacion', label: 'H/asigna',   align: 'center', value: r => r.horaAsignacion || '—' },
    { key: 'horaLlegada',    label: 'H/llega',    align: 'center', value: r => r.horaLlegada    || '—' },
    { key: 'horaTermino',    label: 'H/termina',  align: 'center', value: r => r.horaTermino    || '—' },
    { key: 'tiempoLlegada',  label: 'T/llegada',  align: 'center', value: r => r.tiempoLlegada  || '—' },
    { key: 'tiempoAtencion', label: 'T/atención', align: 'center', value: r => r.tiempoAtencion || '—' },
    { key: 'tiempoTotal',    label: 'T/total',    align: 'center', value: r => r.tiempoTotal    || '—' },
  ];

  readonly columnasOperadores: UiTableColumn<DtoTrabajoOperador>[] = [
    { key: 'usuario',            label: 'Usuario / operador', sortable: true },
    { key: 'casosRecibidos',     label: 'Casos recibidos',      align: 'center', sortable: true },
    { key: 'eventosDespachados', label: 'Eventos despachados',  align: 'center', sortable: true },
    { key: 'actuaciones',        label: 'Actuaciones',          align: 'center', sortable: true },
    { key: 'eventosCerrados',    label: 'Eventos cerrados',     align: 'center', sortable: true },
    {
      key: 'promMinDespacho', label: 'Prom. despacho', align: 'center',
      value: o => (o.promMinDespacho !== null ? this.formatMin(o.promMinDespacho) : '—'),
    },
    { key: 'primeraActividad', label: 'Primera actividad', value: o => o.primeraActividad || '—' },
    { key: 'ultimaActividad',  label: 'Última actividad',  value: o => o.ultimaActividad  || '—' },
  ];

  readonly columnasTiempos: UiTableColumn<DtoTiempoDetalleItem>[] = [
    { key: 'seccional',  label: 'Seccional' },
    { key: 'unidad',     label: 'Unidad' },
    { key: 'nroLlamada', label: 'N.º llamada' },
    { key: 'codigoCaso', label: 'Caso', value: r => `${r.codigoCaso} · ${r.descCaso}` },
    { key: 'placa',      label: 'Placa', value: r => r.placa || '—' },
    { key: 'horaLlamada',      label: 'H/llamada',  align: 'center' },
    { key: 'horaEnvioCentral', label: 'H/central',  align: 'center', value: r => r.horaEnvioCentral || '—' },
    { key: 'horaDespacho',     label: 'H/despacho', align: 'center', value: r => r.horaDespacho || '—' },
    { key: 'horaLlegada',      label: 'H/llega',    align: 'center', value: r => r.horaLlegada  || '—' },
    { key: 'horaTermino',      label: 'H/termina',  align: 'center', value: r => r.horaTermino  || '—' },
    { key: 'tiempoDesplazamiento', label: 'T/desplazamiento', align: 'center', value: r => r.tiempoDesplazamiento || '—' },
    { key: 'tiempoAtencionCaso',   label: 'T/atención',       align: 'center', value: r => r.tiempoAtencionCaso   || '—' },
    { key: 'tiempoTotalCaso',      label: 'T/total',          align: 'center', value: r => r.tiempoTotalCaso      || '—' },
  ];

  private destroy$ = new Subject<void>();

  readonly svc = inject(ReportesService);   // público para acceso desde el template
  private readonly fuerzaSvc = inject(FuerzaService);
  private readonly authSvc   = inject(AuthService);
  private readonly toast     = inject(ToastService);
  private readonly accesibilidad = inject(AccessibilityService);

  ngOnInit(): void {
    // Chart.js congela el color del texto al crear cada gráfica: si se cambia
    // de tema después de cargar, las etiquetas quedan del color anterior (en
    // oscuro, invisibles sobre fondo oscuro).
    this.accesibilidad.accessibility$
      .pipe(
        map(estado => estado.darkMode),
        distinctUntilChanged(),
        skip(1),
        takeUntil(this.destroy$),
      )
      .subscribe(() => {
        if (this.datos() && this.chartsListo) this.renderCharts();
      });

    const claims = this.authSvc.getJwtClaims();
    this.fuerzaId = claims.fuerzaId;
    // Cargar lista de fuerzas para el filtro
    this.fuerzaSvc.getFuerzas().pipe(takeUntil(this.destroy$)).subscribe({
      next: r => this.fuerzas.set((r.data ?? []).filter(f => f.vigente === 'S')),
      error: () => this.toast.error('Error', 'No se pudo cargar la lista de fuerzas.')
    });
    this.cargar();
  }

  ngAfterViewInit(): void {
    this.chartsListo = true;
    if (this.datos()) this.renderCharts();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.chartsTimeoutId !== null) clearTimeout(this.chartsTimeoutId);
    this.destruirCharts();
  }

  // ── Carga ─────────────────────────────────────────────────────────────────

  /** El backend ya valida, pero evitamos la llamada y avisamos de inmediato. */
  private rangoValido(): boolean {
    if (this.desde > this.hasta) {
      this.toast.error('Rango inválido', 'La fecha "Desde" no puede ser posterior a "Hasta".');
      return false;
    }
    return true;
  }

  cargar(): void {
    if (!this.rangoValido()) return;
    this.cargando.set(true);
    this.error.set('');
    this.svc.getReporte({ desde: this.desde, hasta: this.hasta, fuerzaId: this.fuerzaId, turnoVigilancia: this.turnoVigilancia || undefined })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: r => {
          this.cargando.set(false);
          if (r.success) {
            this.datos.set(r.data);
            if (this.chartsListo) this.renderCharts();
          } else {
            this.error.set('No se pudieron cargar los reportes.');
          }
        },
        error: () => {
          this.cargando.set(false);
          this.error.set('Error de comunicación con el servidor.');
        }
      });
  }

  onFiltroChange(): void {
    if (this.seccion === 'dashboard') this.cargar();
    else { this.paginaEfe = 1; this.paginaTieDet = 1; this.cargarReporteActivo(); }
  }

  setRango(rango: 'hoy' | 'semana' | 'mes'): void {
    const now = new Date();
    this.hasta = this.formatDate(now);
    if (rango === 'hoy')   this.desde = this.formatDate(now);
    if (rango === 'semana') {
      const d = new Date(now); d.setDate(d.getDate() - 6); this.desde = this.formatDate(d);
    }
    if (rango === 'mes') {
      const d = new Date(now); d.setDate(1); this.desde = this.formatDate(d);
    }
    this.onFiltroChange();
  }

  // ── Chart.js ──────────────────────────────────────────────────────────────

  /** Se lee en cada render (no cacheado) porque el usuario puede alternar modo oscuro sin recargar. */
  private chartTextColor(): string {
    return getComputedStyle(document.documentElement).getPropertyValue('--ui-text').trim() || '#0f172a';
  }
  private chartGridColor(): string {
    return getComputedStyle(document.documentElement).getPropertyValue('--ui-border').trim() || 'rgba(21,27,59,.14)';
  }

  private renderCharts(): void {
    if (!this.datos()) return;
    this.destruirCharts();
    if (this.chartsTimeoutId !== null) clearTimeout(this.chartsTimeoutId);
    // Pequeño delay para asegurar que los canvas están en el DOM
    this.chartsTimeoutId = setTimeout(() => {
      this.chartsTimeoutId = null;
      this.renderChartOrigen();
      this.renderChartHoras();
      this.renderChartPrio();
    }, 80);
  }

  private renderChartOrigen(): void {
    const el = this.canvasOrigen()?.nativeElement;
    if (!el || !this.datos()?.porOrigen.length) return;
    const data = this.datos()!.porOrigen;
    this.chartOrigen = new Chart(el, {
      type: 'doughnut',
      data: {
        labels: data.map(d => this.svc.origenLabel(d.origen)),
        datasets: [{
          data:            data.map(d => d.total),
          backgroundColor: data.map(d => this.svc.origenColor(d.origen)),
          borderWidth:     2,
          borderColor:     '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 12, font: { size: 12 }, color: this.chartTextColor() } },
          tooltip: {
            callbacks: {
              label: (ctx: any) => {
                const item = data[ctx.dataIndex];
                return ` ${item.total} (${item.porcentaje}%)`;
              }
            }
          }
        }
      }
    });
  }

  private renderChartHoras(): void {
    const el = this.canvasHoras()?.nativeElement;
    if (!el || !this.datos()?.porHora.length) return;
    const data = this.datos()!.porHora;
    const max  = Math.max(...data.map(h => h.total), 1);
    this.chartHoras = new Chart(el, {
      type: 'bar',
      data: {
        labels: data.map(h => `${String(h.hora).padStart(2,'0')}:00`),
        datasets: [{
          label:           'Incidentes',
          data:            data.map(h => h.total),
          backgroundColor: data.map(h => {
            const ratio = h.total / max;
            if (ratio > 0.7) return '#ef4444';
            if (ratio > 0.4) return '#f59e0b';
            return '#08a6cb';
          }),
          borderRadius: 4,
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, color: this.chartTextColor() } },
          y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 }, color: this.chartTextColor() }, grid: { color: this.chartGridColor() } }
        }
      }
    });
  }

  private renderChartPrio(): void {
    const el = this.canvasPrio()?.nativeElement;
    if (!el || !this.datos()) return;
    const r = this.datos()!.resumen;
    this.chartPrio = new Chart(el, {
      type: 'bar',
      data: {
        labels: ['Flash', 'Inmediata', 'Rutina', 'Sin prio'],
        datasets: [{
          data:            [r.flash, r.inmediatos, r.rutina, r.sinPrioridad],
          backgroundColor: ['#ef4444', '#f59e0b', '#10b981', '#94a3b8'],
          borderRadius:    6,
          borderWidth:     0
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          // stepSize:1 servía con una decena de incidentes; con mil producía
          // treinta y pico de marcas amontonadas y giradas en el eje.
          x: {
            beginAtZero: true,
            ticks: { maxTicksLimit: 8, precision: 0, font: { size: 11 }, color: this.chartTextColor() },
            grid: { color: this.chartGridColor() },
          },
          y: { grid: { display: false }, ticks: { font: { size: 12 }, color: this.chartTextColor() } }
        }
      }
    });
  }

  private destruirCharts(): void {
    [this.chartOrigen, this.chartHoras, this.chartPrio].forEach(c => {
      try { c?.destroy(); } catch { /* ignore */ }
    });
    this.chartOrigen = this.chartHoras = this.chartPrio = null;
  }

  // ── Helpers de presentación ───────────────────────────────────────────────

  get resumen(): DtoResumenReporte         { return this.datos()!.resumen; }
  get tiempos(): DtoTiemposAtencion        { return this.datos()!.tiempos; }
  get porOrigen(): DtoPorOrigen[]          { return this.datos()!.porOrigen; }
  get porFuerza(): DtoPorFuerza[]          { return this.datos()!.porFuerza; }
  get topCasos(): DtoTopCaso[]             { return this.datos()!.topCasos; }
  get sla(): DtoSlaItem[]                  { return this.datos()!.sla; }
  get porHora(): DtoPorHora[]              { return this.datos()!.porHora; }

  formatMin = (m: number | null) => this.svc.formatMinutos(m);
  origenLbl = (o: string)         => this.svc.origenLabel(o);
  origenClr = (o: string)         => this.svc.origenColor(o);

  slaClass(pct: number): string {
    if (pct >= 90) return 'sla-ok';
    if (pct >= 70) return 'sla-warn';
    return 'sla-bad';
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  SECCIÓN REPORTES DETALLADOS
  // ════════════════════════════════════════════════════════════════════════════

  setSeccion(s: 'dashboard' | 'detallados'): void {
    this.seccion = s;
    // Siempre se recarga: los filtros pudieron cambiar mientras se veía el dashboard.
    if (s === 'detallados') this.cargarReporteActivo();
  }

  setReporteActivo(r: typeof this.reporteActivo): void {
    this.reporteActivo = r;
    this.cargarReporteActivo();
  }

  cargarReporteActivo(): void {
    if (!this.rangoValido()) return;
    switch (this.reporteActivo) {
      case 'calidad':    this.cargarCalidad();    break;
      case 'efectivos':  this.cargarEfectivos();  break;
      case 'tiempos':    this.cargarTiempos();    break;
      case 'operadores': this.cargarOperadores(); break;
      case 'codigos':    this.cargarCodigos();    break;
    }
  }

  onFiltroDetalladoChange(): void { this.cargarReporteActivo(); }

  // ── R1 — Calidad ─────────────────────────────────────────────────────────

  cargarCalidad(): void {
    this.cargandoCal.set(true);
    this.svc.getPorCalidad({ desde: this.desde, hasta: this.hasta, turnoVigilancia: this.turnoVigilancia || undefined })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next:  r => {
          const data = r.data ?? [];
          this.calidad.set(data);
          this._maxCalidad = Math.max(...data.map(c => c.total), 1);
          this.cargandoCal.set(false);
        },
        error: () => { this.cargandoCal.set(false); this.toast.error('Error', 'No se pudo cargar el reporte de calidad.'); }
      });
  }

  exportarCalidad(): void {
    this.svc.exportarCSV(
      this.calidad() as unknown as Record<string, unknown>[],
      [
        { key: 'caliPedido',  label: 'Calidad' },
        { key: 'descripcion', label: 'Descripción' },
        { key: 'total',       label: 'Total' },
        { key: 'porcentaje',  label: '% del total' },
      ],
      `calidad_${this.desde}_${this.hasta}`
    );
  }

  private _maxCalidad = 1;
  maxCalidad(): number  { return this._maxCalidad; }
  get totalCalidad(): number { return this.calidad().reduce((s, c) => s + c.total, 0); }

  // ── R2 — Pedidos efectivos ────────────────────────────────────────────────

  cargarEfectivos(): void {
    this.cargandoEfe.set(true);
    this.svc.getEfectivos({
      desde: this.desde, hasta: this.hasta,
      fuerzaId: this.fuerzaId || undefined,
      calidad:  this.filtroCalidad || undefined,
      turnoVigilancia: this.turnoVigilancia || undefined,
      page: this.paginaEfe, limit: this.limitEfe,
    }).pipe(takeUntil(this.destroy$))
      .subscribe({
        next:  r => { this.efectivos.set(r.data); this.cargandoEfe.set(false); },
        error: () => { this.cargandoEfe.set(false); this.toast.error('Error', 'No se pudo cargar el reporte.'); }
      });
  }

  /**
   * ui-table en modo external emite la página pedida; antes había una barra de
   * paginación propia con sus botones de anterior y siguiente.
   */
  irAPaginaEfe(pagina: number): void {
    if (pagina === this.paginaEfe) return;
    this.paginaEfe = pagina;
    this.cargarEfectivos();
  }

  irAPaginaTie(pagina: number): void {
    if (pagina === this.paginaTieDet) return;
    this.paginaTieDet = pagina;
    this.cargarTiempos();
  }

  paginaAnteriorEfe(): void { if (this.paginaEfe > 1) { this.paginaEfe--; this.cargarEfectivos(); } }
  paginaSiguienteEfe(): void {
    const efectivos = this.efectivos();
    if (efectivos && this.paginaEfe * this.limitEfe < efectivos.total) {
      this.paginaEfe++; this.cargarEfectivos();
    }
  }

  exportarEfectivos(): void {
    const efectivos = this.efectivos();
    if (!efectivos?.data.length) return;
    this.svc.exportarCSV(
      efectivos.data as unknown as Record<string, unknown>[],
      [
        { key: 'numeTelefono',   label: 'Teléfono'      },
        { key: 'numeLlamada',    label: 'Nro. Llamada'   },
        { key: 'horaLlamada',    label: 'Hora Llamada'   },
        { key: 'codigoCaso',     label: 'Código'         },
        { key: 'descCaso',       label: 'Descripción'    },
        { key: 'caliPedido',     label: 'Calidad'        },
        { key: 'prioridad',      label: 'Prioridad'      },
        { key: 'canal',          label: 'Canal'          },
        { key: 'unidad',         label: 'Patrulla'       },
        { key: 'placa',          label: 'Placa'          },
        { key: 'horaAsignacion', label: 'H/Asigna'       },
        { key: 'horaLlegada',    label: 'H/Llega'        },
        { key: 'horaTermino',    label: 'H/Termina'      },
        { key: 'tiempoLlegada',  label: 'T/Llegada'      },
        { key: 'tiempoAtencion', label: 'T/Atención'     },
        { key: 'tiempoTotal',    label: 'T/Total'        },
      ],
      `pedidos_${this.filtroCalidad || 'todos'}_${this.desde}_${this.hasta}`
    );
  }

  // ── R3 — Tiempos detalle ──────────────────────────────────────────────────

  cargarTiempos(): void {
    this.cargandoTieDet.set(true);
    this.svc.getTiemposDetalle({
      desde: this.desde, hasta: this.hasta,
      fuerzaId: this.fuerzaId || undefined,
      page: this.paginaTieDet, limit: this.limitTieDet,
      turnoVigilancia: this.turnoVigilancia || undefined,
    }).pipe(takeUntil(this.destroy$))
      .subscribe({
        next:  r => { this.tiemposDetalle.set(r.data); this.cargandoTieDet.set(false); },
        error: () => { this.cargandoTieDet.set(false); this.toast.error('Error', 'No se pudo cargar el reporte.'); }
      });
  }

  paginaAnteriorTie(): void { if (this.paginaTieDet > 1) { this.paginaTieDet--; this.cargarTiempos(); } }
  paginaSiguienteTie(): void {
    const tiemposDetalle = this.tiemposDetalle();
    if (tiemposDetalle && this.paginaTieDet * this.limitTieDet < tiemposDetalle.total) {
      this.paginaTieDet++; this.cargarTiempos();
    }
  }

  exportarTiempos(): void {
    const tiemposDetalle = this.tiemposDetalle();
    if (!tiemposDetalle?.data.length) return;
    this.svc.exportarCSV(
      tiemposDetalle.data as unknown as Record<string, unknown>[],
      [
        { key: 'seccional',            label: 'Seccional'       },
        { key: 'unidad',               label: 'Unidad'          },
        { key: 'placa',                label: 'Placa'           },
        { key: 'nroLlamada',           label: 'Nro Llamada'     },
        { key: 'codigoCaso',           label: 'Caso'            },
        { key: 'descCaso',             label: 'Descripción'     },
        { key: 'horaLlamada',          label: 'H/Llamada'       },
        { key: 'horaEnvioCentral',     label: 'CALL-CENT H/Env' },
        { key: 'horaDespacho',         label: 'CALL-Desp H/Asig'},
        { key: 'horaLlegada',          label: 'H/Llegada Pat.'  },
        { key: 'horaTermino',          label: 'H/Termino'       },
        { key: 'tiempoDesplazamiento', label: 'Desplaz.'        },
        { key: 'tiempoAtencionCaso',   label: 'Atención Caso'   },
        { key: 'tiempoTotalCaso',      label: 'Tiempo Total'    },
      ],
      `tiempos_detalle_${this.desde}_${this.hasta}`
    );
  }

  // ── R4 — Operadores ───────────────────────────────────────────────────────

  cargarOperadores(): void {
    this.cargandoOpe.set(true);
    this.svc.getTrabajoOperadores({ desde: this.desde, hasta: this.hasta, fuerzaId: this.fuerzaId || undefined, turnoVigilancia: this.turnoVigilancia || undefined })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next:  r => { this.operadores.set(r.data ?? []); this.cargandoOpe.set(false); },
        error: () => { this.cargandoOpe.set(false); this.toast.error('Error', 'No se pudo cargar el reporte.'); }
      });
  }

  exportarOperadores(): void {
    this.svc.exportarCSV(
      this.operadores() as unknown as Record<string, unknown>[],
      [
        { key: 'usuario',            label: 'Usuario'              },
        { key: 'casosRecibidos',     label: 'Casos Recibidos'      },
        { key: 'eventosDespachados', label: 'Eventos Despachados'  },
        { key: 'actuaciones',        label: 'Actuaciones'          },
        { key: 'eventosCerrados',    label: 'Eventos Cerrados'     },
        { key: 'promMinDespacho',    label: 'Prom. Min. Despacho'  },
        { key: 'primeraActividad',   label: 'Primera Actividad'    },
        { key: 'ultimaActividad',    label: 'Última Actividad'     },
      ],
      `operadores_${this.desde}_${this.hasta}`
    );
  }

  // ── R5 — Códigos ─────────────────────────────────────────────────────────

  cargarCodigos(): void {
    this.cargandoCod.set(true);
    this.svc.getPorCodigo({
      desde: this.desde, hasta: this.hasta,
      fuerzaId: this.fuerzaId || undefined,
      top: this.topCodigos,
      turnoVigilancia: this.turnoVigilancia || undefined,
    }).pipe(takeUntil(this.destroy$))
      .subscribe({
        next:  r => {
          const data = r.data ?? [];
          this.codigos.set(data);
          this._maxCodigo = Math.max(...data.map(c => c.total), 1);
          this.cargandoCod.set(false);
        },
        error: () => { this.cargandoCod.set(false); this.toast.error('Error', 'No se pudo cargar el reporte.'); }
      });
  }

  exportarCodigos(): void {
    this.svc.exportarCSV(
      this.codigos() as unknown as Record<string, unknown>[],
      [
        { key: 'codigoCaso',  label: 'Código'      },
        { key: 'descripcion', label: 'Descripción' },
        { key: 'total',       label: 'Total'       },
        { key: 'porcentaje',  label: '% del total' },
      ],
      `codigos_${this.desde}_${this.hasta}`
    );
  }

  private _maxCodigo = 1;
  maxCodigo(): number { return this._maxCodigo; }

  // ── Helpers comunes ───────────────────────────────────────────────────────

  calidadLbl = (c: string) => this.svc.calidadLabel(c);
  calidadClr = (c: string) => this.svc.calidadColor(c);
  prioLbl    = (p: string) => this.svc.prioridadLabel(p);

  paginaInfo(res: DtoPagedResult<unknown>, pagina: number, limite: number): string {
    const desde = (pagina - 1) * limite + 1;
    const hasta = Math.min(pagina * limite, res.total);
    return `${desde}–${hasta} de ${res.total}`;
  }

  private hoy(): string { return this.formatDate(new Date()); }
  private formatDate(d: Date): string {
    const y   = d.getFullYear();
    const m   = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
