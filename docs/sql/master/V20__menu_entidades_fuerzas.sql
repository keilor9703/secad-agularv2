-- ═══════════════════════════════════════════════════════════════════════════
--  Migración V20: Ítem de menú "Entidades / Fuerzas"
--  Tabla afectada : ctr_menu, ctr_menu_roles  (tenant DB)
--  Idempotente    : comprueba existencia antes de insertar
--  Ejecutar en    : cada tenant que necesite el módulo de Entidades/Fuerzas
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_id_admin     BIGINT;
  v_id_entidades BIGINT;
BEGIN

  -- ── 1. Buscar el grupo padre "Administración" ────────────────────────────
  --  El grupo Administración es un nodo raíz sin detalle (detalle IS NULL).
  SELECT id_menu INTO v_id_admin
  FROM ctr_menu
  WHERE detalle IS NULL
    AND LOWER(descripcion) LIKE '%administraci%'
    AND vigente = 1
  LIMIT 1;

  -- Si por alguna razón no existe, usar la auto-referencia (nodo raíz genérico)
  IF v_id_admin IS NULL THEN
    RAISE NOTICE 'No se encontró grupo Administración; usando id_menu = idpadre como raíz';
    SELECT id_menu INTO v_id_admin
    FROM ctr_menu
    WHERE id_menu = idpadre
    LIMIT 1;
  END IF;

  IF v_id_admin IS NULL THEN
    RAISE EXCEPTION 'No se encontró ningún nodo raíz en ctr_menu. Verifica la estructura del menú.';
  END IF;

  RAISE NOTICE 'Grupo Administración encontrado con id = %', v_id_admin;

  -- ── 2. Crear el ítem "Entidades / Fuerzas" si no existe ──────────────────
  SELECT id_menu INTO v_id_entidades
  FROM ctr_menu
  WHERE idpadre = v_id_admin
    AND detalle = '/administracion/entidades'
  LIMIT 1;

  IF v_id_entidades IS NULL THEN
    INSERT INTO ctr_menu
      (descripcion, idpadre, posicion, tipo, icono, vigente, detalle,
       usuario_creacion, fecha_creacion, maquina_creacion)
    VALUES
      ('Entidades / Fuerzas',
       v_id_admin,
       90,          -- Al final de los ítems de Administración
       'ENLACE',
       'fa-solid fa-building',
       1,
       '/administracion/entidades',
       1, NOW(), 'migration-V20')
    RETURNING id_menu INTO v_id_entidades;

    RAISE NOTICE 'Ítem Entidades/Fuerzas creado con id = %', v_id_entidades;
  ELSE
    RAISE NOTICE 'Ítem Entidades/Fuerzas ya existe con id = %', v_id_entidades;
  END IF;

  -- ── 3. Asignar al rol Superadmin (id_rol = 1) si no está asignado ────────
  INSERT INTO ctr_menu_roles (id_rol, id_menu, usuario_creacion, fecha_creacion, maquina_creacion)
  SELECT 1, v_id_entidades, 1, NOW(), 'migration-V20'
  WHERE NOT EXISTS (
    SELECT 1 FROM ctr_menu_roles
    WHERE id_rol = 1 AND id_menu = v_id_entidades
  );

  RAISE NOTICE 'Migración V20 completada. id_menu Entidades/Fuerzas = %', v_id_entidades;

END $$;

-- ── Verificación final ────────────────────────────────────────────────────
SELECT m.id_menu, m.descripcion, m.detalle, m.posicion, m.icono, m.vigente,
       (SELECT COUNT(1) FROM ctr_menu_roles mr WHERE mr.id_menu = m.id_menu) AS roles_asignados
FROM ctr_menu m
WHERE m.detalle = '/administracion/entidades';
