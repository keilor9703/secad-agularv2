import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';

import { DbMenuItem, MenuService, RoleMenuItem } from '../../../../core/services/menu.service';
import { ToastService } from '../../../../core/services/toast.service';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiChipComponent } from '../../../../shared/components/ui-chip/ui-chip.component';
import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiPanelHeaderComponent } from '../../../../shared/components/ui-panel-header/ui-panel-header.component';
import { UiSectionHeaderComponent } from '../../../../shared/components/ui-section-header/ui-section-header.component';
import { AlertService } from '../../../../shared/services/alert.service';
import { getApiErrorMessage } from '../../../../shared/utils/api-error-message.util';
import { RoleAccessSummaryComponent } from '../../components/roles/role-access-summary/role-access-summary.component';
import { RoleAdminFormComponent } from '../../components/roles/role-admin-form/role-admin-form.component';
import { RoleAdminListComponent } from '../../components/roles/role-admin-list/role-admin-list.component';
import { RoleMenuPermissionsComponent } from '../../components/roles/role-menu-permissions/role-menu-permissions.component';
import { RoleMenuTreeComponent } from '../../components/roles/role-menu-tree/role-menu-tree.component';
import {
  RolAdminItem,
  RolesAdminService,
  SaveRolAdminRequest,
} from '../../services/roles-admin.service';

