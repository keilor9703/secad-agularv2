import {
  Component, ChangeDetectionStrategy, OnInit, OnDestroy, AfterViewInit,
  NgZone, ElementRef,
  computed, inject, signal,
  viewChild
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
// Antes eran `declare const L` / `declare const Chart`, con las dos librerías
// llegando por <script> del CDN. La CSP de la plantilla es script-src 'self',
// así que esos scripts no cargarían: ahora se importan los paquetes.
import * as L from 'leaflet';
import { Chart, registerables } from 'chart.js';
import { Subject } from 'rxjs';
import { distinctUntilChanged, map, skip, takeUntil } from 'rxjs/operators';
import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiSectionHeaderComponent } from '../../../../shared/components/ui-section-header/ui-section-header.component';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiInputComponent } from '../../../../shared/components/ui-input/ui-input.component';
import { UiSelectComponent } from '../../../../shared/components/ui-select/ui-select.component';
import { UiToggleComponent } from '../../../../shared/components/ui-toggle/ui-toggle.component';
import { UiSpinnerComponent } from '../../../../shared/components/ui-spinner/ui-spinner.component';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';
import { AccessibilityService } from '../../../../core/services/accessibility.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import {
  MapaEstadisticoService,
  DtoFiltroEstadistico,
  DtoPuntoEstadistico,
  DtoMetricasEstadisticas,
  DtoAgrupacion
} from '../../../../core/services/operacion/mapa-estadistico.service';

// Chart.js v4 no auto-registra escalas ni tipos: sin esto las gráficas lanzan
// "\"category\" is not a registered scale" en tiempo de ejecución.
Chart.register(...registerables);

/**
 * leaflet.heat y leaflet.markercluster amplían el objeto L en tiempo de
 * ejecución, pero solo markercluster trae tipos. Este alias evita repetir el
 * cast en cada uso y deja claro qué se está tomando prestado.
 */
type LeafletConHeat = typeof L & {
  heatLayer(
    puntos: [number, number, number][],
    opciones?: Record<string, unknown>,
  ): L.Layer;
};

/**
 * Los dos plugins de Leaflet se enganchan al objeto `L` global, no al módulo:
 * importarlos arriba no basta porque los import se elevan y `window.L` todavía
 * no existe cuando se ejecutan. Se publica L y se cargan bajo demanda, una sola
 * vez, antes de dibujar cualquier capa.
 */
let pluginsLeaflet: Promise<void> | null = null;

function cargarPluginsLeaflet(): Promise<void> {
  if (!pluginsLeaflet) {
    (window as unknown as { L: typeof L }).L = L;
    pluginsLeaflet = Promise.all([
      import('leaflet.heat'),
      import('leaflet.markercluster'),
    ]).then(() => undefined);
  }
  return pluginsLeaflet;
}

type CapaMapa = 'puntos' | 'calor' | 'clusters';

