import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, switchMap } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { MenuItem } from '../interfaces/menu-item.interface';
import { isKnownAppRoute, normalizeAppRoute } from '../navigation/app-route-catalog';
import {
  isSafeExternalUrl,
  isSafePdfResource,
  MenuNavigationTarget,
  normalizeExternalResource,
  resolveMenuTarget,
} from '../navigation/menu-destination';
import { DbMenuItem, MenuService } from './menu.service';

interface DbMenuApiItem extends Partial<DbMenuItem> {
  IdMenu?: number;
  Descripcion?: string;
  IdPadre?: number;
  Posicion?: number;
  Tipo?: string;
  Icono?: string | null;
  Detalle?: string | null;
  Vigente?: number;
}

interface NormalizedDbMenuItem {
  readonly idMenu: number;
  readonly descripcion: string;
  readonly idPadre: number;
  readonly posicion: number;
  readonly tipo: string;
  readonly icono: string | null;
  readonly detalle: string | null;
  readonly vigente: number;
}

/** Ícono de reserva de los ítems que no traen uno en la base. */
const ICONO_POR_DEFECTO = 'fa-solid fa-folder';

interface MenuPartition {
  readonly regular: readonly MenuItem[];
  readonly administration: readonly MenuItem[];
}

/**
 * Convierte el catálogo autorizado por la API en un árbol de navegación.
 * El sidebar recibe un modelo listo para presentar y no conoce reglas del backend.
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

  canAccessRoute(rawUrl: string): Observable<boolean> {
    const requestedRoute = normalizeAppRoute(String(rawUrl ?? '').split(/[?#]/, 1)[0]);

    return this.loadMenu().pipe(map((items) => this.hasAccessibleRoute(items, requestedRoute)));
  }

  private loadFallback(): Observable<DbMenuItem[]> {
    const userId = this.authService.getUserId();
    return userId ? this.menuService.getByUser(userId).pipe(catchError(() => of([]))) : of([]);
  }

  private buildMenu(items: DbMenuItem[]): readonly MenuItem[] {
    return this.ensureHomeItem(this.groupAdministrationItems(this.mapDatabaseMenu(items)));
  }

  /** Construye todos los niveles y corta ciclos accidentales de datos. */
  private mapDatabaseMenu(items: DbMenuItem[]): MenuItem[] {
    const normalized = this.normalizeDatabaseItems(items).filter(
      (item) => item.idMenu > 0 && Boolean(item.descripcion) && item.vigente === 1,
    );
    const itemsById = new Map(normalized.map((item) => [item.idMenu, item]));
    const childrenByParent = new Map<number, NormalizedDbMenuItem[]>();

    for (const item of normalized) {
      const siblings = childrenByParent.get(item.idPadre) ?? [];
      siblings.push(item);
      childrenByParent.set(item.idPadre, siblings);
    }

    for (const siblings of childrenByParent.values()) {
      siblings.sort((left, right) => left.posicion - right.posicion || left.idMenu - right.idMenu);
    }

    const roots = normalized
      .filter((item) => item.idMenu !== 1)
      .filter((item) => item.idPadre === 0 || item.idPadre === 1 || !itemsById.has(item.idPadre))
      .sort((left, right) => left.posicion - right.posicion || left.idMenu - right.idMenu);

    const buildNode = (
      item: NormalizedDbMenuItem,
      ancestors: ReadonlySet<number>,
    ): MenuItem | null => {
      if (ancestors.has(item.idMenu)) {
        return null;
      }

      const nextAncestors = new Set(ancestors).add(item.idMenu);
      const children = this.dedupeByRoute(
        (childrenByParent.get(item.idMenu) ?? [])
          .map((child) => buildNode(child, nextAncestors))
          .filter((child): child is MenuItem => child !== null),
      );
      const target = resolveMenuTarget(item.tipo, item.detalle);
      const route = this.resolveDestination(target, item.detalle);

      // Los contenedores sin ruta son válidos; los destinos rotos no se publican.
      if (target !== 'group' && !route && children.length === 0) {
        return null;
      }

      return {
        id: item.idMenu,
        icon: this.normalizeIcon(item.icono),
        label: this.normalizeLabel(item.descripcion, route),
        target: children.length > 0 ? 'group' : target,
        ...(route ? { route } : {}),
        ...(children.length ? { children } : {}),
      };
    };

    return this.dedupeByRoute(
      roots
        .map((root) => buildNode(root, new Set<number>()))
        .filter((item): item is MenuItem => item !== null),
    );
  }

  /**
   * Une los hermanos que llevan al MISMO destino.
   *
   * ctr_menu es una tabla con años de uso: sobreviven filas del sistema
   * anterior junto a las que siembran las migraciones, y desde Administración
   * de Menú se pueden crear más a mano. Mientras una de esas filas apuntaba a
   * una pantalla que aún no existía, el filtro de rutas conocidas la
   * descartaba y nadie notaba el duplicado; al portar la pantalla, las dos
   * filas pasan a ser válidas y el módulo aparece dos veces en el lateral.
   *
   * La comparación es por ruta ya normalizada, no por `detalle` en crudo: dos
   * filas distintas ('/operacion/anotaciones' y '/operacion/anotaciones-turno')
   * pueden ser el mismo destino a través de un alias, y para quien mira el
   * menú eso es un duplicado igual.
   *
   * Se conserva la primera por posición —el orden que ya venía ordenado— y de
   * las demás se rescata lo que le falte: el ícono real si la superviviente se
   * quedó con el de carpeta por defecto, y los hijos si alguna copia los tenía.
   */
  private dedupeByRoute(items: readonly MenuItem[]): MenuItem[] {
    const resultado: MenuItem[] = [];
    const posicionPorRuta = new Map<string, number>();

    for (const item of items) {
      const ruta = item.route ? normalizeAppRoute(item.route) : '';
      const yaVisto = ruta ? posicionPorRuta.get(ruta) : undefined;

      if (yaVisto === undefined) {
        if (ruta) {
          posicionPorRuta.set(ruta, resultado.length);
        }
        resultado.push(item);
        continue;
      }

      const conservado = resultado[yaVisto];
      resultado[yaVisto] = {
        ...conservado,
        icon: conservado.icon === ICONO_POR_DEFECTO ? item.icon : conservado.icon,
        ...(conservado.children?.length
          ? {}
          : item.children?.length
            ? { children: item.children, target: 'group' as const }
            : {}),
      };
    }

    return resultado;
  }

  private normalizeDatabaseItems(items: DbMenuItem[]): NormalizedDbMenuItem[] {
    return (items ?? []).map((item: DbMenuApiItem) => ({
      idMenu: Number(item.idMenu ?? item.IdMenu ?? 0),
      descripcion: String(item.descripcion ?? item.Descripcion ?? '').trim(),
      idPadre: Number(item.idPadre ?? item.IdPadre ?? 0),
      posicion: Number(item.posicion ?? item.Posicion ?? 0),
      tipo: String(item.tipo ?? item.Tipo ?? ''),
      icono: item.icono ?? item.Icono ?? null,
      detalle: item.detalle ?? item.Detalle ?? null,
      vigente: Number(item.vigente ?? item.Vigente ?? 1),
    }));
  }

  private resolveDestination(target: MenuNavigationTarget, rawDetail: unknown): string {
    if (target === 'group') {
      return '';
    }

    if (target === 'external') {
      return isSafeExternalUrl(rawDetail) ? normalizeExternalResource(rawDetail) : '';
    }

    if (target === 'document') {
      return isSafePdfResource(rawDetail) ? normalizeExternalResource(rawDetail) : '';
    }

    const route = normalizeAppRoute(rawDetail);
    return isKnownAppRoute(route) ? route : '';
  }

  private normalizeLabel(label: string, route: string): string {
    return route === '/administracion/configuracion-sistema' ? 'Configuración del sistema' : label;
  }

  private normalizeIcon(rawIcon: unknown): string {
    const icon = String(rawIcon ?? '').trim();
    return !icon ? ICONO_POR_DEFECTO : icon.includes('fa-') ? icon : `fa-solid ${icon}`;
  }

  /** Conserva la jerarquía al reunir destinos administrativos. */
  private groupAdministrationItems(items: readonly MenuItem[]): MenuItem[] {
    const existingAdministration = items.find(
      (item) => item.label.trim().toLocaleLowerCase('es') === 'administración',
    );
    if (existingAdministration) {
      return [...items];
    }

    const partition = this.partitionAdministration(items);
    if (!partition.administration.length) {
      return [...partition.regular];
    }

    return [
      {
        id: 999001,
        icon: 'fa-solid fa-user-shield',
        label: 'Administración',
        target: 'group',
        children: partition.administration,
      },
      ...partition.regular,
    ];
  }

  private partitionAdministration(items: readonly MenuItem[]): MenuPartition {
    const regular: MenuItem[] = [];
    const administration: MenuItem[] = [];

    for (const item of items) {
      if (item.route?.startsWith('/administracion/')) {
        administration.push(item);
        continue;
      }

      const childPartition = this.partitionAdministration(item.children ?? []);
      if (childPartition.administration.length) {
        administration.push({
          ...item,
          target: 'group',
          route: undefined,
          children: childPartition.administration,
        });
      }

      if (item.route || childPartition.regular.length || !item.children?.length) {
        regular.push({
          ...item,
          children: childPartition.regular.length ? childPartition.regular : undefined,
        });
      }
    }

    return { regular, administration };
  }

  private ensureHomeItem(items: readonly MenuItem[]): MenuItem[] {
    if (!this.authService.isAuthenticated()) {
      return [...items];
    }

    const homeIndex = items.findIndex(
      (item) => item.route === '/home' || item.label.toLocaleLowerCase('es') === 'inicio',
    );
    if (homeIndex >= 0) {
      const homeItem: MenuItem = { ...items[homeIndex], target: 'internal', route: '/home' };
      return [homeItem, ...items.filter((_, index) => index !== homeIndex)];
    }

    return [
      {
        id: 999000,
        icon: 'fa-solid fa-house',
        label: 'Inicio',
        target: 'internal',
        route: '/home',
      },
      ...items,
    ];
  }

  private hasAccessibleRoute(items: readonly MenuItem[], requestedRoute: string): boolean {
    return items.some((item) => {
      const itemRoute = item.route ? normalizeAppRoute(item.route) : '';
      const routeMatches = Boolean(
        itemRoute &&
        (requestedRoute === itemRoute ||
          requestedRoute.startsWith(`${itemRoute}/`) ||
          itemRoute.startsWith(`${requestedRoute}/`)),
      );

      return routeMatches || this.hasAccessibleRoute(item.children ?? [], requestedRoute);
    });
  }
}
