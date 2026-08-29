import {
  Component, ChangeDetectionStrategy, OnInit, ViewChild, TemplateRef,
  inject, signal, computed
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SuperAdminService, TenantPublico, TenantRequest } from '../../../../core/services/super-admin.service';
import { ToastService } from '../../../../core/services/toast.service';

import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiTableComponent } from '../../../../shared/components/ui-table/ui-table.component';
import { UiModalComponent } from '../../../../shared/components/ui-modal/ui-modal.component';
import { UiInputComponent } from '../../../../shared/components/ui-input/ui-input.component';
import { UiSelectComponent } from '../../../../shared/components/ui-select/ui-select.component';
import { UiSectionHeaderComponent } from '../../../../shared/components/ui-section-header/ui-section-header.component';
import { UiBadgeComponent } from '../../../../shared/components/ui-badge/ui-badge.component';
import { UiTableAction, UiTableActionEvent, UiTableColumn } from '../../../../shared/interfaces/ui-table.interface';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';
import { UiStatusVariant } from '../../../../shared/interfaces/ui-status.interface';

type ModalMode = 'create' | 'edit';

@Component({
  selector: 'app-tenants-page',
  templateUrl: './tenants-page.component.html',
  styleUrls: ['./tenants-page.component.scss'],
  standalone: true,
  imports: [
    ReactiveFormsModule,
    UiPageHeaderComponent, UiButtonComponent, UiTableComponent, UiModalComponent,
    UiInputComponent, UiSelectComponent, UiSectionHeaderComponent, UiBadgeComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TenantsPageComponent implements OnInit {
  private readonly service = inject(SuperAdminService);
  private readonly toast   = inject(ToastService);
  private readonly fb      = inject(FormBuilder);

  readonly tenants = signal<TenantPublico[]>([]);
  readonly loading = signal(false);
  readonly saving  = signal(false);

  readonly showModal = signal(false);
  readonly modalMode = signal<ModalMode>('create');
  readonly editId    = signal(0);

  readonly form = this.fb.nonNullable.group({
    codDane:      ['', [Validators.required]],
    codUnidad:    [''],
    nombre:       ['', [Validators.required]],
    departamento: [''],
    municipio:    [''],
    categoria:    ['A'],
    sitioGraba:   this.fb.control<number | null>(null),
    dbHost:       [''],
    dbPort:       [5432],
    dbName:       [''],
    dbUsername:   [''],
    dbPassword:   [''],
    activo:       [true]
  });

  // ── Tabla ────────────────────────────────────────────────────────────────
  @ViewChild('celdaNombre',    { static: true }) celdaNombre!: TemplateRef<CeldaCtx>;
  @ViewChild('celdaUbicacion', { static: true }) celdaUbicacion!: TemplateRef<CeldaCtx>;
  @ViewChild('celdaSalud',     { static: true }) celdaSalud!: TemplateRef<CeldaCtx>;

  columns: UiTableColumn<TenantPublico>[] = [];

  readonly acciones: UiTableAction<TenantPublico>[] = [
    { id: 'editar', label: 'Editar',               icon: 'fa-solid fa-pen' },
    { id: 'toggle', label: 'Activar / desactivar', icon: 'fa-solid fa-power-off', title: 'Cambiar estado' }
  ];

  readonly opcionesCategoria: UiSelectOption[] = [
    { label: 'A — Alta disponibilidad',  value: 'A' },
    { label: 'B — Media disponibilidad', value: 'B' },
    { label: 'C — Básica',               value: 'C' }
  ];

  readonly opcionesEstado: UiSelectOption<boolean>[] = [
    { label: 'Activo',   value: true  },
    { label: 'Inactivo', value: false }
  ];

  // ── Validación ───────────────────────────────────────────────────────────
  // Los mismos requisitos que ya comprobaba save(), pero mostrados en el campo
  // que falla en vez de en un toast genérico al final.
  readonly intentoGuardar = signal(false);

  private requerido(campo: keyof TenantRequest, mensaje: string, soloAlCrear = false) {
    return computed(() => {
      if (!this.intentoGuardar()) return '';
      if (soloAlCrear && this.modalMode() !== 'create') return '';
      const v = this.form.getRawValue()[campo];
      return String(v ?? '').trim() ? '' : mensaje;
    });
  }

  readonly errorCodDane    = this.requerido('codDane',    'El código DANE es obligatorio.');
  readonly errorNombre     = this.requerido('nombre',     'El nombre del CAD es obligatorio.');
  readonly errorDbHost     = this.requerido('dbHost',     'El host de la BD es obligatorio.', true);
  readonly errorDbName     = this.requerido('dbName',     'El nombre de la BD es obligatorio.', true);
  readonly errorDbUsuario  = this.requerido('dbUsername', 'El usuario de la BD es obligatorio.', true);
  readonly errorDbPassword = this.requerido('dbPassword', 'La contraseña es obligatoria al crear un tenant.', true);

  ngOnInit(): void {
    this.columns = [
      { key: 'nombre',       label: 'CAD / Nombre',  cellTemplate: this.celdaNombre },
      { key: 'codDane',      label: 'Cód. DANE',     align: 'center' },
      { key: 'sitioGraba',   label: 'Sitio Graba',   align: 'center',
        value: t => t.sitioGraba ?? '—' },
      { key: 'departamento', label: 'Departamento',  cellTemplate: this.celdaUbicacion },
      { key: 'categoria',    label: 'Categoría',     align: 'center',
        // categoria es opcional: sin valor no se pinta insignia (antes salía vacía).
        badge: t => t.categoria ? { text: t.categoria, variant: 'info' } : null },
      { key: 'nivelOperacion', label: 'Salud',       align: 'center', cellTemplate: this.celdaSalud },
      {
        key: 'activo',       label: 'Estado',        align: 'center',
        badge: t => t.suspendido ? { text: 'Suspendido', variant: 'warning' }
                  : t.activo     ? { text: 'Activo',     variant: 'success' }
                                 : { text: 'Inactivo',   variant: 'danger'  }
      }
    ];

    this.load();
  }

  onAccion(ev: UiTableActionEvent<TenantPublico>): void {
    if (ev.actionId === 'editar') this.openEdit(ev.row);
    else if (ev.actionId === 'toggle') this.toggle(ev.row);
  }

  /** nivelClass() del servicio devuelve success|warning|danger, que ya son variantes del kit. */
  nivelVariant = (n: number) => this.service.nivelClass(n) as UiStatusVariant;

  load(): void {
    this.loading.set(true);
    this.service.getTenants().subscribe({
      next: data => { this.tenants.set(data); this.loading.set(false); },
      error: ()   => { this.loading.set(false); this.toast.error('Error', 'Error al cargar tenants.'); }
    });
  }

  openCreate(): void {
    this.form.reset(this.emptyForm());
    this.intentoGuardar.set(false);
    this.modalMode.set('create');
    this.editId.set(0);
    this.showModal.set(true);
  }

  openEdit(t: TenantPublico): void {
    this.editId.set(t.id);
    this.intentoGuardar.set(false);
    this.modalMode.set('edit');
    this.form.reset({
      codDane:      t.codDane,
      codUnidad:    t.codUnidad,
      nombre:       t.nombre,
      departamento: t.departamento,
      municipio:    t.municipio,
      categoria:    t.categoria ?? 'A',
      sitioGraba:   t.sitioGraba ?? null,
      dbHost:       '',
      dbPort:       5432,
      dbName:       '',
      dbUsername:   '',
      dbPassword:   '',
      activo:       t.activo
    });
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
    this.intentoGuardar.set(false);
  }

  save(): void {
    this.intentoGuardar.set(true);

    const v = this.form.getRawValue();
    const mode = this.modalMode();

    // Cada campo muestra su propio error; aquí solo se frena el guardado.
    if (this.errorCodDane() || this.errorNombre() ||
        this.errorDbHost() || this.errorDbName() ||
        this.errorDbUsuario() || this.errorDbPassword()) return;

    this.saving.set(true);
    const request: TenantRequest = v;
    const obs = mode === 'create'
      ? this.service.createTenant(request)
      : this.service.updateTenant(this.editId(), request);

    obs.subscribe({
      next: result => {
        this.saving.set(false);
        if (result.success) {
          this.toast.success('Guardado', result.message);
          this.closeModal();
          this.load();
        } else {
          this.toast.error('Error', result.message);
        }
      },
      error: () => {
        this.saving.set(false);
        this.toast.error('Error', 'Error al guardar tenant.');
      }
    });
  }

  toggle(t: TenantPublico): void {
    this.service.toggleTenant(t.id).subscribe({
      next: result => {
        if (result.success) {
          this.toast.success('Estado actualizado', result.message);
          this.load();
        } else {
          this.toast.error('Error', result.message);
        }
      },
      error: () => this.toast.error('Error', 'Error al cambiar estado.')
    });
  }

  nivelLabel = (n: number) => this.service.nivelLabel(n);
  nivelClass = (n: number) => this.service.nivelClass(n);
  nivelIcon  = (n: number) => this.service.nivelIcon(n);

  private emptyForm(): TenantRequest {
    return {
      codDane: '', codUnidad: '', nombre: '',
      departamento: '', municipio: '', categoria: 'A',
      sitioGraba: null,
      dbHost: '', dbPort: 5432, dbName: '',
      dbUsername: '', dbPassword: '', activo: true
    };
  }
}

/** Contexto que ui-table pasa a cada cellTemplate. */
interface CeldaCtx {
  $implicit: TenantPublico;
  row: TenantPublico;
  column: UiTableColumn<TenantPublico>;
}
