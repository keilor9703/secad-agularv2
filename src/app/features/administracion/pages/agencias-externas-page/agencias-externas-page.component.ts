import {
  Component, ChangeDetectionStrategy, OnInit, ViewChild, TemplateRef,
  inject, signal, computed
} from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';

import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiTableComponent } from '../../../../shared/components/ui-table/ui-table.component';
import { UiModalComponent } from '../../../../shared/components/ui-modal/ui-modal.component';
import { UiInputComponent } from '../../../../shared/components/ui-input/ui-input.component';
import { UiSelectComponent } from '../../../../shared/components/ui-select/ui-select.component';
import { UiSectionHeaderComponent } from '../../../../shared/components/ui-section-header/ui-section-header.component';
import { UiTableAction, UiTableActionEvent, UiTableColumn } from '../../../../shared/interfaces/ui-table.interface';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';
import {
  AgenciaExternaService,
  DtoAgenciaExterna,
  DtoAgenciaExternaRequest,
  TIPOS_AGENCIA
} from '../../../../core/services/operacion/agencia-externa.service';
import { ToastService } from '../../../../core/services/toast.service';

type ModalMode = 'create' | 'edit';

@Component({
  selector: 'app-agencias-externas-page',
  standalone:  true,
  imports: [
    FormsModule, ReactiveFormsModule,
    UiPageHeaderComponent, UiButtonComponent, UiTableComponent, UiModalComponent,
    UiInputComponent, UiSelectComponent, UiSectionHeaderComponent
  ],
  templateUrl: './agencias-externas-page.component.html',
  styleUrls: ['./agencias-externas-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AgenciasExternasPageComponent implements OnInit {
  private readonly svc   = inject(AgenciaExternaService);
  private readonly toast = inject(ToastService);
  private readonly fb    = inject(FormBuilder);

  readonly agencias = signal<DtoAgenciaExterna[]>([]);
  readonly loading  = signal(false);
  readonly saving   = signal(false);

  readonly showModal  = signal(false);
  readonly modalMode  = signal<ModalMode>('create');
  readonly editId     = signal('');

  readonly tiposAgencia = TIPOS_AGENCIA;

  // ── Tabla ────────────────────────────────────────────────────────────────
  // Las celdas que solo pintan texto o una insignia se declaran con value()/
  // badge(): antes cada una era un <td> con su propio marcado y sus clases.
  @ViewChild('celdaNombre', { static: true })
  celdaNombre!: TemplateRef<CeldaCtx>;
  @ViewChild('celdaUrl', { static: true })
  celdaUrl!: TemplateRef<CeldaCtx>;

  columns: UiTableColumn<DtoAgenciaExterna>[] = [];

  readonly acciones: UiTableAction<DtoAgenciaExterna>[] = [
    { id: 'editar', label: 'Editar', icon: 'fa-solid fa-pen' },
    {
      id: 'toggle',
      label: 'Activar / desactivar',
      icon: 'fa-solid fa-power-off',
      // El título cambia según el estado de la fila, igual que antes.
      title: 'Cambiar estado'
    }
  ];

  // ── Opciones de los selectores ───────────────────────────────────────────
  readonly opcionesTipo: UiSelectOption[] =
    TIPOS_AGENCIA.map(t => ({ label: t.label, value: t.value }));

  readonly opcionesMetodo: UiSelectOption[] = [
    { label: 'POST', value: 'POST' },
    { label: 'PUT',  value: 'PUT'  }
  ];

  readonly opcionesEstado: UiSelectOption<boolean>[] = [
    { label: 'Activa',   value: true  },
    { label: 'Inactiva', value: false }
  ];

  // ── Errores de validación ────────────────────────────────────────────────
  // Antes solo salían como toast al guardar; ahora el propio campo los muestra.
  readonly intentoGuardar = signal(false);

  readonly errorNombre = computed(() =>
    this.intentoGuardar() && !this.form.controls.nombre.value.trim()
      ? 'El nombre de la agencia es obligatorio.'
      : ''
  );

  readonly errorCabeceras = computed(() => jsonInvalido(this.formCabeceras()));
  readonly errorMapeo     = computed(() => jsonInvalido(this.formMapeo()));

  /** Campos del request no editados por esta UI todavía — se conservan al guardar. */
  private tipoAuth: DtoAgenciaExternaRequest['tipoAuth']             = 'BEARER';
  private apiUsuario                                                  = '';
  private apiPassword                                                 = '';
  private authExtra                                                   = '';
  private formatoPayload: DtoAgenciaExternaRequest['formatoPayload']  = 'PLANO';

  readonly form = this.fb.nonNullable.group({
    nombre:      ['', [Validators.required]],
    descripcion: [''],
    tipoAgencia: ['OTRA'],
    apiUrl:      [''],
    apiMetodo:   ['POST'],
    apiToken:    [''],
    activa:      [true]
  });

  // Campos auxiliares para el JSON de cabeceras y mapeo
  readonly formCabeceras = signal('');
  readonly formMapeo     = signal('');

  ngOnInit(): void {
    this.columns = [
      { key: 'nombre',      label: 'Agencia',  cellTemplate: this.celdaNombre },
      {
        key: 'tipoAgencia', label: 'Tipo',
        badge: a => ({
          text: this.getTipoLabel(a.tipoAgencia),
          icon: `fa-solid ${this.getTipoIcon(a.tipoAgencia)}`,
          variant: 'info'
        })
      },
      { key: 'apiUrl',      label: 'URL API',  cellTemplate: this.celdaUrl },
      { key: 'apiMetodo',   label: 'Método',   align: 'center',
        badge: a => ({ text: a.apiMetodo, variant: 'neutral' }) },
      {
        key: 'tieneToken',  label: 'Token',    align: 'center',
        badge: a => a.tieneToken
          ? { text: 'Configurado', icon: 'fa-solid fa-lock',      variant: 'success' }
          : { text: 'Sin token',   icon: 'fa-solid fa-lock-open', variant: 'danger'  }
      },
      {
        key: 'activa',      label: 'Estado',   align: 'center',
        badge: a => a.activa
          ? { text: 'Activa',   variant: 'success' }
          : { text: 'Inactiva', variant: 'danger'  }
      }
    ];

    this.load();
  }

  /** Enruta la acción elegida en la fila hacia el método que ya existía. */
  onAccion(ev: UiTableActionEvent<DtoAgenciaExterna>): void {
    if (ev.actionId === 'editar') this.openEdit(ev.row);
    else if (ev.actionId === 'toggle') this.toggle(ev.row);
  }

  load(): void {
    this.loading.set(true);
    this.svc.getAll().subscribe({
      next:  data => { this.agencias.set(data); this.loading.set(false); },
      error: ()   => { this.loading.set(false); this.toast.error('Error', 'No se pudieron cargar las agencias.'); }
    });
  }

  openCreate(): void {
    this.form.reset(this.emptyForm());
    this.tipoAuth = 'BEARER';
    this.apiUsuario = '';
    this.apiPassword = '';
    this.authExtra = '';
    this.formatoPayload = 'PLANO';
    this.formCabeceras.set('');
    this.formMapeo.set('');
    this.intentoGuardar.set(false);
    this.modalMode.set('create');
    this.editId.set('');
    this.showModal.set(true);
  }

  openEdit(a: DtoAgenciaExterna): void {
    this.editId.set(a.id);
    this.intentoGuardar.set(false);
    this.modalMode.set('edit');
    this.form.reset({
      nombre:      a.nombre,
      descripcion: a.descripcion ?? '',
      tipoAgencia: a.tipoAgencia,
      apiUrl:      a.apiUrl ?? '',
      apiMetodo:   a.apiMetodo,
      apiToken:    '',   // nunca se pre-rellena por seguridad
      activa:      a.activa
    });
    this.tipoAuth       = a.tipoAuth ?? 'BEARER';
    this.apiUsuario     = a.apiUsuario ?? '';
    this.apiPassword    = '';
    this.authExtra      = a.authExtra ?? '';
    this.formatoPayload = a.formatoPayload ?? 'PLANO';
    this.formCabeceras.set(a.apiCabeceras ?? '');
    this.formMapeo.set(a.campoMapeo ?? '');
    this.showModal.set(true);
  }

  closeModal(): void {
    // ui-modal se encarga del scroll-lock y del foco; ya no hay que tocar <body>.
    this.showModal.set(false);
    this.intentoGuardar.set(false);
  }

  save(): void {
    // Marca el intento para que errorNombre() se active; los errores de JSON ya
    // se calculan solos mientras se escribe. Cada campo muestra el suyo, así que
    // aquí solo hay que frenar el guardado — antes esto eran tres toasts.
    this.intentoGuardar.set(true);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.errorCabeceras() || this.errorMapeo()) return;

    const cabeceras = this.formCabeceras();
    const mapeo     = this.formMapeo();

    const v = this.form.getRawValue();
    const request: DtoAgenciaExternaRequest = {
      nombre:         v.nombre,
      descripcion:    v.descripcion,
      tipoAgencia:    v.tipoAgencia,
      apiUrl:         v.apiUrl,
      apiMetodo:      v.apiMetodo,
      tipoAuth:       this.tipoAuth,
      apiToken:       v.apiToken,
      apiUsuario:     this.apiUsuario,
      apiPassword:    this.apiPassword,
      authExtra:      this.authExtra,
      apiCabeceras:   cabeceras.trim() || undefined,
      campoMapeo:     mapeo.trim()     || undefined,
      formatoPayload: this.formatoPayload,
      activa:         v.activa
    };

    this.saving.set(true);
    const mode = this.modalMode();
    const obs = mode === 'create'
      ? this.svc.crear(request)
      : this.svc.actualizar(this.editId(), request);

    obs.subscribe({
      next: r => {
        this.saving.set(false);
        if (r.success) {
          this.toast.success('Guardado', r.message);
          this.closeModal();
          this.load();
        } else {
          this.toast.error('Error', r.message);
        }
      },
      error: () => { this.saving.set(false); this.toast.error('Error', 'No se pudo guardar.'); }
    });
  }

  toggle(a: DtoAgenciaExterna): void {
    this.svc.toggle(a.id).subscribe({
      next: r => {
        if (r.success) { this.toast.success('Estado', r.message); this.load(); }
        else             this.toast.error('Error', r.message);
      },
      error: () => this.toast.error('Error', 'No se pudo cambiar el estado.')
    });
  }

  getTipoLabel = (t: string) => this.svc.getTipoLabel(t);
  getTipoIcon  = (t: string) => this.svc.getTipoIcon(t);

  private emptyForm() {
    return {
      nombre: '', descripcion: '', tipoAgencia: 'OTRA',
      apiUrl: '', apiMetodo: 'POST', apiToken: '', activa: true
    };
  }
}

/** Contexto que ui-table pasa a cada cellTemplate. */
interface CeldaCtx {
  $implicit: DtoAgenciaExterna;
  row: DtoAgenciaExterna;
  column: UiTableColumn<DtoAgenciaExterna>;
}

/** '' si el texto está vacío o es JSON válido; si no, el mensaje a mostrar. */
function jsonInvalido(texto: string): string {
  if (!texto.trim()) return '';
  try {
    JSON.parse(texto);
    return '';
  } catch {
    return 'No es un JSON válido.';
  }
}
