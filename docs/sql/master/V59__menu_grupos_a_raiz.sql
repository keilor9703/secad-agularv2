-- ═══════════════════════════════════════════════════════════════════════════
--  V59: Los grupos del menú vuelven a ser raíces
--
--  Apply to: EACH TENANT/CAD database (no a la maestra).
--
--  Síntoma: en el lateral, los módulos de Operación —Recepción, Eventos,
--  Pedido, Turnos, Bitácora, Reportes, Mapa de Incidentes y GIS— salían
--  sueltos en el primer nivel, sin su grupo «Operación», que no aparecía por
--  ninguna parte.
--
--  Causa: en ctr_menu conviven DOS convenciones para decir «esto va en el
--  nivel superior».
--
--    · V10 —la que sembró la tabla— dejó escrito en su cabecera:
--
--          idpadre = 0 → nodo raíz visible (el sidebar lo trata como top-level)
--          -- auto-referencia cuando idpadre = 0
--          UPDATE ctr_menu SET idpadre = v_id_operacion
--          WHERE id_menu = v_id_operacion;
--
--      Es decir: UNA RAÍZ SE APUNTA A SÍ MISMA. «Operación» quedó con
--      id_menu = 1, así que su fila correcta es idpadre = 1.
--
--    · V47 sembró «Administración» y «Super Admin» con idpadre = 1, dando por
--      hecho que el 1 era un centinela de «raíz» y no un grupo de verdad.
--      Con la convención de V10 eso significa, literalmente, «hijos de
--      Operación».
--
--  El frontend se había alineado con la segunda: descartaba el id 1 fuera
--  cual fuera y tomaba idpadre = 1 como nivel superior. Por eso «Operación»
--  no se pintaba y sus hijos subían al primer nivel, mientras que
--  «Administración» y «Super Admin» sí se veían bien... por accidente.
--
--  Se corrigen las dos mitades a la vez, porque por separado ninguna
--  funciona: el servicio de navegación pasa a reconocer la raíz por
--  autorreferencia (sin ids escritos a mano), y esta migración deja los
--  grupos que van arriba apuntándose a sí mismos.
--
--  Idempotente: la fila que ya se autorreferencia no entra en el UPDATE.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Los grupos colgados de otra raíz pasan a ser raíces ────────────────
--  Solo se promueven los grupos cuyo padre es, a su vez, una raíz: así un
--  submenú de verdad —un grupo dentro de un grupo que no es raíz— se queda
--  donde está. Los ENLACE no se tocan: los de Operación siguen colgando de
--  ella, que es donde deben estar.
UPDATE ctr_menu AS hijo
SET    idpadre = hijo.id_menu
FROM   ctr_menu AS padre
WHERE  hijo.tipo    = 'GRUPO'
  AND  hijo.idpadre <> hijo.id_menu
  AND  padre.id_menu = hijo.idpadre
  AND  padre.idpadre = padre.id_menu;

-- ── 2. «Cuentas Email» duplicada bajo Super Admin ─────────────────────────
--  Hay dos filas con el mismo destino /administracion/cuentas-email: una en
--  el grupo de Administración, que es su sitio, y otra colgada de Super
--  Admin. No son hermanas, así que la unificación de hermanos de V58 no la
--  alcanzó, y el resultado es la misma pantalla ofrecida desde dos grupos
--  distintos.
--
--  Se DESACTIVA la que está fuera de su grupo, no se borra: si resulta que
--  se quería ahí a propósito, se revierte con una línea —
--      UPDATE ctr_menu SET vigente = 1 WHERE id_menu = <el que salga abajo>;
--  El grupo de administración se identifica por sus hijos, no por su nombre
--  ni por su tipo, que es el único criterio que no depende de cómo lo hayan
--  bautizado (mismo criterio que usa V57).
DO $$
DECLARE
    v_grupo_admin BIGINT;
    v_fila        RECORD;
BEGIN
    SELECT m.idpadre INTO v_grupo_admin
    FROM   ctr_menu m
    WHERE  m.detalle LIKE '/administracion/%'
    GROUP  BY m.idpadre
    ORDER  BY COUNT(*) DESC, m.idpadre
    LIMIT  1;

    IF v_grupo_admin IS NULL THEN
        RAISE NOTICE 'V59: sin grupo de administración; no se toca nada.';
        RETURN;
    END IF;

    FOR v_fila IN
        SELECT id_menu, descripcion, idpadre, detalle
        FROM   ctr_menu
        WHERE  detalle LIKE '/administracion/%'
          AND  idpadre <> v_grupo_admin
          AND  vigente = 1
          -- Solo si la MISMA pantalla ya está publicada en su grupo.
          AND  EXISTS (SELECT 1 FROM ctr_menu ok
                       WHERE ok.detalle = ctr_menu.detalle
                         AND ok.idpadre = v_grupo_admin
                         AND ok.vigente = 1)
    LOOP
        UPDATE ctr_menu SET vigente = 0 WHERE id_menu = v_fila.id_menu;
        RAISE NOTICE 'V59: «%» (id %, destino %) desactivada — duplicaba la del grupo %',
                     v_fila.descripcion, v_fila.id_menu, v_fila.detalle, v_grupo_admin;
    END LOOP;
END $$;

-- ── 3. Verificación ───────────────────────────────────────────────────────
--  Debe salir un puñado de raíces (los grupos) y, colgando de cada una, sus
--  pantallas.
SELECT CASE WHEN m.idpadre = m.id_menu THEN '(raíz)' ELSE '   └─' END AS nivel,
       m.id_menu, m.idpadre, m.posicion, m.tipo, m.vigente,
       m.descripcion, m.detalle
FROM   ctr_menu m
WHERE  m.vigente = 1
ORDER  BY CASE WHEN m.idpadre = m.id_menu THEN m.id_menu ELSE m.idpadre END,
          m.idpadre = m.id_menu DESC,
          m.posicion, m.id_menu;
