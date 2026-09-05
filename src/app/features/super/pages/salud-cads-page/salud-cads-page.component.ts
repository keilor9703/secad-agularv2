import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  SuperAdminService,
  TenantPublico,
  SaludHistorial,
} from '../../../../core/services/super-admin.service';
import { ToastService } from '../../../../core/services/toast.service';
import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiSearchInputComponent } from '../../../../shared/components/ui-search-input/ui-search-input.component';
import { UiSelectComponent } from '../../../../shared/components/ui-select/ui-select.component';
import { UiBadgeComponent } from '../../../../shared/components/ui-badge/ui-badge.component';
import { UiSpinnerComponent } from '../../../../shared/components/ui-spinner/ui-spinner.component';
import { UiModalComponent } from '../../../../shared/components/ui-modal/ui-modal.component';
import { UiTableComponent } from '../../../../shared/components/ui-table/ui-table.component';
import { UiTableColumn } from '../../../../shared/interfaces/ui-table.interface';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';
import { UiStatusVariant } from '../../../../shared/interfaces/ui-status.interface';

/** Segundos entre refrescos automáticos del tablero. */
const SEGUNDOS_REFRESCO = 30;

@Component({
  selector: 'app-salud-cads-page',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    UiPageHeaderComponent,
    UiButtonComponent,
    UiSearchInputComponent,
    UiSelectComponent,
    UiSpinnerComponent,
    UiModalComponent,
    UiTableComponent,
  ],
  templateUrl: './salud-cads-page.component.html',
  styleUrls: ['./salud-cads-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaludCadsPageComponent implements OnInit {
  private readonly service = inject(SuperAdminService);
  private readonly toast = inject(ToastService);

  readonly cads = signal<TenantPublico[]>([]);
  readonly loading = signal(false);
  readonly switchingContext = signal<string | null>(null);
  readonly ultimaLectura = signal<Date | null>(null);

  readonly filtroTexto = signal('');
  readonly filtroNivel = signal(0); // 0 = todos
  readonly modoVista = signal<'cards' | 'table'>('cards');

  readonly segundosRestantes = signal(SEGUNDOS_REFRESCO);
  readonly pausado = signal(false);

  // Historial del CAD seleccionado
  readonly cadSeleccionado = signal<TenantPublico | null>(null);
  readonly historial = signal<SaludHistorial[]>([]);
  readonly cargandoHistorial = signal(false);
  readonly historialAbierto = signal(false);

  private temporizador: ReturnType<typeof setInterval> | null = null;
  private avisados = new Set<string>();

  readonly opcionesNivel: UiSelectOption<number>[] = [
    { label: 'Todos los niveles', value: 0 },
    { label: 'Normal (Operativo)', value: 1 },
    { label: 'Degradado (Alerta)', value: 2 },
    { label: 'Offline (Crítico)', value: 3 },
  ];

  readonly columnasHistorial: UiTableColumn<SaludHistorial>[] = [
    { key: 'registradoEn', label: 'Fecha / hora', value: (h) => this.fechaHora(h.registradoEn) },
    {
      key: 'nivelOperacion',
      label: 'Estado',
      align: 'center',
      badge: (h) => ({
        text: this.service.nivelLabel(h.nivelOperacion),
        variant: this.nivelVariant(h.nivelOperacion),
      }),
    },
    {
      key: 'latenciaMs',
      label: 'Latencia',
      align: 'center',
      value: (h) => (h.latenciaMs != null ? `${h.latenciaMs} ms` : '—'),
    },
    { key: 'observacion', label: 'Observación', value: (h) => h.observacion || '—' },
  ];

  readonly columnasTablaNoc: UiTableColumn<TenantPublico>[] = [
    { key: 'codDane', label: 'DANE', align: 'center', sortable: true },
    { key: 'nombre', label: 'Nombre CAD / Municipio', sortable: true },
    {
      key: 'departamento',
      label: 'Ubicación',
      value: (c) => `${c.departamento}${c.municipio ? ' · ' + c.municipio : ''}`,
    },
    {
      key: 'nivelOperacion',
      label: 'Salud',
      align: 'center',
      badge: (c) => ({
        text: this.service.nivelLabel(c.nivelOperacion),
        variant: this.nivelVariant(c.nivelOperacion),
      }),
    },
    {
      key: 'latenciaMs',
      label: 'Latencia',
      align: 'center',
      value: (c) => (c.latenciaMs != null ? `${c.latenciaMs} ms` : '—'),
    },
    {
      key: 'incidentesActivos',
      label: 'Incidentes Activos',
      align: 'center',
      sortable: true,
      badge: (c) =>
        c.incidentesActivos > 0
          ? { text: `${c.incidentesActivos}`, variant: 'danger' }
          : { text: '0', variant: 'neutral' },
    },
    {
      key: 'ultimaSincro',
      label: 'Última sincro',
      align: 'center',
      value: (c) => this.formatoSincro(c.ultimaSincro),
    },
  ];

  constructor() {
    inject(DestroyRef).onDestroy(() => this.detenerTemporizador());
  }

  ngOnInit(): void {
    this.cargar();
    this.iniciarTemporizador();
  }

  // ── Datos ────────────────────────────────────────────────────────────────

  cargar(): void {
    this.loading.set(true);
    this.service.getSaludCads().subscribe({
      next: (datos) => {
        this.cads.set(datos);
        this.loading.set(false);
        this.ultimaLectura.set(new Date());
        this.revisarAlertas(datos);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Error', 'No se pudieron cargar los datos de salud de CADs.');
      },
    });
  }

  readonly cadsFiltrados = computed(() => {
    const nivel = this.filtroNivel();
    const texto = this.filtroTexto().trim().toLowerCase();
    return this.cads().filter((c) => {
      const coincideNivel = nivel === 0 || c.nivelOperacion === nivel;
      const coincideTexto =
        !texto || c.nombre.toLowerCase().includes(texto) || c.codDane.includes(texto) || (c.departamento && c.departamento.toLowerCase().includes(texto));
      return coincideNivel && coincideTexto;
    });
  });

  readonly totalNormal = computed(() => this.cads().filter((c) => c.nivelOperacion === 1).length);
  readonly totalDegradado = computed(() => this.cads().filter((c) => c.nivelOperacion === 2).length);
  readonly totalOffline = computed(() => this.cads().filter((c) => c.nivelOperacion === 3).length);

  readonly porcentajeDisponibilidad = computed(() => {
    const total = this.cads().length;
    if (total === 0) return 100;
    const normales = this.totalNormal();
    return Math.round((normales / total) * 100);
  });

  readonly promedioLatencia = computed(() => {
    const conLatencia = this.cads().filter((c) => c.latenciaMs != null && c.latenciaMs > 0);
    if (conLatencia.length === 0) return 0;
    const suma = conLatencia.reduce((acc, curr) => acc + (curr.latenciaMs || 0), 0);
    return Math.round(suma / conLatencia.length);
  });

  readonly totalIncidentes = computed(() =>
    this.cads().reduce((acc, curr) => acc + (curr.incidentesActivos || 0), 0)
  );

  private revisarAlertas(datos: readonly TenantPublico[]): void {
    const enAlerta = datos.filter((c) => c.nivelOperacion >= 2);
    const codigos = new Set(enAlerta.map((c) => c.codDane));

    const nuevos = enAlerta.filter((c) => !this.avisados.has(c.codDane));
    if (nuevos.length) {
      this.toast.warning(
        nuevos.length === 1 ? 'CAD en estado de alerta' : `${nuevos.length} CADs en alerta de red`,
        nuevos.map((c) => `${c.nombre} (${this.nivelLabel(c.nivelOperacion)})`).join(', ')
      );
    }

    this.avisados = codigos;
  }

  // ── Historial y Acciones ─────────────────────────────────────────────────

  abrirHistorial(cad: TenantPublico): void {
    this.cadSeleccionado.set(cad);
    this.historial.set([]);
    this.cargandoHistorial.set(true);
    this.historialAbierto.set(true);

    this.service.getHistorial(cad.codDane, 48).subscribe({
      next: (datos) => {
        this.historial.set(datos);
        this.cargandoHistorial.set(false);
      },
      error: () => {
        this.cargandoHistorial.set(false);
        this.toast.error('Error', 'No se pudo cargar el historial del CAD.');
      },
    });
  }

  cerrarHistorial(): void {
    this.historialAbierto.set(false);
    this.cadSeleccionado.set(null);
  }

  conmutarContexto(cad: TenantPublico): void {
    this.switchingContext.set(cad.codDane);
    this.service.switchContext(cad.codDane).subscribe({
      next: (resp) => {
        this.switchingContext.set(null);
        if (resp?.success) {
          this.toast.success('Contexto cambiado', `Operando ahora en: ${resp.nombreCad || cad.nombre}`);
        } else {
          this.toast.info('Cambio de contexto', `Contexto cambiado a ${cad.nombre}`);
        }
      },
      error: (err) => {
        this.switchingContext.set(null);
        this.toast.error('Error', err?.error?.message || 'No se pudo conmutar al tenant.');
      },
    });
  }

  // ── Refresco automático ──────────────────────────────────────────────────

  alternarPausa(): void {
    const pausar = !this.pausado();
    this.pausado.set(pausar);

    if (pausar) {
      this.detenerTemporizador();
    } else {
      this.cargar();
      this.iniciarTemporizador();
    }
  }

  private iniciarTemporizador(): void {
    this.detenerTemporizador();
    this.segundosRestantes.set(SEGUNDOS_REFRESCO);
    this.temporizador = setInterval(() => {
      this.segundosRestantes.update((v) => v - 1);
      if (this.segundosRestantes() <= 0) {
        this.cargar();
        this.segundosRestantes.set(SEGUNDOS_REFRESCO);
      }
    }, 1000);
  }

  private detenerTemporizador(): void {
    if (this.temporizador !== null) {
      clearInterval(this.temporizador);
      this.temporizador = null;
    }
  }

  // ── Helpers Presentación ─────────────────────────────────────────────────

  nivelLabel = (n: number): string => this.service.nivelLabel(n);
  nivelIcon = (n: number): string => `fa-solid ${this.service.nivelIcon(n)}`;
  nivelVariant = (n: number): UiStatusVariant => this.service.nivelClass(n) as UiStatusVariant;

  latenciaClase(ms: number | undefined): string {
    if (ms == null) return '';
    if (ms < 100) return 'sc-metrica--ok';
    if (ms < 300) return 'sc-metrica--warn';
    return 'sc-metrica--bad';
  }

  formatoSincro(fecha: string | undefined): string {
    if (!fecha) return 'Sin registro';
    const minutos = (Date.now() - new Date(fecha).getTime()) / 60000;
    if (minutos < 2) return 'Hace un momento';
    if (minutos < 60) return `Hace ${Math.round(minutos)} min`;
    if (minutos < 1440) return `Hace ${Math.round(minutos / 60)} h`;
    return `Hace ${Math.round(minutos / 1440)} d`;
  }

  private fechaHora(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-CO');
  }
}
