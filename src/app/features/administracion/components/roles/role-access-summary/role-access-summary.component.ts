import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { DbMenuItem } from '../../../../../core/services/menu.service';
import { UiSectionHeaderComponent } from '../../../../../shared/components/ui-section-header/ui-section-header.component';
import { RolAdminItem } from '../../../services/roles-admin.service';

interface MenuGroupSummary {
  id: number;
  name: string;
  icon: string;
  descendants: number;
}

@Component({
  selector: 'app-role-access-summary',
  standalone: true,
  imports: [UiSectionHeaderComponent],
  templateUrl: './role-access-summary.component.html',
  styleUrl: './role-access-summary.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoleAccessSummaryComponent {
  readonly roles = input<readonly RolAdminItem[]>([]);
  readonly menus = input<readonly DbMenuItem[]>([]);

  readonly activeRoles = computed(() => this.roles().filter((role) => role.vigente === 1).length);
  readonly rolePreview = computed(() => this.roles().slice(0, 8));
  readonly hiddenRoleCount = computed(() => Math.max(0, this.roles().length - this.rolePreview().length));
  readonly menuGroups = computed<MenuGroupSummary[]>(() => this.buildMenuGroups(this.menus()).slice(0, 8));

  /** Selecciona un icono seguro del catálogo o usa uno institucional de respaldo. */
  iconFor(menu: DbMenuItem): string {
    const icon = menu.icono?.trim();
    return icon && /^(fa[srlbd]?|fa-solid|fa-regular|fa-brands)\s+fa-[\w-]+$/i.test(icon)
      ? icon
      : 'fa-solid fa-folder-tree';
  }

  /** Resume cada raíz navegable y cuenta sus descendientes sin entrar en ciclos. */
  private buildMenuGroups(items: readonly DbMenuItem[]): MenuGroupSummary[] {
    const ids = new Set(items.map((item) => item.idMenu));
    const children = new Map<number, DbMenuItem[]>();

    for (const item of items) {
      const siblings = children.get(item.idPadre) ?? [];
      siblings.push(item);
      children.set(item.idPadre, siblings);
    }

    const roots = items
      .filter((item) => item.idPadre === 1 || !ids.has(item.idPadre))
      .sort((a, b) => a.posicion - b.posicion || a.descripcion.localeCompare(b.descripcion, 'es'));

    const countDescendants = (menuId: number, visited = new Set<number>()): number => {
      if (visited.has(menuId)) {
        return 0;
      }

      visited.add(menuId);
      return (children.get(menuId) ?? []).reduce(
        (total, child) => total + 1 + countDescendants(child.idMenu, visited),
        0,
      );
    };

    return roots.map((root) => ({
      id: root.idMenu,
      name: root.descripcion,
      icon: this.iconFor(root),
      descendants: countDescendants(root.idMenu),
    }));
  }
}
