import {
  Component, ChangeDetectionStrategy, OnInit, TemplateRef, ViewChild,
  computed, inject, signal,
} from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';

import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiTableComponent } from '../../../../shared/components/ui-table/ui-table.component';
import { UiModalComponent } from '../../../../shared/components/ui-modal/ui-modal.component';
import { UiInputComponent } from '../../../../shared/components/ui-input/ui-input.component';
import { UiSelectComponent } from '../../../../shared/components/ui-select/ui-select.component';
import { UiChipComponent } from '../../../../shared/components/ui-chip/ui-chip.component';
import { UiTableAction, UiTableActionEvent, UiTableColumn } from '../../../../shared/interfaces/ui-table.interface';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';
import { ToastService } from '../../../../core/services/toast.service';
import { AlertService } from '../../../../shared/services/alert.service';
import {
  SitioGrabacionService, DtoSitioGrabacion, DtoSitioGrabacionRequest,
} from '../../services/sitio-grabacion.service';

type ModoModal = 'crear' | 'editar';

/**
 * Sitios de grabación del CAD.
 *
 * Hasta ahora esta tabla solo se poblaba con INSERT a mano (estaba documentado
 * así en docs/nuevo-tenant.md). Es la unidad policial que opera dentro del CAD,
 * y como un mismo CAD puede alojar varias —Barranquilla aloja MEBAR y DEATA—,
 * es la marca que mantiene separados los registros de cada una.
 */
