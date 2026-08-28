import { Routes } from '@angular/router';

/**
 * Rutas del módulo de Operación (el CAD propiamente dicho).
 *
 * OJO: la página del ciudadano NO va aquí. Es pública —su única credencial es
 * el token del enlace— y por eso se registra suelta en app.routes.ts, fuera del
 * layout y del authGuard. Ver videoCiudadanoRoute más abajo.
 */
export const operacionRoutes: Routes = [
  // Las pantallas del despachador se irán agregando aquí conforme se porten:
  // recepción, eventos, pedido, turnos, reportes y mapas.
];
