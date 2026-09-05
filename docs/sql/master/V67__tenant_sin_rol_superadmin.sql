-- ═══════════════════════════════════════════════════════════════════════════
--  V67: se retira el rol de SuperAdministrador de la base del tenant
--
--  Apply to: EACH TENANT/CAD database (no a la maestra).
--
--  ⚠ ANTES DE APLICAR ESTA: V66 en la maestra y scripts/migrar-superadmins.sh.
--    Este script borra la única pista de quién era superadministrador. Si la
--    tabla secad_super_admins de la maestra está vacía cuando esto corra,
--    nadie podrá volver a entrar a /super.
--
--    Comprobación previa, en la MAESTRA:
--        SELECT COUNT(*) FROM secad_super_admins WHERE activo;   -- > 0
--
--  ── Por qué ──────────────────────────────────────────────────────────────
--
--  A partir de V66, es_super_admin sale exclusivamente de la maestra. El rol 2
--  del tenant ya no otorga nada. Dejarlo sería peor que quitarlo: un rol
--  llamado «SuperAdministrador» que aparece en el catálogo, se puede conceder
--  y no hace absolutamente nada es una trampa para el siguiente administrador
--  que lo vea.
--
--  Se DESACTIVA en vez de borrar: las filas históricas de ctr_roles_user_admin
--  son auditoría de quién tuvo qué y cuándo, y no se tiran. Lo que sí se retira
--  es la concesión efectiva, para que el rol deje de estar vigente en nadie.
--
--  Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_rol      BIGINT := 2;   -- el rol de superadministrador, por convención de V2/V22
    v_nombre   TEXT;
    v_vigentes INT;
    v_planas   INT;
BEGIN
    SELECT descripcion INTO v_nombre FROM ctr_roles WHERE id_rol = v_rol;

    IF v_nombre IS NULL THEN
        RAISE NOTICE 'V67: este CAD no tiene el rol %; no hay nada que retirar.', v_rol;
        RETURN;
    END IF;

    -- Salvaguarda: si el rol 2 de ESTE tenant no es el superadministrador sino
    -- otro rol que alguien creó con ese id, no se toca. Se compara por nombre
    -- porque es lo único que queda para distinguirlos.
    IF UPPER(REPLACE(TRIM(v_nombre), ' ', '')) NOT IN ('SUPERADMINISTRADOR', 'SUPERADMIN') THEN
        RAISE NOTICE 'V67: el rol % de este CAD se llama «%», que no es el superadministrador. No se toca.',
                     v_rol, v_nombre;
        RETURN;
    END IF;

    -- 1. Retirar la concesión vigente (el histórico se conserva, marcado).
    UPDATE ctr_roles_user_admin
       SET vigente        = 0,
           fecha_fin      = COALESCE(fecha_fin, CURRENT_DATE),
           fecha_modifica = NOW()
     WHERE id_rol = v_rol AND COALESCE(vigente, 0) = 1;
    GET DIAGNOSTICS v_vigentes = ROW_COUNT;

    -- 2. La tabla plana sí se limpia: es una caché de acceso, no auditoría.
    DELETE FROM ctr_roles_user WHERE id_rol = v_rol;
    GET DIAGNOSTICS v_planas = ROW_COUNT;

    -- 3. El rol desaparece del catálogo del CAD.
    UPDATE ctr_roles
       SET descripcion = 'SuperAdministrador (se administra desde la maestra)',
           vigente     = 0
     WHERE id_rol = v_rol;

    -- 4. Y deja de conceder pantallas.
    DELETE FROM ctr_menu_roles WHERE id_rol = v_rol;

    RAISE NOTICE 'V67: rol % retirado. % concesión(es) vigente(s) cerradas, % fila(s) de acceso borradas.',
                 v_rol, v_vigentes, v_planas;
END $$;

-- ── Verificación ──────────────────────────────────────────────────────────
SELECT r.id_rol, r.descripcion, r.vigente,
       (SELECT COUNT(*) FROM ctr_roles_user      x WHERE x.id_rol = r.id_rol) AS en_tabla_plana,
       (SELECT COUNT(*) FROM ctr_roles_user_admin a
         WHERE a.id_rol = r.id_rol AND COALESCE(a.vigente,0) = 1)             AS concesiones_vigentes
FROM   ctr_roles r
WHERE  r.id_rol = 2;
