import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { startWith } from 'rxjs';

import {
  DbMenuItem,
  MenuRolCatalogItem,
  MenuRolItem,
  MenuSaveRequest,
} from '../../../../../core/services/menu.service';
import { UiButtonComponent } from '../../../../../shared/components/ui-button/ui-button.component';
import { UiChipComponent } from '../../../../../shared/components/ui-chip/ui-chip.component';
import { UiPanelHeaderComponent } from '../../../../../shared/components/ui-panel-header/ui-panel-header.component';
import { UiSearchInputComponent } from '../../../../../shared/components/ui-search-input/ui-search-input.component';
import { UiSpinnerComponent } from '../../../../../shared/components/ui-spinner/ui-spinner.component';
import { MenuAdminSubmenuFormComponent } from '../menu-admin-submenu-form/menu-admin-submenu-form.component';
import { MenuRoleAccessComponent } from '../menu-role-access/menu-role-access.component';

interface MenuTreeRow {
  readonly item: DbMenuItem;
  readonly depth: number;
  readonly indent: number;
  readonly hasChildren: boolean;
  readonly isLastSibling: boolean;
}

@Component({
  selector: 'app-menu-admin-tree',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    UiButtonComponent,
    UiChipComponent,
    UiPanelHeaderComponent,
    UiSearchInputComponent,
    UiSpinnerComponent,
    MenuAdminSubmenuFormComponent,
    MenuRoleAccessComponent,
  ],
  templateUrl: './menu-admin-tree.component.html',
  styleUrl: './menu-admin-tree.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MenuAdminTreeComponent {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly items = input<readonly DbMenuItem[]>([]);
  readonly loading = input(false);
  readonly processingMenuId = input<number | null>(null);
  readonly editingMenuId = input<number | null>(null);
  readonly selectedMenu = input<DbMenuItem | null>(null);
  readonly selectedSubmenuParent = input<DbMenuItem | null>(null);
  readonly submenuSuggestedPosition = input(0);
  readonly savingSubmenu = input(false);
  readonly focusedMenuId = input<number | null>(null);
  readonly rolesCatalog = input<readonly MenuRolCatalogItem[]>([]);
  readonly assignedRoles = input<readonly MenuRolItem[]>([]);
  readonly loadingRoles = input(false);
  readonly savingRole = input(false);
  readonly removingRoleId = input<number | null>(null);

  readonly editRequested = output<DbMenuItem>();
  readonly rolesRequested = output<DbMenuItem>();
  readonly submenuRequested = output<DbMenuItem>();
  readonly stateRequested = output<DbMenuItem>();
  readonly saveSubmenuRequested = output<MenuSaveRequest>();
  readonly closeSubmenuRequested = output<void>();
  readonly assignRoleRequested = output<number>();
  readonly removeRoleRequested = output<MenuRolItem>();
  readonly closeRolesRequested = output<void>();

  readonly searchControl = new FormControl('', { nonNullable: true });
  private readonly searchTerm = toSignal(
    this.searchControl.valueChanges.pipe(startWith(this.searchControl.getRawValue())),
    { initialValue: '' },
  );
  private readonly expandedIds = signal<ReadonlySet<number>>(new Set<number>());
  private expansionInitialized = false;

  readonly totalItems = computed(() => this.items().filter((item) => !this.isSentinelRoot(item)).length);
  readonly visibleRows = computed<MenuTreeRow[]>(() => this.buildVisibleRows());

  constructor() {
    effect(() => {
      const items = this.items().filter((item) => !this.isSentinelRoot(item));
      const validIds = new Set(items.map((item) => item.idMenu));
      const current = this.expandedIds();
      const normalized = new Set([...current].filter((id) => validIds.has(id)));

      if (!this.expansionInitialized && items.length > 0) {
        // Al cargar los datos, expandir automáticamente todos los contenedores con hijos
        const parentIdsWithChildren = new Set(
          items
            .filter((item) => item.idPadre !== 0 && item.idPadre !== item.idMenu)
            .map((item) => item.idPadre),
        );
        for (const id of parentIdsWithChildren) {
          if (validIds.has(id)) {
            normalized.add(id);
          }
        }
        this.expansionInitialized = true;
      }

      if (normalized.size !== current.size || !this.expansionInitialized) {
        this.expandedIds.set(normalized);
      }
    });

    /*
     * Después de crear un submenú se abren sus antecesores y el scroll
     * interno se desplaza hasta la fila nueva.
     */
    effect(() => {
      const menuId = this.focusedMenuId();
      const items = this.items();

      if (menuId === null || !items.some((item) => item.idMenu === menuId)) {
        return;
      }

      this.expandAncestors(menuId, items);
      this.scheduleMenuReveal(menuId);
    });

    // Mantiene visible el cajón de roles dentro del scroll propio del árbol.
    effect(() => {
      const selectedMenuId = this.selectedMenu()?.idMenu;

      if (selectedMenuId === undefined) {
        return;
      }

      queueMicrotask(() => this.revealRolePanel(selectedMenuId));
    });

    effect(() => {
      const parentId = this.selectedSubmenuParent()?.idMenu;

      if (parentId === undefined) {
        return;
      }

      queueMicrotask(() => this.revealSubmenuPanel(parentId));
    });
  }

  toggle(itemId: number): void {
    this.expandedIds.update((current) => {
      const next = new Set(current);

      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }

      return next;
    });
  }

  expandAll(): void {
    const items = this.items().filter((item) => !this.isSentinelRoot(item));
    const parentIdsWithChildren = new Set(
      items
        .filter((item) => item.idPadre !== 0 && item.idPadre !== item.idMenu)
        .map((item) => item.idPadre),
    );
    this.expandedIds.set(parentIdsWithChildren);
  }

  collapseAll(): void {
    this.expandedIds.set(new Set<number>());
  }

  isExpanded(itemId: number): boolean {
    return this.expandedIds().has(itemId);
  }

  isPanelSelected(itemId: number): boolean {
    return (
      this.editingMenuId() === itemId ||
      this.selectedMenu()?.idMenu === itemId ||
      this.selectedSubmenuParent()?.idMenu === itemId
    );
  }

  isEditing(itemId: number): boolean {
    return this.editingMenuId() === itemId;
  }

  itemIcon(item: DbMenuItem): string {
    return (
      item.icono?.trim() ||
      (item.tipo === 'S' || item.tipo === 'GRUPO' ? 'fa-solid fa-folder-tree' : 'fa-regular fa-file-lines')
    );
  }

  typeLabel(type: string): string {
    const labels: Record<string, string> = {
      S: 'Submenú',
      GRUPO: 'Grupo',
      ENLACE: 'Enlace',
      frm: 'Formulario',
      url: 'Enlace',
      pdf: 'PDF',
    };

    return labels[type] || type || 'Sin tipo';
  }

  private buildVisibleRows(): MenuTreeRow[] {
    const source = this.items().filter((item) => !this.isSentinelRoot(item));
    const itemIds = new Set(source.map((item) => item.idMenu));
    const childrenByParent = new Map<number, DbMenuItem[]>();

    for (const item of source) {
      // Las raíces o grupos autorreferenciados no son hijos de sí mismos
      if (item.idPadre === item.idMenu || item.idPadre === 0) {
        continue;
      }
      const siblings = childrenByParent.get(item.idPadre) ?? [];
      siblings.push(item);
      childrenByParent.set(item.idPadre, siblings);
    }

    for (const siblings of childrenByParent.values()) {
      siblings.sort((a, b) => a.posicion - b.posicion || a.idMenu - b.idMenu);
    }

    const roots = source
      .filter((item) => this.isTopLevel(item, itemIds))
      .sort((a, b) => a.posicion - b.posicion || a.idMenu - b.idMenu);
    const term = this.searchTerm().trim().toLocaleLowerCase('es');
    const branchMatchCache = new Map<number, boolean>();

    const branchMatches = (item: DbMenuItem, trail = new Set<number>()): boolean => {
      const cached = branchMatchCache.get(item.idMenu);
      if (cached !== undefined) {
        return cached;
      }

      if (trail.has(item.idMenu)) {
        return false;
      }

      const ownMatch = this.searchableText(item).includes(term);
      const nextTrail = new Set(trail).add(item.idMenu);
      const childMatch = (childrenByParent.get(item.idMenu) ?? []).some((child) =>
        branchMatches(child, nextTrail),
      );
      const matches = !term || ownMatch || childMatch;
      branchMatchCache.set(item.idMenu, matches);
      return matches;
    };

    const rows: MenuTreeRow[] = [];
    const visited = new Set<number>();

    const append = (item: DbMenuItem, depth: number, isLastSibling: boolean): void => {
      if (visited.has(item.idMenu) || !branchMatches(item)) {
        return;
      }

      visited.add(item.idMenu);
      const children = childrenByParent.get(item.idMenu) ?? [];
      const visibleChildren = children.filter((child) => branchMatches(child));
      rows.push({
        item,
        depth,
        indent: Math.min(depth, 6) * 28,
        hasChildren: children.length > 0,
        isLastSibling,
      });

      if (term || this.expandedIds().has(item.idMenu)) {
        for (const [index, child] of visibleChildren.entries()) {
          append(child, depth + 1, index === visibleChildren.length - 1);
        }
      }
    };

    const visibleRoots = roots.filter((root) => branchMatches(root));
    for (const [index, root] of visibleRoots.entries()) {
      append(root, 0, index === visibleRoots.length - 1);
    }

    // Salvaguarda: cualquier elemento no alcanzado desde las raíces se muestra en nivel 0
    for (const item of source) {
      if (!visited.has(item.idMenu) && branchMatches(item)) {
        append(item, 0, false);
      }
    }

    return rows;
  }

  private searchableText(item: DbMenuItem): string {
    return [item.idMenu, item.descripcion, item.tipo, item.detalle ?? '', item.icono ?? '']
      .join(' ')
      .toLocaleLowerCase('es');
  }

  private isSentinelRoot(item: DbMenuItem): boolean {
    const desc = (item.descripcion ?? '').trim().toLocaleUpperCase('es');
    const tipo = (item.tipo ?? '').trim().toLocaleUpperCase('es');
    return desc === 'RAIZ' || tipo === 'RAIZ';
  }

  private isTopLevel(item: DbMenuItem, itemIds: ReadonlySet<number>): boolean {
    return item.idPadre === 0 || item.idPadre === item.idMenu || !itemIds.has(item.idPadre);
  }

  private expandAncestors(menuId: number, items: readonly DbMenuItem[]): void {
    const byId = new Map(items.map((item) => [item.idMenu, item]));
    const itemIds = new Set(items.map((item) => item.idMenu));
    const next = new Set(this.expandedIds());
    const visited = new Set<number>();
    let current = byId.get(menuId);
    let changed = false;

    while (current && !visited.has(current.idMenu)) {
      visited.add(current.idMenu);
      if (this.isTopLevel(current, itemIds)) {
        break;
      }
      const parent = byId.get(current.idPadre);

      if (!parent || this.isSentinelRoot(parent) || this.isTopLevel(parent, itemIds)) {
        if (parent && !this.isSentinelRoot(parent)) {
          next.add(parent.idMenu);
          changed = true;
        }
        break;
      }

      if (!next.has(parent.idMenu)) {
        next.add(parent.idMenu);
        changed = true;
      }

      current = parent;
    }

    if (changed) {
      this.expandedIds.set(next);
    }
  }

  private revealMenuItem(menuId: number): void {
    const host = this.elementRef.nativeElement;
    const scrollContainer = host.querySelector<HTMLElement>('.menu-tree-card__body');
    const menuItem = host.querySelector<HTMLElement>(`[data-menu-id="${menuId}"]`);

    if (!scrollContainer || !menuItem) {
      return;
    }

    this.scrollElementIntoContainer(scrollContainer, menuItem, 16);
    menuItem.focus({ preventScroll: true });
  }

  private scheduleMenuReveal(menuId: number): void {
    if (typeof window === 'undefined') {
      queueMicrotask(() => this.revealMenuItem(menuId));
      return;
    }

    /*
     * Dos frames garantizan que @for ya materializó al hijo después de abrir
     * los ancestros. Esto evita saltos intermitentes en árboles profundos.
     */
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => this.revealMenuItem(menuId));
    });
  }

  private revealRolePanel(menuId: number): void {
    const host = this.elementRef.nativeElement;
    const scrollContainer = host.querySelector<HTMLElement>('.menu-tree-card__body');
    const rolePanel = host.querySelector<HTMLElement>(`[data-role-menu-id="${menuId}"]`);

    if (!scrollContainer || !rolePanel) {
      return;
    }

    this.scrollElementIntoContainer(scrollContainer, rolePanel, 12);
  }

  private revealSubmenuPanel(menuId: number): void {
    const host = this.elementRef.nativeElement;
    const scrollContainer = host.querySelector<HTMLElement>('.menu-tree-card__body');
    const submenuPanel = host.querySelector<HTMLElement>(`[data-submenu-parent-id="${menuId}"]`);

    if (!scrollContainer || !submenuPanel) {
      return;
    }

    this.scrollElementIntoContainer(scrollContainer, submenuPanel, 12);
  }

  private scrollElementIntoContainer(
    scrollContainer: HTMLElement,
    element: HTMLElement,
    spacing: number,
  ): void {
    const containerRect = scrollContainer.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const topOverflow = elementRect.top - containerRect.top;
    const bottomOverflow = elementRect.bottom - this.visibleContainerBottom(containerRect);
    let nextScrollTop = scrollContainer.scrollTop;

    if (bottomOverflow > 0) {
      nextScrollTop += bottomOverflow + spacing;
    } else if (topOverflow < 0) {
      nextScrollTop += topOverflow - spacing;
    } else {
      return;
    }

    scrollContainer.scrollTo({
      top: Math.max(0, nextScrollTop),
      behavior: this.prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }

  private prefersReducedMotion(): boolean {
    return (
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  private visibleContainerBottom(containerRect: DOMRect): number {
    if (typeof window === 'undefined' || window.innerWidth > 760) {
      return containerRect.bottom;
    }

    const configuredFooterHeight = Number.parseFloat(
      window.getComputedStyle(this.elementRef.nativeElement).getPropertyValue('--footer-height'),
    );
    const mobileFooterHeight = Number.isFinite(configuredFooterHeight)
      ? configuredFooterHeight
      : 78;

    return Math.min(containerRect.bottom, window.innerHeight - mobileFooterHeight);
  }
}
