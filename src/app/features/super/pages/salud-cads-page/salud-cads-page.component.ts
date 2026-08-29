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
    UiBadgeComponent,
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
  readonly ultimaLectura = signal<Date | null>(null);

  readonly filtroTexto = signal('');
  readonly filtroNivel = signal(0); // 0 = todos

  readonly segundosRestantes = signal(SEGUNDOS_REFRESCO);
  readonly pausado = signal(false);

  // Historial del CAD seleccionado
  readonly cadSeleccionado = signal<TenantPublico | null>(null);
  readonly historial = signal<SaludHistorial[]>([]);
  readonly cargandoHistorial = signal(false);
  readonly historialAbierto = signal(false);

  private temporizador: ReturnType<typeof setInterval> | null = null;

  /**
   * CADs que ya provocaron aviso. Sin esto el refresco de 30 s dispararía el
   * mismo toast dos veces por minuto hasta que alguien arregle el CAD caído.
   */
  private avisados = new Set<string>();

  readonly opcionesNivel: UiSelectOption<number>[] = [
    { label: 'Todos los niveles', value: 0 },
    { label: 'Normal', value: 1 },
    { label: 'Degradado', value: 2 },
    { label: 'Offline', value: 3 },
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
        this.toast.error('Error', 'No se pudieron cargar los datos de salud.');
      },
    });
  }

  readonly cadsFiltrados = computed(() => {
    const nivel = this.filtroNivel();
    const texto = this.filtroTexto().trim().toLowerCase();
    return this.cads().filter((c) => {
      const coincideNivel = nivel === 0 || c.nivelOperacion === nivel;
      const coincideTexto =
        !texto || c.nombre.toLowerCase().includes(texto) || c.codDane.includes(texto);
      return coincideNivel && coincideTexto;
    });
  });

  readonly totalNormal = computed(() => this.cads().filter((c) => c.nivelOperacion === 1).length);
  readonly totalDegradado = computed(
    () => this.cads().filter((c) => c.nivelOperacion === 2).length,
  );
  readonly totalOffline = computed(() => this.cads().filter((c) => c.nivelOperacion === 3).length);

  /**
   * Avisa sólo por los CADs que acaban de degradarse, y olvida los que se
   * recuperaron para que un segundo bajón sí vuelva a avisar.
   */
  private revisarAlertas(datos: readonly TenantPublico[]): void {
    const enAlerta = datos.filter((c) => c.nivelOperacion >= 2);
    const codigos = new Set(enAlerta.map((c) => c.codDane));

    const nuevos = enAlerta.filter((c) => !this.avisados.has(c.codDane));
    if (nuevos.length) {
      this.toast.warning(
        nuevos.length === 1 ? 'CAD con alerta' : `${nuevos.length} CADs con alerta`,
        nuevos.map((c) => c.nombre).join(', '),
      );
    }

    this.avisados = codigos;
  }

  // ── Historial ────────────────────────────────────────────────────────────

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
        this.toast.error('Error', 'No se pudo cargar el historial.');
      },
    });
  }

  cerrarHistorial(): void {
    this.historialAbierto.set(false);
    this.cadSeleccionado.set(null);
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

  // ── Presentación ─────────────────────────────────────────────────────────

  nivelLabel = (n: number): string => this.service.nivelLabel(n);
  nivelIcon = (n: number): string => `fa-solid ${this.service.nivelIcon(n)}`;

  /** nivelClass() devuelve success|warning|danger, que ya son variantes del kit. */
  nivelVariant = (n: number): UiStatusVariant => this.service.nivelClass(n) as UiStatusVariant;

  latenciaClase(ms: number | undefined): string {
    if (ms == null) return '';
    if (ms < 100) return 'sc-metrica--ok';
    if (ms < 300) return 'sc-metrica--warn';
    return 'sc-metrica--bad';
  }

  /** «Hace 5 min» se lee de un vistazo mejor que una marca de tiempo cruda. */
  formatoSincro(fecha: string | undefined): string {
    if (!fecha) return 'Sin registro';
    const minutos = (Date.now() - new Date(fecha).getTime()) / 60000;
    if (minutos < 2) return 'Hace menos de 2 min';
    if (minutos < 60) return `Hace ${Math.round(minutos)} min`;
    if (minutos < 1440) return `Hace ${Math.round(minutos / 60)} h`;
    return `Hace ${Math.round(minutos / 1440)} días`;
  }

  private fechaHora(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-CO');
  }
}
