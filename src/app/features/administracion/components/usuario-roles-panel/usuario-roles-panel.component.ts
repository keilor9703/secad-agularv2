import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';

import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiInputComponent } from '../../../../shared/components/ui-input/ui-input.component';
import { UiModalComponent } from '../../../../shared/components/ui-modal/ui-modal.component';
import { UiSelectComponent } from '../../../../shared/components/ui-select/ui-select.component';
import { UiTableComponent } from '../../../../shared/components/ui-table/ui-table.component';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';
import {
  UiTableAction,
  UiTableActionDisplay,
  UiTableActionEvent,
  UiTableActionsPosition,
  UiTableBadge,
  UiTableColumn,
  UiTableVariant,
} from '../../../../shared/interfaces/ui-table.interface';
import { getFormErrorMessage } from '../../../../shared/utils/form-error.util';
import { RolEstado, UserRole } from '../../interfaces/usuario-admin-view.interface';
import { DtoRolCatalogo } from '../../services/usuario-admin.service';

@Component({
  selector: 'app-usuario-roles-panel',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    UiButtonComponent,
    UiInputComponent,
    UiModalComponent,
    UiSelectComponent,
    UiTableComponent,
  ],
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

  /**
   * Configuración visual de esta tabla:
   * - plain: encabezado limpio, sin relleno institucional.
   * - row-hover: botones flotantes al pasar o enfocar la fila.
   * - left: acciones fijas en el extremo izquierdo.
   */
  readonly roleTableVariant = signal<UiTableVariant>('plain');
  readonly roleActionDisplay = signal<UiTableActionDisplay>('row-hover');
  readonly roleActionsPosition = signal<UiTableActionsPosition>('right');

  readonly roleColumns: UiTableColumn<UserRole>[] = [
    {
      key: 'nombre',
      label: 'Rol',
      sortable: true,
      width: '20%',
      fontWeight: 'semibold',
    },
    {
      key: 'estado',
      label: 'Estado',
      align: 'center',
      width: '20%',
      badge: (role) => this.statusBadge(role.estado),
    },
    {
      key: 'fechaExpiracion',
      label: 'Fecha expiración',
      width: '20%',
      value: (role) => role.fechaExpiracion || 'Sin fecha',
    },
    {
      key: 'justificacion',
      label: 'Justificación',
      value: (role) => role.justificacion || 'Sin justificación',
    },
  ];

  private statusBadge(status: RolEstado): UiTableBadge {
    if (status === 'Vigente') {
      return {
        text: status,
        variant: 'success',
        appearance: 'outline',
        size: 'xs',
        icon: 'fa-solid fa-check',
        uppercase: true,
      };
    }

    if (status === 'Vencido') {
      return {
        text: status,
        variant: 'primary',
        appearance: 'outline',
        size: 'xs',
        icon: 'fa-solid fa-triangle-exclamation',
        uppercase: true,
      };
    }

    return {
      text: status,
      variant: 'secondary',
      appearance: 'outline',
      size: 'xs',
      icon: 'fa-solid fa-ban',
      uppercase: true,
    };
  }

  readonly roleActions: UiTableAction<UserRole>[] = [
    {
      id: 'edit',
      label: 'Editar',
      icon: 'fa-solid fa-pen-to-square',
      description: 'Actualizar vigencia y justificación',
      variant: 'info',
    },
    {
      id: 'delete',
      label: 'Retirar rol',
      icon: 'fa-solid fa-trash',
      description: 'Retirar el rol asignado',
      variant: 'danger',
      visible: (role) => role.id === this.superAdministradorRolId,
      disabled: (role) => this.deletingRoleId === role.id,
    },
  ];

  get rolOptions(): UiSelectOption<number>[] {
    return this.rolesCatalogo.map((role) => ({
      label: role.nombre || `Rol ${role.id}`,
      value: role.id,
    }));
  }

  get roleModalTitle(): string {
    return this.editingRole ? 'Editar rol asignado' : 'Asignar rol';
  }

  get roleModalSubtitle(): string {
    return this.editingRole
      ? 'Actualiza la vigencia y la justificación del rol seleccionado.'
      : 'Selecciona el rol, define su vigencia y registra la justificación.';
  }

  handleRoleAction(event: UiTableActionEvent<UserRole>): void {
    if (event.actionId === 'edit') {
      this.editarRol.emit(event.row);
      return;
    }

    if (event.actionId === 'delete') {
      this.eliminarRol.emit(event.row);
    }
  }

  getRoleError(fieldName: string): string {
    return getFormErrorMessage(this.rolForm?.get(fieldName) ?? null);
  }
}
