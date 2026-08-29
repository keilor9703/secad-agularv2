import { Routes } from '@angular/router';
import { superAdminGuard } from '../../core/auth/super-admin.guard';

/**
 * Zona del superadministrador: opera por encima de un CAD concreto (alta de
 * tenants, salud de la red nacional). El guard va en cada ruta y no sólo en el
 * padre para que ninguna hija nueva quede accesible por olvido.
 */
export const superRoutes: Routes = [
  { path: '', redirectTo: 'tenants', pathMatch: 'full' },
  {
    path: 'tenants',
    canActivate: [superAdminGuard],
    loadComponent: () =>
      import('./pages/tenants-page/tenants-page.component').then((m) => m.TenantsPageComponent),
    data: { breadcrumb: 'Gestión de Tenants' },
  },
  {
    path: 'salud-cads',
    canActivate: [superAdminGuard],
    loadComponent: () =>
      import('./pages/salud-cads-page/salud-cads-page.component').then(
        (m) => m.SaludCadsPageComponent,
      ),
    data: { breadcrumb: 'Salud de CADs' },
  },
];