@Component({
  selector: 'app-roles-admin',
  standalone: true,
  imports: [
    UiButtonComponent,
    UiChipComponent,
    UiPageHeaderComponent,
    UiPanelHeaderComponent,
    UiSectionHeaderComponent,
    RoleAccessSummaryComponent,
    RoleAdminFormComponent,
    RoleAdminListComponent,
    RoleMenuPermissionsComponent,
    RoleMenuTreeComponent,
  ],
  templateUrl: './roles-admin-page.component.html',
  styleUrl: './roles-admin-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RolesAdminPageComponent implements OnInit {
  private readonly rolesService = inject(RolesAdminService);
  private readonly menuService = inject(MenuService);
  private readonly toast = inject(ToastService);
  private readonly alert = inject(AlertService);
  private readonly destroyRef = inject(DestroyRef);

  readonly minimized = signal(false);
  readonly loadingRoles = signal(false);
  readonly loadingMenus = signal(false);
  readonly loadingRoleMenus = signal(false);
  readonly savingRole = signal(false);
  readonly savingRoleMenu = signal(false);
  readonly processingRoleId = signal<number | null>(null);

  readonly roles = signal<readonly RolAdminItem[]>([]);
  readonly allMenus = signal<readonly DbMenuItem[]>([]);
  readonly roleMenus = signal<readonly RoleMenuItem[]>([]);

  readonly creatingRole = signal(false);
  readonly editingRole = signal<RolAdminItem | null>(null);
  readonly selectedRoleId = signal<number | null>(null);
  readonly formResetVersion = signal(0);

  readonly editorVisible = computed(() => this.creatingRole() || this.editingRole() !== null);
  readonly selectedRole = computed(
    () => this.roles().find((role) => role.id === this.selectedRoleId()) ?? null,
  );
  readonly roleCount = computed(() => this.roles().length);
  readonly activeRoleCount = computed(
    () => this.roles().filter((role) => role.vigente === 1).length,
  );
  ngOnInit(): void {
    this.loadMenus();
    this.loadRoles();
  }

  /** Abre un formulario limpio para registrar un rol. */
  startCreate(): void {
    this.creatingRole.set(true);
    this.editingRole.set(null);
    this.formResetVersion.update((version) => version + 1);
  }

  /** Abre el editor con una copia del rol para no mutar el listado original. */
  editRole(role: RolAdminItem): void {
    if (this.selectedRoleId() !== role.id) {
      this.selectRole(role);
    }

    this.creatingRole.set(false);
    this.editingRole.set({ ...role });
    this.formResetVersion.update((version) => version + 1);
  }

  /** Cierra el editor y descarta únicamente el estado visual del formulario. */
  closeEditor(): void {
    this.creatingRole.set(false);
    this.editingRole.set(null);
    this.formResetVersion.update((version) => version + 1);
  }

  /** Consulta y ordena el catálogo; conserva la selección cuando todavía existe. */
  loadRoles(preferredRoleId: number | null = this.selectedRoleId()): void {
    if (this.loadingRoles()) {
      return;
    }

    this.loadingRoles.set(true);
    this.rolesService
      .getAll()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loadingRoles.set(false)),
      )
      .subscribe({
        next: (data) => {
          const roles = [...(data ?? [])].sort((a, b) =>
            (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es', { sensitivity: 'base' }),
          );
          this.roles.set(roles);

          const nextSelection =
            roles.find((role) => role.id === preferredRoleId) ?? roles.at(0) ?? null;

          if (!nextSelection) {
            this.selectedRoleId.set(null);
            this.roleMenus.set([]);
            return;
          }

          if (this.selectedRoleId() !== nextSelection.id) {
            this.selectRole(nextSelection);
          }
        },
        error: (error: unknown) => {
          this.roles.set([]);
          this.selectedRoleId.set(null);
          this.roleMenus.set([]);
          this.toast.error(
            'Administración de roles',
            getApiErrorMessage(error, 'No fue posible consultar los roles.'),
          );
        },
      });
  }

  /** Carga una sola vez el catálogo de menús que puede asignarse a los roles. */
  loadMenus(): void {
    if (this.loadingMenus()) {
      return;
    }

    this.loadingMenus.set(true);
    this.menuService
      .getAdminMenu()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loadingMenus.set(false)),
      )
      .subscribe({
        next: (items) => {
          const menus = (items ?? [])
            .filter((item) => !this.isRootMenu(item))
            .slice()
            .sort(
              (a, b) =>
                a.idPadre - b.idPadre ||
                a.posicion - b.posicion ||
                a.descripcion.localeCompare(b.descripcion, 'es'),
            );
          this.allMenus.set(menus);
        },
        error: (error: unknown) => {
          this.allMenus.set([]);
          this.toast.error(
            'Permisos de menú',
            getApiErrorMessage(error, 'No fue posible consultar el catálogo de menús.'),
          );
        },
      });
  }

  /** Crea o actualiza un rol con el mismo contrato utilizado por la API actual. */
  saveRole(request: SaveRolAdminRequest): void {
    if (this.savingRole()) {
      return;
    }

    const editingId = this.editingRole()?.id ?? null;
    const payload: SaveRolAdminRequest = {
      ...request,
      id: editingId,
      nombre: request.nombre.trim(),
      vigente: request.vigente === 0 ? 0 : 1,
    };

    this.savingRole.set(true);
    this.rolesService
      .save(payload)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.savingRole.set(false)),
      )
      .subscribe({
        next: (response) => {
          if (!response?.success) {
            this.toast.warning(
              editingId ? 'Editar rol' : 'Crear rol',
              response?.message || 'No fue posible guardar el rol.',
            );
            return;
          }

          this.toast.success(
            editingId ? 'Editar rol' : 'Crear rol',
            response.message || 'Rol guardado correctamente.',
          );
          const preferredId = response.idRol ?? editingId ?? this.selectedRoleId();
          this.closeEditor();
          this.loadRoles(preferredId);
        },
        error: (error: unknown) => {
          this.toast.error(
            editingId ? 'Editar rol' : 'Crear rol',
            getApiErrorMessage(error, 'Se presentó un error guardando el rol.'),
          );
        },
      });
  }

  /** Confirma el cambio de disponibilidad antes de modificar un rol. */
  async changeRoleState(role: RolAdminItem): Promise<void> {
    if (this.processingRoleId() !== null) {
      return;
    }

    const activating = role.vigente !== 1;
    const confirmed = await this.alert.confirm({
      title: activating ? 'Activar rol' : 'Desactivar rol',
      message: `¿Desea ${activating ? 'activar' : 'desactivar'} “${this.roleName(role)}”?`,
      confirmText: activating ? 'Sí, activar' : 'Sí, desactivar',
      cancelText: 'No, cancelar',
      icon: 'question',
      intent: activating ? 'primary' : 'danger',
      focusCancel: true,
    });

    if (!confirmed) {
      return;
    }

    this.processingRoleId.set(role.id);
    this.rolesService
      .setEstado(role.id, { vigente: activating ? 1 : 0 })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.processingRoleId.set(null)),
      )
      .subscribe({
        next: (response) => {
          if (!response?.success) {
            this.toast.warning(
              'Estado del rol',
              response?.message || 'No fue posible actualizar el estado.',
            );
            return;
          }

          this.toast.success(
            'Estado del rol',
            response.message || 'Estado actualizado correctamente.',
          );
          this.loadRoles(role.id);
        },
        error: (error: unknown) => {
          this.toast.error(
            'Estado del rol',
            getApiErrorMessage(error, 'Se presentó un error actualizando el estado.'),
          );
        },
      });
  }

  /** Selecciona el rol que se administrará y consulta sus permisos vigentes. */
  selectRole(role: RolAdminItem): void {
    this.selectedRoleId.set(role.id);
    this.roleMenus.set([]);
    this.loadRoleMenus(role.id);
  }

  /** Obtiene los menús asignados al rol seleccionado. */
  loadRoleMenus(roleId: number): void {
    this.loadingRoleMenus.set(true);
    this.menuService
      .getMenusByRol(roleId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loadingRoleMenus.set(false)),
      )
      .subscribe({
        next: (data) => {
          const menus = [...(data ?? [])].sort(
            (a, b) =>
              a.idPadre - b.idPadre ||
              a.posicion - b.posicion ||
              a.descripcionMenu.localeCompare(b.descripcionMenu, 'es'),
          );
          this.roleMenus.set(menus);
        },
        error: (error: unknown) => {
          this.roleMenus.set([]);
          this.toast.error(
            'Permisos de menú',
            getApiErrorMessage(error, 'No fue posible consultar los menús del rol.'),
          );
        },
      });
  }

  /**
   * Guarda de una vez TODAS las pantallas del rol.
   *
   * Sustituye al par asignar/retirar de una en una. El administrador revisa la
   * lista entera, marca lo que corresponde y guarda: una llamada, una
   * transacción. Antes, conceder doce pantallas eran doce peticiones, y si una
   * fallaba a mitad el rol quedaba con permisos a medias sin avisar.
   */
  guardarPermisos(idMenus: number[]): void {
    const roleId = this.selectedRoleId();
    if (!roleId || this.savingRoleMenu()) {
      return;
    }

    this.savingRoleMenu.set(true);
    this.menuService
      .replaceMenusDeRol(roleId, { idMenus })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.savingRoleMenu.set(false)),
      )
      .subscribe({
        next: (response) => {
          if (!response?.success) {
            this.toast.warning(
              'Permisos del rol',
              response?.message || 'No fue posible guardar los permisos.',
            );
            return;
          }

          this.toast.success(
            'Permisos del rol',
            response.message || 'Permisos actualizados correctamente.',
          );
          this.loadRoleMenus(roleId);
        },
        error: (error: unknown) => {
          this.toast.error(
            'Permisos del rol',
            getApiErrorMessage(error, 'Se presentó un error guardando los permisos.'),
          );
        },
      });
  }


  /** Construye una etiqueta jerárquica legible para el selector de permisos. */

  /** Excluye la raíz técnica ficticia si existiese, pero no ítems reales. */
  private isRootMenu(item: DbMenuItem): boolean {
    const desc = (item.descripcion ?? '').trim().toUpperCase();
    const tipo = (item.tipo ?? '').trim().toUpperCase();
    return desc === 'RAIZ' || tipo === 'RAIZ';
  }

  /** Devuelve siempre un nombre seguro para confirmaciones y mensajes. */
  private roleName(role: RolAdminItem): string {
    return role.nombre?.trim() || `Rol ${role.id}`;
  }
}
