import { Routes } from '@angular/router';

export const noticiasRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/noticias-page/noticias-page.component').then((m) => m.NoticiasPageComponent)
  }
];
