import {
  Component, ChangeDetectionStrategy, OnInit, ViewChild, TemplateRef,
  inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  SuperAdminService, UnidadItem, UnidadSaveRequest,
  DepartamentoItem
} from '../../../../core/services/super-admin.service';
import { ToastService } from '../../../../core/services/toast.service';

import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiTableComponent } from '../../../../shared/components/ui-table/ui-table.component';
import { UiModalComponent } from '../../../../shared/components/ui-modal/ui-modal.component';
import { UiInputComponent } from '../../../../shared/components/ui-input/ui-input.component';
import { UiSelectComponent } from '../../../../shared/components/ui-select/ui-select.component';
import { UiBadgeComponent } from '../../../../shared/components/ui-badge/ui-badge.component';
import { UiSectionHeaderComponent } from '../../../../shared/components/ui-section-header/ui-section-header.component';
import { UiTableAction, UiTableActionEvent, UiTableColumn } from '../../../../shared/interfaces/ui-table.interface';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';

type ModalMode = 'create' | 'edit';

@Component({
  selector: 'app-unidades-page',
  templateUrl: './unidades-page.component.html',
  styleUrls: ['./unidades-page.component.scss'],
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    UiPageHeaderComponent, UiButtonComponent, UiTableComponent, UiModalComponent,
    UiInputComponent, UiSelectComponent, UiBadgeComponent, UiSectionHeaderComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UnidadesPageComponent implements OnInit {
  private readonly service = inject(SuperAdminService);
  private readonly toast   = inject(ToastService);
  private readonly fb      = inject(FormBuilder);

  // ── Estado principal ──────────────────────────────────────────────────────
  readonly unidades = signal<UnidadItem[]>([]);
  readonly totalCount = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(15);
  readonly loading = signal(false);
  readonly saving  = signal(false);

  // Filtros
  readonly filtroTexto = signal('');
  readonly filtroDepartamento = signal('');
  readonly departamentos = signal<DepartamentoItem[]>([]);

  readonly filtroForm = this.fb.nonNullable.group({
    texto: [''],
    departamento: [''],
  });

  // Modal
  readonly showModal = signal(false);
  readonly modalMode = signal<ModalMode>('create');
  readonly editConsecutivo = signal<number>(0);
  readonly intentoGuardar = signal(false);

  readonly totalPages = computed(() => {
    const total = this.totalCount();
    const size = this.pageSize();
    return Math.max(1, Math.ceil(total / size));
  });

  readonly opcionesDepartamentosFiltro = computed<UiSelectOption<string>[]>(() => {
    const opts: UiSelectOption<string>[] = [
      { label: 'Todos los departamentos', value: '' }
    ];
    for (const d of this.departamentos()) {
      opts.push({ label: `${d.departamento} (${d.totalMunicipios})`, value: d.departamento });
    }
    return opts;
  });

  readonly opcionesVigente: UiSelectOption<string>[] = [
    { label: 'Vigente (SI)',    value: 'SI' },
    { label: 'No vigente (NO)', value: 'NO' },
  ];

  // ── Formulario ────────────────────────────────────────────────────────────
  readonly form = this.fb.nonNullable.group({
    consecutivo:            this.fb.control<number | null>(null),
    fuerza:                 [6],
    descripcionDependencia: ['', [Validators.required]],
    vigente:                ['SI'],
    siglaFisica:            [''],
    siglaPapa:              [''],
    departamento:           ['', [Validators.required]],
    codigoDepartamento:     this.fb.control<number | null>(null),
    municipio:              ['', [Validators.required]],
    codigoDane:             ['', [Validators.required]],
    descRegional:           [''],
    codRegional:            this.fb.control<number | null>(null),
    direccion:              [''],
    telefono:               [''],
    telefonoIp:             [''],
    email:                  [''],
    zona:                   ['UR'],
  });

  // ── Validación de errores ─────────────────────────────────────────────────
  readonly errorDescripcion = computed(() =>
    this.intentoGuardar() && !this.form.controls.descripcionDependencia.value.trim()
      ? 'La descripción de la dependencia es obligatoria.' : '');

  readonly errorDepartamento = computed(() =>
    this.intentoGuardar() && !this.form.controls.departamento.value.trim()
      ? 'El departamento es obligatorio.' : '');

  readonly errorMunicipio = computed(() =>
    this.intentoGuardar() && !this.form.controls.municipio.value.trim()
      ? 'El municipio es obligatorio.' : '');

  readonly errorCodigoDane = computed(() =>
    this.intentoGuardar() && !this.form.controls.codigoDane.value.trim()
      ? 'El código DANE es obligatorio.' : '');

  // ── Tabla ────────────────────────────────────────────────────────────────
  @ViewChild('celdaUnidad',    { static: true }) celdaUnidad!: TemplateRef<CeldaCtx>;
  @ViewChild('celdaUbicacion', { static: true }) celdaUbicacion!: TemplateRef<CeldaCtx>;
  @ViewChild('celdaVigente',   { static: true }) celdaVigente!: TemplateRef<CeldaCtx>;

  columns: UiTableColumn<UnidadItem>[] = [];

  readonly acciones: UiTableAction<UnidadItem>[] = [
    { id: 'editar', label: 'Editar',               icon: 'fa-solid fa-pen' },
    { id: 'toggle', label: 'Activar / desactivar', icon: 'fa-solid fa-power-off', title: 'Cambiar vigencia' }
  ];

  ngOnInit(): void {
    this.columns = [
      { key: 'consecutivo',  label: 'Consecutivo', align: 'center', width: '110px' },
      { key: 'descripcionDependencia', label: 'Unidad / Dependencia', cellTemplate: this.celdaUnidad },
      { key: 'siglaFisica',  label: 'Sigla Física', align: 'center', width: '130px',
        value: u => u.siglaFisica || '—' },
      { key: 'municipio',    label: 'Ubicación',   cellTemplate: this.celdaUbicacion },
      { key: 'codigoDane',   label: 'Cód. DANE',   align: 'center', width: '110px',
        value: u => u.codigoDane || '—' },
      { key: 'descRegional', label: 'Regional',    width: '180px',
        value: u => u.descRegional || '—' },
      { key: 'vigente',      label: 'Vigente',     align: 'center', width: '100px', cellTemplate: this.celdaVigente },
    ];

    this.filtroForm.controls.texto.valueChanges.subscribe(v => {
      this.filtroTexto.set(v);
      this.page.set(1);
      this.cargarUnidades();
    });

    this.filtroForm.controls.departamento.valueChanges.subscribe(d => {
      this.filtroDepartamento.set(d);
      this.page.set(1);
      this.cargarUnidades();
    });

    this.cargarDepartamentos();
    this.cargarUnidades();
  }

  cargarDepartamentos(): void {
    this.service.getDepartamentos().subscribe({
      next: deps => this.departamentos.set(deps),
      error: () => this.toast.error('Departamentos', 'Error al cargar lista de departamentos.')
    });
  }

  cargarUnidades(): void {
    this.loading.set(true);
    this.service.getUnidades({
      filtro: this.filtroTexto().trim() || undefined,
      departamento: this.filtroDepartamento().trim() || undefined,
      page: this.page(),
      pageSize: this.pageSize(),
    }).subscribe({
      next: resp => {
        this.unidades.set(resp.items);
        this.totalCount.set(resp.totalCount);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Error', 'Error al cargar unidades institucionales.');
      }
    });
  }

  limpiarFiltros(): void {
    this.filtroForm.reset({ texto: '', departamento: '' });
  }

  cambiarPagina(nuevaPagina: number): void {
    if (nuevaPagina < 1 || nuevaPagina > this.totalPages()) return;
    this.page.set(nuevaPagina);
    this.cargarUnidades();
  }

  onAccion(ev: UiTableActionEvent<UnidadItem>): void {
    if (ev.actionId === 'editar') this.openEdit(ev.row);
    else if (ev.actionId === 'toggle') this.toggle(ev.row);
  }

  openCreate(): void {
    this.form.reset({
      consecutivo: null,
      fuerza: 6,
      descripcionDependencia: '',
      vigente: 'SI',
      siglaFisica: '',
      siglaPapa: '',
      departamento: this.filtroDepartamento() || '',
      codigoDepartamento: null,
      municipio: '',
      codigoDane: '',
      descRegional: '',
      codRegional: null,
      direccion: '',
      telefono: '',
      telefonoIp: '',
      email: '',
      zona: 'UR',
    });
    this.modalMode.set('create');
    this.editConsecutivo.set(0);
    this.intentoGuardar.set(false);
    this.showModal.set(true);
  }

  openEdit(u: UnidadItem): void {
    this.editConsecutivo.set(u.consecutivo);
    this.modalMode.set('edit');
    this.intentoGuardar.set(false);
    this.form.reset({
      consecutivo: u.consecutivo,
      fuerza: u.fuerza ?? 6,
      descripcionDependencia: u.descripcionDependencia,
      vigente: u.vigente || 'SI',
      siglaFisica: u.siglaFisica || '',
      siglaPapa: u.siglaPapa || '',
      departamento: u.departamento || '',
      codigoDepartamento: u.codigoDepartamento ?? null,
      municipio: u.municipio || '',
      codigoDane: u.codigoDane || '',
      descRegional: u.descRegional || '',
      codRegional: u.codRegional ?? null,
      direccion: u.direccion || '',
      telefono: u.telefono || '',
      telefonoIp: u.telefonoIp || '',
      email: u.email || '',
      zona: u.zona || 'UR',
    });
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
    this.intentoGuardar.set(false);
  }

  save(): void {
    this.intentoGuardar.set(true);
    if (this.errorDescripcion() || this.errorDepartamento() ||
        this.errorMunicipio() || this.errorCodigoDane()) return;

    this.saving.set(true);
    const v = this.form.getRawValue();
    const req: UnidadSaveRequest = {
      consecutivo:            this.modalMode() === 'edit' ? this.editConsecutivo() : (v.consecutivo || undefined),
      fuerza:                 v.fuerza || 6,
      descripcionDependencia: v.descripcionDependencia.trim(),
      vigente:                v.vigente,
      siglaFisica:            v.siglaFisica.trim() || undefined,
      siglaPapa:              v.siglaPapa.trim() || undefined,
      departamento:           v.departamento.trim(),
      codigoDepartamento:     v.codigoDepartamento ?? undefined,
      municipio:              v.municipio.trim(),
      codigoDane:             v.codigoDane.trim(),
      descRegional:           v.descRegional.trim() || undefined,
      codRegional:            v.codRegional ?? undefined,
      direccion:              v.direccion.trim() || undefined,
      telefono:               v.telefono.trim() || undefined,
      telefonoIp:             v.telefonoIp.trim() || undefined,
      email:                  v.email.trim() || undefined,
      zona:                   v.zona.trim() || 'UR',
    };

    const obs = this.modalMode() === 'create'
      ? this.service.createUnidad(req)
      : this.service.updateUnidad(this.editConsecutivo(), req);

    obs.subscribe({
      next: res => {
        this.saving.set(false);
        if (res.success) {
          this.toast.success('Unidad institucional', res.message);
          this.closeModal();
          this.cargarUnidades();
          this.cargarDepartamentos();
        } else {
          this.toast.error('Error', res.message);
        }
      },
      error: err => {
        this.saving.set(false);
        this.toast.error('Error', err?.error?.message || 'Error al guardar la unidad institucional.');
      }
    });
  }

  toggle(u: UnidadItem): void {
    this.service.toggleUnidad(u.consecutivo).subscribe({
      next: res => {
        if (res.success) {
          this.toast.success('Vigencia', res.message);
          this.cargarUnidades();
        } else {
          this.toast.error('Error', res.message);
        }
      },
      error: () => this.toast.error('Error', 'Error al cambiar vigencia de la unidad.')
    });
  }
}

interface CeldaCtx {
  $implicit: UnidadItem;
  row: UnidadItem;
  column: UiTableColumn<UnidadItem>;
}
