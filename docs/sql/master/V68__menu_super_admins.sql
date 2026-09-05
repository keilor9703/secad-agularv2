-- ═══════════════════════════════════════════════════════════════════════════
--  V68: entrada de menú para «Superadministradores»
--
--  Apply to: EACH TENANT/CAD database (no a la maestra).
--
--  La pantalla vive en /super/super-admins y administra secad_super_admins de
--  la base maestra (ver V66). El ítem se siembra en cada tenant porque el menú
--  lateral se arma con la tabla ctr_menu del CAD activo, aunque lo que la
--  pantalla administre esté fuera de él.
--
--  El ítem se concede al rol Administrador, que es el que arma el menú de las
--  pantallas de gestión. Quién puede ENTRAR de verdad no lo decide esta
--  concesión: la ruta está protegida por superAdminGuard en el frontend y por
--  la política SuperAdministrador en la API, y las dos leen el claim
--  es_super_admin, que se resuelve contra la maestra. Un administrador de
--  unidad que llegue a verlo será rebotado al pulsarlo.
--
--  Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_grupo BIGINT;
    v_item  BIGINT;
BEGIN
    SELECT id_menu INTO v_grupo
      FROM ctr_menu
     WHERE tipo = 'GRUPO'
       AND (UPPER(descripcion) LIKE '%SUPER%ADMIN%' OR detalle = '/super')
     LIMIT 1;

    IF v_grupo IS NULL THEN
        RAISE NOTICE 'V68: no existe el grupo Super Admin en este CAD; no se siembra.';
        RETURN;
    END IF;

    SELECT id_menu INTO v_item
      FROM ctr_menu WHERE detalle = '/super/super-admins' LIMIT 1;

    IF v_item IS NULL THEN
        INSERT INTO ctr_menu (descripcion, idpadre, posicion, tipo, icono, vigente,
                              detalle, usuario_creacion, fecha_creacion, maquina_creacion)
        VALUES ('Superadministradores', v_grupo, 40, 'S', 'fa-solid fa-user-shield', 1,
                '/super/super-admins', 1, NOW(), 'migration-V68')
        RETURNING id_menu INTO v_item;
    END IF;

    INSERT INTO ctr_menu_roles (id_rol, id_menu, usuario_creacion, fecha_creacion, maquina_creacion)
    SELECT r.id_rol, v_item, 1, NOW(), 'migration-V68'
    FROM   ctr_roles r
    WHERE  r.id_rol = 1
      AND  NOT EXISTS (SELECT 1 FROM ctr_menu_roles mr
                       WHERE mr.id_menu = v_item AND mr.id_rol = r.id_rol);

    RAISE NOTICE 'V68: «Superadministradores» disponible en /super/super-admins.';
END $$;

SELECT id_menu, descripcion, idpadre, tipo, vigente, detalle
FROM   ctr_menu WHERE detalle = '/super/super-admins';
