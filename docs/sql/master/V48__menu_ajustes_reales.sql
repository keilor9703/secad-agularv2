-- ══════════════════════════════════════════════════════════════════════════
-- V48: Reenganchar grupos de menú huérfanos + ajustes de etiqueta/ícono
--
-- El usuario reportó que, incluso después de V47 ("aun no se ven todos los
-- modulos realmente"), faltaban TODO el submenú de Administración, TODO
-- Super Admin, y Gestión Documental/Mensajería. Causa raíz encontrada en
-- frontend/src/app/components/sidebar/sidebar.ts → mapDbMenu(): el sidebar
-- solo reconoce como "raíz visible" los ítems con idpadre IN (0, 1) o cuyo
-- padre no exista en la lista activa, y excluye explícitamente id_menu = 1
-- (el nodo raíz técnico). Los grupos "Operación" (V10), "Gestión Documental"
-- (V15), "Administración" y "Super Admin" (V47) fueron creados cada uno como
-- su PROPIA raíz auto-referenciada (idpadre = id_menu), asumiendo que el
-- sidebar soporta múltiples raíces — pero solo la reconoce si su id_menu es
-- literalmente 1. Como "Operación" fue el primer grupo insertado (V10),
-- tomó el id 1 y por eso es el único que se ve; los demás (id 5, 9, 10 en
-- este tenant) y absolutamente todos sus hijos quedan invisibles.
--
-- Este script:
--   1. Reengancha cualquier grupo auto-referenciado (salvo el nodo raíz real,
--      id_menu = 1) bajo ese nodo raíz, para que el sidebar los reconozca.
--   2. Corrige etiqueta/ícono de varios ítems para que coincidan con la
--      referencia real de producción que compartió el usuario (por ruta en
--      "detalle", no por id — los ids no coinciden entre bases).
--   3. Otorga acceso amplio a los roles 1 y 2 sobre todo el menú (el volcado
--      real mostró permisos muy dispersos/heredados de años de uso manual —
--      más simple y seguro partir de "ambos roles ven todo" en un tenant
--      nuevo y restringir después desde Administración → Roles/Menú si se
--      necesita).
-- Idempotente.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. Reenganchar grupos raíz huérfanos bajo el nodo raíz real (id_menu=1) ──
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM ctr_menu WHERE id_menu = 1 AND idpadre = 1) THEN
        UPDATE ctr_menu
        SET idpadre = 1
        WHERE tipo = 'GRUPO' AND idpadre = id_menu AND id_menu <> 1;
    END IF;
END $$;

-- ── 2. Corrección de etiquetas/íconos por ruta (detalle) ─────────────────
UPDATE ctr_menu SET descripcion = 'Configuración'        WHERE detalle = '/administracion/configuracion-sistema';
UPDATE ctr_menu SET descripcion = 'Dominios'             WHERE detalle = '/administracion/dominio';
UPDATE ctr_menu SET descripcion = 'Hub de Integraciones' WHERE detalle = '/administracion/integraciones';
UPDATE ctr_menu SET descripcion = 'Reportes y Estadísticas' WHERE detalle = '/operacion/reportes';
UPDATE ctr_menu SET descripcion = 'GIS Estadístico'       WHERE detalle = '/operacion/mapa-estadistico';
UPDATE ctr_menu SET descripcion = 'Gestión de Tenants'    WHERE detalle = '/super/tenants';

UPDATE ctr_menu SET icono = 'fa-solid fa-gear'         WHERE descripcion = 'Administración' AND tipo = 'GRUPO';
UPDATE ctr_menu SET icono = 'fa-solid fa-truck-fast'   WHERE detalle = '/operacion/pedido';
UPDATE ctr_menu SET icono = 'fa-solid fa-shield-halved' WHERE detalle = '/administracion/roles';
UPDATE ctr_menu SET icono = 'fa-solid fa-envelope'     WHERE detalle = '/administracion/cuentas-email';

-- ── 3. Acceso amplio para SuperAdministrador (1) y Administrador (2) ─────
INSERT INTO ctr_menu_roles (id_rol, id_menu, usuario_creacion, fecha_creacion, maquina_creacion)
SELECT r.id_rol, m.id_menu, 1, NOW(), 'migration-V48'
FROM ctr_menu m
CROSS JOIN (VALUES (1),(2)) AS r(id_rol)
WHERE NOT EXISTS (
    SELECT 1 FROM ctr_menu_roles mr WHERE mr.id_menu = m.id_menu AND mr.id_rol = r.id_rol
);
