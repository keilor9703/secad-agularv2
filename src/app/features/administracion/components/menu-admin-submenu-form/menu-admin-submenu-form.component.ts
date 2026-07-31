import { ChangeDetectionStrategy, Component, effect, inject, input, output } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { DbMenuItem, MenuSaveRequest } from '../../../../core/services/menu.service';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiChipComponent } from '../../../../shared/components/ui-chip/ui-chip.component';
import { UiIconPickerComponent } from '../../../../shared/components/ui-icon-picker/ui-icon-picker.component';
import { UiInputComponent } from '../../../../shared/components/ui-input/ui-input.component';
import { UiSelectComponent } from '../../../../shared/components/ui-select/ui-select.component';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';
import { UiFormControlSize } from '../../../../shared/models/ui-form-control-size.model';
import { getFormErrorMessage } from '../../../../shared/utils/form-error.util';

type SubmenuFormField = 'descripcion' | 'posicion' | 'tipo' | 'icono' | 'vigente' | 'detalle';

const SUBMENU_TYPE_OPTIONS: UiSelectOption<string>[] = [
  { value: 'S', label: 'Contenedor de submenú' },
  { value: 'frm', label: 'Formulario interno' },
  { value: 'url', label: 'Hipervínculo' },
  { value: 'pdf', label: 'Documento PDF' },
];

const SUBMENU_STATUS_OPTIONS: UiSelectOption<number>[] = [
  { value: 1, label: 'Activo' },
  { value: 0, label: 'Inactivo' },
];

@Component({
  selector: 'app-menu-admin-submenu-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    UiButtonComponent,
    UiChipComponent,
    UiIconPickerComponent,
    UiInputComponent,
    UiSelectComponent,
  ],
  templateUrl: './menu-admin-submenu-form.component.html',
  styleUrl: './menu-admin-submenu-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MenuAdminSubmenuFormComponent {
  private readonly fb = inject(NonNullableFormBuilder);

  readonly parent = input.required<DbMenuItem>();
  readonly suggestedPosition = input(0);
  readonly saving = input(false);

  readonly saveRequested = output<MenuSaveRequest>();
  readonly cancelRequested = output<void>();

  readonly typeOptions = SUBMENU_TYPE_OPTIONS;
  readonly statusOptions = SUBMENU_STATUS_OPTIONS;

  /**
   * Tamaño compacto compartido por input y select. El ancho queda en 100 %
   * para que sea la grilla del formulario la que distribuya las columnas.
   */
  readonly compactControlSize: UiFormControlSize = {
    height: '38px',
    minHeight: '36px',
    maxHeight: '40px',
    width: '100%',
    minWidth: '0px',
    maxWidth: '100%',
    mobile: {
      height: '40px',
      minHeight: '38px',
      maxHeight: '42px',
      width: '100%',
      minWidth: '0px',
      maxWidth: '100%',
    },
  };

  readonly form = this.fb.group({
    descripcion: ['', [Validators.required, Validators.maxLength(255)]],
    posicion: ['0', [Validators.required, Validators.pattern(/^\d+$/)]],
    tipo: ['S', [Validators.required, Validators.maxLength(20)]],
    icono: ['', [Validators.maxLength(120)]],
    vigente: [1, [Validators.required]],
    detalle: ['', [Validators.maxLength(500)]],
  });

  constructor() {
    /*
     * Cada cambio de padre representa una operación nueva; por eso se
     * restablecen los valores y se propone la siguiente posición disponible.
     */
    effect(() => {
      this.parent().idMenu;
      this.resetForm(this.suggestedPosition());
    });
  }

  submit(): void {
    if (this.form.invalid || this.saving()) {
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
      idMenu: null,
      descripcion: value.descripcion.trim(),
      idPadre: this.parent().idMenu,
      posicion: position,
      tipo: value.tipo.trim(),
      icono: value.icono.trim(),
      vigente: value.vigente,
      detalle: value.detalle.trim(),
    });
  }

  cancel(): void {
    this.cancelRequested.emit();
  }

  errorFor(field: SubmenuFormField): string {
    const control = this.form.controls[field];

    if (field === 'posicion' && control.hasError('invalidPosition')) {
      return 'Ingrese una posición entera igual o mayor que cero.';
    }

    return getFormErrorMessage(control);
  }

  private resetForm(position: number): void {
    this.form.reset({
      descripcion: '',
      posicion: String(Math.max(0, position)),
      tipo: 'S',
      icono: '',
      vigente: 1,
      detalle: '',
    });
  }
}
