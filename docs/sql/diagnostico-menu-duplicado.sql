-- ═══════════════════════════════════════════════════════════════════════════
--  Diagnóstico: ítems de menú repetidos
--
--  El lateral ya no los pinta dos veces (el frontend une los hermanos que
--  llevan al mismo destino), pero conviene ver qué hay realmente en la tabla:
--  las filas sobrantes siguen ocupando sitio en Administración → Menú y en
--  ctr_menu_roles.
--
--  SOLO LEE. No modifica nada.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. El grupo Operación y todos sus hijos, tal como llegan al frontend ──
--  `maquina_creacion` dice quién creó cada fila: 'migration-Vxx' si vino de
--  una migración, otra cosa (o NULL) si se creó a mano desde la pantalla de
--  administración de menú o si viene del sistema anterior.
SELECT
    h.id_menu,
    h.descripcion,
    h.detalle,
    h.icono,
    h.posicion,
    h.vigente,
    h.maquina_creacion,
    h.fecha_creacion
FROM ctr_menu g
JOIN ctr_menu h ON h.idpadre = g.id_menu
WHERE g.tipo = 'GRUPO'
  AND LOWER(g.descripcion) LIKE '%operaci%'
ORDER BY h.posicion, h.id_menu;

-- ── 2. Rutas repetidas bajo un mismo padre ────────────────────────────────
SELECT
    idpadre,
    detalle,
    COUNT(*)                      AS veces,
    STRING_AGG(id_menu::text, ', ' ORDER BY id_menu) AS ids,
    STRING_AGG(descripcion, ' | ' ORDER BY id_menu)  AS nombres
FROM ctr_menu
WHERE vigente = 1
  AND detalle IS NOT NULL
GROUP BY idpadre, detalle
HAVING COUNT(*) > 1
ORDER BY idpadre, detalle;

-- ── 3. Parejas que son el mismo destino con distinta ruta ─────────────────
--  El frontend equipara estas dos mediante un alias, así que para quien mira
--  el menú son el mismo módulo aunque en la tabla sean filas distintas.
SELECT id_menu, descripcion, detalle, idpadre, icono, vigente, maquina_creacion
FROM ctr_menu
WHERE detalle IN ('/operacion/anotaciones', '/operacion/anotaciones-turno')
ORDER BY idpadre, posicion;

-- ── 4. Filas sin ícono (las que salen con el de carpeta por defecto) ──────
SELECT id_menu, descripcion, detalle, idpadre, posicion, maquina_creacion
FROM ctr_menu
WHERE vigente = 1
  AND tipo = 'ENLACE'
  AND (icono IS NULL OR TRIM(icono) = '')
ORDER BY idpadre, posicion;
