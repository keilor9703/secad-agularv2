import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { startWith } from 'rxjs';

import {
  isMenuDestinationType,
  MenuDestinationType,
  normalizeMenuType,
} from '../../../../../core/navigation/menu-destination';
import { DbMenuItem, MenuSaveRequest } from '../../../../../core/services/menu.service';
import { UiButtonComponent } from '../../../../../shared/components/ui-button/ui-button.component';
import { UiIconPickerComponent } from '../../../../../shared/components/ui-icon-picker/ui-icon-picker.component';
import { UiInputComponent } from '../../../../../shared/components/ui-input/ui-input.component';
import { UiSelectComponent } from '../../../../../shared/components/ui-select/ui-select.component';
import { UiSelectOption } from '../../../../../shared/interfaces/ui-select-option.interface';
import { getFormErrorMessage } from '../../../../../shared/utils/form-error.util';
import { menuDetailError, menuDetailValidators } from '../menu-destination.validators';
import { MENU_ROUTE_OPTIONS } from '../menu-route-options';

type MenuFormField =
  | 'descripcion'
  | 'idPadre'
  | 'posicion'
  | 'tipo'
  | 'icono'
  | 'vigente'
  | 'detalle';

const MENU_TYPE_OPTIONS: UiSelectOption<string>[] = [
  { value: 'GRUPO', label: 'Grupo (contenedor, sin ruta)' },
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
  readonly routeOptions = MENU_ROUTE_OPTIONS;
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
  readonly selectedType = signal<MenuDestinationType>('S');
  readonly isInternalDestination = computed(() => this.selectedType() === 'frm');
  readonly usesInternalRoute = computed(
    () =>
      this.selectedType() === 'frm' ||
      this.selectedType() === 'S' ||
      this.selectedType() === 'GRUPO',
  );
  // Un grupo es contenedor siempre; un 'S' lo es mientras no tenga ruta.
  readonly isContainerDestination = computed(
    () => this.selectedType() === 'GRUPO' || this.selectedType() === 'S',
  );

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
    { value: 0, label: 'Menú principal (nivel superior / raíz)' },
    ...this.parentOptions().map((item) => ({
      value: item.idMenu,
      label: `${item.descripcion} · ID ${item.idMenu}`,
    })),
  ]);

  constructor() {
    this.form.controls.tipo.valueChanges
      .pipe(startWith(this.form.controls.tipo.value), takeUntilDestroyed())
      .subscribe((rawType) => {
        const type = isMenuDestinationType(rawType) ? rawType : 'S';
        this.selectedType.set(type);
        this.form.controls.detalle.setValidators(menuDetailValidators(type));
        this.form.controls.detalle.updateValueAndValidity({ emitEvent: false });
      });

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
      tipo: isMenuDestinationType(value.tipo) ? value.tipo : 'S',
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

    if (field === 'detalle') {
      const detailError = menuDetailError(control);
      if (detailError) {
        return detailError;
      }
    }

    return getFormErrorMessage(control);
  }

  private writeForm(item: DbMenuItem | null, createParentId = 0, suggestedPosition = 0): void {
    // Antes aquí se hacía `rawType === 'GRUPO' ? 'S' : rawType`: abrir un grupo
    // ya lo dejaba escrito como submenú en el formulario, así que guardarlo sin
    // tocar nada le cambiaba el tipo. Se conserva lo que hay y solo se traduce
    // lo que esta pantalla no sabe ofrecer ('ENLACE' → 'frm').
    const type = item ? normalizeMenuType(item.tipo) : 'S';
    const parentId = item
      ? item.idPadre === item.idMenu || item.idPadre <= 0
        ? 0
        : item.idPadre
      : createParentId;

    this.form.reset({
      descripcion: item?.descripcion ?? '',
      idPadre: parentId,
      posicion: String(item?.posicion ?? Math.max(0, suggestedPosition)),
      tipo: type,
      icono: item?.icono ?? '',
      vigente: item?.vigente === 0 ? 0 : 1,
      detalle: item?.detalle ?? '',
    });
  }
}
