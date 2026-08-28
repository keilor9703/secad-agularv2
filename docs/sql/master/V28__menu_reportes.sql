-- ══════════════════════════════════════════════════════════════════════════════
-- V28: Ítem de menú — Reportes y Estadísticas (§6.16)
-- Ruta: /operacion/reportes
-- Icono: fa-solid fa-chart-bar
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
    RAISE NOTICE 'V28: No se encontró el grupo Operación en ctr_menu — crear el ítem manualmente.';
  ELSE
    -- Verificar si ya existe
    SELECT id_menu INTO v_id_item
    FROM ctr_menu
    WHERE idpadre = v_id_oper AND detalle = '/operacion/reportes'
    LIMIT 1;

    IF v_id_item IS NULL THEN
      INSERT INTO ctr_menu
        (descripcion, idpadre, posicion, tipo, icono, vigente, detalle,
         usuario_creacion, fecha_creacion, maquina_creacion)
      VALUES
        ('Reportes y Estadísticas', v_id_oper, 90, 'ENLACE',
         'fa-solid fa-chart-bar', 1, '/operacion/reportes',
         1, NOW(), 'migration-V28')
      RETURNING id_menu INTO v_id_item;

      -- Asignar a todos los roles
      INSERT INTO ctr_menu_roles (id_rol, id_menu, usuario_creacion, fecha_creacion, maquina_creacion)
      SELECT r.id_rol, v_id_item, 1, NOW(), 'migration-V28'
      FROM (VALUES (1),(2)) AS r(id_rol)
      WHERE NOT EXISTS (
        SELECT 1 FROM ctr_menu_roles mr
        WHERE mr.id_rol = r.id_rol AND mr.id_menu = v_id_item
      );

      RAISE NOTICE 'V28: Ítem "Reportes y Estadísticas" creado con id = %', v_id_item;
    ELSE
      RAISE NOTICE 'V28: Ítem ya existe con id = %', v_id_item;
    END IF;
  END IF;
END $$;
