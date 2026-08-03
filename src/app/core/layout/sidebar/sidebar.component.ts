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
import { MenuItem, SubMenuItem } from '../../interfaces/menu-item.interface';
import { BrandIdentityService } from '../../services/brand-identity.service';
import { NavigationMenuService } from '../../services/navigation-menu.service';
import { SidebarService } from '../../services/sidebar.service';

type MenuBrandTextKind = 'institution' | 'system' | 'acronym';

interface MenuBrandTextItem {
  readonly kind: MenuBrandTextKind;
  readonly text: string;
  readonly sizePx: number;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink],
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
  readonly expandedItemId = signal<number | null>(null);

  private readonly currentUrl = toSignal(
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
      this.expandedItemId.set(this.findActiveGroup()?.id ?? null);
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

  toggleGroup(item: MenuItem): void {
    if (!item.submenu?.length) {
      return;
    }

    if (!this.isOpen()) {
      this.sidebarService.openSidebar();
      this.expandedItemId.set(item.id);
      return;
    }

    this.expandedItemId.update((currentId) => (currentId === item.id ? null : item.id));
  }

  isExpandedItem(item: MenuItem): boolean {
    return this.expandedItemId() === item.id;
  }

  isMenuItemActive(item: MenuItem): boolean {
    if (item.route && this.routeMatches(item.route)) {
      return true;
    }

    return item.submenu?.some((child) => this.routeMatches(child.route)) ?? false;
  }

  isSubmenuItemActive(item: SubMenuItem): boolean {
    return this.routeMatches(item.route);
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

  private findActiveGroup(): MenuItem | undefined {
    return this.menuItems().find((item) =>
      item.submenu?.some((child) => this.routeMatches(child.route)),
    );
  }
}
