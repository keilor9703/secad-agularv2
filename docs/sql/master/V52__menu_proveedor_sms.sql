-- ══════════════════════════════════════════════════════════════════════════
-- V52: Ítem de menú para el nuevo submódulo "Proveedor SMS"
--
-- Mismo patrón que V50 (Códigos de Caso): buscar el grupo "Administración"
-- por descripción/tipo, insertar el ítem si no existe, otorgar acceso a los
-- roles 1 y 2.
-- Idempotente.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_id_admin BIGINT;
BEGIN
    SELECT id_menu INTO v_id_admin FROM ctr_menu WHERE tipo = 'GRUPO' AND descripcion = 'Administración' LIMIT 1;

    IF v_id_admin IS NOT NULL THEN
        INSERT INTO ctr_menu (descripcion, idpadre, posicion, tipo, icono, vigente, detalle, usuario_creacion, fecha_creacion, maquina_creacion)
        SELECT 'Proveedor SMS', v_id_admin, 46, 'ENLACE', 'fa-solid fa-comment-sms', 1, '/administracion/sms', 1, NOW(), 'migration-V52'
        WHERE NOT EXISTS (
            SELECT 1 FROM ctr_menu m WHERE m.idpadre = v_id_admin AND m.detalle = '/administracion/sms'
        );
    END IF;
END $$;

INSERT INTO ctr_menu_roles (id_rol, id_menu, usuario_creacion, fecha_creacion, maquina_creacion)
SELECT r.id_rol, m.id_menu, 1, NOW(), 'migration-V52'
FROM ctr_menu m
CROSS JOIN (VALUES (1),(2)) AS r(id_rol)
WHERE m.detalle = '/administracion/sms'
  AND NOT EXISTS (SELECT 1 FROM ctr_menu_roles mr WHERE mr.id_menu = m.id_menu AND mr.id_rol = r.id_rol);
