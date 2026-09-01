-- ══════════════════════════════════════════════════════════════════════════
-- V56: Asegurar los ítems de Administración que V47/V50/V52 pudieron no crear
--
-- SÍNTOMA: en el menú de la versión nueva faltan «Códigos de Caso»,
-- «Dominios» y «Proveedor SMS», aunque sus pantallas existen y sus rutas
-- están declaradas.
--
-- CAUSA: V47, V50 y V52 localizan el grupo padre con
--     WHERE tipo = 'GRUPO' AND descripcion = 'Administración'
-- es decir, comparando la descripción LETRA POR LETRA. En una base cuyo
-- grupo se llame «Administracion» (sin tilde), «ADMINISTRACIÓN» o traiga un
-- espacio de más —cosa normal en una tabla con años de edición manual— esa
-- consulta no encuentra nada: v_id_admin queda NULL, el IF no entra y el
-- script TERMINA BIEN SIN INSERTAR NADA. No hay error que delate el fallo,
-- así que la migración parece aplicada.
--
-- Esta migración repara eso: busca el grupo sin distinguir mayúsculas ni
-- tildes, lo crea si de verdad no existe, y siembra los ítems que falten.
-- Idempotente: si ya están, no toca nada.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_id_admin BIGINT;
    v_id_raiz  BIGINT;
    v_creados  INT := 0;
    v_item     RECORD;
BEGIN
    -- ── 1. Buscar el grupo tolerando tildes, mayúsculas y espacios ────────
    --  unaccent no está disponible en todos los tenants, así que se traducen
    --  a mano las vocales acentuadas, que es lo único que aparece aquí.
    SELECT id_menu INTO v_id_admin
    FROM   ctr_menu
    WHERE  tipo = 'GRUPO'
      AND  TRANSLATE(LOWER(TRIM(descripcion)), 'áéíóúü', 'aeiouu') = 'administracion'
      AND  vigente = 1
    ORDER  BY id_menu
    LIMIT  1;

    IF v_id_admin IS NULL THEN
        SELECT id_menu INTO v_id_raiz FROM ctr_menu WHERE id_menu = 1;

        INSERT INTO ctr_menu (descripcion, idpadre, posicion, tipo, icono, vigente, detalle,
                              usuario_creacion, fecha_creacion, maquina_creacion)
        VALUES ('Administración', COALESCE(v_id_raiz, 0), 10, 'GRUPO',
                'fa-solid fa-gear', 1, NULL, 1, NOW(), 'migration-V56')
        RETURNING id_menu INTO v_id_admin;

        IF v_id_raiz IS NULL THEN
            UPDATE ctr_menu SET idpadre = v_id_admin WHERE id_menu = v_id_admin;
        END IF;

        RAISE NOTICE 'V56: no había grupo Administración; creado con id = %', v_id_admin;
    ELSE
        RAISE NOTICE 'V56: grupo Administración encontrado con id = % (descripción: %)',
                     v_id_admin, (SELECT descripcion FROM ctr_menu WHERE id_menu = v_id_admin);
    END IF;

    -- ── 2. Sembrar los ítems que falten ───────────────────────────────────
    --  Se comprueba por `detalle`, que es lo que identifica al destino; la
    --  descripción puede haberse editado desde la pantalla de menú.
    FOR v_item IN
        SELECT * FROM (VALUES
            ('Usuarios',              '/administracion/usuarios',              'fa-solid fa-users',        10),
            ('Roles',                 '/administracion/roles',                 'fa-solid fa-shield-halved',20),
            ('Menú',                  '/administracion/menu',                  'fa-solid fa-bars',         30),
            ('Configuración',         '/administracion/configuracion-sistema', 'fa-solid fa-sliders',      40),
            ('Códigos de Caso',       '/administracion/casos',                 'fa-solid fa-list-check',   45),
            ('Proveedor SMS',         '/administracion/sms',                   'fa-solid fa-comment-sms',  46),
            ('Línea de Mando',        '/administracion/linea-mando',           'fa-solid fa-sitemap',      50),
            ('Dominios',              '/administracion/dominio',               'fa-solid fa-globe',        60),
            ('Cuentas Email',         '/administracion/cuentas-email',         'fa-solid fa-envelope',     70),
            ('Asistente Inteligente', '/administracion/asistente',             'fa-solid fa-robot',        80),
            ('Entidades / Fuerzas',   '/administracion/entidades',             'fa-solid fa-building-shield', 85),
            ('Agencias Externas',     '/administracion/agencias-externas',     'fa-solid fa-tower-cell',   90),
            ('Hub de Integraciones',  '/administracion/integraciones',         'fa-solid fa-plug',         95)
        ) AS v(descripcion, detalle, icono, posicion)
    LOOP
        IF NOT EXISTS (SELECT 1 FROM ctr_menu WHERE detalle = v_item.detalle AND vigente = 1) THEN
            INSERT INTO ctr_menu (descripcion, idpadre, posicion, tipo, icono, vigente, detalle,
                                  usuario_creacion, fecha_creacion, maquina_creacion)
            VALUES (v_item.descripcion, v_id_admin, v_item.posicion, 'ENLACE',
                    v_item.icono, 1, v_item.detalle, 1, NOW(), 'migration-V56');
            v_creados := v_creados + 1;
            RAISE NOTICE 'V56: creado «%» → %', v_item.descripcion, v_item.detalle;
        END IF;
    END LOOP;

    RAISE NOTICE 'V56: % ítem(s) de Administración creados.', v_creados;
END $$;

-- ── 3. Otorgar los ítems de Administración a los roles 1 y 2 ──────────────
INSERT INTO ctr_menu_roles (id_rol, id_menu, usuario_creacion, fecha_creacion, maquina_creacion)
SELECT r.id_rol, m.id_menu, 1, NOW(), 'migration-V56'
FROM ctr_menu m
CROSS JOIN (VALUES (1),(2)) AS r(id_rol)
WHERE m.detalle LIKE '/administracion/%'
  AND m.vigente = 1
  AND NOT EXISTS (
      SELECT 1 FROM ctr_menu_roles mr WHERE mr.id_menu = m.id_menu AND mr.id_rol = r.id_rol
  );

-- ── 4. Verificación ───────────────────────────────────────────────────────
SELECT m.id_menu, m.descripcion, m.detalle, m.posicion, m.vigente, m.maquina_creacion
FROM   ctr_menu m
WHERE  m.detalle LIKE '/administracion/%'
ORDER  BY m.posicion, m.id_menu;
