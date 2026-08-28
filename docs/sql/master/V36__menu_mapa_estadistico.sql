-- ══════════════════════════════════════════════════════════════════════════════
-- V36: Ítem de menú — GIS Estadístico Delincuencial
-- Ruta  : /operacion/mapa-estadistico
-- Icono : fa-solid fa-chart-area
-- Orden : 86 (entre Mapa de Incidentes=85 y Reportes=90)
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_id_oper BIGINT;
  v_id_item BIGINT;
BEGIN
  SELECT id_menu INTO v_id_oper
  FROM ctr_menu
  WHERE LOWER(descripcion) LIKE '%operaci%' AND vigente = 1
    AND id_menu <> COALESCE(idpadre, 0)
  ORDER BY id_menu
  LIMIT 1;

  IF v_id_oper IS NULL THEN
    RAISE NOTICE 'V36: No se encontró el grupo Operación en ctr_menu.';
  ELSE
    SELECT id_menu INTO v_id_item
    FROM ctr_menu
    WHERE idpadre = v_id_oper AND detalle = '/operacion/mapa-estadistico'
    LIMIT 1;

    IF v_id_item IS NULL THEN
      INSERT INTO ctr_menu
        (descripcion, idpadre, posicion, tipo, icono, vigente, detalle,
         usuario_creacion, fecha_creacion, maquina_creacion)
      VALUES
        ('GIS Estadístico', v_id_oper, 86, 'ENLACE',
         'fa-solid fa-chart-area', 1, '/operacion/mapa-estadistico',
         1, NOW(), 'migration-V36')
      RETURNING id_menu INTO v_id_item;

      INSERT INTO ctr_menu_roles (id_rol, id_menu, usuario_creacion, fecha_creacion, maquina_creacion)
      SELECT r.id_rol, v_id_item, 1, NOW(), 'migration-V36'
      FROM (VALUES (1),(2)) AS r(id_rol)
      WHERE NOT EXISTS (
        SELECT 1 FROM ctr_menu_roles mr
        WHERE mr.id_rol = r.id_rol AND mr.id_menu = v_id_item
      );

      RAISE NOTICE 'V36: Ítem "GIS Estadístico" creado con id = %', v_id_item;
    ELSE
      RAISE NOTICE 'V36: Ítem ya existe con id = %', v_id_item;
    END IF;
  END IF;
END $$;
