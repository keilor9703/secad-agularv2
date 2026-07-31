import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { DbMenuItem, MenuSaveRequest } from '../../../../../core/services/menu.service';
import { UiButtonComponent } from '../../../../../shared/components/ui-button/ui-button.component';
import { UiIconPickerComponent } from '../../../../../shared/components/ui-icon-picker/ui-icon-picker.component';
import { UiInputComponent } from '../../../../../shared/components/ui-input/ui-input.component';
import { UiSelectComponent } from '../../../../../shared/components/ui-select/ui-select.component';
import { UiSelectOption } from '../../../../../shared/interfaces/ui-select-option.interface';
import { getFormErrorMessage } from '../../../../../shared/utils/form-error.util';

type MenuFormField =
  | 'descripcion'
  | 'idPadre'
  | 'posicion'
  | 'tipo'
  | 'icono'
  | 'vigente'
  | 'detalle';

const MENU_TYPE_OPTIONS: UiSelectOption<string>[] = [
  { value: 'S', label: 'Submenú' },
  { value: 'frm', label: 'Formulario interno' },
  { value: 'url', label: 'Hipervínculo' },
  { value: 'pdf', label: 'Documento PDF' },
];

const MENU_STATUS_OPTIONS: UiSelectOption<number>[] = [
  { value: 1, label: 'Activo' },
  { value: 0, label: 'Inactivo' },
];

@Component({
  selector: 'app-menu-admin-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    UiButtonComponent,
    UiIconPickerComponent,
    UiInputComponent,
    UiSelectComponent,
  ],
  templateUrl: './menu-admin-form.component.html',
  styleUrl: './menu-admin-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MenuAdminFormComponent {
  private readonly fb = inject(NonNullableFormBuilder);

  readonly editingItem = input<DbMenuItem | null>(null);
  readonly creating = input(false);
  readonly createParent = input<DbMenuItem | null>(null);
  readonly suggestedPosition = input(0);
  readonly parentOptions = input<readonly DbMenuItem[]>([]);
  readonly saving = input(false);

  /**
   * Se incrementa desde la página después de guardar para limpiar también
   * formularios que estaban creando un registro nuevo.
   */
  readonly resetVersion = input(0);

  readonly saveRequested = output<MenuSaveRequest>();
  readonly cancelRequested = output<void>();

  readonly typeOptions = MENU_TYPE_OPTIONS;
  readonly statusOptions = MENU_STATUS_OPTIONS;
  readonly isCreating = computed(() => this.creating() && this.editingItem() === null);
  readonly title = computed(() =>
    this.isCreating() ? 'Crear menú principal' : 'Editar ítem de menú',
  );
  readonly description = computed(() =>
    this.isCreating()
      ? 'Defina el nuevo destino de primer nivel; quedará ubicado directamente bajo RAÍZ.'
      : 'Actualice la ubicación, el comportamiento y la visibilidad del ítem.',
  );
  readonly submitLabel = computed(() => (this.isCreating() ? 'Guardar menú' : 'Guardar cambios'));

  readonly form = this.fb.group({
    descripcion: ['', [Validators.required, Validators.maxLength(255)]],
    idPadre: [0, [Validators.required, Validators.min(0)]],
    posicion: ['0', [Validators.required, Validators.pattern(/^\d+$/)]],
    tipo: ['S', [Validators.required, Validators.maxLength(20)]],
    icono: ['', [Validators.maxLength(120)]],
    vigente: [1, [Validators.required]],
    detalle: ['', [Validators.maxLength(500)]],
  });

  readonly parentSelectOptions = computed<UiSelectOption<number>[]>(() => [
    { value: 0, label: 'Sin padre' },
    ...this.parentOptions().map((item) => ({
      value: item.idMenu,
      label: `${item.descripcion} · ID ${item.idMenu}`,
    })),
  ]);

  constructor() {
    effect(() => {
      const item = this.editingItem();
      const creating = this.creating();
      const parentId = this.createParent()?.idMenu ?? 0;
      const suggestedPosition = this.suggestedPosition();
      this.resetVersion();
      this.writeForm(item, creating ? parentId : 0, suggestedPosition);
    });
  }

  submit(): void {
    const editingItem = this.editingItem();

    if ((!editingItem && !this.isCreating()) || this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const position = Number(value.posicion);

    if (!Number.isSafeInteger(position) || position < 0) {
      this.form.controls.posicion.setErrors({ invalidPosition: true });
      this.form.controls.posicion.markAsTouched();
      return;
    }

    this.saveRequested.emit({
      idMenu: editingItem?.idMenu ?? null,
      descripcion: value.descripcion.trim(),
      idPadre: value.idPadre,
      posicion: position,
      tipo: value.tipo.trim(),
      icono: value.icono.trim(),
      vigente: value.vigente,
      detalle: value.detalle.trim(),
    });
  }

  reset(): void {
    this.writeForm(null, this.createParent()?.idMenu ?? 0, this.suggestedPosition());
    this.cancelRequested.emit();
  }

  errorFor(field: MenuFormField): string {
    const control = this.form.controls[field];

    if (field === 'posicion' && control.hasError('invalidPosition')) {
      return 'Ingrese una posición entera igual o mayor que cero.';
    }

    return getFormErrorMessage(control);
  }

  private writeForm(item: DbMenuItem | null, createParentId = 0, suggestedPosition = 0): void {
    this.form.reset({
      descripcion: item?.descripcion ?? '',
      idPadre: item?.idPadre ?? createParentId,
      posicion: String(item?.posicion ?? Math.max(0, suggestedPosition)),
      tipo: item?.tipo ?? 'S',
      icono: item?.icono ?? '',
      vigente: item?.vigente === 0 ? 0 : 1,
      detalle: item?.detalle ?? '',
    });
  }
}
