import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { DbMenuItem, MenuService, RoleMenuItem } from '../../../../core/services/menu.service';
import { ToastService } from '../../../../core/services/toast.service';
import {
  UiButtonComponent,
  UiButtonVariant
} from '../../../../shared/components/ui-button/ui-button.component';
import { UiInputComponent } from '../../../../shared/components/ui-input/ui-input.component';
import { UiSelectComponent } from '../../../../shared/components/ui-select/ui-select.component';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';
import {
  RolAdminItem,
  RolesAdminService,
  SaveRolAdminRequest
} from '../../services/roles-admin.service';

interface RolAdminForm {
  id: FormControl<number | null>;
  nombre: FormControl<string>;
  vigente: FormControl<number>;
}

interface RolMenuForm {
  selectedMenuId: FormControl<number | null>;
}

@Component({
  selector: 'app-roles-admin',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, UiButtonComponent, UiInputComponent, UiSelectComponent],
  templateUrl: './roles-admin-page.component.html',
  styleUrls: ['./roles-admin-page.component.scss']
})
export class RolesAdminPageComponent implements OnInit {
  readonly vigenteOptions: UiSelectOption<number>[] = [
    { label: 'Si', value: 1 },
    { label: 'No', value: 0 }
  ];

  readonly roleForm = new FormGroup<RolAdminForm>({
    id: new FormControl<number | null>(null),
    nombre: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(255)]
    }),
    vigente: new FormControl(1, { nonNullable: true })
  });

  readonly permissionsForm = new FormGroup<RolMenuForm>({
    selectedMenuId: new FormControl<number | null>(null)
  });

  minimized = false;
  visible = true;
  loading = false;
  saving = false;
  loadingRoleMenus = false;
  savingRoleMenu = false;

  roles: RolAdminItem[] = [];
  allMenus: DbMenuItem[] = [];
  roleMenus: RoleMenuItem[] = [];

  editingId: number | null = null;
  selectedRoleId: number | null = null;

  constructor(
    private readonly rolesService: RolesAdminService,
    private readonly menuService: MenuService,
    private readonly toast: ToastService
  ) {}

  ngOnInit(): void {
    this.loadMenus();
    this.loadRoles();
  }

  toggleMinimize(): void {
    this.minimized = !this.minimized;
  }

  loadRoles(): void {
    this.loading = true;
    this.rolesService.getAll().subscribe({
      next: (data) => {
        this.roles = (data ?? []).slice().sort((a, b) => {
          const aa = (a.nombre ?? '').toString();
          const bb = (b.nombre ?? '').toString();
          return aa.localeCompare(bb);
        });

        if (this.selectedRoleId && !this.roles.some((role) => role.id === this.selectedRoleId)) {
          this.selectedRoleId = null;
          this.roleMenus = [];
        }

        if (!this.selectedRoleId && this.roles.length > 0) {
          this.seleccionarRolPermisos(this.roles[0]);
        }

        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.roles = [];
        this.toast.error('Roles', err?.error?.message ?? 'No fue posible consultar los roles.');
      }
    });
  }

  loadMenus(): void {
    this.menuService.getAdminMenu().subscribe({
      next: (items) => {
        this.allMenus = (items ?? [])
          .filter((item) => !this.isRaiz(item))
          .slice()
          .sort(
            (a, b) =>
              a.idPadre - b.idPadre ||
              a.posicion - b.posicion ||
              a.descripcion.localeCompare(b.descripcion)
          );
      },
      error: () => {
        this.allMenus = [];
      }
    });
  }

  nuevo(): void {
    this.editingId = null;
    this.roleForm.reset(this.getDefaultForm());
    this.roleForm.markAsPristine();
  }

  editar(item: RolAdminItem): void {
    this.editingId = item.id;
    this.roleForm.reset({
      id: item.id,
      nombre: (item.nombre ?? '').trim(),
      vigente: item.vigente === 0 ? 0 : 1
    });
  }

  guardar(): void {
    if (this.roleForm.invalid) {
      this.roleForm.markAllAsTouched();
      this.toast.warning('Roles', 'Revisa los campos obligatorios antes de guardar.');
      return;
    }

    const formValue = this.roleForm.getRawValue();
    const nombre = formValue.nombre.trim();
    if (!nombre) {
      this.toast.warning('Roles', 'La descripcion del rol es obligatoria.');
      return;
    }

    this.saving = true;
    this.rolesService
      .save({
        id: formValue.id ?? null,
        nombre,
        vigente: formValue.vigente === 0 ? 0 : 1
      })
      .subscribe({
        next: (resp) => {
          this.saving = false;
          if (!resp?.success) {
            this.toast.warning('Roles', resp?.message || 'No fue posible guardar el rol.');
            return;
          }

          this.toast.success('Roles', resp.message || 'Rol guardado correctamente.');
          this.nuevo();
          this.loadRoles();
        },
        error: (err) => {
          this.saving = false;
          this.toast.error('Roles', err?.error?.detail ?? err?.error?.message ?? 'Error guardando rol.');
        }
      });
  }

  cambiarEstado(item: RolAdminItem): void {
    const nuevoEstado = item.vigente === 1 ? 0 : 1;
    this.rolesService.setEstado(item.id, { vigente: nuevoEstado }).subscribe({
      next: (resp) => {
        if (!resp?.success) {
          this.toast.warning('Roles', resp?.message || 'No fue posible actualizar estado.');
          return;
        }

        this.toast.success('Roles', resp.message || 'Estado actualizado.');
        this.loadRoles();
      },
      error: (err) => {
        this.toast.error('Roles', err?.error?.detail ?? err?.error?.message ?? 'Error actualizando estado.');
      }
    });
  }

  seleccionarRolPermisos(item: RolAdminItem): void {
    this.selectedRoleId = item.id;
    this.permissionsForm.reset({ selectedMenuId: null });
    this.cargarMenusPorRol(item.id);
  }

  cargarMenusPorRol(idRol: number): void {
    this.loadingRoleMenus = true;
    this.menuService.getMenusByRol(idRol).subscribe({
      next: (data) => {
        this.roleMenus = (data ?? [])
          .slice()
          .sort(
            (a, b) =>
              a.idPadre - b.idPadre ||
              a.posicion - b.posicion ||
              a.descripcionMenu.localeCompare(b.descripcionMenu)
          );
        this.loadingRoleMenus = false;
      },
      error: (err) => {
        this.roleMenus = [];
        this.loadingRoleMenus = false;
        this.toast.error('Permisos de menu', err?.error?.message ?? 'No fue posible consultar menus del rol.');
      }
    });
  }

  get availableMenus(): DbMenuItem[] {
    const assigned = new Set(this.roleMenus.map((item) => item.idMenu));
    return this.allMenus.filter((menu) => !assigned.has(menu.idMenu));
  }

  get availableMenuOptions(): UiSelectOption<number>[] {
    return this.availableMenus.map((menu) => ({
      label: this.formatMenuLabel(menu),
      value: menu.idMenu
    }));
  }

  asignarMenu(): void {
    const selectedMenuId = this.permissionsForm.controls.selectedMenuId.value;

    if (!this.selectedRoleId || this.selectedRoleId <= 0) {
      this.toast.warning('Permisos de menu', 'Selecciona un rol.');
      return;
    }

    if (!selectedMenuId || selectedMenuId <= 0) {
      this.toast.warning('Permisos de menu', 'Selecciona un menu.');
      return;
    }

    this.savingRoleMenu = true;
    this.menuService.assignMenuToRol(this.selectedRoleId, { idMenu: selectedMenuId }).subscribe({
      next: (resp) => {
        this.savingRoleMenu = false;
        if (!resp?.success) {
          this.toast.warning('Permisos de menu', resp?.message || 'No fue posible asignar menu.');
          return;
        }
        this.toast.success('Permisos de menu', resp.message || 'Menu asignado.');
        this.permissionsForm.reset({ selectedMenuId: null });
        this.cargarMenusPorRol(this.selectedRoleId!);
      },
      error: (err) => {
        this.savingRoleMenu = false;
        this.toast.error('Permisos de menu', err?.error?.detail ?? err?.error?.message ?? 'Error asignando menu.');
      }
    });
  }

  quitarMenu(item: RoleMenuItem): void {
    if (!this.selectedRoleId || this.selectedRoleId <= 0) {
      return;
    }

    this.menuService.removeMenuFromRol(this.selectedRoleId, item.idMenu).subscribe({
      next: (resp) => {
        if (!resp?.success) {
          this.toast.warning('Permisos de menu', resp?.message || 'No fue posible quitar menu.');
          return;
        }
        this.toast.success('Permisos de menu', resp.message || 'Menu retirado del rol.');
        this.cargarMenusPorRol(this.selectedRoleId!);
      },
      error: (err) => {
        this.toast.error('Permisos de menu', err?.error?.detail ?? err?.error?.message ?? 'Error retirando menu.');
      }
    });
  }

  get selectedRoleName(): string {
    if (!this.selectedRoleId) {
      return 'Sin rol seleccionado';
    }
    const role = this.roles.find((item) => item.id === this.selectedRoleId);
    return role?.nombre?.trim() || `Rol ${this.selectedRoleId}`;
  }

  get roleNameError(): string {
    const control = this.roleForm.controls.nombre;
    if (!control.touched && !control.dirty) {
      return '';
    }

    if (control.hasError('required')) {
      return 'La descripcion del rol es obligatoria.';
    }

    if (control.hasError('maxlength')) {
      return 'La descripcion no puede superar 255 caracteres.';
    }

    return '';
  }

  formatMenuLabel(menu: DbMenuItem): string {
    const prefix = menu.idPadre === 1 ? '' : '\u21B3 ';
    return `${prefix}${menu.descripcion} (ID ${menu.idMenu})`;
  }

  getEstadoButtonVariant(item: RolAdminItem): UiButtonVariant {
    return item.vigente === 0 ? 'primary' : 'secondary';
  }

  private isRaiz(item: DbMenuItem): boolean {
    return item.idMenu === 1 || (item.descripcion ?? '').trim().toUpperCase() === 'RAIZ';
  }

  private getDefaultForm(): SaveRolAdminRequest {
    return {
      id: null,
      nombre: '',
      vigente: 1
    };
  }
}
