import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { MobileBottomNavItem } from './mobile-bottom-nav.types';

@Component({
  selector: 'app-mobile-bottom-nav',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './mobile-bottom-nav.component.html',
  styleUrl: './mobile-bottom-nav.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MobileBottomNavComponent {
  private readonly router = inject(Router);

  /**
   * Configuración central de la navegación.
   * El elemento central queda reservado y deshabilitado para una implementación futura.
   */
  readonly items: readonly MobileBottomNavItem[] = [
    {
      id: 'home',
      label: 'Inicio',
      icon: 'fa-solid fa-house',
      route: '/home',
      exact: true,
    },
    {
      id: 'future',
      label: 'Próximamente',
      icon: 'fa-solid fa-inbox',
      route: null,
      disabled: true,
    },
    {
      id: 'settings',
      label: 'Configuración',
      icon: 'fa-solid fa-gear',
      route: '/administracion/configuracion-sistema',
    },
  ];

  /**
   * Señal reactiva que mantiene sincronizado el indicador activo incluso después
   * de redirecciones del router.
   */
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  isActive(item: MobileBottomNavItem): boolean {
    if (!item.route || item.disabled) {
      return false;
    }

    const currentPath = this.currentUrl().split(/[?#]/, 1)[0];

    return item.exact
      ? currentPath === item.route
      : currentPath === item.route || currentPath.startsWith(`${item.route}/`);
  }
}
