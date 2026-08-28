-- ══════════════════════════════════════════════════════════════════════════
-- V47: Completar el árbol de menú (ctr_menu / ctr_menu_roles)
--
-- Las migraciones anteriores (V15, V17, V20, V28) intentaban insertar sus
-- ítems bajo un grupo "Administración" que en realidad nunca fue CREADO por
-- ningún script — solo se BUSCABA, con un fallback frágil ("cualquier nodo
-- raíz") que en un tenant nuevo termina colgando ítems de Administración
-- bajo "Operación" por accidente (le pasó a "Entidades / Fuerzas", V20).
-- Los ítems que no encontraron ni siquiera ese fallback (Asistente
-- Inteligente V17, Reportes V28) simplemente no se crearon.
--
-- Este script:
--   1. Crea los grupos raíz "Administración" y "Super Admin" si no existen.
--   2. Re-ubica "Entidades / Fuerzas" bajo "Administración" (estaba bajo
--      "Operación" por el fallback de V20).
--   3. Inserta todos los ítems de menú que corresponden a rutas reales del
--      frontend (app.routes.ts) y que ningún script anterior llegó a crear.
--   4. Otorga acceso a Administrador (id_rol=1) y SuperAdministrador
--      (id_rol=2) a los ítems de Administración/Operación, y solo a
--      SuperAdministrador (id_rol=2) a los de Super Admin.
--
-- Idempotente: cada INSERT comprueba existencia por (idpadre, detalle) antes
-- de insertar; los GRANT de ctr_menu_roles usan NOT EXISTS.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_id_admin BIGINT;
    v_id_super BIGINT;
BEGIN

    -- ── 1. Grupos raíz ────────────────────────────────────────────────────
    SELECT id_menu INTO v_id_admin FROM ctr_menu WHERE tipo = 'GRUPO' AND descripcion = 'Administración' LIMIT 1;
    IF v_id_admin IS NULL THEN
        INSERT INTO ctr_menu (descripcion, idpadre, posicion, tipo, icono, vigente, detalle, usuario_creacion, fecha_creacion, maquina_creacion)
        VALUES ('Administración', 0, 40, 'GRUPO', 'fa-solid fa-gears', 1, NULL, 1, NOW(), 'migration-V47')
        RETURNING id_menu INTO v_id_admin;
        UPDATE ctr_menu SET idpadre = v_id_admin WHERE id_menu = v_id_admin;
        RAISE NOTICE 'Grupo Administración creado con id = %', v_id_admin;
    ELSE
        RAISE NOTICE 'Grupo Administración ya existe con id = %', v_id_admin;
    END IF;

    SELECT id_menu INTO v_id_super FROM ctr_menu WHERE tipo = 'GRUPO' AND descripcion = 'Super Admin' LIMIT 1;
    IF v_id_super IS NULL THEN
        INSERT INTO ctr_menu (descripcion, idpadre, posicion, tipo, icono, vigente, detalle, usuario_creacion, fecha_creacion, maquina_creacion)
        VALUES ('Super Admin', 0, 50, 'GRUPO', 'fa-solid fa-user-shield', 1, NULL, 1, NOW(), 'migration-V47')
        RETURNING id_menu INTO v_id_super;
        UPDATE ctr_menu SET idpadre = v_id_super WHERE id_menu = v_id_super;
        RAISE NOTICE 'Grupo Super Admin creado con id = %', v_id_super;
    ELSE
        RAISE NOTICE 'Grupo Super Admin ya existe con id = %', v_id_super;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM ctr_menu WHERE tipo = 'GRUPO' AND descripcion = 'Operación') THEN
        RAISE EXCEPTION 'No se encontró el grupo Operación — se esperaba que V10 ya lo hubiera creado.';
    END IF;

    -- ── 2. Reubicar "Entidades / Fuerzas" bajo Administración ──────────────
    UPDATE ctr_menu SET idpadre = v_id_admin
    WHERE detalle = '/administracion/entidades' AND idpadre <> v_id_admin;

END $$;

-- ── 3. Ítems de menú faltantes ──────────────────────────────────────────