@Component({
  selector: 'app-mapa-estadistico-page',
  standalone: true,
  imports: [
    DecimalPipe,
    FormsModule,
    UiPageHeaderComponent,
    UiSectionHeaderComponent,
    UiButtonComponent,
    UiInputComponent,
    UiSelectComponent,
    UiToggleComponent,
    UiSpinnerComponent,
  ],
  templateUrl: './mapa-estadistico-page.component.html',
  styleUrls: ['./mapa-estadistico-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MapaEstadisticoPageComponent implements OnInit, AfterViewInit, OnDestroy {

  // ── Filtros ───────────────────────────────────────────────────────────────
  filtro: DtoFiltroEstadistico = {
    desde:            this.defaultDesde(),
    hasta:            this.defaultHasta(),
    codiPedido:       '',
    prioridad:        '',
    ciudad:           '',
    barrio:           '',
    canalCodigo:      0,
    soloCerrados:     true,
    turnoVigilancia:  0
  };

  // Turnos de vigilancia — mismas franjas que el módulo de Reportes
  readonly turnos = [
    { value: 0, label: 'Todos los turnos'       },
    { value: 1, label: 'Primer turno  (22-05h)' },
    { value: 2, label: 'Segundo turno (06-13h)' },
    { value: 3, label: 'Tercer turno  (14-21h)' },
  ];

  // Opciones de los selectores del kit. En el origen eran <option> sueltos
  // repetidos en la plantilla.
  readonly opcionesTurno: UiSelectOption<number>[] = this.turnos.map(t => ({
    label: t.label,
    value: t.value,
  }));

  // Las listas de ciudad y barrio llegan del backend como string[]; el kit
  // pide {label, value} y añade la opción "todas".
  readonly opcionesCiudad = computed<UiSelectOption<string>[]>(() => [
    { label: 'Todas las ciudades', value: '' },
    ...this.ciudades().map(c => ({ label: c, value: c })),
  ]);

  /**
   * Los barrios solo se cargan una vez elegida la ciudad. Sin esa distinción el
   * campo anunciaba «sin barrios» nada más entrar, cuando en realidad todavía
   * no se había preguntado por ninguno.
   */
  readonly hintBarrio = computed(() => {
    const ciudad = this.esSuperAdmin ? this.filtro.ciudad : this.ciudadUsuario;
    if (!ciudad) return 'Elija primero una ciudad.';
    if (this.cargandoListas()) return '';
    return this.barrios().length ? '' : 'Esta ciudad no tiene barrios registrados.';
  });

  readonly opcionesBarrio = computed<UiSelectOption<string>[]>(() => [
    { label: 'Todos los barrios', value: '' },
    ...this.barrios().map(b => ({ label: b, value: b })),
  ]);

  readonly opcionesPrioridad: UiSelectOption<string>[] = [
    { label: 'Todas las prioridades', value: '' },
    { label: 'Flash',      value: 'FLASH'     },
    { label: 'Inmediata',  value: 'INMEDIATA' },
    { label: 'Rutina',     value: 'RUTINA'    },
  ];

  // ── Estado ────────────────────────────────────────────────────────────────
  readonly cargando       = signal(false);
  readonly errorCarga     = signal(false);
  readonly consultado     = signal(false);
  readonly cargandoListas = signal(false);

  // ── Listas desplegables ───────────────────────────────────────────────────
  readonly ciudades = signal<string[]>([]);
  readonly barrios  = signal<string[]>([]);

  // ── Claims del usuario ────────────────────────────────────────────────────
  esSuperAdmin   = false;
  ciudadUsuario  = '';   // ciudad auto-detectada para no-superadmin
  private sitioGraba = 0;

  // ── Datos ─────────────────────────────────────────────────────────────────
  readonly puntos   = signal<DtoPuntoEstadistico[]>([]);
  readonly metricas = signal<DtoMetricasEstadisticas>(this.metricasVacias());

  // ── Mapa ──────────────────────────────────────────────────────────────────
  capaActiva: CapaMapa = 'calor';
  // El contenedor se toma por referencia de plantilla: un id global en el DOM
  // se rompe en cuanto dos vistas coexisten durante una transición de ruta.
  readonly mapaRef = viewChild.required<ElementRef<HTMLDivElement>>('mapaDiv');
  private map: L.Map | null = null;
  private heatLayer: L.Layer | null = null;
  private clusterGroup: L.MarkerClusterGroup | null = null;
  private puntosGroup: L.LayerGroup | null = null;
  private municipioLayer: L.GeoJSON | null = null;
  private cuadrantesLayer: L.GeoJSON | null = null;
  private readonly ARCGIS_BASE =
    'https://services3.arcgis.com/8cBoM4o6pnuUb1z1/ArcGIS/rest/services/SIDENCO_SinMalla/FeatureServer';

  // ── Gráficas Chart.js ─────────────────────────────────────────────────────
  readonly chartTipoRef = viewChild.required<ElementRef<HTMLCanvasElement>>('chartTipo');
  readonly chartHoraRef = viewChild.required<ElementRef<HTMLCanvasElement>>('chartHora');
  readonly chartDiaRef = viewChild.required<ElementRef<HTMLCanvasElement>>('chartDia');
  readonly chartMesRef = viewChild.required<ElementRef<HTMLCanvasElement>>('chartMes');
  readonly chartPrioRef = viewChild.required<ElementRef<HTMLCanvasElement>>('chartPrioridad');

  private charts: Map<string, any> = new Map();

  // ── Internos ──────────────────────────────────────────────────────────────
  private codDane  = '';
  private destroy$ = new Subject<void>();

  private readonly auth  = inject(AuthService);
  private readonly accesibilidad = inject(AccessibilityService);
  private readonly svc   = inject(MapaEstadisticoService);
  private readonly toast = inject(ToastService);
  private readonly zone  = inject(NgZone);

  // ══════════════════════════════════════════════════════════════════════════
  //  Lifecycle
  // ══════════════════════════════════════════════════════════════════════════

  ngOnInit(): void {
    // Chart.js congela el color del texto al crear cada gráfica: si el usuario
    // cambia de tema después de analizar, las etiquetas quedan del color
    // anterior (en oscuro, invisibles). Se repintan con el tema nuevo.
    this.accesibilidad.accessibility$
      .pipe(
        map(estado => estado.darkMode),
        distinctUntilChanged(),
        skip(1),
        takeUntil(this.destroy$),
      )
      .subscribe(() => {
        if (this.consultado()) this.renderCharts();
      });

    const claims      = this.auth.getJwtClaims();
    this.codDane      = claims.codDane;
    this.esSuperAdmin = claims.esSuperAdmin;
    this.sitioGraba   = claims.sitioGraba ?? 0;

    if (!this.esSuperAdmin) {
      // Para operadores la ciudad viene del nombre del CAD o nombreCad
      this.ciudadUsuario = claims.nombreCad || '';
    }

    this.cargarListas();
  }

  ngAfterViewInit(): void {
    this.initMap();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.destroyCharts();
    if (this.map) { this.map.off(); this.map.remove(); this.map = null; }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Listas (ciudades / barrios)
  // ══════════════════════════════════════════════════════════════════════════

  private cargarListas(): void {
    this.cargandoListas.set(true);

    if (this.esSuperAdmin) {
      this.svc.getCiudades()
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: list => {
            this.ciudades.set(list);
            // Si solo hay una ciudad la preseleccionamos y cargamos sus barrios
            if (list.length === 1) {
              this.filtro.ciudad = list[0];
              this.cargarBarrios(list[0]);
            } else {
              this.cargandoListas.set(false);
            }
          },
          error: () => { this.cargandoListas.set(false); }
        });
    } else {
      // Operador: solo carga barrios, acotados a su propio sitio (sitioGraba).
      // Antes se pedía sin ciudad y sin sitio, trayendo barrios de TODAS las
      // ciudades/CADs del sistema en vez de solo los del tenant del operador.
      this.cargarBarrios('');
    }
  }

  private cargarBarrios(ciudad: string): void {
    this.cargandoListas.set(true);
    this.svc.getBarrios(ciudad || undefined, this.esSuperAdmin ? undefined : this.sitioGraba)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: list => {
          this.barrios.set(list);
          this.cargandoListas.set(false);
        },
        error: () => { this.cargandoListas.set(false); }
      });
  }

  onCiudadChange(): void {
    this.filtro.barrio = '';
    this.barrios.set([]);
    if (this.filtro.ciudad) {
      this.cargarBarrios(this.filtro.ciudad);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Consulta
  // ══════════════════════════════════════════════════════════════════════════

  consultar(): void {
    if (!this.filtro.desde || !this.filtro.hasta) {
      this.toast.warning('Filtros', 'Debe seleccionar un rango de fechas.');
      return;
    }
    if (this.filtro.desde > this.filtro.hasta) {
      this.toast.warning('Filtros', 'La fecha "Desde" no puede ser posterior a "Hasta".');
      return;
    }
    this.cargando.set(true);
    this.errorCarga.set(false);

    this.svc.getAnalisis(this.filtro)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.zone.run(() => {
            this.cargando.set(false);
            this.consultado.set(true);
            // Un solo punto con coordenadas no numéricas rompía L.circleMarker/
            // L.heatLayer a mitad del bucle de render, dejando el mapa Y las
            // gráficas sin dibujar para toda la consulta (el error interrumpía
            // actualizarMapa() antes de llegar al setTimeout de renderCharts()).
            const puntos = (data.puntos ?? []).filter(p =>
              Number.isFinite(p.lat) && Number.isFinite(p.lng) &&
              Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180
            );
            this.puntos.set(puntos);
            let metricas = data.metricas ?? this.metricasVacias();
            // Fallback: si el backend no devolvió métricas pero hay puntos,
            // las calculamos en el cliente para garantizar que los gráficos funcionen.
            if (metricas.total === 0 && puntos.length > 0) {
              metricas = this.computeMetricasFromPuntos();
            }
            this.metricas.set(metricas);
            this.actualizarMapa();
            setTimeout(() => this.renderCharts(), 100);
          });
        },
        error: () => {
          this.zone.run(() => {
            this.cargando.set(false);
            this.errorCarga.set(true);
          });
          this.toast.error('GIS Estadístico', 'Error al consultar los datos.');
        }
      });
  }

  limpiarFiltros(): void {
    this.filtro = {
      desde: this.defaultDesde(), hasta: this.defaultHasta(),
      codiPedido: '', prioridad: '', ciudad: '', barrio: '',
      canalCodigo: 0, soloCerrados: true, turnoVigilancia: 0
    };
    if (this.esSuperAdmin) this.barrios.set([]);

    // Antes "Limpiar" solo reseteaba el formulario: el mapa, el panel de
    // resumen y las gráficas seguían mostrando la consulta anterior, dando
    // la falsa impresión de que correspondían a "todos los incidentes".
    this.consultado.set(false);
    this.puntos.set([]);
    this.metricas.set(this.metricasVacias());
    this.limpiarCapasIncidentes();
    this.destroyCharts();
  }

  turnoLabel(v: number): string {
    return this.turnos.find(t => t.value === v)?.label ?? 'Todos';
  }

  turnoBadgeColor(v: number): string {
    return ['#64748b', '#dc2626', '#2563eb', '#7c3aed'][v] ?? '#64748b';
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Exportar informe PDF
  // ══════════════════════════════════════════════════════════════════════════

  generarInforme(): void {
    const metricas = this.metricas();
    const puntos   = this.puntos();
    // Capturar cada gráfica como imagen PNG desde su <canvas>
    const imgTipo  = this.chartTipoRef()?.nativeElement?.toDataURL('image/png') ?? '';
    const imgHora  = this.chartHoraRef()?.nativeElement?.toDataURL('image/png') ?? '';
    const imgDia   = this.chartDiaRef()?.nativeElement?.toDataURL('image/png')  ?? '';
    const imgMes   = this.chartMesRef()?.nativeElement?.toDataURL('image/png')  ?? '';
    const imgPrio  = this.chartPrioRef()?.nativeElement?.toDataURL('image/png') ?? '';

    const filtrosTexto = [
      `Período: ${this.escapeHtml(this.filtro.desde)} → ${this.escapeHtml(this.filtro.hasta)}`,
      (this.filtro.turnoVigilancia ?? 0) > 0 ? `Turno: ${this.escapeHtml(this.turnoLabel(this.filtro.turnoVigilancia!))}` : null,
      this.filtro.prioridad   ? `Prioridad: ${this.escapeHtml(this.filtro.prioridad)}` : null,
      this.filtro.codiPedido  ? `Código caso: ${this.escapeHtml(this.filtro.codiPedido)}` : null,
      !this.esSuperAdmin && this.ciudadUsuario ? `Ciudad: ${this.escapeHtml(this.ciudadUsuario)}` : null,
      this.esSuperAdmin && this.filtro.ciudad  ? `Ciudad: ${this.escapeHtml(this.filtro.ciudad)}` : null,
      this.filtro.barrio      ? `Barrio: ${this.escapeHtml(this.filtro.barrio)}` : null,
      this.filtro.soloCerrados ? 'Solo incidentes cerrados' : 'Todos los incidentes',
    ].filter(Boolean).join(' &nbsp;|&nbsp; ');

    const topCasos = metricas.porTipoCaso.slice(0, 10)
      .map((c, i) => `<tr>
        <td>${i + 1}</td>
        <td>${this.escapeHtml(c.clave)}</td>
        <td>${this.escapeHtml(c.descripcion)}</td>
        <td style="text-align:right;font-weight:700">${c.total.toLocaleString('es-CO')}</td>
      </tr>`).join('');

    const topCiudades = metricas.porCiudad.length ? `
      <div class="seccion">
        <h2>Distribución por ciudad / municipio</h2>
        <table>
          <thead><tr><th>#</th><th>Ciudad</th><th style="text-align:right">Incidentes</th></tr></thead>
          <tbody>
            ${metricas.porCiudad.slice(0, 8).map((c, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${this.escapeHtml(c.descripcion)}</td>
                <td style="text-align:right;font-weight:700">${c.total.toLocaleString('es-CO')}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>` : '';

    const ahora = new Date().toLocaleString('es-CO', {
      dateStyle: 'long', timeStyle: 'short'
    });

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Informe GIS Estadístico Delincuencial</title>
  <style>
    @page { size: A4; margin: 18mm 15mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #222; background: #fff; }

    /* ── Encabezado ─────────────────────────────────────── */
    .encabezado {
      display: flex; align-items: center; justify-content: space-between;
      border-bottom: 3px solid #003087; padding-bottom: 10px; margin-bottom: 14px;
    }
    .encabezado-titulo h1 { font-size: 17px; color: #003087; font-weight: 900; line-height: 1.2; }
    .encabezado-titulo p  { font-size: 10px; color: #666; margin-top: 3px; }
    .encabezado-logo { text-align: right; font-size: 10px; color: #999; }
    .encabezado-logo strong { display: block; font-size: 13px; color: #003087; }

    /* ── Filtros ─────────────────────────────────────────── */
    .filtros {
      background: #f0f4ff; border: 1px solid #c0d0f0; border-radius: 5px;
      padding: 7px 12px; font-size: 10px; color: #334; margin-bottom: 14px;
    }
    .filtros strong { color: #003087; }

    /* ── KPIs ────────────────────────────────────────────── */
    .kpis { display: flex; gap: 8px; margin-bottom: 16px; }
    .kpi {
      flex: 1; border-radius: 7px; padding: 10px 8px; text-align: center;
      border: 1px solid #e0e0e0;
    }
    .kpi-valor { font-size: 26px; font-weight: 900; line-height: 1; }
    .kpi-label { font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: #666; margin-top: 4px; }
    .kpi-total  { background: #f0f4ff; }  .kpi-total  .kpi-valor { color: #003087; }
    .kpi-flash  { background: #fff0f0; }  .kpi-flash  .kpi-valor { color: #cc0000; }
    .kpi-inmd   { background: #fff6ee; }  .kpi-inmd   .kpi-valor { color: #e67300; }
    .kpi-rut    { background: #f0f6ff; }  .kpi-rut    .kpi-valor { color: #0066cc; }
    .kpi-coord  { background: #f0fff4; }  .kpi-coord  .kpi-valor { color: #00a36c; }

    /* ── Secciones ───────────────────────────────────────── */
    .seccion { margin-bottom: 18px; break-inside: avoid; }
    .seccion h2 {
      font-size: 11px; font-weight: 800; text-transform: uppercase;
      letter-spacing: .06em; color: #003087; border-left: 3px solid #003087;
      padding-left: 7px; margin-bottom: 8px;
    }

    /* ── Gráficas ────────────────────────────────────────── */
    .graficas-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .grafica-card  {
      border: 1px solid #e8e8e8; border-radius: 6px; padding: 10px;
      break-inside: avoid;
    }
    .grafica-card h3 {
      font-size: 9px; font-weight: 800; text-transform: uppercase;
      color: #003087; margin-bottom: 6px; letter-spacing: .05em;
    }
    .grafica-card img { width: 100%; height: auto; display: block; }
    .grafica-full   { grid-column: 1 / -1; }

    /* ── Tabla ───────────────────────────────────────────── */
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    thead tr { background: #003087; color: #fff; }
    thead th { padding: 5px 7px; text-align: left; font-weight: 700; font-size: 9px; text-transform: uppercase; }
    tbody tr:nth-child(even) { background: #f8f9fc; }
    tbody td { padding: 4px 7px; color: #333; border-bottom: 1px solid #eee; }

    /* ── Pie de página ───────────────────────────────────── */
    .pie {
      margin-top: 20px; padding-top: 8px; border-top: 1px solid #ddd;
      font-size: 9px; color: #aaa; display: flex; justify-content: space-between;
    }

    /* ── Insights ────────────────────────────────────────── */
    .insights { display: flex; gap: 8px; margin-bottom: 16px; }
    .insight {
      flex: 1; background: #fafbff; border: 1px solid #e0e8f0;
      border-radius: 5px; padding: 8px 10px; font-size: 10px;
    }
    .insight-label { color: #888; font-size: 9px; text-transform: uppercase; margin-bottom: 3px; }
    .insight-valor { font-weight: 700; color: #003087; font-size: 12px; }
  </style>
</head>
<body>

  <!-- Encabezado -->
  <div class="encabezado">
    <div class="encabezado-titulo">
      <h1>Informe GIS Estadístico Delincuencial</h1>
      <p>Sistema de Análisis de Incidentes — SECAD OFTIC</p>
    </div>
    <div class="encabezado-logo">
      <strong>OFTIC · SECAD</strong>
      Generado: ${ahora}
    </div>
  </div>

  <!-- Filtros aplicados -->
  <div class="filtros">
    <strong>Parámetros de consulta:</strong> &nbsp; ${filtrosTexto}
  </div>

  <!-- KPIs principales -->
  <div class="kpis">
    <div class="kpi kpi-total">
      <div class="kpi-valor">${metricas.total.toLocaleString('es-CO')}</div>
      <div class="kpi-label">Total incidentes</div>
    </div>
    <div class="kpi kpi-flash">
      <div class="kpi-valor">${metricas.totalFlash.toLocaleString('es-CO')}</div>
      <div class="kpi-label">Flash</div>
    </div>
    <div class="kpi kpi-inmd">
      <div class="kpi-valor">${metricas.totalInmd.toLocaleString('es-CO')}</div>
      <div class="kpi-label">Inmediata</div>
    </div>
    <div class="kpi kpi-rut">
      <div class="kpi-valor">${metricas.totalRutina.toLocaleString('es-CO')}</div>
      <div class="kpi-label">Rutina</div>
    </div>
    <div class="kpi kpi-coord">
      <div class="kpi-valor">${puntos.length.toLocaleString('es-CO')}</div>
      <div class="kpi-label">Con coordenadas</div>
    </div>
  </div>

  <!-- Insights clave -->
  <div class="insights">
    <div class="insight">
      <div class="insight-label">Tipo más frecuente</div>
      <div class="insight-valor">${this.topCaso ? this.escapeHtml(this.topCaso.descripcion || this.topCaso.clave) + ' (' + this.topCaso.total + ')' : '—'}</div>
    </div>
    <div class="insight">
      <div class="insight-label">Hora pico de incidentes</div>
      <div class="insight-valor">${this.horaPico}</div>
    </div>
    <div class="insight">
      <div class="insight-label">Día más activo</div>
      <div class="insight-valor">${this.diaPico}</div>
    </div>
  </div>

  <!-- Gráficas -->
  <div class="seccion">
    <h2>Análisis estadístico</h2>
    <div class="graficas-grid">
      ${imgPrio  ? `<div class="grafica-card"><h3>Distribución por prioridad</h3><img src="${imgPrio}"></div>` : ''}
      ${imgTipo  ? `<div class="grafica-card grafica-full"><h3>Top tipos de caso</h3><img src="${imgTipo}"></div>` : ''}
      ${imgHora  ? `<div class="grafica-card grafica-full"><h3>Incidentes por hora del día</h3><img src="${imgHora}"></div>` : ''}
      ${imgDia   ? `<div class="grafica-card"><h3>Por día de la semana</h3><img src="${imgDia}"></div>` : ''}
      ${imgMes   ? `<div class="grafica-card"><h3>Tendencia mensual</h3><img src="${imgMes}"></div>` : ''}
    </div>
  </div>

  <!-- Top tipos de caso (tabla) -->
  ${topCasos ? `
  <div class="seccion">
    <h2>Ranking de tipos de caso</h2>
    <table>
      <thead><tr><th>#</th><th>Código</th><th>Descripción</th><th style="text-align:right">Incidentes</th></tr></thead>
      <tbody>${topCasos}</tbody>
    </table>
  </div>` : ''}

  <!-- Top ciudades -->
  ${topCiudades}

  <!-- Pie de página -->
  <div class="pie">
    <span>SECAD · Sistema de Estadísticas Delincuenciales · OFTIC</span>
    <span>Documento generado el ${ahora} — Confidencial</span>
  </div>

</body>
</html>`;

    const ventana = window.open('', '_blank', 'width=900,height=700');
    if (ventana) {
      ventana.document.write(html);
      ventana.document.close();
      // El disparo de impresión va aquí y no en un <script> del propio informe:
      // la ventana hereda la CSP de esta (script-src 'self'), que bloquearía
      // cualquier script en línea y dejaría el informe sin imprimirse.
      ventana.addEventListener('load', () => ventana.print());
    } else {
      this.toast.warning('Informe bloqueado', 'El navegador bloqueó la ventana emergente. Habilite popups para este sitio e intente de nuevo.');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Mapa Leaflet
  // ══════════════════════════════════════════════════════════════════════════

  private initMap(): void {
    const mapa = L.map(this.mapaRef().nativeElement, { zoomControl: true })
                  .setView([4.7110, -74.0721], 11);
    this.map = mapa;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(mapa);

    if (this.codDane) this.cargarCapaMunicipios(this.codDane);
    setTimeout(() => this.map?.invalidateSize(), 200);
  }

  cambiarCapa(capa: CapaMapa): void {
    this.capaActiva = capa;
    this.actualizarMapa();
  }

  private actualizarMapa(): void {
    if (!this.map) return;
    this.limpiarCapasIncidentes();
    if (this.puntos().length === 0) return;

    // Calor y grupos dependen de los plugins; puntos usa Leaflet a secas y se
    // dibuja sin esperar. La promesa está resuelta salvo en el primer análisis.
    if (this.capaActiva === 'puntos') {
      this.renderPuntos();
      return;
    }

    const capa = this.capaActiva;
    cargarPluginsLeaflet().then(() => {
      // Entre la petición y la carga el operador pudo cambiar de capa.
      if (this.capaActiva !== capa || !this.map) return;
      this.zone.run(() => {
        if (capa === 'calor') this.renderHeatmap();
        else this.renderClusters();
      });
    }).catch(() => {
      this.zone.run(() =>
        this.toast.error('Mapa', 'No se pudieron cargar las capas de calor y agrupación.'));
    });
  }

  private limpiarCapasIncidentes(): void {
    const mapa = this.map;
    if (!mapa) return;
    if (this.heatLayer)    { mapa.removeLayer(this.heatLayer);    this.heatLayer    = null; }
    if (this.clusterGroup) { mapa.removeLayer(this.clusterGroup); this.clusterGroup = null; }
    if (this.puntosGroup)  { mapa.removeLayer(this.puntosGroup);  this.puntosGroup  = null; }
  }

  // ── Capa de calor ──────────────────────────────────────────────────────────

  private renderHeatmap(): void {
    const mapa = this.map;
    if (!mapa) return;
    const heatData: [number, number, number][] =
      this.puntos().map(p => [p.lat, p.lng, p.intensidad]);
    this.heatLayer = (L as LeafletConHeat).heatLayer(heatData, {
      radius:     45,
      blur:       35,
      maxZoom:    18,
      max:        1.0,
      minOpacity: 0.5,
      gradient: {
        0.0:  '#000033',
        0.25: '#0000ff',
        0.45: '#00ccff',
        0.60: '#00ff88',
        0.75: '#ffff00',
        0.88: '#ff6600',
        1.0:  '#ff0000'
      }
    }).addTo(mapa);
  }

  // ── Capa de clusters ──────────────────────────────────────────────────────

  private renderClusters(): void {
    const mapa = this.map;
    if (!mapa) return;

    const grupo = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius:    70,
      iconCreateFunction: (cluster: any) => {
        const count    = cluster.getChildCount();
        const size     = count < 10 ? 38 : count < 50 ? 48 : count < 200 ? 56 : 64;
        const fontSize = count > 99 ? 11 : 14;
        // Color según volumen: azul < 10, naranja < 50, rojo ≥ 50
        const bg = count < 10 ? '#0066cc' : count < 50 ? '#e67300' : '#cc0000';
        // Inline styles — Leaflet inyecta el HTML fuera del árbol Angular,
        // por lo que las clases SCSS no aplican. Todo debe ir en style="".
        const html = `<div style="
          width:${size}px; height:${size}px; line-height:${size}px;
          font-size:${fontSize}px; font-family:inherit;
          background:${bg}; color:#fff; font-weight:900; text-align:center;
          border-radius:50%;
          border:2.5px solid rgba(255,255,255,.80);
          box-shadow:0 3px 14px rgba(0,0,0,.45), 0 0 0 4px rgba(255,255,255,.20);
          cursor:pointer; display:flex; align-items:center; justify-content:center;
        ">${count}</div>`;
        return (L as any).divIcon({
          html,
          className:  '',
          iconSize:   [size, size],
          iconAnchor: [size / 2, size / 2]
        });
      }
    });

    for (const p of this.puntos()) {
      const color  = this.colorPrioridad(p.prioridad);
      const marker = L.circleMarker([p.lat, p.lng], {
        radius:      10,
        fillColor:   color,
        color:       '#ffffff',
        weight:      2.5,
        opacity:     1,
        fillOpacity: 0.92
      }).bindPopup(this.buildPopup(p));
      grupo.addLayer(marker);
    }
    this.clusterGroup = grupo;
    mapa.addLayer(grupo);
  }

  // ── Capa de puntos individuales ───────────────────────────────────────────

  private renderPuntos(): void {
    const mapa = this.map;
    if (!mapa) return;

    const grupo = L.layerGroup();
    for (const p of this.puntos()) {
      const color = this.colorPrioridad(p.prioridad);
      // Halo exterior (ring blanco semitransparente)
      L.circleMarker([p.lat, p.lng], {
        radius:      14,
        fillColor:   color,
        color:       color,
        weight:      0,
        opacity:     0,
        fillOpacity: 0.22,
        interactive: false
      }).addTo(grupo);
      // Punto principal
      L.circleMarker([p.lat, p.lng], {
        radius:      9,
        fillColor:   color,
        color:       '#ffffff',
        weight:      2.5,
        opacity:     1,
        fillOpacity: 0.95
      })
       .bindPopup(this.buildPopup(p))
       .addTo(grupo);
    }
    this.puntosGroup = grupo;
    grupo.addTo(mapa);
  }

  /**
   * Escapa HTML para interpolación segura en popups de Leaflet e informes.
   * bindPopup()/document.write() asignan el string vía innerHTML — nunca pasa
   * por el sanitizador de Angular. Todo campo de texto libre digitado por un
   * operador (dirección, descripción, barrio, código de caso…) debe pasar por
   * aquí antes de interpolarse, o un valor malicioso capturado en, por
   * ejemplo, dire_caso se ejecutaría en la sesión del analista que abra el
   * mapa o genere el informe (mismo patrón corregido en Mapa de Incidentes).
   */
  private escapeHtml(value: string | number | null | undefined): string {
    if (value == null) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private buildPopup(p: DtoPuntoEstadistico): string {
    const codiPedido = this.escapeHtml(p.codiPedido);
    const descPedido = this.escapeHtml(p.descPedido) || 'Sin descripción';
    const direCaso    = this.escapeHtml(p.direCaso) || '—';
    const barrio      = this.escapeHtml(p.barrio);
    const ciudad      = this.escapeHtml(p.ciudad);
    const horaCaso    = this.escapeHtml(p.horaCaso);
    const id          = this.escapeHtml(p.id);
    return `
      <div style="font-family:sans-serif;min-width:190px;font-size:12px">
        <div style="font-weight:700;color:var(--ui-text,#003087);margin-bottom:5px;font-size:13px">
          ${codiPedido} — ${descPedido}
        </div>
        <div style="margin-bottom:2px;color:var(--ui-text,#111)">
          <i class="fa-solid fa-location-dot" style="color:#cc0000"></i>
          <strong>${direCaso}</strong>
        </div>
        ${barrio ? `<div style="color:var(--ui-muted,#666);margin-bottom:2px">${barrio}${ciudad ? ', ' + ciudad : ''}</div>` : ''}
        <div style="margin-top:5px;margin-bottom:5px">
          <span style="background:${this.colorPrioridad(p.prioridad)};color:#fff;padding:2px 9px;
                       border-radius:10px;font-size:10px;font-weight:700;letter-spacing:.04em">
            ${this.labelPrioridad(p.prioridad)}
          </span>
          <span style="color:var(--ui-muted,#888);font-size:10px;margin-left:6px">
            <i class="fa-regular fa-clock"></i> ${horaCaso}
          </span>
        </div>
        <div style="font-size:10px;color:var(--ui-muted,#aaa)">ID: ${id}</div>
      </div>`;
  }

  // ── Capas institucionales ─────────────────────────────────────────────────

  private cargarCapaMunicipios(codDane: string): void {
    const url = `${this.ARCGIS_BASE}/3/query?where=CODIGO='${encodeURIComponent(codDane)}'&outFields=CODIGO,NOMBRE&returnGeometry=true&f=geojson`;
    fetch(url).then(r => r.json()).then((g: GeoJSON.GeoJsonObject) => {
      const mapa = this.map;
      if (!mapa) return;
      this.municipioLayer = L.geoJSON(g, {
        style: { color: '#003087', weight: 2.5, fillColor: '#7d7d7d', fillOpacity: 0.06 }
      }).addTo(mapa);
      const bounds = this.municipioLayer.getBounds();
      if (bounds.isValid()) {
        mapa.fitBounds(bounds, { padding: [20, 20] });
        this.cargarCuadrantesPorBbox(bounds);
      }
    }).catch(() => {
      this.zone.run(() => this.toast.warning('Mapa', 'No se pudo cargar la capa de municipio (servicio GIS no disponible).'));
    });
  }

  private cargarCuadrantesPorBbox(bounds: L.LatLngBounds): void {
    const sw = bounds.getSouthWest(), ne = bounds.getNorthEast();
    const bbox = `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`;
    const url  = `${this.ARCGIS_BASE}/11/query?geometry=${encodeURIComponent(bbox)}&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true&f=geojson&resultRecordCount=2000`;
    fetch(url).then(r => r.json()).then((g: GeoJSON.GeoJsonObject) => {
      const mapa = this.map;
      if (!mapa) return;
      if (this.cuadrantesLayer) mapa.removeLayer(this.cuadrantesLayer);
      this.cuadrantesLayer = L.geoJSON(g, {
        style: { color: '#ff0000', weight: 1.2, fillOpacity: 0, opacity: 0.45 }
      }).addTo(mapa);
    }).catch(() => {
      this.zone.run(() => this.toast.warning('Mapa', 'No se pudo cargar la capa de cuadrantes (servicio GIS no disponible).'));
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Gráficas Chart.js
  // ══════════════════════════════════════════════════════════════════════════

  /** Color de texto/grilla de Chart.js según el tema activo (--ui-text/--ui-border no son
   *  estáticos: se leen en cada render porque el usuario puede alternar modo oscuro sin recargar. */
  private chartTextColor(): string {
    return getComputedStyle(document.documentElement).getPropertyValue('--ui-text').trim() || '#0f172a';
  }
  private chartGridColor(): string {
    return getComputedStyle(document.documentElement).getPropertyValue('--ui-border').trim() || 'rgba(21,27,59,.14)';
  }

  private renderCharts(): void {
    this.destroyCharts();
    this.renderChartTipo();
    this.renderChartHora();
    this.renderChartDia();
    this.renderChartMes();
    this.renderChartPrioridad();
  }

  private renderChartTipo(): void {
    const ref = this.chartTipoRef()?.nativeElement;
    if (!ref) return;
    const top = this.metricas().porTipoCaso.slice(0, 12);
    const text = this.chartTextColor();
    this.charts.set('tipo', new Chart(ref, {
      type: 'bar',
      data: {
        labels:   top.map(x => x.descripcion || x.clave),
        datasets: [{ label: 'Incidentes', data: top.map(x => x.total),
          backgroundColor: this.paleta(top.length), borderRadius: 4 }]
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales:  {
          x: { grid: { display: false }, ticks: { color: text } },
          // autoSkip a false: con doce tipos Chart.js escondía la mitad de las
          // etiquetas y quedaban barras sin nombre. El alto de la caja ya se
          // calcula en función del número de barras.
          y: { ticks: { font: { size: 10 }, color: text, autoSkip: false } }
        }
      }
    }));
  }

  private renderChartHora(): void {
    const ref = this.chartHoraRef()?.nativeElement;
    if (!ref) return;
    const horas = Array.from({ length: 24 }, (_, i) => {
      const found = this.metricas().porHora.find(h => h.clave === String(i));
      return found?.total ?? 0;
    });
    const text = this.chartTextColor();
    const grid = this.chartGridColor();
    this.charts.set('hora', new Chart(ref, {
      type: 'line',
      data: {
        labels:   Array.from({ length: 24 }, (_, i) => `${i}h`),
        datasets: [{ label: 'Incidentes por hora', data: horas, fill: true,
          borderColor: '#003087', backgroundColor: 'rgba(0,48,135,0.15)',
          tension: 0.4, pointRadius: 3 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: text }, grid: { color: grid } },
          y: { beginAtZero: true, ticks: { stepSize: 1, color: text }, grid: { color: grid } }
        }
      }
    }));
  }

  private renderChartDia(): void {
    const ref = this.chartDiaRef()?.nativeElement;
    if (!ref) return;
    const dias  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    const vals  = Array.from({ length: 7 }, (_, i) => {
      return this.metricas().porDiaSemana.find(d => d.clave === String(i))?.total ?? 0;
    });
    const text = this.chartTextColor();
    const grid = this.chartGridColor();
    this.charts.set('dia', new Chart(ref, {
      type: 'bar',
      data: {
        labels:   dias,
        datasets: [{ label: 'Por día', data: vals,
          backgroundColor: 'rgba(0,48,135,0.7)', borderRadius: 4 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: text }, grid: { color: grid } },
          y: { beginAtZero: true, ticks: { color: text }, grid: { color: grid } }
        }
      }
    }));
  }

  private renderChartMes(): void {
    const ref = this.chartMesRef()?.nativeElement;
    if (!ref) return;
    const meses = this.metricas().porMes;
    const text = this.chartTextColor();
    const grid = this.chartGridColor();
    this.charts.set('mes', new Chart(ref, {
      type: 'line',
      data: {
        labels:   meses.map(m => m.clave),
        datasets: [{ label: 'Tendencia', data: meses.map(m => m.total),
          borderColor: '#e67300', backgroundColor: 'rgba(230,115,0,0.1)',
          fill: true, tension: 0.3, pointRadius: 3 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: text }, grid: { color: grid } },
          y: { beginAtZero: true, ticks: { color: text }, grid: { color: grid } }
        }
      }
    }));
  }

  private renderChartPrioridad(): void {
    const ref = this.chartPrioRef()?.nativeElement;
    if (!ref) return;
    const items = this.metricas().porPrioridad.filter(x => x.total > 0);
    this.charts.set('prio', new Chart(ref, {
      type: 'doughnut',
      data: {
        labels:   items.map(x => x.descripcion),
        datasets: [{ data: items.map(x => x.total),
          backgroundColor: ['#cc0000','#e67300','#0066cc','#888888'],
          borderWidth: 2 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, color: this.chartTextColor() } } }
      }
    }));
  }

  private destroyCharts(): void {
    this.charts.forEach(c => { try { c.destroy(); } catch {} });
    this.charts.clear();
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Helpers de UI
  // ══════════════════════════════════════════════════════════════════════════

  colorPrioridad(p: string): string {
    const u = (p || '').toUpperCase();
    if (u === 'FLASH'    || u === '01') return '#cc0000';
    if (u === 'INMEDIATA'|| u === '02') return '#e67300';
    if (u === 'RUTINA'   || u === '03') return '#0066cc';
    return '#888888';
  }

  labelPrioridad(p: string): string {
    const u = (p || '').toUpperCase();
    if (u === 'FLASH'    || u === '01') return 'Flash';
    if (u === 'INMEDIATA'|| u === '02') return 'Inmediata';
    if (u === 'RUTINA'   || u === '03') return 'Rutina';
    return p || '—';
  }

  get topCaso(): DtoAgrupacion | null {
    return this.metricas().porTipoCaso[0] ?? null;
  }

  get horaPico(): string {
    if (!this.metricas().porHora.length) return '—';
    const max = this.metricas().porHora.reduce((a, b) => b.total > a.total ? b : a);
    return `${max.clave}:00 h`;
  }

  get diaPico(): string {
    if (!this.metricas().porDiaSemana.length) return '—';
    const max = this.metricas().porDiaSemana.reduce((a, b) => b.total > a.total ? b : a);
    return max.descripcion;
  }

  private paleta(n: number): string[] {
    const base = ['#003087','#0055d4','#0077e6','#3399ff','#66b3ff',
                  '#e67300','#cc0000','#00a36c','#6f42c1','#fd7e14',
                  '#20c997','#d63384'];
    return Array.from({ length: n }, (_, i) => base[i % base.length]);
  }

  /**
   * yyyy-MM-dd en hora LOCAL. Date.toISOString() convierte a UTC antes de
   * recortar la fecha — en Bogotá (UTC-5), a partir de ~19:00 locales ya es
   * "mañana" en UTC, así que el rango de fechas por defecto quedaba corrido
   * un día en el horario típico de operación de un CAD.
   */
  private fechaLocalIso(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private defaultDesde(): string {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return this.fechaLocalIso(d);
  }

  private defaultHasta(): string {
    return this.fechaLocalIso(new Date());
  }

  private metricasVacias(): DtoMetricasEstadisticas {
    return {
      total: 0, totalFlash: 0, totalInmd: 0, totalRutina: 0,
      totalOtros: 0, conCoordenadas: 0,
      porTipoCaso: [], porHora: [], porDiaSemana: [],
      porMes: [], porCiudad: [], porPrioridad: []
    };
  }

  // Calcula métricas directamente desde los puntos cargados.
  // Se activa cuando el backend devuelve métricas vacías (total=0) pero sí hay puntos.
  private computeMetricasFromPuntos(): DtoMetricasEstadisticas {
    const m = this.metricasVacias();
    m.total          = this.puntos().length;
    m.conCoordenadas = this.puntos().length;

    // Conteos por prioridad
    for (const p of this.puntos()) {
      const u = (p.prioridad || '').toUpperCase();
      if      (u === 'FLASH'     || u === '01') m.totalFlash++;
      else if (u === 'INMEDIATA' || u === '02') m.totalInmd++;
      else if (u === 'RUTINA'    || u === '03') m.totalRutina++;
      else                                       m.totalOtros++;
    }

    // Por prioridad (donut)
    m.porPrioridad = [
      { clave: 'FLASH',    descripcion: 'Flash',    total: m.totalFlash },
      { clave: 'INMEDIATA',descripcion: 'Inmediata',total: m.totalInmd  },
      { clave: 'RUTINA',   descripcion: 'Rutina',   total: m.totalRutina },
    ];
    if (m.totalOtros > 0)
      m.porPrioridad.push({ clave: 'OTROS', descripcion: 'Sin prioridad', total: m.totalOtros });

    // Por tipo de caso
    const tipoMap = new Map<string, DtoAgrupacion>();
    for (const p of this.puntos()) {
      const clave = p.codiPedido || 'SIN CÓDIGO';
      const desc  = p.descPedido || clave;
      const entry = tipoMap.get(clave);
      if (entry) entry.total++;
      else tipoMap.set(clave, { clave, descripcion: desc, total: 1 });
    }
    m.porTipoCaso = [...tipoMap.values()]
      .sort((a, b) => b.total - a.total).slice(0, 12);

    // Por hora del día — horaCaso = 'DD/MM/YYYY HH:MM'
    const horaMap = new Map<number, number>();
    for (const p of this.puntos()) {
      const timePart = (p.horaCaso || '').split(' ')[1];
      if (timePart) {
        const h = parseInt(timePart.split(':')[0], 10);
        if (!isNaN(h)) horaMap.set(h, (horaMap.get(h) ?? 0) + 1);
      }
    }
    m.porHora = Array.from(horaMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([h, total]) => ({ clave: String(h), descripcion: String(h), total }));

    // Por día de la semana — extraemos desde la fecha de horaCaso
    const diasNombre = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const dowMap = new Map<number, number>();
    for (const p of this.puntos()) {
      const datePart = (p.horaCaso || '').split(' ')[0]; // 'DD/MM/YYYY'
      if (datePart) {
        const parts = datePart.split('/');
        if (parts.length === 3) {
          const d = new Date(+parts[2], +parts[1] - 1, +parts[0]);
          if (!isNaN(d.getTime())) {
            const dow = d.getDay();
            dowMap.set(dow, (dowMap.get(dow) ?? 0) + 1);
          }
        }
      }
    }
    m.porDiaSemana = Array.from(dowMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([dow, total]) => ({
        clave:       String(dow),
        descripcion: diasNombre[dow] ?? String(dow),
        total
      }));

    // Tendencia mensual — 'DD/MM/YYYY' → 'YYYY-MM'
    const mesMap = new Map<string, number>();
    for (const p of this.puntos()) {
      const datePart = (p.horaCaso || '').split(' ')[0];
      if (datePart) {
        const parts = datePart.split('/');
        if (parts.length === 3) {
          const key = `${parts[2]}-${parts[1].padStart(2,'0')}`;
          mesMap.set(key, (mesMap.get(key) ?? 0) + 1);
        }
      }
    }
    m.porMes = Array.from(mesMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([clave, total]) => ({ clave, descripcion: clave, total }));

    // Top ciudades
    const ciudadMap = new Map<string, number>();
    for (const p of this.puntos()) {
      if (p.ciudad) ciudadMap.set(p.ciudad, (ciudadMap.get(p.ciudad) ?? 0) + 1);
    }
    m.porCiudad = Array.from(ciudadMap.entries())
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([clave, total]) => ({ clave, descripcion: clave, total }));

    return m;
  }
}
