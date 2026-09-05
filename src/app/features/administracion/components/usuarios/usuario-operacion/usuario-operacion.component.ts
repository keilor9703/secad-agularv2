import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output,
  inject, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';

import {
  FuerzaService, DtoFuerza, DtoCanalFuerza, DtoUsuarioOperacionRequest,
} from '../../../services/fuerza.service';
import { SitioGrabacionService, DtoSitioGrabacion } from '../../../services/sitio-grabacion.service';
import { ToastService } from '../../../../../core/services/toast.service';
import { UiSectionHeaderComponent } from '../../../../../shared/components/ui-section-header/ui-section-header.component';
import { UiSelectComponent } from '../../../../../shared/components/ui-select/ui-select.component';
import { UiInputComponent } from '../../../../../shared/components/ui-input/ui-input.component';
import { UiButtonComponent } from '../../../../../shared/components/ui-button/ui-button.component';
import { UiSpinnerComponent } from '../../../../../shared/components/ui-spinner/ui-spinner.component';
import { UiSelectOption } from '../../../../../shared/interfaces/ui-select-option.interface';

/**
 * Asignación de Sitio de grabación, Fuerza, Canal y ACD de un usuario.
 *
 * Es lo que le dice al backend qué ve cada despachador. El sitio de grabación
 * es la unidad policial a la que pertenece: un CAD físico puede alojar varias
 * —Barranquilla aloja la MEBAR y el DEATA— y el sitio es lo que mantiene
 * separados sus registros. De ahí cuelga todo lo demás: la fuerza y el canal
 * filtran los casos que le llegan, y el ACD es su extensión en la planta
 * telefónica. Sin esto un usuario entra al CAD pero no recibe nada.
 *
 * Va en su propio componente y no dentro de usuario-form porque se guarda por
 * separado (endpoint propio) y porque los selectores son en cascada: las
 * fuerzas dependen del sitio, y los canales de la fuerza.
 */