INSERT INTO ctr_menu (descripcion, idpadre, posicion, tipo, icono, vigente, detalle, usuario_creacion, fecha_creacion, maquina_creacion)
SELECT v.descripcion, g.id_menu, v.posicion, 'ENLACE', v.icono, 1, v.detalle, 1, NOW(), 'migration-V47'
FROM (VALUES
    ('Usuarios',                 '/administracion/usuarios',              'fa-solid fa-users',       10),
    ('Roles',                    '/administracion/roles',                 'fa-solid fa-user-shield', 20),
    ('Menú',                     '/administracion/menu',                  'fa-solid fa-bars',        30),
    ('Configuración del Sistema','/administracion/configuracion-sistema', 'fa-solid fa-sliders',     40),
    ('Línea de Mando',           '/administracion/linea-mando',           'fa-solid fa-sitemap',     50),
    ('Dominio',                  '/administracion/dominio',               'fa-solid fa-globe',       60),
    ('Cuentas Email',            '/administracion/cuentas-email',         'fa-solid fa-at',          70),
    ('Asistente Inteligente',    '/administracion/asistente',             'fa-solid fa-robot',       80),
    ('Integraciones',            '/administracion/integraciones',         'fa-solid fa-plug',        95)
) AS v(descripcion, detalle, icono, posicion)
JOIN ctr_menu g ON g.tipo = 'GRUPO' AND g.descripcion = 'Administración'
WHERE NOT EXISTS (
    SELECT 1 FROM ctr_menu m WHERE m.idpadre = g.id_menu AND m.detalle = v.detalle
);

INSERT INTO ctr_menu (descripcion, idpadre, posicion, tipo, icono, vigente, detalle, usuario_creacion, fecha_creacion, maquina_creacion)
SELECT v.descripcion, g.id_menu, v.posicion, 'ENLACE', v.icono, 1, v.detalle, 1, NOW(), 'migration-V47'
FROM (VALUES
    ('Salud CADs', '/super/salud-cads', 'fa-solid fa-heart-pulse',    10),
    ('Tenants',    '/super/tenants',    'fa-solid fa-building-shield',20)
) AS v(descripcion, detalle, icono, posicion)
JOIN ctr_menu g ON g.tipo = 'GRUPO' AND g.descripcion = 'Super Admin'
WHERE NOT EXISTS (
    SELECT 1 FROM ctr_menu m WHERE m.idpadre = g.id_menu AND m.detalle = v.detalle
);

INSERT INTO ctr_menu (descripcion, idpadre, posicion, tipo, icono, vigente, detalle, usuario_creacion, fecha_creacion, maquina_creacion)
SELECT v.descripcion, g.id_menu, v.posicion, 'ENLACE', v.icono, 1, v.detalle, 1, NOW(), 'migration-V47'
FROM (VALUES
    ('Pedido (Jefe de Turno)', '/operacion/pedido',         'fa-solid fa-clipboard-list', 25),
    ('Reportes',               '/operacion/reportes',       'fa-solid fa-chart-column',   50),
    ('Mapa de Incidentes',     '/operacion/mapa-incidentes','fa-solid fa-map-location-dot',60),
    ('Mapa Estadístico',       '/operacion/mapa-estadistico','fa-solid fa-chart-area',    70)
) AS v(descripcion, detalle, icono, posicion)
JOIN ctr_menu g ON g.tipo = 'GRUPO' AND g.descripcion = 'Operación'
WHERE NOT EXISTS (
    SELECT 1 FROM ctr_menu m WHERE m.idpadre = g.id_menu AND m.detalle = v.detalle
);

-- ── 4. Permisos: Administrador (1) + SuperAdministrador (2) para todo,
--      salvo el grupo "Super Admin" y sus ítems (solo id_rol=2) ───────────
INSERT INTO ctr_menu_roles (id_rol, id_menu, usuario_creacion, fecha_creacion, maquina_creacion)
SELECT 1, m.id_menu, 1, NOW(), 'migration-V47'
FROM ctr_menu m
WHERE m.descripcion <> 'Super Admin'
  AND m.idpadre NOT IN (SELECT id_menu FROM ctr_menu WHERE descripcion = 'Super Admin' AND tipo = 'GRUPO')
  AND NOT EXISTS (SELECT 1 FROM ctr_menu_roles mr WHERE mr.id_menu = m.id_menu AND mr.id_rol = 1);

INSERT INTO ctr_menu_roles (id_rol, id_menu, usuario_creacion, fecha_creacion, maquina_creacion)
SELECT 2, m.id_menu, 1, NOW(), 'migration-V47'
FROM ctr_menu m
WHERE NOT EXISTS (SELECT 1 FROM ctr_menu_roles mr WHERE mr.id_menu = m.id_menu AND mr.id_rol = 2);
