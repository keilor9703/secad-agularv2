-- ══════════════════════════════════════════════════════════════════════════
-- V61: Agregar "Unidades y Municipios" al menú Super Admin
--
-- Apply to: EACH TENANT/CAD database (no a la maestra).
--
-- Registra el nuevo módulo institucional en ctr_menu bajo el grupo Super Admin
-- y le otorga acceso al rol SuperAdministrador (id_rol = 2).
-- Idempotente.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_id_super BIGINT;
    v_id_menu  BIGINT;
BEGIN
    -- 1. Buscar grupo Super Admin
    SELECT id_menu INTO v_id_super
    FROM ctr_menu
    WHERE tipo = 'GRUPO'
      AND LOWER(TRIM(descripcion)) LIKE '%super%admin%'
    LIMIT 1;

    IF v_id_super IS NULL THEN
        -- Fallback si no tiene 'Super Admin' explícito como grupo
        SELECT id_menu INTO v_id_super
        FROM ctr_menu
        WHERE detalle LIKE '/super/%'
        LIMIT 1;
        IF v_id_super IS NOT NULL THEN
            SELECT idpadre INTO v_id_super FROM ctr_menu WHERE id_menu = v_id_super;
        END IF;
    END IF;

    IF v_id_super IS NULL THEN
        RAISE NOTICE 'V61: No se encontró el grupo Super Admin en este tenant. Omitiendo.';
        RETURN;
    END IF;

    -- 2. Verificar si ya existe el ítem
    SELECT id_menu INTO v_id_menu
    FROM ctr_menu
    WHERE detalle = '/super/unidades'
    LIMIT 1;

    IF v_id_menu IS NULL THEN
        INSERT INTO ctr_menu (
            descripcion, idpadre, posicion, tipo, icono, vigente, detalle,
            usuario_creacion, fecha_creacion, maquina_creacion
        ) VALUES (
            'Unidades y Municipios',
            v_id_super,
            30,
            'ENLACE',
            'fa-solid fa-map-location-dot',
            1,
            '/super/unidades',
            1,
            NOW(),
            'migration-V61'
        )
        RETURNING id_menu INTO v_id_menu;
        RAISE NOTICE 'V61: Ítem "Unidades y Municipios" creado con id = % bajo grupo %', v_id_menu, v_id_super;
    ELSE
        UPDATE ctr_menu
        SET idpadre = v_id_super,
            descripcion = 'Unidades y Municipios',
            tipo = 'ENLACE',
            icono = 'fa-solid fa-map-location-dot',
            vigente = 1
        WHERE id_menu = v_id_menu;
        RAISE NOTICE 'V61: Ítem "Unidades y Municipios" ya existía (id = %), actualizado.', v_id_menu;
    END IF;

    -- 3. Otorgar permisos al rol SuperAdministrador (id_rol = 2)
    IF v_id_menu IS NOT NULL THEN
        INSERT INTO ctr_menu_roles (id_rol, id_menu, usuario_creacion, fecha_creacion, maquina_creacion)
        VALUES (2, v_id_menu, 1, NOW(), 'migration-V61')
        ON CONFLICT (id_menu, id_rol) DO NOTHING;
        RAISE NOTICE 'V61: Permiso otorgado a rol 2 (SuperAdministrador) para menú %', v_id_menu;
    END IF;

END $$;
