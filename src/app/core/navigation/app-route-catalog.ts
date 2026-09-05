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
 *
 * ⚠️ OJO AL PORTAR UNA PANTALLA: además del *.routes.ts hay que agregarla AQUÍ.
 * El menú lateral se arma desde la base (ctr_menu) pero pasa cada ítem por
 * isKnownAppRoute(): si la ruta no está en esta lista, el ítem se descarta en
 * silencio y el grupo aparece vacío aunque en la base esté sembrado, vigente y
 * otorgado al rol. Es a propósito —evita enlaces rotos— pero es fácil de pasar
 * por alto, porque el síntoma parece un problema de permisos o de datos.
 *
 * Las pantallas de operación que aún no se han portado NO deben estar aquí:
 * mientras no existan, el menú debe seguir ocultándolas.
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
  {
    route: '/administracion/entidades',
    label: 'Entidades / Fuerzas',
    area: 'Administración',
  },
  {
    route: '/administracion/agencias-externas',
    label: 'Agencias externas',
    area: 'Administración',
  },
  {
    route: '/administracion/asistente',
    label: 'Asistente inteligente',
    area: 'Administración',
  },
  { route: '/administracion/casos', label: 'Códigos de caso (consulta)', area: 'Administración' },
  {
    route: '/administracion/integraciones',
    label: 'Hub de integraciones',
    area: 'Administración',
  },
  { route: '/administracion/dominio', label: 'Dominios', area: 'Administración' },
  { route: '/administracion/cuentas-email', label: 'Cuentas de correo', area: 'Administración' },
  // ── Super Admin ──────────────────────────────────────────────────────────
  // El menú las descarta igual si el usuario no es superadministrador: quien
  // filtra por rol es la base (ctr_menu_roles) y, en la ruta, superAdminGuard.
  { route: '/super/tenants', label: 'Gestión de Tenants', area: 'Super Admin' },
  { route: '/super/salud-cads', label: 'Salud de CADs', area: 'Super Admin' },
  { route: '/super/unidades', label: 'Unidades y Municipios', area: 'Super Admin' },
  { route: '/super/casos', label: 'Códigos de caso institucionales', area: 'Super Admin' },

  // ── Operación ────────────────────────────────────────────────────────────
  // Solo lo ya portado. Al portar eventos o pedido, agregarlos aquí o no
  // aparecerán en el menú.
  { route: '/operacion', label: 'Operación', area: 'Operación' },
  {
    route: '/operacion/anotaciones-turno',
    label: 'Bitácora de turno',
    area: 'Operación',
  },
  { route: '/operacion/mapa-incidentes', label: 'Mapa de incidentes', area: 'Operación' },
  {
    route: '/operacion/mapa-estadistico',
    label: 'GIS estadístico',
    area: 'Operación',
  },
  { route: '/operacion/reportes', label: 'Reportes y estadísticas', area: 'Operación' },
  { route: '/operacion/turnos', label: 'Turnos de vigilancia', area: 'Operación' },
  { route: '/operacion/recepcion', label: 'Recepción de llamadas', area: 'Operación' },
  { route: '/operacion/pedido', label: 'Seguimiento de incidentes', area: 'Operación' },
  { route: '/operacion/eventos', label: 'Eventos', area: 'Operación' },

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
  // Atajos que el sistema anterior resolvía con un redirectTo en su tabla de
  // rutas. El menú se arma desde ctr_menu, y esa tabla lleva años en
  // producción con filas que guardan la ruta corta: allí funcionaban por el
  // redirect, y aquí desaparecían del lateral sin decir nada, porque
  // isKnownAppRoute() no las reconocía. Se replican como alias en lugar de
  // migrar el dato en cada instalación.
  //
  // Queda fuera a propósito '/radio': el origen lo redirige a
  // '/administracion/radio', una ruta que él mismo no declara, así que allí
  // también termina en 404. No se traslada un enlace roto.
  '/recepcion': '/operacion/recepcion',
  '/pedido': '/operacion/pedido',
  '/eventos': '/operacion/eventos',
  '/turnos': '/operacion/turnos',
  '/anotaciones': '/operacion/anotaciones-turno',
  '/reportes': '/operacion/reportes',
  '/mapa-incidentes': '/operacion/mapa-incidentes',
  '/mapa-estadistico': '/operacion/mapa-estadistico',
  '/entidades': '/administracion/entidades',
  '/asistente': '/administracion/asistente',
  '/agencias-externas': '/administracion/agencias-externas',
  '/gestion-correos-electronicos': '/gestion-documental/gestion-correos-electronicos',
  '/salud-cads': '/super/salud-cads',
  '/tenants': '/super/tenants',
  '/sms': '/administracion/integraciones',
  '/administracion/sms': '/administracion/integraciones',
  // La base trae '/operacion/anotaciones' (sembrado por V47), pero la pantalla
  // se llama anotaciones-turno como en secad_angular. Se resuelve con un alias
  // para no tener que migrar el dato en cada instalación.
  '/operacion/anotaciones': '/operacion/anotaciones-turno',
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
