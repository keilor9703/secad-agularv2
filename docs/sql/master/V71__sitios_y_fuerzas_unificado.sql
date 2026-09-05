-- ═══════════════════════════════════════════════════════════════════════════
--  V71: la fuerza vive dentro de un sitio de grabación, y se administra ahí
--
--  Apply to: EACH TENANT/CAD database (no a la maestra).
--
--  Qué cambia y por qué
--  ────────────────────
--  V70 le dio pantalla propia al catálogo de sitios de grabación. Al usarlo
--  quedó claro que sobraba una pantalla: una fuerza NUNCA está fuera de una
--  unidad policial, así que el sitio no es un catálogo hermano de Entidades
--  sino el nivel de arriba. Los dos módulos se unen en uno:
--
--      Administración → Sitios de grabación y fuerzas
--
--  Se elige la unidad y se ven SUS fuerzas. El catálogo de sitios pasa a ser
--  una vista dentro del mismo módulo, y el ítem suelto se retira (mismo
--  patrón que V64 con Proveedor SMS).
--
--  El problema de arranque
--  ───────────────────────
--  En un CAD que ya venía trabajando, cad_fuerzas.sitio_graba vale 0 en todas
--  las filas: hasta V70 el valor salía del claim del administrador, y un
--  administrador sin unidad asignada tiene claim 0. Si la pantalla se pusiera
--  a filtrar por sitio sin más, se vería vacía.
--
--  Esta migración clasifica lo que se puede clasificar SIN adivinar:
--
--    · CAD con exactamente un sitio vigente → todo va a ese sitio. No hay
--      ambigüedad posible.
--    · CAD con varios (Barranquilla: MEBAR y DEATA) → no se toca nada. El
--      reparto lo hace una persona desde la pestaña «Sin clasificar», que
--      trae un botón para mover en bloque.
--    · CAD sin sitios todavía → tampoco se toca. Primero hay que registrarlos.
--
--  Fuerzas y usuarios se mueven JUNTOS, y esto no es un detalle: Recepción
--  filtra los canales con `f.sitio_graba = @sitio del usuario`, sin escape a 0
--  (a diferencia de Turnos y Pedidos, que sí lo tienen). Clasificar las
--  fuerzas y dejar a los despachadores en el sitio viejo los deja sin ver
--  canal alguno.
--
--  Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Clasificar lo que no admite duda ────────────────────────────────────
DO $$
DECLARE
    v_sitios   INTEGER;
    v_sitio    INTEGER;
    v_fuerzas  INTEGER;
    v_usuarios INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_sitios
      FROM cad_sitios_grabacion
     WHERE COALESCE(vigente, 'S') = 'S';

    IF v_sitios = 1 THEN
        SELECT consecutivo INTO v_sitio
          FROM cad_sitios_grabacion
         WHERE COALESCE(vigente, 'S') = 'S';

        UPDATE cad_fuerzas SET sitio_graba = v_sitio
         WHERE COALESCE(sitio_graba, 0) = 0;
        GET DIAGNOSTICS v_fuerzas = ROW_COUNT;

        UPDATE ctr_usuarios SET sitio_grabacion = v_sitio
         WHERE COALESCE(sitio_grabacion, 0) = 0;
        GET DIAGNOSTICS v_usuarios = ROW_COUNT;

        RAISE NOTICE 'V71: un solo sitio (%). Clasificadas % fuerza(s) y % usuario(s).',
                     v_sitio, v_fuerzas, v_usuarios;

    ELSIF v_sitios = 0 THEN
        RAISE NOTICE 'V71: este CAD no tiene sitios de grabación. Regístrelos en '
                     'Administración → Sitios de grabación y fuerzas y asigne las '
                     'fuerzas desde la pestaña «Sin clasificar».';
    ELSE
        RAISE NOTICE 'V71: este CAD tiene % sitios. No se clasifica nada por '
                     'adivinanza: reparta las fuerzas desde la pestaña «Sin '
                     'clasificar» del módulo.', v_sitios;
    END IF;
END $$;


-- ── 2. Retirar el ítem de menú suelto ──────────────────────────────────────
-- Mismo patrón que V64: el módulo se integró en otro, así que el ítem se
-- desactiva en vez de borrarse, para no dejar huérfanas sus filas de
-- ctr_menu_roles ni el histórico de quién lo tenía.
UPDATE ctr_menu
   SET vigente     = 0,
       descripcion = 'Sitios de grabación (integrado en Entidades / Fuerzas)'
 WHERE detalle = '/administracion/sitios-grabacion'
   AND vigente = 1;


-- ── 3. Renombrar el módulo que los alberga a los dos ───────────────────────
-- Quien busque «sitios de grabación» en el menú después de este cambio tiene
-- que encontrarlo. El nombre viejo solo hablaba de la mitad de abajo.
UPDATE ctr_menu
   SET descripcion = 'Sitios de grabación y fuerzas'
 WHERE detalle = '/administracion/entidades'
   AND descripcion <> 'Sitios de grabación y fuerzas';


-- ── 4. Cerrar la puerta, pero solo si ya está todo dentro ──────────────────
-- La clave foránea es lo que impide que vuelva a existir una fuerza apuntando
-- a una unidad inexistente. Se añade únicamente cuando NINGUNA fila la
-- violaría; en un CAD a medio clasificar el bloque no hace nada y la próxima
-- pasada de esta misma migración la creará. Por eso es segura de repetir.
--
-- Sobre ctr_usuarios.sitio_grabacion NO se pone: ahí el 0 es legítimo. Un
-- superadministrador conmutando de contexto recibe sitio 0 a propósito
-- (no pertenece a ninguna unidad del CAD), y una restricción lo rompería.
DO $$
DECLARE
    v_huerfanas INTEGER;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cad_fuerzas_sitio') THEN
        RAISE NOTICE 'V71: la clave foránea ya existe. Nada que hacer.';
        RETURN;
    END IF;

    SELECT COUNT(*) INTO v_huerfanas
      FROM cad_fuerzas f
     WHERE NOT EXISTS (SELECT 1 FROM cad_sitios_grabacion s
                        WHERE s.consecutivo = f.sitio_graba);

    IF v_huerfanas = 0 THEN
        ALTER TABLE cad_fuerzas
            ADD CONSTRAINT fk_cad_fuerzas_sitio
            FOREIGN KEY (sitio_graba) REFERENCES cad_sitios_grabacion(consecutivo);

        RAISE NOTICE 'V71: clave foránea cad_fuerzas.sitio_graba → cad_sitios_grabacion creada. '
                     'A partir de ahora una fuerza no puede existir fuera de una unidad.';
    ELSE
        RAISE NOTICE 'V71: quedan % fuerza(s) apuntando a un sitio que no existe, así que la '
                     'clave foránea NO se crea todavía. Repártalas desde la pestaña «Sin '
                     'clasificar» y vuelva a pasar esta migración.', v_huerfanas;
    END IF;
END $$;
