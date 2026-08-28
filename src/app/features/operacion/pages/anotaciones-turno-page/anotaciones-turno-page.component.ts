import { Component, ChangeDetectionStrategy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';

import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiPanelHeaderComponent } from '../../../../shared/components/ui-panel-header/ui-panel-header.component';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiInputComponent } from '../../../../shared/components/ui-input/ui-input.component';
import { UiModalComponent } from '../../../../shared/components/ui-modal/ui-modal.component';
import { UiSpinnerComponent } from '../../../../shared/components/ui-spinner/ui-spinner.component';
import { UiPaginationComponent } from '../../../../shared/components/ui-pagination/ui-pagination.component';
import { AuthService } from '../../../../core/auth/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import {
  AnotacionTurnoService,
  AnotacionTurno,
  AnotacionTurnoRequest,
  TIPOS_ANOTACION
} from '../../../../core/services/operacion/anotacion-turno.service';

@Component({
  selector: 'app-anotaciones-turno-page',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    UiPageHeaderComponent, UiPanelHeaderComponent, UiButtonComponent,
    UiInputComponent, UiModalComponent, UiSpinnerComponent, UiPaginationComponent
  ],
  templateUrl: './anotaciones-turno-page.component.html',
  styleUrls: ['./anotaciones-turno-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AnotacionesTurnoPageComponent implements OnInit {

  private svc   = inject(AnotacionTurnoService);
  private auth  = inject(AuthService);
  private toast = inject(ToastService);
  private fb    = inject(FormBuilder);

  // ─── Estado de la lista ──────────────────────────────────────────────────
  readonly anotaciones = signal<AnotacionTurno[]>([]);
  readonly cargando    = signal(false);
  readonly errorCarga  = signal('');

  // ─── Filtros ─────────────────────────────────────────────────────────────
  filtroTipo   = '';
  filtroDesde  = this.hoyISO();
  filtroHasta  = this.hoyISO();

  // ─── Formulario ──────────────────────────────────────────────────────────
  readonly modoEdicion = signal(false);
  readonly editandoId  = signal<string | null>(null);
  readonly guardando   = signal(false);

  readonly form = this.fb.nonNullable.group({
    tipo:        ['GENERAL', [Validators.required]],
    titulo:      [''],
    descripcion: ['', [Validators.required]]
  });

  // ─── JWT claims ──────────────────────────────────────────────────────────
  canalCodigo = 0;
  sitioGraba  = 0;
  fuerzaId    = 0;

  // ─── Catálogo de tipos ───────────────────────────────────────────────────
  readonly tipos = TIPOS_ANOTACION;

  /** Se activa al intentar guardar; hasta entonces el campo no muestra error. */
  readonly intentoGuardar = signal(false);

  readonly errorDescripcion = computed(() =>
    this.intentoGuardar() && !this.form.controls.descripcion.value.trim()
      ? 'La descripción de la anotación es obligatoria.'
      : ''
  );

  // ─── Modal de confirmación de borrado ────────────────────────────────────
  readonly itemAEliminar = signal<AnotacionTurno | null>(null);
  readonly eliminando    = signal(false);

  // ─── Paginación ──────────────────────────────────────────────────────────
  readonly p        = signal(1);
  readonly pageSize = 15;

  readonly anotacionesFiltradas = computed(() => {
    const tipo = this.filtroTipo;
    const items = this.anotaciones();
    return tipo ? items.filter(a => a.tipo === tipo) : items;
  });

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.anotacionesFiltradas().length / this.pageSize))
  );

  readonly paginadas = computed(() => {
    const start = (this.p() - 1) * this.pageSize;
    return this.anotacionesFiltradas().slice(start, start + this.pageSize);
  });

  nextPage() { if (this.p() < this.totalPages()) this.p.update(v => v + 1); }
  prevPage() { if (this.p() > 1) this.p.update(v => v - 1); }

  irFiltro(tipo: string): void {
    this.filtroTipo = tipo;
    this.p.set(1);
  }

  // ────────────────────────────────────────────────────────────────────────
  //  INIT
  // ────────────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    const claims    = this.auth.getJwtClaims();
    this.canalCodigo = claims.canalId    ?? 0;
    this.sitioGraba  = claims.sitioGraba ?? 0;
    this.fuerzaId    = claims.fuerzaId   ?? 0;
    this.cargar();
  }

  // ────────────────────────────────────────────────────────────────────────
  //  CARGAR
  // ────────────────────────────────────────────────────────────────────────

  /**
   * @param resetPage false preserva la página actual (usado tras crear/editar/
   *   eliminar, para no sacar al operador de donde estaba trabajando).
   */
  cargar(resetPage = true): void {
    this.cargando.set(true);
    this.errorCarga.set('');
    if (resetPage) this.p.set(1);

    this.svc.getList({
      canal:  this.canalCodigo || undefined,
      sitio:  this.sitioGraba  || undefined,
      desde:  this.filtroDesde || undefined,
      hasta:  this.filtroHasta || undefined,
      fuerza: this.fuerzaId    || undefined,
    }).subscribe({
      next: (r) => {
        this.anotaciones.set(r.data ?? []);
        this.cargando.set(false);
        // La página pudo quedar fuera de rango (p. ej. se eliminó el único
        // registro de la última página) — recortar en vez de dejarla vacía.
        if (this.p() > this.totalPages()) this.p.set(this.totalPages());
      },
      error: () => {
        this.cargando.set(false);
        this.errorCarga.set('No se pudo cargar la bitácora.');
      }
    });
  }

  /** true si la lista pudo haber sido truncada por el límite del backend (500 registros). */
  readonly posibleTruncamiento = computed(() => this.anotaciones().length >= 500);

  // ────────────────────────────────────────────────────────────────────────
  //  GUARDAR (crear / actualizar)
  // ────────────────────────────────────────────────────────────────────────

  setTipoForm(tipo: string): void {
    this.form.controls.tipo.setValue(tipo);
  }

  guardar(): void {
    // El propio campo muestra el error; aquí solo se frena el guardado.
    this.intentoGuardar.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.guardando.set(true);

    const v = this.form.getRawValue();
    const req: AnotacionTurnoRequest = {
      ...v,
      canalCodigo: this.canalCodigo || undefined,
      fuerzaId:    this.fuerzaId    || undefined,
      sitioGraba:  this.sitioGraba  || undefined,
    };

    const modoEdicion = this.modoEdicion();
    const editandoId  = this.editandoId();
    const op$ = modoEdicion && editandoId
      ? this.svc.update(editandoId, req)
      : this.svc.create(req);

    op$.subscribe({
      next: (r) => {
        this.guardando.set(false);
        if (r.success) {
          this.toast.success(
            modoEdicion ? 'Actualizada' : 'Registrada',
            r.message ?? 'Anotación guardada.'
          );
          this.cancelar();
          this.cargar(false);
        } else {
          this.toast.error('Error', r.message ?? 'No se pudo guardar.');
        }
      },
      error: (e) => {
        this.guardando.set(false);
        this.toast.error('Error', e.error?.message ?? 'No se pudo guardar la anotación.');
      }
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  //  EDITAR
  // ────────────────────────────────────────────────────────────────────────

  editar(item: AnotacionTurno): void {
    this.modoEdicion.set(true);
    this.editandoId.set(item.id);
    this.form.reset({
      tipo:        item.tipo,
      titulo:      item.titulo ?? '',
      descripcion: item.descripcion,
    });
    // Scroll al formulario
    setTimeout(() => {
      document.getElementById('formAnotacion')?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  }

  cancelar(): void {
    this.intentoGuardar.set(false);
    this.modoEdicion.set(false);
    this.editandoId.set(null);
    this.form.reset(this.formVacio());
  }

  // ────────────────────────────────────────────────────────────────────────
  //  ELIMINAR
  // ────────────────────────────────────────────────────────────────────────

  solicitarEliminar(item: AnotacionTurno): void {
    this.itemAEliminar.set(item);
  }

  cancelarEliminar(): void {
    this.itemAEliminar.set(null);
  }

  confirmarEliminar(): void {
    const item = this.itemAEliminar();
    if (!item || this.eliminando()) return;
    this.eliminando.set(true);

    this.svc.delete(item.id).subscribe({
      next: (r) => {
        this.eliminando.set(false);
        this.itemAEliminar.set(null);
        if (r.success) {
          this.toast.success('Eliminada', 'La anotación fue eliminada.');
          this.cargar(false);
        } else {
          this.toast.error('Error', r.message ?? 'No se pudo eliminar.');
        }
      },
      error: () => {
        this.eliminando.set(false);
        this.toast.error('Error', 'No se pudo eliminar la anotación.');
      }
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  //  HELPERS
  // ────────────────────────────────────────────────────────────────────────

  getTipoInfo(tipo: string) { return this.svc.getTipoInfo(tipo); }

  private formVacio(): AnotacionTurnoRequest {
    return { tipo: 'GENERAL', titulo: '', descripcion: '' };
  }

  private hoyISO(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  contarPorTipo(tipo: string): number {
    return this.anotaciones().filter(a => a.tipo === tipo).length;
  }
}
