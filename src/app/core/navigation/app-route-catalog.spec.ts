import { isKnownAppRoute, normalizeAppRoute } from './app-route-catalog';

/**
 * Atajos que el sistema anterior resolvía con un redirectTo en app.routes.ts.
 * ctr_menu lleva años en producción con filas que guardan la ruta corta, así
 * que el catálogo tiene que reconocerlas o esos módulos desaparecen del menú.
 */
const ATAJOS_DEL_ORIGEN: ReadonlyArray<[string, string]> = [
  ['/recepcion', '/operacion/recepcion'],
  ['/pedido', '/operacion/pedido'],
  ['/eventos', '/operacion/eventos'],
  ['/turnos', '/operacion/turnos'],
  ['/anotaciones', '/operacion/anotaciones-turno'],
  ['/reportes', '/operacion/reportes'],
  ['/mapa-incidentes', '/operacion/mapa-incidentes'],
  ['/mapa-estadistico', '/operacion/mapa-estadistico'],
  ['/usuarios', '/administracion/usuarios'],
  ['/roles', '/administracion/roles'],
  ['/menu', '/administracion/menu'],
  ['/formularios', '/administracion/formularios'],
  ['/configuracion-sistema', '/administracion/configuracion-sistema'],
  ['/admin-multimedia', '/administracion/configuracion-sistema'],
  ['/video-unidad', '/administracion/configuracion-sistema'],
  ['/configuracion-imagen-sitio', '/administracion/configuracion-sistema'],
  ['/linea-mando', '/administracion/linea-mando'],
  ['/dominio', '/administracion/dominio'],
  ['/entidades', '/administracion/entidades'],
  ['/asistente', '/administracion/asistente'],
  ['/agencias-externas', '/administracion/agencias-externas'],
  ['/cuentas-email', '/administracion/cuentas-email'],
  ['/gestion-correos-electronicos', '/gestion-documental/gestion-correos-electronicos'],
  ['/salud-cads', '/super/salud-cads'],
  ['/tenants', '/super/tenants'],
];

describe('app-route-catalog', () => {
  it('resuelve todos los atajos que traía el sistema anterior', () => {
    for (const [corta, destino] of ATAJOS_DEL_ORIGEN) {
      expect(normalizeAppRoute(corta)).toBe(destino);
      expect(isKnownAppRoute(corta)).toBe(true);
    }
  });

  it('normaliza barras finales y rutas sin barra inicial', () => {
    expect(normalizeAppRoute('/operacion/turnos/')).toBe('/operacion/turnos');
    expect(normalizeAppRoute('operacion/turnos')).toBe('/operacion/turnos');
    expect(normalizeAppRoute('  /operacion/turnos  ')).toBe('/operacion/turnos');
    expect(isKnownAppRoute('operacion/turnos/')).toBe(true);
  });

  it('no reconoce rutas que el Router no declara', () => {
    // '/radio' apuntaba a '/administracion/radio', que el propio origen nunca
    // declaró: allí también acababa en 404, así que no se replica el alias.
    expect(isKnownAppRoute('/radio')).toBe(false);
    expect(isKnownAppRoute('/administracion/radio')).toBe(false);
    expect(isKnownAppRoute('/inventado')).toBe(false);
    expect(isKnownAppRoute('')).toBe(false);
    expect(isKnownAppRoute(null)).toBe(false);
  });

  it('todo alias apunta a una ruta que existe en el catálogo', () => {
    for (const [, destino] of ATAJOS_DEL_ORIGEN) {
      expect(isKnownAppRoute(destino)).toBe(true);
    }
  });
});
