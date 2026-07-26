import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, switchMap } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { MenuItem, SubMenuItem } from '../interfaces/menu-item.interface';
import { DbMenuItem, MenuService } from './menu.service';

interface DbMenuApiItem extends Partial<DbMenuItem> {
  IdMenu?: number;
  Descripcion?: string;
  IdPadre?: number;
  Posicion?: number;
  Icono?: string | null;
  Detalle?: string | null;
  Vigente?: number;
}

/**
 * Adapta el menú de la API al modelo que utiliza la navegación.
 *
 * La vista del sidebar no conoce reglas de rutas, agrupaciones administrativas
 * ni estrategias de respaldo: su única responsabilidad es presentar el resultado.
 */
@Injectable({ providedIn: 'root' })
export class NavigationMenuService {
  private readonly menuService = inject(MenuService);
  private readonly authService = inject(AuthService);

  loadMenu(): Observable<readonly MenuItem[]> {
    return this.menuService.getMyMenu().pipe(
      switchMap((items) => (items?.length ? of(items) : this.loadFallback())),
      catchError(() => this.loadFallback()),
      map((items) => this.buildMenu(items)),
      catchError(() => of(this.ensureHomeItem([]))),
    );
  }

  private loadFallback(): Observable<DbMenuItem[]> {
    const userId = this.authService.getUserId();

    if (!userId) {
      return of([]);
    }

    return this.menuService.getByUser(userId).pipe(catchError(() => of([])));
  }

  private buildMenu(items: DbMenuItem[]): readonly MenuItem[] {
    const mapped = this.mapDatabaseMenu(items);
    return this.ensureHomeItem(this.groupAdministrationItems(mapped));
  }

  private mapDatabaseMenu(items: DbMenuItem[]): MenuItem[] {
    const normalized = (items ?? []).map((item: DbMenuApiItem) => ({
      idMenu: Number(item.idMenu ?? item.IdMenu ?? 0),
      descripcion: String(item.descripcion ?? item.Descripcion ?? ''),
      idPadre: Number(item.idPadre ?? item.IdPadre ?? 0),
      posicion: Number(item.posicion ?? item.Posicion ?? 0),
      icono: item.icono ?? item.Icono,
      detalle: item.detalle ?? item.Detalle,
      vigente: Number(item.vigente ?? item.Vigente ?? 1),
    }));

    const activeItems = normalized.filter(
      (item) => Boolean(item.descripcion) && item.vigente === 1,
    );
    const itemsById = new Map(activeItems.map((item) => [item.idMenu, item]));

    const parentItems = activeItems
      .filter((item) => item.idPadre === 0 || item.idPadre === 1 || !itemsById.has(item.idPadre))
      .filter((item) => item.idMenu !== 1)
      .sort((left, right) => left.posicion - right.posicion);

    return parentItems
      .map((parent): MenuItem | null => {
        const submenu = activeItems
          .filter((child) => child.idPadre === parent.idMenu)
          .sort((left, right) => left.posicion - right.posicion)
          .map((child): SubMenuItem => {
            const route = this.normalizeRoute(child.detalle);

            return {
              id: child.idMenu,
              route,
              label: this.normalizeLabel(child.descripcion, route),
              isExternal: this.isExternalUrl(route),
            };
          })
          .filter((item) => Boolean(item.route));

        const route = this.normalizeRoute(parent.detalle);
        const baseItem = {
          id: parent.idMenu,
          icon: this.normalizeIcon(parent.icono),
          label: this.normalizeLabel(parent.descripcion, route),
        };

        if (submenu.length) {
          return { ...baseItem, submenu };
        }

        if (!route) {
          return null;
        }

        return {
          ...baseItem,
          route,
          isExternal: this.isExternalUrl(route),
        };
      })
      .filter((item): item is MenuItem => item !== null);
  }

  private normalizeRoute(rawRoute: unknown): string {
    const route = String(rawRoute ?? '').trim();

    if (!route) {
      return '';
    }

    if (this.isExternalUrl(route)) {
      return route.startsWith('www.') ? `https://${route}` : route;
    }

    if (route.startsWith('/administracion/')) {
      return route;
    }

    const configurationAliases = new Set([
      '/video-unidad',
      '/configuracion-imagen-sitio',
      '/admin-multimedia',
      '/configuracion-sistema',
    ]);

    if (configurationAliases.has(route)) {
      return '/administracion/configuracion-sistema';
    }

    const routeAliases: Readonly<Record<string, string>> = {
      '/formularios': '/administracion/formularios',
      '/usuarios': '/administracion/usuarios',
      '/roles': '/administracion/roles',
      '/linea-mando': '/administracion/linea-mando',
      '/menu': '/administracion/menu',
      '/auditoria': '/administracion/auditoria',
    };

    return routeAliases[route] ?? (route.startsWith('/') ? route : `/${route}`);
  }

  private normalizeLabel(label: string, route: string): string {
    return route === '/administracion/configuracion-sistema' ? 'Configuración del sistema' : label;
  }

  private normalizeIcon(rawIcon: unknown): string {
    const icon = String(rawIcon ?? '').trim();

    if (!icon) {
      return 'fa-solid fa-folder';
    }

    return icon.includes('fa-') ? icon : `fa-solid ${icon}`;
  }

  private groupAdministrationItems(items: MenuItem[]): MenuItem[] {
    const visibleItems: MenuItem[] = [];
    const administrationItems: SubMenuItem[] = [];

    for (const item of items) {
      if (item.route && this.isAdministrationRoute(item.route)) {
        administrationItems.push({
          id: item.id,
          label: item.label,
          route: item.route,
          isExternal: item.isExternal,
        });
        continue;
      }

      if (item.submenu?.length) {
        const adminChildren = item.submenu.filter((child) =>
          this.isAdministrationRoute(child.route),
        );
        const regularChildren = item.submenu.filter(
          (child) => !this.isAdministrationRoute(child.route),
        );

        administrationItems.push(...adminChildren);

        if (regularChildren.length) {
          visibleItems.push({ ...item, submenu: regularChildren });
        } else if (item.route && !this.isAdministrationRoute(item.route)) {
          visibleItems.push({ ...item, submenu: undefined });
        }
        continue;
      }

      visibleItems.push(item);
    }

    const uniqueAdministrationItems = administrationItems
      .filter(
        (item, index, source) =>
          source.findIndex((candidate) => candidate.route === item.route) === index,
      )
      .sort((left, right) => left.label.localeCompare(right.label, 'es'));

    if (uniqueAdministrationItems.length) {
      visibleItems.unshift({
        id: 999001,
        icon: 'fa-solid fa-user-shield',
        label: 'Administración',
        submenu: uniqueAdministrationItems,
      });
    }

    return visibleItems;
  }

  private isAdministrationRoute(route: string): boolean {
    return route.startsWith('/administracion/');
  }

  private isExternalUrl(route: string): boolean {
    return /^(https?:\/\/|www\.)/i.test(route);
  }

  private ensureHomeItem(items: MenuItem[]): MenuItem[] {
    if (!this.authService.isAuthenticated()) {
      return items;
    }

    const homeIndex = items.findIndex(
      (item) => item.route === '/home' || item.label.toLocaleLowerCase('es') === 'inicio',
    );

    if (homeIndex >= 0) {
      const homeItem = { ...items[homeIndex], route: '/home' };
      return [homeItem, ...items.filter((_, index) => index !== homeIndex)];
    }

    return [
      {
        id: 999000,
        icon: 'fa-solid fa-house',
        label: 'Inicio',
        route: '/home',
      },
      ...items,
    ];
  }
}