@Component({
  selector: 'app-sitios-grabacion-page',
  standalone: true,
  imports: [
    FormsModule, ReactiveFormsModule,
    UiPageHeaderComponent, UiButtonComponent, UiTableComponent, UiModalComponent,
    UiInputComponent, UiSelectComponent, UiChipComponent,
  ],
  templateUrl: './sitios-grabacion-page.component.html',
  styleUrls: ['./sitios-grabacion-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SitiosGrabacionPageComponent implements OnInit {
  private readonly svc   = inject(SitioGrabacionService);
  private readonly toast = inject(ToastService);
  private readonly alert = inject(AlertService);
  private readonly fb    = inject(FormBuilder);

  readonly sitios  = signal<DtoSitioGrabacion[]>([]);
  readonly loading = signal(false);
  readonly saving  = signal(false);

  readonly showModal = signal(false);
  readonly modo      = signal<ModoModal>('crear');
  readonly editId    = signal(0);

  readonly totalVigentes = computed(() => this.sitios().filter(s => s.vigente === 'S').length);
  readonly totalUsuarios = computed(() => this.sitios().reduce((n, s) => n + (s.totalUsuarios || 0), 0));

  @ViewChild('celdaUnidad', { static: true }) celdaUnidad!: TemplateRef<CeldaCtx>;

  columns: UiTableColumn<DtoSitioGrabacion>[] = [];

  readonly acciones: UiTableAction<DtoSitioGrabacion>[] = [
    { id: 'editar', label: 'Editar', icon: 'fa-solid fa-pen' },
    { id: 'toggle', label: 'Activar / retirar', icon: 'fa-solid fa-power-off', title: 'Cambiar vigencia' },
    {
      id: 'eliminar', label: 'Eliminar', icon: 'fa-solid fa-trash', variant: 'danger',
      // Un sitio con fuerzas o usuarios no se borra: se retira. Si se borrara,
      // esos registros quedarían apuntando a una unidad inexistente.
      disabled: s => (s.totalFuerzas + s.totalUsuarios) > 0,
      title: 'Solo se pueden eliminar los sitios que no tienen nada asignado',
    },
  ];

  readonly opcionesVigencia: UiSelectOption<string>[] = [
    { label: 'Vigente', value: 'S' },
    { label: 'Retirado', value: 'N' },
  ];

  readonly intentoGuardar = signal(false);

  readonly form = this.fb.nonNullable.group({
    consecutivo: [0, [Validators.required, Validators.min(1)]],
    descripcion: ['', [Validators.required]],
    abreviatura: [''],
    codDane:     [''],
    vigente:     ['S'],
  });

  readonly errorConsecutivo = computed(() =>
    this.intentoGuardar() && (this.form.controls.consecutivo.value ?? 0) <= 0
      ? 'El código debe ser un número mayor que 0.' : '');

  readonly errorDescripcion = computed(() =>
    this.intentoGuardar() && !this.form.controls.descripcion.value.trim()
      ? 'El nombre de la unidad es obligatorio.' : '');

  ngOnInit(): void {
    this.columns = [
      { key: 'consecutivo', label: 'Código', align: 'center', width: '90px' },
      { key: 'descripcion', label: 'Unidad policial', cellTemplate: this.celdaUnidad },
      {
        key: 'codDane', label: 'DANE', align: 'center',
        value: s => s.codDane || '—',
      },
      {
        key: 'totalFuerzas', label: 'Fuerzas', align: 'center',
        badge: s => ({ text: String(s.totalFuerzas), variant: s.totalFuerzas ? 'info' : 'neutral' }),
      },
      {
        key: 'totalUsuarios', label: 'Usuarios', align: 'center',
        badge: s => ({ text: String(s.totalUsuarios), variant: s.totalUsuarios ? 'info' : 'neutral' }),
      },
      {
        key: 'vigente', label: 'Estado', align: 'center',
        badge: s => s.vigente === 'S'
          ? { text: 'Vigente',  variant: 'success' }
          : { text: 'Retirado', variant: 'danger'  },
      },
    ];

    this.cargar();
  }

  cargar(): void {
    this.loading.set(true);
    this.svc.getSitios().subscribe({
      next: r => { this.sitios.set(r.data ?? []); this.loading.set(false); },
      error: () => {
        this.loading.set(false);
        this.toast.error('Sitios de grabación', 'No se pudieron cargar los sitios de grabación.');
      },
    });
  }

  onAccion(ev: UiTableActionEvent<DtoSitioGrabacion>): void {
    if (ev.actionId === 'editar')        this.abrirEdicion(ev.row);
    else if (ev.actionId === 'toggle')   this.cambiarVigencia(ev.row);
    else if (ev.actionId === 'eliminar') this.eliminar(ev.row);
  }

  // ── Modal ────────────────────────────────────────────────────────────────

  abrirCreacion(): void {
    // El código lo elige el CAD, pero se propone el siguiente libre para no
    // obligar a nadie a ir a buscarlo.
    const siguiente = this.sitios().reduce((max, s) => Math.max(max, s.consecutivo), 0) + 1;
    this.form.reset({ consecutivo: siguiente, descripcion: '', abreviatura: '', codDane: '', vigente: 'S' });
    this.form.controls.consecutivo.enable();
    this.intentoGuardar.set(false);
    this.modo.set('crear');
    this.editId.set(0);
    this.showModal.set(true);
  }

  abrirEdicion(s: DtoSitioGrabacion): void {
    this.form.reset({
      consecutivo: s.consecutivo,
      descripcion: s.descripcion,
      abreviatura: s.abreviatura ?? '',
      codDane:     s.codDane ?? '',
      vigente:     s.vigente,
    });
    // El código identifica al sitio en el JWT y en los registros históricos:
    // cambiarlo desligaría todo lo grabado hasta hoy.
    this.form.controls.consecutivo.disable();
    this.intentoGuardar.set(false);
    this.modo.set('editar');
    this.editId.set(s.consecutivo);
    this.showModal.set(true);
  }

  cerrarModal(): void {
    this.showModal.set(false);
    this.intentoGuardar.set(false);
  }

  guardar(): void {
    this.intentoGuardar.set(true);
    if (this.errorConsecutivo() || this.errorDescripcion()) return;

    const v = this.form.getRawValue();
    const request: DtoSitioGrabacionRequest = {
      consecutivo: v.consecutivo,
      descripcion: v.descripcion.trim(),
      abreviatura: v.abreviatura.trim() || null,
      codDane:     v.codDane.trim() || null,
      vigente:     v.vigente,
    };

    this.saving.set(true);
    const obs = this.modo() === 'crear'
      ? this.svc.crear(request)
      : this.svc.actualizar(this.editId(), request);

    obs.subscribe({
      next: r => {
        this.saving.set(false);
        if (r.success) {
          this.toast.success('Sitios de grabación', r.message);
          this.cerrarModal();
          this.cargar();
        } else {
          this.toast.warning('Sitios de grabación', r.message);
        }
      },
      error: err => {
        this.saving.set(false);
        this.toast.error('Sitios de grabación', err?.error?.message ?? 'No se pudo guardar el sitio.');
      },
    });
  }

  // ── Acciones de fila ─────────────────────────────────────────────────────

  cambiarVigencia(s: DtoSitioGrabacion): void {
    this.svc.toggle(s.consecutivo).subscribe({
      next: r => {
        if (r.success) { this.toast.success('Sitios de grabación', r.message); this.cargar(); }
        else             this.toast.warning('Sitios de grabación', r.message);
      },
      error: err => this.toast.error('Sitios de grabación',
        err?.error?.message ?? 'No se pudo cambiar la vigencia.'),
    });
  }

  async eliminar(s: DtoSitioGrabacion): Promise<void> {
    const ok = await this.alert.confirm(
      'Eliminar sitio de grabación',
      `Se eliminará «${s.descripcion}» (código ${s.consecutivo}). Esta acción no se puede deshacer.`,
      'Eliminar',
    );
    if (!ok) return;

    this.svc.eliminar(s.consecutivo).subscribe({
      next: r => {
        if (r.success) { this.toast.success('Sitios de grabación', r.message); this.cargar(); }
        else             this.toast.warning('Sitios de grabación', r.message);
      },
      error: err => this.toast.error('Sitios de grabación',
        err?.error?.message ?? 'No se pudo eliminar el sitio.'),
    });
  }
}

/** Contexto que ui-table pasa a cada cellTemplate. */
interface CeldaCtx {
  $implicit: DtoSitioGrabacion;
  row: DtoSitioGrabacion;
  column: UiTableColumn<DtoSitioGrabacion>;
}
