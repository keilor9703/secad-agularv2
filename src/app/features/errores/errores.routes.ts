import { Routes } from '@angular/router';

export const erroresRoutes: Routes = [
  {
    path: '',
    redirectTo: '404',
    pathMatch: 'full'
  },
  {
    path: '404',
    loadComponent: () =>
      import('./pages/not-found-page/not-found-page.component').then((m) => m.NotFoundPageComponent),
    data: { breadcrumb: 'Página no encontrada' }
  }
];
