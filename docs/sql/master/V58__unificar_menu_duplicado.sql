-- ══════════════════════════════════════════════════════════════════════════
-- V58: Unificar los ítems de menú que llevan al mismo sitio
--
-- ctr_menu arrastra años de edición manual y de migraciones sucesivas, así
-- que hay módulos con dos filas hermanas apuntando al mismo destino: en
-- Operación conviven «Turnos» dos veces, «Pedido» dos veces y
-- «Anotaciones» junto a «Bitácora de Turno». El lateral nuevo ya los une al
-- pintarlos, pero en la tabla siguen estorbando: se ven duplicados en
-- Administración → Menú y hay que mantener sus permisos por partida doble.
--
-- Qué hace, por cada grupo de hermanos que comparten destino:
--
--   · CONSERVA la fila más antigua (menor id_menu). Es la que el usuario creó
--     y a la que dio su posición en el menú, de modo que el orden no cambia.
--   · Le corrige el `detalle` a la forma canónica —con barra inicial y sin
--     barra final—, porque varias se guardaron como 'operacion/turnos'.
--   · Si la fila conservada NO TIENE ÍCONO, adopta el ícono y la descripción
--     de la copia que sí los trae. Una fila sin ícono es una fila creada a
--     medias; la de la migración lleva el nombre correcto de la pantalla
--     (así «Anotaciones» pasa a llamarse «Bitácora de Turno»).
--   · Traslada a la fila conservada los permisos de rol que solo tuviera la
--     copia, para no perder accesos.
--   · ELIMINA la copia.
--
-- Solo compara filas VIGENTES y HERMANAS (mismo idpadre): dos entradas al
-- mismo sitio desde grupos distintos pueden ser intencionadas.
-- Idempotente: si no hay duplicados, no hace nada.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_grupo    RECORD;
    v_conserva RECORD;
    v_copia    RECORD;
    v_unidos   INT := 0;
BEGIN
    -- Rutas equivalentes: el frontend resuelve la primera a la segunda, así
    -- que para quien mira el menú son el mismo módulo.
    CREATE TEMP TABLE IF NOT EXISTS v58_alias(de TEXT, a TEXT) ON COMMIT DROP;
    DELETE FROM v58_alias;
    INSERT INTO v58_alias VALUES
        ('/operacion/anotaciones',      '/operacion/anotaciones-turno'),
        ('/admin-multimedia',           '/administracion/configuracion-sistema'),
        ('/video-unidad',               '/administracion/configuracion-sistema'),
        ('/configuracion-imagen-sitio', '/administracion/configuracion-sistema');

    FOR v_grupo IN
        WITH normalizado AS (
            SELECT m.id_menu, m.idpadre, m.icono, m.descripcion, m.maquina_creacion,
                   RTRIM(CASE WHEN LEFT(TRIM(m.detalle), 1) = '/'
                              THEN TRIM(m.detalle)
                              ELSE '/' || TRIM(m.detalle) END, '/') AS ruta
            FROM   ctr_menu m
            WHERE  m.vigente = 1
              AND  COALESCE(TRIM(m.detalle), '') <> ''
              AND  m.detalle !~* '^(https?://|www\.|mailto:|tel:)'
        ),
        resuelto AS (
            SELECT n.*, COALESCE((SELECT a.a FROM v58_alias a WHERE a.de = n.ruta), n.ruta) AS destino
            FROM   normalizado n
        )
        SELECT idpadre, destino, MIN(id_menu) AS conservar, COUNT(*) AS cuantos
        FROM   resuelto
        GROUP  BY idpadre, destino
        HAVING COUNT(*) > 1
        ORDER  BY idpadre, MIN(id_menu)
    LOOP
        SELECT * INTO v_conserva FROM ctr_menu WHERE id_menu = v_grupo.conservar;

        -- Ruta canónica en la fila que se queda.
        UPDATE ctr_menu
        SET    detalle = RTRIM(CASE WHEN LEFT(TRIM(detalle), 1) = '/'
                                    THEN TRIM(detalle)
                                    ELSE '/' || TRIM(detalle) END, '/')
        WHERE  id_menu = v_grupo.conservar
          AND  detalle <> RTRIM(CASE WHEN LEFT(TRIM(detalle), 1) = '/'
                                     THEN TRIM(detalle)
                                     ELSE '/' || TRIM(detalle) END, '/');

        FOR v_copia IN
            WITH normalizado AS (
                SELECT m.id_menu, m.idpadre, m.icono, m.descripcion,
                       RTRIM(CASE WHEN LEFT(TRIM(m.detalle), 1) = '/'
                                  THEN TRIM(m.detalle)
                                  ELSE '/' || TRIM(m.detalle) END, '/') AS ruta
                FROM   ctr_menu m
                WHERE  m.vigente = 1
                  AND  COALESCE(TRIM(m.detalle), '') <> ''
            )
            SELECT n.id_menu, n.icono, n.descripcion
            FROM   normalizado n
            WHERE  n.idpadre = v_grupo.idpadre
              AND  COALESCE((SELECT a.a FROM v58_alias a WHERE a.de = n.ruta), n.ruta) = v_grupo.destino
              AND  n.id_menu <> v_grupo.conservar
            ORDER  BY n.id_menu
        LOOP
            -- La fila conservada se queda sin ícono → toma nombre e ícono de
            -- la copia, que es la que los trae completos.
            IF COALESCE(TRIM(v_conserva.icono), '') = ''
               AND COALESCE(TRIM(v_copia.icono), '') <> '' THEN
                UPDATE ctr_menu
                SET    icono       = v_copia.icono,
                       descripcion = v_copia.descripcion
                WHERE  id_menu = v_grupo.conservar;
                RAISE NOTICE 'V58: «%» toma nombre e ícono de «%»',
                             v_conserva.descripcion, v_copia.descripcion;
                SELECT * INTO v_conserva FROM ctr_menu WHERE id_menu = v_grupo.conservar;
            END IF;

            -- Permisos que solo tenía la copia.
            INSERT INTO ctr_menu_roles (id_rol, id_menu, usuario_creacion, fecha_creacion, maquina_creacion)
            SELECT mr.id_rol, v_grupo.conservar, 1, NOW(), 'migration-V58'
            FROM   ctr_menu_roles mr
            WHERE  mr.id_menu = v_copia.id_menu
              AND  NOT EXISTS (SELECT 1 FROM ctr_menu_roles x
                               WHERE x.id_menu = v_grupo.conservar AND x.id_rol = mr.id_rol);

            DELETE FROM ctr_menu_roles WHERE id_menu = v_copia.id_menu;
            DELETE FROM ctr_menu       WHERE id_menu = v_copia.id_menu;
            v_unidos := v_unidos + 1;
            RAISE NOTICE 'V58: eliminada la copia % («%») → se queda la %',
                         v_copia.id_menu, v_copia.descripcion, v_grupo.conservar;
        END LOOP;
    END LOOP;

    RAISE NOTICE 'V58: % copia(s) eliminada(s).', v_unidos;
END $$;

-- ── Verificación ──────────────────────────────────────────────────────────
SELECT m.id_menu, m.descripcion, m.idpadre, m.posicion, m.icono, m.detalle
FROM   ctr_menu m
WHERE  m.vigente = 1
ORDER  BY m.idpadre, m.posicion, m.id_menu;
