-- ══════════════════════════════════════════════════════════════════════════════
-- V34: Ítem de menú — Mapa de Incidentes GIS 2D (§2.3, §6.12)
-- Ruta  : /operacion/mapa-incidentes
-- Icono : fa-solid fa-map-location-dot
-- Orden : 85 (entre anotaciones=40 y reportes=90)
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_id_oper BIGINT;
  v_id_item BIGINT;
BEGIN
  -- Buscar el grupo "Operación" en el menú
  SELECT id_menu INTO v_id_oper
  FROM ctr_menu
  WHERE LOWER(descripcion) LIKE '%operaci%' AND vigente = 1
    AND id_menu <> COALESCE(idpadre, 0)
  ORDER BY id_menu
  LIMIT 1;

  IF v_id_oper IS NULL THEN
    RAISE NOTICE 'V34: No se encontró el grupo Operación en ctr_menu — crear el ítem manualmente.';
  ELSE
    -- Verificar si ya existe (idempotente)
    SELECT id_menu INTO v_id_item
    FROM ctr_menu
    WHERE idpadre = v_id_oper AND detalle = '/operacion/mapa-incidentes'
    LIMIT 1;

    IF v_id_item IS NULL THEN
      INSERT INTO ctr_menu
        (descripcion, idpadre, posicion, tipo, icono, vigente, detalle,
         usuario_creacion, fecha_creacion, maquina_creacion)
      VALUES
        ('Mapa de Incidentes', v_id_oper, 85, 'ENLACE',
         'fa-solid fa-map-location-dot', 1, '/operacion/mapa-incidentes',
         1, NOW(), 'migration-V34')
      RETURNING id_menu INTO v_id_item;

      -- Asignar a todos los roles (operador=1, administrador=2)
      INSERT INTO ctr_menu_roles (id_rol, id_menu, usuario_creacion, fecha_creacion, maquina_creacion)
      SELECT r.id_rol, v_id_item, 1, NOW(), 'migration-V34'
      FROM (VALUES (1),(2)) AS r(id_rol)
      WHERE NOT EXISTS (
        SELECT 1 FROM ctr_menu_roles mr
        WHERE mr.id_rol = r.id_rol AND mr.id_menu = v_id_item
      );

      RAISE NOTICE 'V34: Ítem "Mapa de Incidentes" creado con id = %', v_id_item;
    ELSE
      RAISE NOTICE 'V34: Ítem ya existe con id = %', v_id_item;
    END IF;
  END IF;
END $$;

-- ── Verificación ──────────────────────────────────────────────────────────────
SELECT
  'menu_mapa' AS objeto,
  CASE WHEN EXISTS (
    SELECT 1 FROM ctr_menu WHERE detalle = '/operacion/mapa-incidentes' AND vigente = 1
  ) THEN 'OK' ELSE 'FALTA' END AS estado;