@Component({
  selector: 'app-usuario-operacion',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    UiSectionHeaderComponent, UiSelectComponent, UiInputComponent,
    UiButtonComponent, UiSpinnerComponent,
  ],
  templateUrl: './usuario-operacion.component.html',
  styleUrls: ['./usuario-operacion.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsuarioOperacionComponent {
  private readonly fuerzaService = inject(FuerzaService);
  private readonly sitioService  = inject(SitioGrabacionService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  /** Id del usuario en edición. '0' o vacío = no hay usuario cargado. */
  @Input() set idUsuario(valor: string | null | undefined) {
    this._idUsuario = valor ?? '';
    if (this._idUsuario && this._idUsuario !== '0') this.cargar();
    else this.limpiar();
  }
  private _idUsuario = '';

  @Output() guardado = new EventEmitter<void>();

  readonly sitios   = signal<DtoSitioGrabacion[]>([]);
  readonly fuerzas  = signal<DtoFuerza[]>([]);
  readonly canales  = signal<DtoCanalFuerza[]>([]);
  readonly cargando = signal(false);
  readonly guardando = signal(false);
  /** Lo que hay guardado hoy, para mostrarlo aunque el catálogo aún no cargue. */
  readonly actual = signal<{ sitioDescripcion?: string; fuerzaDescripcion?: string; canalDescripcion?: string }>({});

  readonly form = this.fb.nonNullable.group({
    sitioGrabacion:  [0],
    cadcanaFuerzaId: [0],
    cadcanaCodigo:   [0],
    acd:             [0],
  });

  constructor() {
    this.cargarSitios();
    this.cargarFuerzas();
  }

  // ── Opciones de los selectores ───────────────────────────────────────────
  opcionesSitio(): UiSelectOption<number>[] {
    return [
      { label: 'Sin asignar', value: 0 },
      ...this.sitios().map(s => ({ label: this.sitioService.etiqueta(s), value: s.consecutivo })),
    ];
  }

  /**
   * Solo las fuerzas del sitio elegido. Es la regla que impide que un usuario
   * de una unidad termine despachando el canal de la otra cuando las dos
   * comparten el mismo CAD; el backend rechaza la combinación de todos modos.
   * Las fuerzas sin sitio (0, «sin clasificar») se ofrecen siempre, porque en
   * un CAD de una sola unidad es lo normal que estén así.
   */
  opcionesFuerza(): UiSelectOption<number>[] {
    const sitio = this.form.controls.sitioGrabacion.value ?? 0;
    const visibles = sitio > 0
      ? this.fuerzas().filter(f => f.sitioGraba === sitio || f.sitioGraba === 0)
      : this.fuerzas();
    return [
      { label: 'Sin asignar', value: 0 },
      ...visibles.map(f => ({ label: f.descripcion, value: f.id })),
    ];
  }

  opcionesCanal(): UiSelectOption<number>[] {
    return [
      { label: 'Sin asignar', value: 0 },
      ...this.canales().map(c => ({ label: c.descripcion, value: c.codigo })),
    ];
  }

  get hayFuerza(): boolean {
    return (this.form.controls.cadcanaFuerzaId.value ?? 0) > 0;
  }

  get hayUsuario(): boolean {
    return !!this._idUsuario && this._idUsuario !== '0';
  }

  /** Cuántas fuerzas quedan bajo el sitio elegido, para explicar un selector vacío. */
  get fuerzasDelSitio(): number {
    return this.opcionesFuerza().length - 1;
  }

  // ── Carga ────────────────────────────────────────────────────────────────
  private cargarSitios(): void {
    // Solo los vigentes: asignar una unidad retirada dejaría al usuario en un
    // sitio que ya no opera.
    this.sitioService.getSitios(true).subscribe({
      next: r => this.sitios.set(r.data ?? []),
      error: () => { /* silencioso: el catálogo es secundario, la pantalla sirve igual */ },
    });
  }

  private cargarFuerzas(): void {
    // sitio=0 → todas las del CAD. Administrar es cosa del CAD entero: si aloja
    // dos unidades, quien administra tiene que poder asignar las fuerzas de las
    // dos, no solo las de la suya.
    this.fuerzaService.getFuerzas(0).subscribe({
      // Solo las vigentes: asignar una fuerza dada de baja dejaría al usuario
      // apuntando a algo que ya no despacha.
      next: r => this.fuerzas.set((r.data ?? []).filter(f => f.vigente === 'S')),
      error: () => { /* silencioso: el catálogo es secundario, la pantalla sirve igual */ },
    });
  }

  private cargarCanales(fuerzaId: number): void {
    if (!fuerzaId) { this.canales.set([]); return; }
    this.fuerzaService.getCanales(fuerzaId).subscribe({
      next: r => this.canales.set((r.data ?? []).filter(c => c.vigente === 'S')),
      error: () => this.canales.set([]),
    });
  }

  private limpiar(): void {
    this.form.reset({ sitioGrabacion: 0, cadcanaFuerzaId: 0, cadcanaCodigo: 0, acd: 0 });
    this.canales.set([]);
    this.actual.set({});
  }

  private cargar(): void {
    this.cargando.set(true);
    this.fuerzaService.getUsuarioOperacion(this._idUsuario).subscribe({
      next: r => {
        const op = r.data;
        this.form.reset({
          sitioGrabacion:  op?.sitioGrabacion ?? 0,
          cadcanaFuerzaId: op?.cadcanaFuerzaId ?? 0,
          cadcanaCodigo:   op?.cadcanaCodigo ?? 0,
          acd:             op?.acd ?? 0,
        });
        this.actual.set({
          sitioDescripcion:  op?.sitioDescripcion,
          fuerzaDescripcion: op?.fuerzaDescripcion,
          canalDescripcion:  op?.canalDescripcion,
        });
        // Los canales de la fuerza ya asignada, para que el selector muestre
        // el valor guardado y no un hueco.
        this.cargarCanales(op?.cadcanaFuerzaId ?? 0);
        this.cargando.set(false);
      },
      error: () => {
        this.cargando.set(false);
        this.toast.error('Operación', 'No se pudieron cargar los datos operacionales.');
      },
    });
  }

  // ── Interacción ──────────────────────────────────────────────────────────

  /**
   * Al cambiar de unidad, la fuerza que había puede pertenecer a la otra: si
   * ya no está entre las de este sitio se limpia, con ella el canal.
   */
  onSitioChange(): void {
    const fuerzaActual = this.form.controls.cadcanaFuerzaId.value ?? 0;
    const sigueValida = this.opcionesFuerza().some(o => o.value === fuerzaActual);
    if (!sigueValida) {
      this.form.controls.cadcanaFuerzaId.setValue(0);
      this.form.controls.cadcanaCodigo.setValue(0);
      this.canales.set([]);
    }
  }

  /** Al cambiar la fuerza el canal anterior deja de ser válido: se limpia. */
  onFuerzaChange(): void {
    this.form.controls.cadcanaCodigo.setValue(0);
    const fuerzaId = this.form.controls.cadcanaFuerzaId.value ?? 0;
    this.cargarCanales(fuerzaId);

    // Elegir la fuerza primero es lo natural cuando el CAD tiene una sola
    // unidad: se rellena el sitio con el de la fuerza en vez de obligar a
    // ponerlo a mano.
    const fuerza = this.fuerzas().find(f => f.id === fuerzaId);
    if (fuerza && fuerza.sitioGraba > 0 && (this.form.controls.sitioGrabacion.value ?? 0) === 0)
      this.form.controls.sitioGrabacion.setValue(fuerza.sitioGraba);
  }

  guardar(): void {
    if (!this.hayUsuario) {
      this.toast.warning('Operación', 'Consulte primero un usuario.');
      return;
    }
    this.guardando.set(true);
    const request = this.form.getRawValue() as DtoUsuarioOperacionRequest;

    this.fuerzaService.saveUsuarioOperacion(this._idUsuario, request).subscribe({
      next: r => {
        this.guardando.set(false);
        if (r.success) {
          this.toast.success('Operación', r.message || 'Datos operacionales guardados.');
          this.cargar();
          this.guardado.emit();
        } else {
          this.toast.warning('Operación', r.message);
        }
      },
      error: err => {
        this.guardando.set(false);
        this.toast.error('Operación', err?.error?.message ?? 'Error guardando datos operacionales.');
      },
    });
  }
}
