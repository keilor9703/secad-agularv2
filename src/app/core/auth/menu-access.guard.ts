import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { AuthService } from './auth.service';
import { NavigationMenuService } from '../services/navigation-menu.service';

/**
 * Evita que ocultar una opción sea la única barrera del frontend.
 * La autorización definitiva continúa perteneciendo a cada endpoint del API.
 */
export const menuAccessGuard: CanActivateChildFn = (_route, state) => {
  const auth = inject(AuthService);
  const navigation = inject(NavigationMenuService);
  const router = inject(Router);

  if (auth.isCurrentUserSuperAdmin() || state.url.startsWith('/home')) {
    return true;
  }

  return navigation.canAccessRoute(state.url).pipe(
    map((allowed) =>
      allowed
        ? true
        : router.createUrlTree(['/home'], { queryParams: { acceso: 'denegado' } }),
    ),
    catchError(() =>
      of(router.createUrlTree(['/home'], { queryParams: { acceso: 'no-verificado' } })),
    ),
  );
};
