import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { RoleMenuItem } from '../../../../../core/services/menu.service';
import { UiButtonComponent } from '../../../../../shared/components/ui-button/ui-button.component';
import { UiSectionHeaderComponent } from '../../../../../shared/components/ui-section-header/ui-section-header.component';
import { UiSelectComponent } from '../../../../../shared/components/ui-select/ui-select.component';
import { UiSelectOption } from '../../../../../shared/interfaces/ui-select-option.interface';
import { UiFormControlSize } from '../../../../../shared/models/ui-form-control-size.model';
import { RolAdminItem } from '../../../services/roles-admin.service';
import { RoleMenuTreeComponent } from '../role-menu-tree/role-menu-tree.component';

interface RoleMenuForm {
  selectedMenuId: FormControl<number | null>;
}

@Component({
  selector: 'app-role-menu-permissions',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    UiButtonComponent,
    UiSectionHeaderComponent,
    UiSelectComponent,
    RoleMenuTreeComponent,
  ],
  templateUrl: './role-menu-permissions.component.html',
  styleUrl: './role-menu-permissions.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoleMenuPermissionsComponent {
  readonly selectedRole = input<RolAdminItem | null>(null);
  readonly assignedMenus = input<readonly RoleMenuItem[]>([]);
  readonly availableMenuOptions = input<UiSelectOption<number>[]>([]);
  readonly loading = input(false);
  readonly loadingCatalog = input(false);
  readonly saving = input(false);
  readonly removingMenuId = input<number | null>(null);

  readonly assignRequested = output<number>();
  readonly removeRequested = output<RoleMenuItem>();

  readonly form = new FormGroup<RoleMenuForm>({
    selectedMenuId: new FormControl<number | null>(null, Validators.required),
  });

  readonly selectedRoleName = computed(
    () => this.selectedRole()?.nombre?.trim() || 'Sin rol seleccionado',
  );
  readonly canAssign = computed(
    () =>
      this.selectedRole() !== null &&
      this.availableMenuOptions().length > 0 &&
      !this.loadingCatalog() &&
      !this.saving(),
  );

  readonly compactControlSize: UiFormControlSize = {
    height: '38px',
    minHeight: '36px',
    maxHeight: '41px',
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

  constructor() {
    effect(() => {
      this.selectedRole()?.id;
      this.assignedMenus();
      this.form.reset({ selectedMenuId: null });
    });
  }

  /** Emite únicamente un identificador válido y deja la persistencia a la página. */
  submitAssignment(): void {
    if (this.form.invalid || !this.canAssign()) {
      this.form.markAllAsTouched();
      return;
    }

    const menuId = this.form.controls.selectedMenuId.value;
    if (menuId !== null && menuId > 0) {
      this.assignRequested.emit(menuId);
    }
  }
}
