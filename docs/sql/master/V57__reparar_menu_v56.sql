-- ══════════════════════════════════════════════════════════════════════════
-- V57: Deshacer el desorden que dejó V56 en ctr_menu
--
-- V56 estaba mal escrita, en dos puntos:
--
--   1. Buscaba el grupo padre con `tipo = 'GRUPO'`. En una base real ese
--      grupo puede tener tipo 'S' (es lo que usa la pantalla de
--      administración de menú al crearlo a mano). Al no encontrarlo, V56 hizo
--      lo que decía su propio código: CREAR UN SEGUNDO GRUPO «Administración»
--      y colgar de él los ítems. El menú acabó con dos grupos homónimos.
--
--      Ese mismo defecto es el que tenían V47, V50 y V52 —y la razón real de
--      que «Códigos de Caso» y «Proveedor SMS» nunca se sembraran—: no era la
--      tilde de la descripción, era el `tipo`.
--
--   2. Comprobaba la existencia con `AND vigente = 1`, así que las filas
--      DESACTIVADAS A PROPÓSITO las dio por ausentes y las duplicó. Es el
--      caso de «Dominios» y «Cuentas Email».
--
-- Esta migración repara ambas cosas. Solo toca filas cuya maquina_creacion
-- sea 'migration-V56': ninguna fila creada por el usuario o por otra
-- migración se modifica ni se borra. Idempotente.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_grupo_v56  BIGINT;
    v_grupo_real BIGINT;
    v_movidos    INT := 0;
    v_borrados   INT := 0;
    v_item       RECORD;
BEGIN
    -- ── 1. El grupo que creó V56 ──────────────────────────────────────────
    SELECT id_menu INTO v_grupo_v56
    FROM   ctr_menu
    WHERE  maquina_creacion = 'migration-V56'
      AND  detalle IS NULL
    ORDER  BY id_menu
    LIMIT  1;

    -- ── 2. El grupo de administración de verdad ───────────────────────────
    --  Se identifica por los hijos que ya tiene, no por su descripción ni por
    --  su tipo: es el único criterio que no depende de cómo lo hayan
    --  nombrado. Se excluye el que creó V56.
    SELECT m.idpadre INTO v_grupo_real
    FROM   ctr_menu m
    WHERE  m.detalle LIKE '/administracion/%'
      AND  m.maquina_creacion IS DISTINCT FROM 'migration-V56'
      AND  m.idpadre IS DISTINCT FROM v_grupo_v56
    GROUP  BY m.idpadre
    ORDER  BY COUNT(*) DESC, m.idpadre
    LIMIT  1;

    IF v_grupo_real IS NULL THEN
        RAISE NOTICE 'V57: no se encontró un grupo de administración previo; no se toca nada.';
        RETURN;
    END IF;

    RAISE NOTICE 'V57: grupo real = % · grupo creado por V56 = %',
                 v_grupo_real, COALESCE(v_grupo_v56::text, 'ninguno');

    -- ── 3. Repartir lo que creó V56 ───────────────────────────────────────
    --  Se conservan únicamente los dos módulos que de verdad faltaban; se
    --  reenganchan bajo el grupo real. Todo lo demás que V56 insertó se
    --  elimina: o duplicaba una fila existente (aunque estuviera
    --  desactivada), o era un ítem que nadie pidió.
    FOR v_item IN
        SELECT id_menu, descripcion, detalle
        FROM   ctr_menu
        WHERE  maquina_creacion = 'migration-V56'
          AND  detalle IS NOT NULL
    LOOP
        IF v_item.detalle IN ('/administracion/casos', '/administracion/sms')
           AND NOT EXISTS (
               SELECT 1 FROM ctr_menu o
               WHERE  o.detalle = v_item.detalle
                 AND  o.id_menu <> v_item.id_menu
                 AND  o.maquina_creacion IS DISTINCT FROM 'migration-V56'
           )
        THEN
            UPDATE ctr_menu
            SET    idpadre          = v_grupo_real,
                   tipo             = 'frm',   -- el tipo que usan sus hermanos
                   posicion         = CASE WHEN detalle = '/administracion/casos' THEN 11 ELSE 12 END,
                   -- Se re-marca para que una segunda pasada no vuelva a
                   -- procesar una fila ya reparada.
                   maquina_creacion = 'migration-V57'
            WHERE  id_menu = v_item.id_menu;
            v_movidos := v_movidos + 1;
            RAISE NOTICE 'V57: «%» reenganchado bajo el grupo %', v_item.descripcion, v_grupo_real;
        ELSE
            DELETE FROM ctr_menu_roles WHERE id_menu = v_item.id_menu;
            DELETE FROM ctr_menu       WHERE id_menu = v_item.id_menu;
            v_borrados := v_borrados + 1;
            RAISE NOTICE 'V57: «%» (%) eliminado — duplicaba una fila existente o no se había pedido',
                         v_item.descripcion, v_item.detalle;
        END IF;
    END LOOP;

    -- ── 4. Quitar el grupo sobrante si ya no cuelga nada de él ────────────
    IF v_grupo_v56 IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM ctr_menu WHERE idpadre = v_grupo_v56 AND id_menu <> v_grupo_v56)
    THEN
        DELETE FROM ctr_menu_roles WHERE id_menu = v_grupo_v56;
        DELETE FROM ctr_menu       WHERE id_menu = v_grupo_v56;
        RAISE NOTICE 'V57: grupo «Administración» duplicado (id %) eliminado.', v_grupo_v56;
    END IF;

    RAISE NOTICE 'V57: % reenganchado(s), % eliminado(s).', v_movidos, v_borrados;
