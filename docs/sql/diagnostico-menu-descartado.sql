-- ═══════════════════════════════════════════════════════════════════════════
--  Diagnóstico: ¿qué ítems de ctr_menu NO va a mostrar la versión nueva?
--
--  El lateral anterior navegaba a lo que dijera `detalle`, sin comprobar
--  nada, y por eso enseña todas las filas de la tabla. La versión nueva pasa
--  cada ítem por isKnownAppRoute() y descarta EN SILENCIO el que apunte a una
--  ruta que el Router no declara, para no ofrecer enlaces que acabarían en un
--  404. El efecto secundario es este: un módulo cuya fila guarda una ruta que
--  el frontend no conoce desaparece del menú sin decir por qué.
--
--  Esta consulta reproduce esa decisión dentro de la base y marca, fila por
--  fila, si se verá o no.
--
--  SOLO LEE. Ejecutar en la base DEL TENANT.
--
--  Generada desde src/app/core/navigation/app-route-catalog.ts
--  (30 rutas declaradas, 28 alias).
-- ═══════════════════════════════════════════════════════════════════════════

WITH catalogo(ruta, pantalla) AS (
  VALUES
    ('/home', 'Inicio'),
    ('/noticias', 'Noticias y comunicados'),
    ('/administracion', 'Inicio de administración'),
    ('/administracion/formularios', 'Guía de formularios'),
    ('/administracion/usuarios', 'Usuarios'),
    ('/administracion/roles', 'Roles'),
    ('/administracion/menu', 'Administración de menú'),
    ('/administracion/configuracion-sistema', 'Configuración del sistema'),
    ('/administracion/linea-mando', 'Línea de mando'),
    ('/administracion/entidades', 'Entidades / Fuerzas'),
    ('/administracion/agencias-externas', 'Agencias externas'),
    ('/administracion/asistente', 'Asistente inteligente'),
    ('/administracion/casos', 'Códigos de caso'),
    ('/administracion/integraciones', 'Hub de integraciones'),
    ('/administracion/sms', 'Proveedor SMS'),
    ('/administracion/dominio', 'Dominios'),
    ('/administracion/cuentas-email', 'Cuentas de correo'),
    ('/super/tenants', 'Gestión de Tenants'),
    ('/super/salud-cads', 'Salud de CADs'),
    ('/operacion', 'Operación'),
    ('/operacion/anotaciones-turno', 'Bitácora de turno'),
    ('/operacion/mapa-incidentes', 'Mapa de incidentes'),
    ('/operacion/mapa-estadistico', 'GIS estadístico'),
    ('/operacion/reportes', 'Reportes y estadísticas'),
    ('/operacion/turnos', 'Turnos de vigilancia'),
    ('/operacion/recepcion', 'Recepción de llamadas'),
    ('/operacion/pedido', 'Seguimiento de incidentes'),
    ('/operacion/eventos', 'Eventos'),
    ('/gestion-documental', 'Gestión documental'),
    ('/gestion-documental/gestion-correos-electronicos', 'Gestión de correos electrónicos')
),
alias(de, a) AS (
  VALUES
    ('/inicio', '/home'),
    ('/formularios', '/administracion/formularios'),
    ('/usuarios', '/administracion/usuarios'),
    ('/roles', '/administracion/roles'),
    ('/menu', '/administracion/menu'),
    ('/configuracion-sistema', '/administracion/configuracion-sistema'),
    ('/admin-multimedia', '/administracion/configuracion-sistema'),
    ('/video-unidad', '/administracion/configuracion-sistema'),
    ('/configuracion-imagen-sitio', '/administracion/configuracion-sistema'),
    ('/linea-mando', '/administracion/linea-mando'),
    ('/dominio', '/administracion/dominio'),
    ('/cuentas-email', '/administracion/cuentas-email'),
    ('/correos-electronicos', '/gestion-documental/gestion-correos-electronicos'),
    ('/recepcion', '/operacion/recepcion'),
    ('/pedido', '/operacion/pedido'),
    ('/eventos', '/operacion/eventos'),
    ('/turnos', '/operacion/turnos'),
    ('/anotaciones', '/operacion/anotaciones-turno'),
    ('/reportes', '/operacion/reportes'),
    ('/mapa-incidentes', '/operacion/mapa-incidentes'),
    ('/mapa-estadistico', '/operacion/mapa-estadistico'),
    ('/entidades', '/administracion/entidades'),
    ('/asistente', '/administracion/asistente'),
    ('/agencias-externas', '/administracion/agencias-externas'),
    ('/gestion-correos-electronicos', '/gestion-documental/gestion-correos-electronicos'),
    ('/salud-cads', '/super/salud-cads'),
    ('/tenants', '/super/tenants'),
    ('/operacion/anotaciones', '/operacion/anotaciones-turno')
),
menu AS (
  SELECT
      m.id_menu, m.descripcion, m.idpadre, m.tipo, m.detalle, m.posicion,
      p.descripcion AS grupo,
      TRIM(COALESCE(m.detalle, '')) AS destino,
      -- Se replica normalizeAppRoute(): recorta, antepone '/', quita las
      -- barras finales y aplica el alias si lo hay.
      COALESCE((SELECT a.a FROM alias a WHERE a.de = n.ruta), n.ruta) AS ruta_resuelta
  FROM ctr_menu m
  LEFT JOIN ctr_menu p ON p.id_menu = m.idpadre
  CROSS JOIN LATERAL (
      SELECT RTRIM(
               CASE WHEN LEFT(TRIM(COALESCE(m.detalle, '')), 1) = '/'
                    THEN TRIM(m.detalle)
                    ELSE '/' || TRIM(COALESCE(m.detalle, '')) END,
               '/') AS ruta
  ) n
  WHERE m.vigente = 1
),
clasificado AS (
  SELECT
      menu.*,
      CASE
        -- Un contenedor sin destino: se ve si le queda algún hijo visible.
        WHEN destino = '' THEN 'grupo'
        -- isSafeExternalUrl()
        WHEN destino ~* '^(https?://|www\.)[^[:space:]]+$' THEN 'externo'
        -- isSafePdfResource(): también admite rutas locales assets/ o documentos/
        WHEN destino ~* '^(/?(assets|documentos)/[^[:space:]]+\.pdf([?#].*)?)$' THEN 'documento'
        WHEN EXISTS (SELECT 1 FROM catalogo c WHERE c.ruta = menu.ruta_resuelta) THEN 'interno'
        ELSE 'descartado'
      END AS clase
  FROM menu
)
SELECT
    COALESCE(grupo, '(raíz)') AS grupo,
    descripcion,
    detalle,
    CASE WHEN clase = 'interno' THEN ruta_resuelta ELSE NULL END AS ruta_resuelta,
    CASE clase
      WHEN 'descartado' THEN 'NO SE VE — la ruta no está en el catálogo del frontend'
      WHEN 'grupo'      THEN 'grupo (se ve si le queda algún hijo visible)'
      WHEN 'externo'    THEN 'se ve (enlace externo)'
      WHEN 'documento'  THEN 'se ve (documento PDF)'
      ELSE                   'se ve'
    END AS resultado
FROM clasificado
ORDER BY
    CASE WHEN clase = 'descartado' THEN 0 ELSE 1 END,   -- primero lo que se pierde
    grupo NULLS FIRST, posicion, id_menu;
