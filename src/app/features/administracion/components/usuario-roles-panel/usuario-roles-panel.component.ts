import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';

import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiInputComponent } from '../../../../shared/components/ui-input/ui-input.component';
import { UiSelectComponent } from '../../../../shared/components/ui-select/ui-select.component';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';
import { getFormErrorMessage } from '../../../../shared/utils/form-error.util';
import { UserRole } from '../../interfaces/usuario-admin-view.interface';
import { DtoRolCatalogo } from '../../services/usuario-admin.service';

@Component({
  selector: 'app-usuario-roles-panel',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, UiButtonComponent, UiInputComponent, UiSelectComponent],
  templateUrl: './usuario-roles-panel.component.html',
  styleUrls: ['./usuario-roles-panel.component.scss'],
})
export class UsuarioRolesPanelComponent {
  @Input() roles: UserRole[] = [];
  @Input() rolesCatalogo: DtoRolCatalogo[] = [];
  @Input() rolForm!: FormGroup;
  @Input() showAddRoleForm = false;
  @Input() editingRole: UserRole | null = null;
  @Input() savingRole = false;
  @Input() deletingRoleId: number | null = null;
  @Input() superAdministradorRolId = 1;

  @Output() agregarRol = new EventEmitter<void>();
  @Output() guardarRol = new EventEmitter<void>();
  @Output() cancelarRol = new EventEmitter<void>();
  @Output() editarRol = new EventEmitter<UserRole>();
  @Output() eliminarRol = new EventEmitter<UserRole>();

  get rolOptions(): UiSelectOption<number>[] {
    return this.rolesCatalogo.map((role) => ({
      label: role.nombre || `Rol ${role.id}`,
      value: role.id,
    }));
  }

  getRoleError(fieldName: string): string {
    return getFormErrorMessage(this.rolForm?.get(fieldName) ?? null);
  }
}
