import { ChangeDetectionStrategy, Component, computed, effect, input, output } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';

import {
  DbMenuItem,
  MenuRolCatalogItem,
  MenuRolItem,
} from '../../../../../core/services/menu.service';
import { UiButtonComponent } from '../../../../../shared/components/ui-button/ui-button.component';
import { UiChipComponent } from '../../../../../shared/components/ui-chip/ui-chip.component';
import { UiSelectComponent } from '../../../../../shared/components/ui-select/ui-select.component';
import { UiTableComponent } from '../../../../../shared/components/ui-table/ui-table.component';
import { UiSelectOption } from '../../../../../shared/interfaces/ui-select-option.interface';
import {
  UiTableAction,
  UiTableActionEvent,
  UiTableColumn,
} from '../../../../../shared/interfaces/ui-table.interface';
import { getFormErrorMessage } from '../../../../../shared/utils/form-error.util';

@Component({
  selector: 'app-menu-role-access',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    UiButtonComponent,
    UiChipComponent,
    UiSelectComponent,
    UiTableComponent,
  ],
  templateUrl: './menu-role-access.component.html',
  styleUrl: './menu-role-access.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MenuRoleAccessComponent {
  readonly menu = input.required<DbMenuItem>();
  readonly rolesCatalog = input<readonly MenuRolCatalogItem[]>([]);
  readonly assignedRoles = input<readonly MenuRolItem[]>([]);
  readonly loading = input(false);
  readonly saving = input(false);
  readonly removingRoleId = input<number | null>(null);

  readonly assignRequested = output<number>();
  readonly removeRequested = output<MenuRolItem>();
  readonly closeRequested = output<void>();

  readonly roleControl = new FormControl<number | null>(null, {
    validators: [Validators.required],
  });

  readonly roleOptions = computed<UiSelectOption<number>[]>(() => {
    const assignedIds = new Set(this.assignedRoles().map((role) => role.idRol));

    return this.rolesCatalog()
      .filter((role) => !assignedIds.has(role.idRol))
      .map((role) => ({
        value: role.idRol,
        label: `${role.descripcion} · ID ${role.idRol}`,
      }));
  });
  readonly assignedRoleRows = computed<MenuRolItem[]>(() => [...this.assignedRoles()]);
  readonly roleColumns: UiTableColumn<MenuRolItem>[] = [
    {
      key: 'descripcionRol',
      label: 'Rol',
      sortable: true,
      fontWeight: 'semibold',
    },
    {
      key: 'idRol',
      label: 'ID',
      align: 'center',
      width: '72px',
    },
  ];
  readonly roleActions: UiTableAction<MenuRolItem>[] = [
    {
      id: 'remove',
      label: 'Retirar rol',
      icon: 'fa-solid fa-user-minus',
      description: 'Retirar el permiso de este menú',
      variant: 'danger',
      disabled: (role) => this.removingRoleId() === role.idRol,
    },
  ];

  constructor() {
    let previousMenuId: number | null = null;

    effect(() => {
      const menuId = this.menu().idMenu;
      const assignedIds = new Set(this.assignedRoles().map((role) => role.idRol));
      const selectedRoleId = this.roleControl.getRawValue();

      if (
        previousMenuId !== menuId ||
        (selectedRoleId !== null && assignedIds.has(selectedRoleId))
      ) {
        this.roleControl.reset(null);
      }

      previousMenuId = menuId;
    });
  }

  assign(): void {
    if (this.roleControl.invalid || this.saving()) {
      this.roleControl.markAsTouched();
      return;
    }

    const roleId = this.roleControl.getRawValue();
    if (roleId !== null) {
      this.assignRequested.emit(roleId);
    }
  }

  roleError(): string {
    return getFormErrorMessage(this.roleControl);
  }

  handleRoleAction(event: UiTableActionEvent<MenuRolItem>): void {
    if (event.actionId === 'remove') {
      this.removeRequested.emit(event.row);
    }
  }
}
