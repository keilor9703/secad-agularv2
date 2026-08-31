import { Routes } from '@angular/router';

/**
 * Rutas del módulo de Operación (el CAD propiamente dicho).
 *
 * OJO: la página del ciudadano NO va aquí. Es pública —su única credencial es
 * el token del enlace— y por eso se registra suelta en app.routes.ts, fuera del
 * layout y del authGuard. Ver videoCiudadanoRoute más abajo.
 */
export const operacionRoutes: Routes = [
  {
    path: 'anotaciones-turno',
    loadComponent: () =>
      import('./pages/anotaciones-turno-page/anotaciones-turno-page.component').then(
        (m) => m.AnotacionesTurnoPageComponent,
      ),
    data: { breadcrumb: 'Bitácora de Turno' },
  },
  {
    path: 'mapa-incidentes',
    loadComponent: () =>
      import('./pages/mapa-incidentes-page/mapa-incidentes-page.component').then(
        (m) => m.MapaIncidentesPageComponent,
      ),
    data: { breadcrumb: 'Mapa de Incidentes' },
  },
  {
    path: 'mapa-estadistico',
    loadComponent: () =>
      import('./pages/mapa-estadistico-page/mapa-estadistico-page.component').then(
        (m) => m.MapaEstadisticoPageComponent,
      ),
    data: { breadcrumb: 'GIS Estadístico' },
  },
  {
    path: 'reportes',
    loadComponent: () =>
      import('./pages/reportes-page/reportes-page.component').then(
        (m) => m.ReportesPageComponent,
      ),
    data: { breadcrumb: 'Reportes y Estadísticas' },
  },
  {
    path: 'turnos',
    loadComponent: () =>
      import('./pages/turnos-page/turnos-page.component').then((m) => m.TurnosPageComponent),
    data: { breadcrumb: 'Turnos de Vigilancia' },
  },
  // Pendientes de portar: recepción, eventos y pedido.
];
