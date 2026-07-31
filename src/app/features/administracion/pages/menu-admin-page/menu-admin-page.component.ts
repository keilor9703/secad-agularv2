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

import {
  DbMenuItem,
  MenuRolCatalogItem,
  MenuRolItem,
  MenuSaveRequest,
  MenuService,
} from '../../../../core/services/menu.service';
import { ToastService } from '../../../../core/services/toast.service';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { AlertService } from '../../../../shared/services/alert.service';
import { getApiErrorMessage } from '../../../../shared/utils/api-error-message.util';
import { MenuAdminFormComponent } from '../../components/menu/menu-admin-form/menu-admin-form.component';
import { MenuAdminTreeComponent } from '../../components/menu/menu-admin-tree/menu-admin-tree.component';

@Component({
  selector: 'app-menu-admin',
  standalone: true,
  imports: [UiButtonComponent, MenuAdminFormComponent, MenuAdminTreeComponent],
  templateUrl: './menu-admin-page.component.html',
  styleUrl: './menu-admin-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MenuAdminPageComponent implements OnInit {
  private readonly menuService = inject(MenuService);
  private readonly toast = inject(ToastService);
  private readonly alert = inject(AlertService);
  private readonly destroyRef = inject(DestroyRef);
  private focusResetTimer: ReturnType<typeof setTimeout> | null = null;

  readonly minimized = signal(false);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly savingSubmenu = signal(false);
  readonly processingMenuId = signal<number | null>(null);

  readonly menuItems = signal<readonly DbMenuItem[]>([]);
  readonly editingItem = signal<DbMenuItem | null>(null);
  readonly creatingMenu = signal(false);
  readonly formResetVersion = signal(0);
  readonly selectedSubmenuParent = signal<DbMenuItem | null>(null);
  readonly focusedMenuId = signal<number | null>(null);

  readonly selectedMenuForRoles = signal<DbMenuItem | null>(null);
  readonly rolesCatalog = signal<readonly MenuRolCatalogItem[]>([]);
  readonly assignedRoles = signal<readonly MenuRolItem[]>([]);
  readonly loadingRoleCatalog = signal(false);
  readonly loadingRoles = signal(false);
  readonly savingRole = signal(false);
  readonly removingRoleId = signal<number | null>(null);

  readonly menuCount = computed(() => this.menuItems().filter((item) => !this.isRoot(item)).length);
  readonly activeMenuCount = computed(
    () => this.menuItems().filter((item) => !this.isRoot(item) && item.vigente === 1).length,
  );
  readonly rootMenu = computed(() => this.menuItems().find((item) => this.isRoot(item)) ?? null);
  readonly editorVisible = computed(() => this.creatingMenu() || this.editingItem() !== null);
  readonly rootMenuSuggestedPosition = computed(() => {
    const rootId = this.rootMenu()?.idMenu;

    if (rootId === undefined) {
      return 0;
    }

    const positions = this.menuItems()
      .filter((item) => item.idPadre === rootId)
      .map((item) => item.posicion);

    return positions.length > 0 ? Math.max(...positions) + 1 : 0;
  });
  readonly submenuSuggestedPosition = computed(() => {
    const parentId = this.selectedSubmenuParent()?.idMenu;

    if (parentId === undefined) {
      return 0;
    }

    const siblingPositions = this.menuItems()
      .filter((item) => item.idPadre === parentId)
      .map((item) => item.posicion);

    return siblingPositions.length > 0 ? Math.max(...siblingPositions) + 1 : 0;
  });
  readonly parentOptions = computed<readonly DbMenuItem[]>(() => {
    const editing = this.editingItem();
    const excludedIds = editing
      ? this.collectDescendantIds(editing.idMenu, this.menuItems())
      : new Set<number>();

    if (editing) {
      excludedIds.add(editing.idMenu);
    }

    return this.menuItems()
      .filter((item) => !excludedIds.has(item.idMenu))
      .filter((item) => item.idMenu === 1 || !this.isRoot(item))
      .slice()
      .sort((a, b) => a.descripcion.localeCompare(b.descripcion, 'es'));
  });

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => {
      if (this.focusResetTimer !== null) {
        clearTimeout(this.focusResetTimer);
      }
    });

    this.loadMenu();
  }

  toggleMinimize(): void {
    this.minimized.update((value) => !value);
  }

  loadMenu(focusMenuId: number | null = null, focusFallback: MenuSaveRequest | null = null): void {
    if (this.loading()) {
      return;
    }

    this.loading.set(true);
    this.menuService
      .getAdminMenu()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (items) => {
          const normalized = [...(items ?? [])].sort(
            (a, b) => a.idPadre - b.idPadre || a.posicion - b.posicion || a.idMenu - b.idMenu,
          );

          this.menuItems.set(normalized);
          this.reconcileSelectedMenu(normalized);

          if (focusMenuId !== null || focusFallback !== null) {
            const resolvedFocusId = this.resolveFocusMenuId(normalized, focusMenuId, focusFallback);

            /*
             * Se limpia primero para que Angular vuelva a ejecutar la
             * animación aun si alguna integración reutiliza el mismo ID.
             */
            this.scheduleMenuFocus(resolvedFocusId);
          }
        },
        error: (error: unknown) => {
          this.toast.error(
            'Administración de menú',
            getApiErrorMessage(error, 'No fue posible cargar la estructura del menú.'),
          );
        },
      });
  }

  closeEditor(): void {
    this.creatingMenu.set(false);
    this.editingItem.set(null);
    this.formResetVersion.update((version) => version + 1);
  }

  editItem(item: DbMenuItem): void {
    /*
     * Se crea una nueva referencia para que un segundo clic sobre el mismo
     * registro también restaure el formulario.
     */
    this.closeRoles();
    this.closeSubmenu();
    this.creatingMenu.set(false);
    this.editingItem.set({ ...item });
    this.formResetVersion.update((version) => version + 1);
  }

  startSubmenu(parent: DbMenuItem): void {
    this.closeRoles();
    this.creatingMenu.set(false);
    this.editingItem.set(null);
    this.selectedSubmenuParent.set({ ...parent });
  }

  startRootMenu(): void {
    const root = this.rootMenu();

    if (!root) {
      this.toast.warning(
        'Crear menú principal',
        'No se encontró el nodo RAIZ requerido para crear elementos de primer nivel.',
      );
      return;
    }

    this.closeRoles();
    this.closeSubmenu();
    this.editingItem.set(null);
    this.creatingMenu.set(true);
    this.formResetVersion.update((version) => version + 1);
  }

  closeSubmenu(): void {
    this.selectedSubmenuParent.set(null);
  }

  saveItem(payload: MenuSaveRequest): void {
    if (this.saving()) {
      return;
    }

    this.saving.set(true);
    this.menuService
      .saveAdminMenu(payload)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: (response) => {
          if (!response?.success) {
            this.toast.warning(
              'Administración de menú',
              response?.message || 'No fue posible guardar el ítem.',
            );
            return;
          }

          this.toast.success(
            'Administración de menú',
            response.message || 'Ítem guardado correctamente.',
          );
          const created = payload.idMenu === null;
          this.closeEditor();
          this.loadMenu(created && response.id > 0 ? response.id : null, created ? payload : null);
        },
        error: (error: unknown) => {
          this.toast.error(
            'Administración de menú',
            getApiErrorMessage(error, 'Se presentó un error guardando el ítem.'),
          );
        },
      });
  }

  saveSubmenu(payload: MenuSaveRequest): void {
    const parent = this.selectedSubmenuParent();

    if (!parent || this.savingSubmenu()) {
      return;
    }

    /*
     * El padre proviene del contexto de la fila, no de un valor editable del
     * formulario. Así se evita crear el submenú en una rama incorrecta.
     */
    const request: MenuSaveRequest = {
      ...payload,
      idMenu: null,
      idPadre: parent.idMenu,
    };

    this.savingSubmenu.set(true);
    this.menuService
      .saveAdminMenu(request)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.savingSubmenu.set(false)),
      )
      .subscribe({
        next: (response) => {
          if (!response?.success) {
            this.toast.warning(
              'Crear submenú',
              response?.message || 'No fue posible guardar el submenú.',
            );
            return;
          }

          this.toast.success(
            'Crear submenú',
            response.message || 'Submenú guardado correctamente.',
          );
          this.closeSubmenu();
          this.loadMenu(response.id > 0 ? response.id : null, request);
        },
        error: (error: unknown) => {
          this.toast.error(
            'Crear submenú',
            getApiErrorMessage(error, 'Se presentó un error guardando el submenú.'),
          );
        },
      });
  }

  async changeItemState(item: DbMenuItem): Promise<void> {
    if (this.processingMenuId() !== null) {
      return;
    }

    const activating = item.vigente !== 1;
    const confirmed = await this.alert.confirm({
      title: activating ? 'Activar ítem' : 'Desactivar ítem',
      message: `¿Desea ${activating ? 'activar' : 'desactivar'} “${item.descripcion}”?`,
      confirmText: activating ? 'Sí, activar' : 'Sí, desactivar',
      cancelText: 'No, cancelar',
      icon: 'question',
      intent: activating ? 'primary' : 'danger',
      focusCancel: true,
    });

    if (!confirmed) {
      return;
    }

    const nextState = activating ? 1 : 0;
    this.processingMenuId.set(item.idMenu);

    this.menuService
      .setEstadoAdminMenu(item.idMenu, { vigente: nextState })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.processingMenuId.set(null)),
      )
      .subscribe({
        next: (response) => {
          if (!response?.success) {
            this.toast.warning(
              'Administración de menú',
              response?.message || 'No fue posible actualizar el estado.',
            );
            return;
          }

          this.menuItems.update((items) =>
            items.map((current) =>
              current.idMenu === item.idMenu ? { ...current, vigente: nextState } : current,
            ),
          );
          this.toast.success(
            'Administración de menú',
            response.message || 'Estado actualizado correctamente.',
          );
        },
        error: (error: unknown) => {
          this.toast.error(
            'Administración de menú',
            getApiErrorMessage(error, 'Se presentó un error actualizando el estado.'),
          );
        },
      });
  }

  manageRoles(item: DbMenuItem): void {
    this.closeSubmenu();
    this.creatingMenu.set(false);
    this.editingItem.set(null);
    this.selectedMenuForRoles.set(item);
    this.ensureRoleCatalog();
    this.loadAssignedRoles(item.idMenu);
  }

  closeRoles(): void {
    this.selectedMenuForRoles.set(null);
    this.assignedRoles.set([]);
  }

  assignRole(roleId: number): void {
    const menu = this.selectedMenuForRoles();

    if (!menu || this.savingRole()) {
      return;
    }

    this.savingRole.set(true);
    this.menuService
      .assignRolToMenu(menu.idMenu, { idRol: roleId })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.savingRole.set(false)),
      )
      .subscribe({
        next: (response) => {
          if (!response?.success) {
            this.toast.warning(
              'Permisos del menú',
              response?.message || 'No fue posible asignar el rol.',
            );
            return;
          }

          this.toast.success(
            'Permisos del menú',
            response.message || 'Rol asignado correctamente.',
          );
          this.loadAssignedRoles(menu.idMenu);
        },
        error: (error: unknown) => {
          this.toast.error(
            'Permisos del menú',
            getApiErrorMessage(error, 'Se presentó un error asignando el rol.'),
          );
        },
      });
  }

  async removeRole(role: MenuRolItem): Promise<void> {
    const menu = this.selectedMenuForRoles();

    if (!menu || this.removingRoleId() !== null) {
      return;
    }

    const confirmed = await this.alert.confirmDelete(
      'Retirar permiso',
      `¿Desea retirar el rol “${role.descripcionRol}” de “${menu.descripcion}”?`,
      'Sí, retirar',
    );

    if (!confirmed) {
      return;
    }

    this.removingRoleId.set(role.idRol);
    this.menuService
      .removeRolFromMenu(menu.idMenu, role.idRol)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.removingRoleId.set(null)),
      )
      .subscribe({
        next: (response) => {
          if (!response?.success) {
            this.toast.warning(
              'Permisos del menú',
              response?.message || 'No fue posible retirar el rol.',
            );
            return;
          }

          this.toast.success(
            'Permisos del menú',
            response.message || 'Rol retirado correctamente.',
          );
          this.loadAssignedRoles(menu.idMenu);
        },
        error: (error: unknown) => {
          this.toast.error(
            'Permisos del menú',
            getApiErrorMessage(error, 'Se presentó un error retirando el rol.'),
          );
        },
      });
  }

  private ensureRoleCatalog(): void {
    if (this.rolesCatalog().length > 0 || this.loadingRoleCatalog()) {
      return;
    }

    this.loadingRoleCatalog.set(true);
    this.menuService
      .getRolesCatalog()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loadingRoleCatalog.set(false)),
      )
      .subscribe({
        next: (roles) => {
          this.rolesCatalog.set(
            [...(roles ?? [])].sort((a, b) => a.descripcion.localeCompare(b.descripcion, 'es')),
          );
        },
        error: (error: unknown) => {
          this.rolesCatalog.set([]);
          this.toast.error(
            'Permisos del menú',
            getApiErrorMessage(error, 'No fue posible cargar el catálogo de roles.'),
          );
        },
      });
  }

  private loadAssignedRoles(menuId: number): void {
    this.loadingRoles.set(true);
    this.menuService
      .getRolesByMenu(menuId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loadingRoles.set(false)),
      )
      .subscribe({
        next: (roles) => {
          /*
           * Una respuesta tardía de un menú anterior no debe contaminar el
           * panel actualmente seleccionado.
           */
          if (this.selectedMenuForRoles()?.idMenu !== menuId) {
            return;
          }

          this.assignedRoles.set(
            [...(roles ?? [])].sort((a, b) =>
              a.descripcionRol.localeCompare(b.descripcionRol, 'es'),
            ),
          );
        },
        error: (error: unknown) => {
          if (this.selectedMenuForRoles()?.idMenu === menuId) {
            this.assignedRoles.set([]);
            this.toast.error(
              'Permisos del menú',
              getApiErrorMessage(error, 'No fue posible consultar los roles asignados.'),
            );
          }
        },
      });
  }

  private reconcileSelectedMenu(items: readonly DbMenuItem[]): void {
    const selectedForRoles = this.selectedMenuForRoles();

    if (selectedForRoles) {
      const updatedRoleMenu = items.find((item) => item.idMenu === selectedForRoles.idMenu) ?? null;
      this.selectedMenuForRoles.set(updatedRoleMenu);

      if (!updatedRoleMenu) {
        this.assignedRoles.set([]);
      }
    }

    const selectedParent = this.selectedSubmenuParent();

    if (selectedParent) {
      this.selectedSubmenuParent.set(
        items.find((item) => item.idMenu === selectedParent.idMenu) ?? null,
      );
    }
  }

  private resolveFocusMenuId(
    items: readonly DbMenuItem[],
    requestedId: number | null,
    fallback: MenuSaveRequest | null,
  ): number | null {
    if (requestedId !== null && items.some((item) => item.idMenu === requestedId)) {
      return requestedId;
    }

    if (!fallback) {
      return null;
    }

    return (
      items
        .filter(
          (item) =>
            item.idPadre === fallback.idPadre &&
            item.posicion === fallback.posicion &&
            item.descripcion.trim() === fallback.descripcion.trim(),
        )
        .sort((a, b) => b.idMenu - a.idMenu)[0]?.idMenu ?? null
    );
  }

  private scheduleMenuFocus(menuId: number | null): void {
    if (this.focusResetTimer !== null) {
      clearTimeout(this.focusResetTimer);
      this.focusResetTimer = null;
    }

    this.focusedMenuId.set(null);

    if (menuId === null) {
      return;
    }

    queueMicrotask(() => {
      this.focusedMenuId.set(menuId);
      this.focusResetTimer = setTimeout(() => {
        if (this.focusedMenuId() === menuId) {
          this.focusedMenuId.set(null);
        }

        this.focusResetTimer = null;
      }, 1400);
    });
  }

  private collectDescendantIds(parentId: number, items: readonly DbMenuItem[]): Set<number> {
    const descendants = new Set<number>();
    const pending = [parentId];

    while (pending.length > 0) {
      const current = pending.pop();
      if (current === undefined) {
        continue;
      }

      for (const item of items) {
        if (item.idPadre === current && !descendants.has(item.idMenu)) {
          descendants.add(item.idMenu);
          pending.push(item.idMenu);
        }
      }
    }

    return descendants;
  }

  private isRoot(item: DbMenuItem): boolean {
    return item.idMenu === 1 || item.descripcion.trim().toLocaleUpperCase('es') === 'RAIZ';
  }
}
