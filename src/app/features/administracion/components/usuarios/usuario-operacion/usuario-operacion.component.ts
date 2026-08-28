import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output,
  inject, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';

import {
  FuerzaService, DtoFuerza, DtoCanalFuerza, DtoUsuarioOperacionRequest,
} from '../../../services/fuerza.service';
import { ToastService } from '../../../../../core/services/toast.service';
import { UiSectionHeaderComponent } from '../../../../../shared/components/ui-section-header/ui-section-header.component';
import { UiSelectComponent } from '../../../../../shared/components/ui-select/ui-select.component';
import { UiInputComponent } from '../../../../../shared/components/ui-input/ui-input.component';
import { UiButtonComponent } from '../../../../../shared/components/ui-button/ui-button.component';
import { UiSpinnerComponent } from '../../../../../shared/components/ui-spinner/ui-spinner.component';
import { UiSelectOption } from '../../../../../shared/interfaces/ui-select-option.interface';

/**
 * Asignación de Fuerza, Canal y ACD de un usuario.
 *
 * Es lo que le dice al backend qué ve cada despachador: la fuerza y el canal
 * filtran los casos que le llegan, y el ACD es su extensión en la planta
 * telefónica. Sin esto un usuario entra al CAD pero no recibe nada.
 *
 * Va en su propio componente y no dentro de usuario-form porque se guarda por
 * separado (endpoint propio) y porque el selector es en cascada: los canales
 * dependen de la fuerza elegida.
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

  readonly fuerzas  = signal<DtoFuerza[]>([]);
  readonly canales  = signal<DtoCanalFuerza[]>([]);
  readonly cargando = signal(false);
  readonly guardando = signal(false);
  /** Lo que hay guardado hoy, para mostrarlo aunque el catálogo aún no cargue. */
  readonly actual = signal<{ fuerzaDescripcion?: string; canalDescripcion?: string }>({});

  readonly form = this.fb.nonNullable.group({
    cadcanaFuerzaId: [0],
    cadcanaCodigo:   [0],
    acd:             [0],
  });

  constructor() {
    this.cargarFuerzas();
  }

  // ── Opciones de los selectores ───────────────────────────────────────────
  opcionesFuerza(): UiSelectOption<number>[] {
    return [
      { label: 'Sin asignar', value: 0 },
      ...this.fuerzas().map(f => ({ label: f.descripcion, value: f.id })),
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

  // ── Carga ────────────────────────────────────────────────────────────────
  private cargarFuerzas(): void {
    this.fuerzaService.getFuerzas().subscribe({
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
    this.form.reset({ cadcanaFuerzaId: 0, cadcanaCodigo: 0, acd: 0 });
    this.canales.set([]);
    this.actual.set({});
  }

  private cargar(): void {
    this.cargando.set(true);
    this.fuerzaService.getUsuarioOperacion(this._idUsuario).subscribe({
      next: r => {
        const op = r.data;
        this.form.reset({
          cadcanaFuerzaId: op?.cadcanaFuerzaId ?? 0,
          cadcanaCodigo:   op?.cadcanaCodigo ?? 0,
          acd:             op?.acd ?? 0,
        });
        this.actual.set({
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

  /** Al cambiar la fuerza el canal anterior deja de ser válido: se limpia. */
  onFuerzaChange(): void {
    this.form.controls.cadcanaCodigo.setValue(0);
    this.cargarCanales(this.form.controls.cadcanaFuerzaId.value ?? 0);
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
