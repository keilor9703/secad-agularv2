import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { RoleMenuItem } from '../../../../../core/services/menu.service';
import { UiButtonComponent } from '../../../../../shared/components/ui-button/ui-button.component';
import { UiSpinnerComponent } from '../../../../../shared/components/ui-spinner/ui-spinner.component';

interface RoleMenuTreeNode {
  item: RoleMenuItem;
  depth: number;
  hasChildren: boolean;
}

@Component({
  selector: 'app-role-menu-tree',
  standalone: true,
  imports: [UiButtonComponent, UiSpinnerComponent],
  templateUrl: './role-menu-tree.component.html',
  styleUrl: './role-menu-tree.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoleMenuTreeComponent {
  readonly menus = input<readonly RoleMenuItem[]>([]);
  readonly loading = input(false);
  readonly removingMenuId = input<number | null>(null);

  readonly removeRequested = output<RoleMenuItem>();

  readonly nodes = computed<RoleMenuTreeNode[]>(() => this.flatten(this.menus()));

  /** Devuelve un icono semántico sin depender de clases almacenadas en la API. */
  iconFor(node: RoleMenuTreeNode): string {
    if (node.hasChildren) {
      return 'fa-solid fa-folder-tree';
    }

    const type = node.item.tipo?.trim().toLocaleLowerCase('es') ?? '';
    return type.includes('extern') || type.includes('link')
      ? 'fa-solid fa-arrow-up-right-from-square'
      : 'fa-solid fa-file-shield';
  }

  /** Mantiene estable el DOM aunque se refresque el catálogo desde la API. */
  trackNode(_: number, node: RoleMenuTreeNode): number {
    return node.item.idMenu;
  }

  /** Convierte relaciones padre-hijo en una lista visual con profundidad segura. */
  private flatten(items: readonly RoleMenuItem[]): RoleMenuTreeNode[] {
    const ordered = [...items].sort(
      (a, b) =>
        a.idPadre - b.idPadre ||
        a.posicion - b.posicion ||
        a.descripcionMenu.localeCompare(b.descripcionMenu, 'es'),
    );
    const itemIds = new Set(ordered.map((item) => item.idMenu));
    const childrenByParent = new Map<number, RoleMenuItem[]>();

    for (const item of ordered) {
      const siblings = childrenByParent.get(item.idPadre) ?? [];
      siblings.push(item);
      childrenByParent.set(item.idPadre, siblings);
    }

    const roots = ordered.filter((item) => !itemIds.has(item.idPadre));
    const visited = new Set<number>();
    const result: RoleMenuTreeNode[] = [];

    const visit = (item: RoleMenuItem, depth: number): void => {
      if (visited.has(item.idMenu)) {
        return;
      }

      visited.add(item.idMenu);
      const children = childrenByParent.get(item.idMenu) ?? [];
      result.push({ item, depth: Math.min(depth, 6), hasChildren: children.length > 0 });
      children.forEach((child) => visit(child, depth + 1));
    };

    roots.forEach((root) => visit(root, 0));
    ordered.filter((item) => !visited.has(item.idMenu)).forEach((item) => visit(item, 0));
    return result;
  }
}
