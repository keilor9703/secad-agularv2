-- ═══════════════════════════════════════════════════════════════════════════
--  Migración V10: Menú de Operación – Recepción, Eventos y Turnos
--  Tabla afectada : ctr_menu  (tenant DB)
--  Idempotente    : usa INSERT … ON CONFLICT DO NOTHING / comprueba existencia
--  Ejecutar en    : cada tenant que necesite los módulos de Operación en el
--                   menú lateral del sistema.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Nodo padre "Operación" ─────────────────────────────────────────────
--  idpadre = 0 → nodo raíz visible (el sidebar lo trata como top-level)
--  posicion = 20 → aparece después de las secciones de Administración (10)

DO $$
DECLARE
  v_id_operacion  BIGINT;
  v_id_recepcion  BIGINT;
  v_id_eventos    BIGINT;
  v_id_turnos     BIGINT;
BEGIN

  -- ── Buscar o crear el grupo "Operación" ──────────────────────────────────
  SELECT id_menu INTO v_id_operacion
  FROM ctr_menu
  WHERE detalle IS NULL
    AND LOWER(descripcion) LIKE '%operaci%'
    AND vigente = 1
  LIMIT 1;

  IF v_id_operacion IS NULL THEN
    INSERT INTO ctr_menu
      (descripcion, idpadre, posicion, tipo, icono, vigente, detalle,
       usuario_creacion, fecha_creacion, maquina_creacion)
    VALUES
      ('Operación', 0, 20, 'GRUPO', 'fa-solid fa-tower-broadcast', 1, NULL,
       1, NOW(), 'migration-V10')
    RETURNING id_menu INTO v_id_operacion;

    -- auto-referencia cuando idpadre = 0
    UPDATE ctr_menu SET idpadre = v_id_operacion
    WHERE id_menu = v_id_operacion;

    RAISE NOTICE 'Grupo Operación creado con id = %', v_id_operacion;
  ELSE
    RAISE NOTICE 'Grupo Operación ya existe con id = %', v_id_operacion;
  END IF;

  -- ── Recepción ─────────────────────────────────────────────────────────────
  SELECT id_menu INTO v_id_recepcion
  FROM ctr_menu
  WHERE idpadre = v_id_operacion
    AND detalle = '/operacion/recepcion'
  LIMIT 1;

  IF v_id_recepcion IS NULL THEN
    INSERT INTO ctr_menu
      (descripcion, idpadre, posicion, tipo, icono, vigente, detalle,
       usuario_creacion, fecha_creacion, maquina_creacion)
    VALUES
      ('Recepción', v_id_operacion, 10, 'ENLACE',
       'fa-solid fa-headset', 1, '/operacion/recepcion',
       1, NOW(), 'migration-V10')
    RETURNING id_menu INTO v_id_recepcion;
    RAISE NOTICE 'Ítem Recepción creado con id = %', v_id_recepcion;
  ELSE
    RAISE NOTICE 'Ítem Recepción ya existe con id = %', v_id_recepcion;
  END IF;

  -- ── Eventos (cola de despacho) ────────────────────────────────────────────
  SELECT id_menu INTO v_id_eventos
  FROM ctr_menu
  WHERE idpadre = v_id_operacion
    AND detalle = '/operacion/eventos'
  LIMIT 1;

  IF v_id_eventos IS NULL THEN
    INSERT INTO ctr_menu
      (descripcion, idpadre, posicion, tipo, icono, vigente, detalle,
       usuario_creacion, fecha_creacion, maquina_creacion)
    VALUES
      ('Eventos', v_id_operacion, 20, 'ENLACE',
       'fa-solid fa-tower-broadcast', 1, '/operacion/eventos',
       1, NOW(), 'migration-V10')
    RETURNING id_menu INTO v_id_eventos;
    RAISE NOTICE 'Ítem Eventos creado con id = %', v_id_eventos;
  ELSE
    RAISE NOTICE 'Ítem Eventos ya existe con id = %', v_id_eventos;
  END IF;

  -- ── Turnos ────────────────────────────────────────────────────────────────
  SELECT id_menu INTO v_id_turnos
  FROM ctr_menu
  WHERE idpadre = v_id_operacion
    AND detalle = '/operacion/turnos'
  LIMIT 1;

  IF v_id_turnos IS NULL THEN
    INSERT INTO ctr_menu
      (descripcion, idpadre, posicion, tipo, icono, vigente, detalle,
       usuario_creacion, fecha_creacion, maquina_creacion)
    VALUES
      ('Turnos', v_id_operacion, 30, 'ENLACE',
       'fa-solid fa-calendar-check', 1, '/operacion/turnos',
       1, NOW(), 'migration-V10')
    RETURNING id_menu INTO v_id_turnos;
    RAISE NOTICE 'Ítem Turnos creado con id = %', v_id_turnos;
  ELSE
    RAISE NOTICE 'Ítem Turnos ya existe con id = %', v_id_turnos;
  END IF;

END $$;

-- ── 2. Asignar los nuevos ítems al rol "Superadmin" (id_rol = 1) ──────────
--  Usa INSERT … ON CONFLICT DO NOTHING para no duplicar si ya existe.
INSERT INTO ctr_menu_roles (id_rol, id_menu, usuario_creacion, fecha_creacion, maquina_creacion)
SELECT 1, m.id_menu, 1, NOW(), 'migration-V10'
FROM ctr_menu m
WHERE m.detalle IN ('/operacion/recepcion', '/operacion/eventos', '/operacion/turnos')
  AND NOT EXISTS (
    SELECT 1
    FROM ctr_menu_roles mr
    WHERE mr.id_rol = 1
      AND mr.id_menu = m.id_menu
  );

-- ── 3. Verificación final ─────────────────────────────────────────────────
SELECT m.id_menu, m.descripcion, m.detalle, m.posicion, m.icono, m.vigente
FROM ctr_menu m
WHERE m.detalle IN ('/operacion/recepcion', '/operacion/eventos', '/operacion/turnos')
   OR (m.detalle IS NULL AND LOWER(m.descripcion) LIKE '%operaci%')
ORDER BY m.idpadre, m.posicion;
