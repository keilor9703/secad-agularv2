import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostBinding,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { AuthService } from '../../auth/auth.service';
import { MenuItem } from '../../interfaces/menu-item.interface';
import { BrandIdentityService } from '../../services/brand-identity.service';
import { NavigationMenuService } from '../../services/navigation-menu.service';
import { SidebarService } from '../../services/sidebar.service';
import { SidebarMenuNodeComponent } from './sidebar-menu-node.component';

type MenuBrandTextKind = 'institution' | 'system' | 'acronym';

interface MenuBrandTextItem {
  readonly kind: MenuBrandTextKind;
  readonly text: string;
  readonly sizePx: number;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, SidebarMenuNodeComponent],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent {
  private readonly router = inject(Router);
  private readonly navigationMenu = inject(NavigationMenuService);
  private readonly brandIdentity = inject(BrandIdentityService);
  private readonly authService = inject(AuthService);

  readonly sidebarService = inject(SidebarService);
  readonly isOpen = this.sidebarService.isOpen;
  readonly identity = this.brandIdentity.identity;
  readonly brandTextItems = computed<MenuBrandTextItem[]>(() => {
    const identity = this.identity();
    const items: Record<MenuBrandTextKind, MenuBrandTextItem | null> = {
      institution: identity.menuShowInstitutionName
        ? {
            kind: 'institution',
            text: identity.institutionName,
            sizePx: identity.menuInstitutionTextSizePx,
          }
        : null,
      system: identity.menuShowSystemName
        ? {
            kind: 'system',
            text: identity.systemName,
            sizePx: identity.menuSystemTextSizePx,
          }
        : null,
      acronym: identity.menuShowAcronym
        ? {
            kind: 'acronym',
            text: identity.shortName,
            sizePx: identity.menuAcronymTextSizePx,
          }
        : null,
    };

    return identity.menuBrandTextOrder
      .split('-')
      .map((key) => items[key as MenuBrandTextKind])
      .filter((item): item is MenuBrandTextItem => item !== null && Boolean(item.text));
  });
  readonly menuItems = signal<readonly MenuItem[]>([]);
  readonly expandedItemIds = signal<ReadonlySet<number>>(new Set<number>());

  readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  constructor() {
    this.brandIdentity.load();

    /**
     * Mantiene abierto el grupo que contiene la ruta activa.
     * No depende del estado abierto/cerrado del drawer, por eso la selección
     * permanece visible en el rail compacto.
     */
    effect(() => {
      const sidebarOpen = this.isOpen();
      const activeAncestors = this.collectActiveAncestorIds(this.menuItems());

      if (!sidebarOpen || !activeAncestors.size) {
        return;
      }

      /*
       * Al abrir el drawer se recupera la rama de la ruta actual. Se hace una
       * unión para conservar también los grupos que el usuario abrió a mano.
       */
      this.expandedItemIds.update((current) => {
        const next = new Set(current);
        let changed = false;

        activeAncestors.forEach((id) => {
          if (!next.has(id)) {
            next.add(id);
            changed = true;
          }
        });

        return changed ? next : current;
      });
    });

    this.navigationMenu
      .loadMenu()
      .pipe(takeUntilDestroyed())
      .subscribe((items) => this.menuItems.set(items));
  }

  @HostBinding('class.expanded')
  get expanded(): boolean {
    return this.isOpen();
  }

  toggleSidebar(): void {
    this.sidebarService.toggleSidebar();
  }

  closeSidebar(): void {
    this.sidebarService.closeSidebar();
  }

  toggleGroup(itemId: number): void {
    if (!this.isOpen()) {
      this.sidebarService.openSidebar();
    }

    this.expandedItemIds.update((current) => {
      const next = new Set(current);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      return next;
    });
  }

  onNavigate(): void {
    this.sidebarService.closeSidebar();
  }

  logout(): void {
    this.sidebarService.closeSidebar();
    this.authService.logout();
    void this.router.navigate(['/login']);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeSidebar();
  }

  private routeMatches(route: string): boolean {
    if (!route || /^(https?:\/\/|www\.)/i.test(route)) {
      return false;
    }

    const currentPath = this.currentUrl().split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';
    const candidatePath = route.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';

    return (
      currentPath === candidatePath ||
      (candidatePath !== '/' && currentPath.startsWith(`${candidatePath}/`))
    );
  }

  private collectActiveAncestorIds(items: readonly MenuItem[]): ReadonlySet<number> {
    const expanded = new Set<number>();

    const visit = (item: MenuItem): boolean => {
      const childActive = item.children?.some((child) => visit(child)) ?? false;
      const selfActive = Boolean(item.route && this.routeMatches(item.route));

      if (childActive && item.children?.length) {
        expanded.add(item.id);
      }

      return selfActive || childActive;
    };

    items.forEach(visit);
    return expanded;
  }
}
