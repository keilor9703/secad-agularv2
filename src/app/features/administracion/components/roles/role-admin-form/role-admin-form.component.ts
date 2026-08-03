import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { UiButtonComponent } from '../../../../../shared/components/ui-button/ui-button.component';
import { UiInputComponent } from '../../../../../shared/components/ui-input/ui-input.component';
import { UiSelectComponent } from '../../../../../shared/components/ui-select/ui-select.component';
import { UiSelectOption } from '../../../../../shared/interfaces/ui-select-option.interface';
import { UiFormControlSize } from '../../../../../shared/models/ui-form-control-size.model';
import { getFormErrorMessage } from '../../../../../shared/utils/form-error.util';
import {
  RolAdminItem,
  SaveRolAdminRequest,
} from '../../../services/roles-admin.service';

type RoleFormField = 'nombre' | 'vigente';

const ROLE_STATUS_OPTIONS: UiSelectOption<number>[] = [
  { value: 1, label: 'Activo' },
  { value: 0, label: 'Inactivo' },
];

@Component({
  selector: 'app-role-admin-form',
  standalone: true,
  imports: [ReactiveFormsModule, UiButtonComponent, UiInputComponent, UiSelectComponent],
  templateUrl: './role-admin-form.component.html',
  styleUrl: './role-admin-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoleAdminFormComponent {
  private readonly fb = inject(NonNullableFormBuilder);

  readonly editingRole = input<RolAdminItem | null>(null);
  readonly embedded = input(false);
  readonly saving = input(false);
  readonly resetVersion = input(0);

  readonly saveRequested = output<SaveRolAdminRequest>();
  readonly cancelRequested = output<void>();

  readonly statusOptions = ROLE_STATUS_OPTIONS;
  readonly compactControlSize: UiFormControlSize = {
    height: '40px',
    minHeight: '38px',
    maxHeight: '42px',
    width: '100%',
    minWidth: '0px',
    maxWidth: '100%',
    mobile: {
      height: '41px',
      minHeight: '39px',
      maxHeight: '43px',
      width: '100%',
      minWidth: '0px',
      maxWidth: '100%',
    },
  };

  readonly form = this.fb.group({
    nombre: ['', [Validators.required, Validators.maxLength(255)]],
    vigente: [1, [Validators.required]],
  });

  constructor() {
    effect(() => {
      const role = this.editingRole();
      this.resetVersion();
      this.writeForm(role);
    });
  }

  get title(): string {
    return this.editingRole() ? 'Editar rol' : 'Crear rol';
  }

  get description(): string {
    return this.editingRole()
      ? 'Actualice el nombre y la disponibilidad del perfil seleccionado.'
      : 'Defina un perfil reutilizable para organizar los permisos del sistema.';
  }

  get submitLabel(): string {
    return this.editingRole() ? 'Guardar cambios' : 'Crear rol';
  }

  /** Valida, normaliza y entrega los datos; la página decide cómo persistirlos. */
  submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    this.saveRequested.emit({
      id: this.editingRole()?.id ?? null,
      nombre: value.nombre.trim(),
      vigente: value.vigente === 0 ? 0 : 1,
    });
  }

  /** Notifica el cierre sin ejecutar cambios sobre el catálogo. */
  cancel(): void {
    this.cancelRequested.emit();
  }

  /** Centraliza los mensajes para que input y select conserven el mismo criterio. */
  errorFor(field: RoleFormField): string {
    return getFormErrorMessage(this.form.controls[field]);
  }

  /** Sincroniza el formulario únicamente cuando cambia el contexto del editor. */
  private writeForm(role: RolAdminItem | null): void {
    this.form.reset({
      nombre: role?.nombre?.trim() ?? '',
      vigente: role?.vigente === 0 ? 0 : 1,
    });
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }
}
