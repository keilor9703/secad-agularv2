import { Routes } from '@angular/router';

export const gestionDocumentalRoutes: Routes = [
  {
    path: '',
    redirectTo: 'gestion-correos-electronicos',
    pathMatch: 'full'
  },
  {
    path: 'gestion-correos-electronicos',
    loadComponent: () =>
      import('./pages/gestion-correos-electronicos-page/gestion-correos-electronicos-page.component').then(
        (m) => m.GestionCorreosElectronicosPageComponent
      ),
    data: { breadcrumb: 'Correos Electrónicos' }
  }
];
