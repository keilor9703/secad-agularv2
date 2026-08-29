import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';

/**
 * Allows access only to SuperAdministrador users (es_super_admin = true).
 * Unauthenticated users are redirected to /login.
 * Authenticated non-superadmin users are redirected to /home.
 */
export const superAdminGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    router.navigate(['/login']);
    return false;
  }

  if (!auth.esSuperAdmin()) {
    router.navigate(['/home']);
    return false;
  }

  return true;
};
