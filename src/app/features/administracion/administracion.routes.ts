import { Routes } from '@angular/router';

// Routes para la Administracion module
export const administracionRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/administracion-inicio-page/administracion-inicio-page.component').then(
        (m) => m.AdministracionInicioPageComponent,
      ),
    data: { breadcrumb: 'Inicio' },
  },
  {
    path: 'inicio',
    loadComponent: () =>
      import('./pages/administracion-inicio-page/administracion-inicio-page.component').then(
        (m) => m.AdministracionInicioPageComponent,
      ),
    data: { breadcrumb: 'Inicio' },
  },
  {
    path: 'entidades',
    loadComponent: () =>
      import('./pages/entidades-page/entidades-page.component').then(
        (m) => m.EntidadesPageComponent,
      ),
    data: { breadcrumb: 'Entidades / Fuerzas' },
  },
  {
    path: 'agencias-externas',
    loadComponent: () =>
      import('./pages/agencias-externas-page/agencias-externas-page.component').then(
        (m) => m.AgenciasExternasPageComponent,
      ),
    data: { breadcrumb: 'Agencias externas' },
  },
  {
    path: 'sms',
    loadComponent: () =>
      import('./pages/config-sms-page/config-sms-page.component').then(
        (m) => m.ConfigSmsPageComponent,
      ),
    data: { breadcrumb: 'Proveedor SMS' },
  },
  {
    path: 'asistente',
    loadComponent: () =>
      import('./pages/asistente-page/asistente-page.component').then(
        (m) => m.AsistentePageComponent,
      ),
    data: { breadcrumb: 'Asistente inteligente' },
  },
  {
    path: 'integraciones',
    loadComponent: () =>
      import('./pages/integraciones-page/integraciones-page.component').then(
        (m) => m.IntegracionesPageComponent,
      ),
    data: { breadcrumb: 'Hub de integraciones' },
  },
  {
    path: 'casos',
    loadComponent: () =>
      import('./pages/casos-page/casos-page.component').then((m) => m.CasosPageComponent),
    data: { breadcrumb: 'Códigos de caso' },
  },
  {
    path: 'formularios',
    loadComponent: () =>
      import('./pages/formularios-page/formularios-page.component').then(
        (m) => m.FormulariosPageComponent,
      ),
    data: { breadcrumb: 'Formularios' },
  },
  {
    path: 'usuarios',
    loadComponent: () =>
      import('./pages/usuarios-page/usuarios-page.component').then((m) => m.UsuariosPageComponent),
    data: { breadcrumb: 'Usuarios' },
  },
  {
    path: 'roles',
    loadComponent: () =>
      import('./pages/roles-admin-page/roles-admin-page.component').then(
        (m) => m.RolesAdminPageComponent,
      ),
    data: { breadcrumb: 'Roles' },
  },
  {
    path: 'menu',
    loadComponent: () =>
      import('./pages/menu-admin-page/menu-admin-page.component').then(
        (m) => m.MenuAdminPageComponent,
      ),
    data: { breadcrumb: 'Menú' },
  },
  {
    path: 'configuracion-sistema',
    loadComponent: () =>
      import('./pages/configuracion-sistema-page/configuracion-sistema-page.component').then(
        (m) => m.ConfiguracionSistemaPageComponent,
      ),
    data: { breadcrumb: 'Configuración Sistema' },
  },
  { path: 'admin-multimedia', redirectTo: 'configuracion-sistema', pathMatch: 'full' },
  { path: 'video-unidad', redirectTo: 'configuracion-sistema', pathMatch: 'full' },
  { path: 'configuracion-imagen-sitio', redirectTo: 'configuracion-sistema', pathMatch: 'full' },
  {
    path: 'linea-mando',
    loadComponent: () =>
      import('./pages/linea-mando-page/linea-mando-page.component').then(
        (m) => m.LineaMandoPageComponent,
      ),
    data: { breadcrumb: 'Línea de Mando' },
  },
  {
    path: 'dominio',
    loadComponent: () =>
      import('./pages/dominio-page/dominio-page.component').then((m) => m.DominioPageComponent),
    data: { breadcrumb: 'Dominios' },
  },
  {
    path: 'cuentas-email',
    loadComponent: () =>
      import('./pages/cuentas-email-page/cuentas-email-page.component').then(
        (m) => m.CuentasEmailPageComponent,
      ),
    data: { breadcrumb: 'Cuentas Email' },
  },
];
