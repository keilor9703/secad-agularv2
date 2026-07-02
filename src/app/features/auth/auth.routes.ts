import { Routes } from '@angular/router';

export const authRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/login-page/login-page.component').then((m) => m.LoginPageComponent)
  }
];
