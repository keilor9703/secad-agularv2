-- ══════════════════════════════════════════════════════════════════════════
-- V50: Ítem de menú para el nuevo submódulo "Códigos de caso"
--
-- Nueva pantalla de administración (CRUD individual + importación masiva
-- desde Excel) para cad_casos, que hasta ahora no tenía ninguna forma de
-- cargarse salvo directo por SQL. Se agrega bajo el grupo "Administración"
-- (mismo patrón que V47/V48: buscar el grupo por descripción/tipo, insertar
-- el ítem si no existe, otorgar acceso a los roles 1 y 2).
-- Idempotente.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_id_admin BIGINT;
BEGIN
    SELECT id_menu INTO v_id_admin FROM ctr_menu WHERE tipo = 'GRUPO' AND descripcion = 'Administración' LIMIT 1;

    IF v_id_admin IS NOT NULL THEN
        INSERT INTO ctr_menu (descripcion, idpadre, posicion, tipo, icono, vigente, detalle, usuario_creacion, fecha_creacion, maquina_creacion)
        SELECT 'Códigos de Caso', v_id_admin, 45, 'ENLACE', 'fa-solid fa-clipboard-list', 1, '/administracion/casos', 1, NOW(), 'migration-V50'
        WHERE NOT EXISTS (
            SELECT 1 FROM ctr_menu m WHERE m.idpadre = v_id_admin AND m.detalle = '/administracion/casos'
        );
    END IF;
END $$;

INSERT INTO ctr_menu_roles (id_rol, id_menu, usuario_creacion, fecha_creacion, maquina_creacion)
SELECT r.id_rol, m.id_menu, 1, NOW(), 'migration-V50'
FROM ctr_menu m
CROSS JOIN (VALUES (1),(2)) AS r(id_rol)
WHERE m.detalle = '/administracion/casos'
  AND NOT EXISTS (SELECT 1 FROM ctr_menu_roles mr WHERE mr.id_menu = m.id_menu AND mr.id_rol = r.id_rol);
