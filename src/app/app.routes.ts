import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';
import { menuAccessGuard } from './core/auth/menu-access.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.authRoutes),
  },
  {
    path: '',
    loadComponent: () =>
      import('./core/layout/main-layout/main-layout.component').then((m) => m.MainLayoutComponent),
    canActivate: [authGuard],
    canActivateChild: [menuAccessGuard],
    children: [
      {
        path: '',
        redirectTo: 'home',
        pathMatch: 'full',
      },
      {
        path: 'home',
        loadChildren: () => import('./features/home/home.routes').then((m) => m.homeRoutes),
        data: { breadcrumb: 'Inicio' },
      },
      {
        path: 'noticias',
        loadChildren: () =>
          import('./features/noticias/noticias.routes').then((m) => m.noticiasRoutes),
        data: { breadcrumb: 'Noticias' },
      },
      {
        path: 'administracion',
        canActivate: [authGuard],
        loadChildren: () =>
          import('./features/administracion/administracion.routes').then(
            (m) => m.administracionRoutes,
          ),
        data: { breadcrumb: 'Administración' },
      },
      {
        path: 'gestion-documental',
        loadChildren: () =>
          import('./features/gestion-documental/gestion-documental.routes').then(
            (m) => m.gestionDocumentalRoutes,
          ),
        data: { breadcrumb: 'Gestión Documental' },
      },
      { path: 'formularios', redirectTo: 'administracion/formularios', pathMatch: 'full' },
      { path: 'usuarios', redirectTo: 'administracion/usuarios', pathMatch: 'full' },
      { path: 'roles', redirectTo: 'administracion/roles', pathMatch: 'full' },
      { path: 'menu', redirectTo: 'administracion/menu', pathMatch: 'full' },
      {
        path: 'configuracion-sistema',
        redirectTo: 'administracion/configuracion-sistema',
        pathMatch: 'full',
      },
      {
        path: 'admin-multimedia',
        redirectTo: 'administracion/configuracion-sistema',
        pathMatch: 'full',
      },
      {
        path: 'video-unidad',
        redirectTo: 'administracion/configuracion-sistema',
        pathMatch: 'full',
      },
      {
        path: 'configuracion-imagen-sitio',
        redirectTo: 'administracion/configuracion-sistema',
        pathMatch: 'full',
      },
      { path: 'linea-mando', redirectTo: 'administracion/linea-mando', pathMatch: 'full' },
      { path: 'radio', redirectTo: 'administracion/radio', pathMatch: 'full' },
      { path: 'dominio', redirectTo: 'administracion/dominio', pathMatch: 'full' },
      { path: 'cuentas-email', redirectTo: 'administracion/cuentas-email', pathMatch: 'full' },
      {
        path: 'correos-electronicos',
        redirectTo: 'gestion-documental/gestion-correos-electronicos',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: 'errores',
    loadChildren: () => import('./features/errores/errores.routes').then((m) => m.erroresRoutes),
  },
  {
    path: '**',
    redirectTo: 'errores/404',
  },
];