END $$;

-- ── 4 bis. Sembrar «Códigos de Caso» y «Proveedor SMS» si aún faltan ──────
--  Para las bases donde V56 nunca se aplicó: V50 y V52 tampoco los crearon,
--  por el mismo defecto del `tipo`. Aquí el grupo se localiza por sus hijos,
--  y la existencia se comprueba por `detalle` SIN mirar `vigente`, para no
--  duplicar una fila que alguien haya desactivado a propósito.
DO $$
DECLARE
    v_grupo BIGINT;
    v_item  RECORD;
BEGIN
    SELECT m.idpadre INTO v_grupo
    FROM   ctr_menu m
    WHERE  m.detalle LIKE '/administracion/%'
    GROUP  BY m.idpadre
    ORDER  BY COUNT(*) DESC, m.idpadre
    LIMIT  1;

    IF v_grupo IS NULL THEN
        RAISE NOTICE 'V57: sin grupo de administración; no se siembra nada.';
        RETURN;
    END IF;

    FOR v_item IN
        SELECT * FROM (VALUES
            ('Códigos de Caso', '/administracion/casos', 'fa-solid fa-list-check',  11),
            ('Proveedor SMS',   '/administracion/sms',   'fa-solid fa-comment-sms', 12)
        ) AS v(descripcion, detalle, icono, posicion)
    LOOP
        IF NOT EXISTS (SELECT 1 FROM ctr_menu WHERE detalle = v_item.detalle) THEN
            INSERT INTO ctr_menu (descripcion, idpadre, posicion, tipo, icono, vigente, detalle,
                                  usuario_creacion, fecha_creacion, maquina_creacion)
            VALUES (v_item.descripcion, v_grupo, v_item.posicion, 'frm',
                    v_item.icono, 1, v_item.detalle, 1, NOW(), 'migration-V57');
            RAISE NOTICE 'V57: creado «%» bajo el grupo %', v_item.descripcion, v_grupo;
        END IF;
    END LOOP;
END $$;

-- ── 5. Volver a activar «Dominios» ────────────────────────────────────────
--  Estaba con vigente = 0 y por eso no salía en el menú. Se reactiva porque
--  se pidió expresamente. NO se tocan «Cuentas Email» ni «Formularios», que
--  también están desactivados: si están así, es porque alguien lo decidió, y
--  no se pidió cambiarlo.
UPDATE ctr_menu
SET    vigente = 1
WHERE  detalle = '/administracion/dominio'
  AND  vigente = 0;

-- ── 6. Permisos de los dos ítems conservados ──────────────────────────────
INSERT INTO ctr_menu_roles (id_rol, id_menu, usuario_creacion, fecha_creacion, maquina_creacion)
SELECT r.id_rol, m.id_menu, 1, NOW(), 'migration-V57'
FROM ctr_menu m
CROSS JOIN (VALUES (1),(2)) AS r(id_rol)
WHERE m.detalle IN ('/administracion/casos', '/administracion/sms')
  AND NOT EXISTS (
      SELECT 1 FROM ctr_menu_roles mr WHERE mr.id_menu = m.id_menu AND mr.id_rol = r.id_rol);

-- ── 7. Verificación ───────────────────────────────────────────────────────
SELECT m.id_menu, m.descripcion, m.idpadre, m.posicion, m.tipo, m.vigente, m.detalle
FROM   ctr_menu m
WHERE  m.detalle LIKE '/administracion/%' OR m.detalle IS NULL
ORDER  BY m.idpadre, m.posicion, m.id_menu;
