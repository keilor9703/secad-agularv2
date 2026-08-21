export interface AppRouteCatalogItem {
  readonly route: string;
  readonly label: string;
  readonly area: string;
}

/**
 * Catálogo único de destinos internos que ya existen en el Router de Angular.
 *
 * Administración de Menú consume esta lista para evitar guardar enlaces que
 * terminarían en el 404. Agregar una opción aquí no crea una pantalla: la ruta
 * debe estar declarada primero en el archivo *.routes.ts correspondiente.
 */
export const APP_ROUTE_CATALOG: readonly AppRouteCatalogItem[] = [
  { route: '/home', label: 'Inicio', area: 'General' },
  { route: '/noticias', label: 'Noticias y comunicados', area: 'General' },
  { route: '/administracion', label: 'Inicio de administración', area: 'Administración' },
  { route: '/administracion/formularios', label: 'Guía de formularios', area: 'Administración' },
  { route: '/administracion/usuarios', label: 'Usuarios', area: 'Administración' },
  { route: '/administracion/roles', label: 'Roles', area: 'Administración' },
  { route: '/administracion/menu', label: 'Administración de menú', area: 'Administración' },
  {
    route: '/administracion/configuracion-sistema',
    label: 'Configuración del sistema',
    area: 'Administración',
  },
  { route: '/administracion/linea-mando', label: 'Línea de mando', area: 'Administración' },
  { route: '/administracion/dominio', label: 'Dominios', area: 'Administración' },
  { route: '/administracion/cuentas-email', label: 'Cuentas de correo', area: 'Administración' },
  { route: '/gestion-documental', label: 'Gestión documental', area: 'Gestión documental' },
  {
    route: '/gestion-documental/gestion-correos-electronicos',
    label: 'Gestión de correos electrónicos',
    area: 'Gestión documental',
  },
] as const;

const ROUTE_ALIASES: Readonly<Record<string, string>> = {
  '/inicio': '/home',
  '/formularios': '/administracion/formularios',
  '/usuarios': '/administracion/usuarios',
  '/roles': '/administracion/roles',
  '/menu': '/administracion/menu',
  '/configuracion-sistema': '/administracion/configuracion-sistema',
  '/admin-multimedia': '/administracion/configuracion-sistema',
  '/video-unidad': '/administracion/configuracion-sistema',
  '/configuracion-imagen-sitio': '/administracion/configuracion-sistema',
  '/linea-mando': '/administracion/linea-mando',
  '/dominio': '/administracion/dominio',
  '/cuentas-email': '/administracion/cuentas-email',
  '/correos-electronicos': '/gestion-documental/gestion-correos-electronicos',
};

const KNOWN_INTERNAL_ROUTES = new Set(APP_ROUTE_CATALOG.map((item) => item.route));

export function normalizeAppRoute(rawRoute: unknown): string {
  const value = String(rawRoute ?? '').trim();
  if (!value) {
    return '';
  }

  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, '') || '/';
  return ROUTE_ALIASES[withoutTrailingSlash] ?? withoutTrailingSlash;
}

export function isKnownAppRoute(rawRoute: unknown): boolean {
  return KNOWN_INTERNAL_ROUTES.has(normalizeAppRoute(rawRoute));
}
