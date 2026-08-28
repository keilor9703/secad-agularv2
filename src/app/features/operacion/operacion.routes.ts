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
  // Pendientes de portar: recepción, eventos, pedido, turnos, reportes y mapas.
];
