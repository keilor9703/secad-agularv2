-- ═══════════════════════════════════════════════════════════════════════════
--  V70: el sitio de grabación pasa a ser un catálogo administrable
--
--  Apply to: EACH TENANT/CAD database (no a la maestra).
--
--  Qué es un sitio de grabación
--  ────────────────────────────
--  Un tenant es el CAD FÍSICO. Un sitio de grabación es la UNIDAD POLICIAL
--  que opera dentro de ese CAD. No son lo mismo: hay municipios que no
--  pueden montar un CAD con todo su equipamiento, así que dos unidades
--  vecinas comparten la sala. En Barranquilla, por ejemplo, el mismo CAD
--  aloja dos sitios: MEBAR (Metropolitana de Barranquilla) y DEATA
--  (Departamento de Atlántico). Comparten instalación; sus registros no se
--  pueden mezclar.
--
--  Por eso el sitio marca al usuario (ctr_usuarios.sitio_grabacion), a la
--  fuerza (cad_fuerzas.sitio_graba) y, a través de ellos, todo lo que se
--  recibe y se despacha.
--
--  El problema que resuelve esta migración
--  ───────────────────────────────────────
--  La tabla existe desde V4 con dos columnas (consecutivo, descripcion) y
--  V31 le añadió cod_dane, pero NUNCA tuvo pantalla: el único modo de dar
--  de alta un sitio era un INSERT a mano documentado en docs/nuevo-tenant.md.
--  Y sin catálogo administrable tampoco había forma de asignarle un sitio a
--  un usuario desde el sistema.
--
--  Aquí se le agrega lo que le falta para ser un catálogo como los demás:
--  una abreviatura (MEBAR, DEATA — es como se nombran en la práctica) y
--  vigencia, para poder retirar un sitio sin borrar el histórico que lo
--  referencia.
--
--  Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE cad_sitios_grabacion
    ADD COLUMN IF NOT EXISTS abreviatura VARCHAR(20);

ALTER TABLE cad_sitios_grabacion
    ADD COLUMN IF NOT EXISTS vigente CHAR(1) NOT NULL DEFAULT 'S';

COMMENT ON COLUMN cad_sitios_grabacion.abreviatura IS
    'Sigla de la unidad policial: MEBAR, DEATA, MEBOG… Es como se la nombra '
    'en la operación y es lo que se muestra junto a los registros.';

COMMENT ON COLUMN cad_sitios_grabacion.vigente IS
    'S = el sitio opera hoy y se puede asignar. N = retirado; se conserva '
    'porque los registros históricos apuntan a él, pero ya no se ofrece.';

-- Los sitios que ya existían quedan vigentes (el DEFAULT solo aplica a las
-- filas nuevas cuando la columna se crea con NOT NULL DEFAULT, pero si la
-- columna ya existía de una pasada anterior alguien pudo dejar nulos).
UPDATE cad_sitios_grabacion SET vigente = 'S' WHERE vigente IS NULL;


-- ── Ítem de menú ───────────────────────────────────────────────────────────
-- Mismo patrón que V50/V52: buscar el grupo Administración, insertar si no
-- está, y dar acceso a los roles administrativos que el propio CAD declara
-- (V69: ctr_roles.es_admin), no a un id fijo.
--
-- El tipo es 'S', no 'ENLACE'. V62 unificó el vocabulario de ctr_menu.tipo
-- justamente para quitar ese segundo término, y como V70 corre DESPUÉS ya no
-- hay nada que lo normalice: una fila 'ENLACE' aquí quedaría fuera del
-- vocabulario y con ella la pantalla queda inalcanzable para el guardián de
-- rutas del frontend.
DO $$
DECLARE
    v_id_admin BIGINT;
BEGIN
    SELECT id_menu INTO v_id_admin
      FROM ctr_menu
     WHERE tipo = 'GRUPO' AND descripcion = 'Administración'
     LIMIT 1;

    IF v_id_admin IS NOT NULL THEN
        INSERT INTO ctr_menu (descripcion, idpadre, posicion, tipo, icono, vigente, detalle,
                              usuario_creacion, fecha_creacion, maquina_creacion)
        SELECT 'Sitios de grabación', v_id_admin, 12, 'S', 'fa-solid fa-tower-cell', 1,
               '/administracion/sitios-grabacion', 1, NOW(), 'migration-V70'
        WHERE NOT EXISTS (
            SELECT 1 FROM ctr_menu m
             WHERE m.idpadre = v_id_admin
               AND m.detalle = '/administracion/sitios-grabacion'
        );
    END IF;
END $$;

-- Reparación por si una versión anterior de este mismo script alcanzó a
-- insertar la fila con el tipo viejo.
UPDATE ctr_menu
SET    tipo = 'S'
WHERE  detalle = '/administracion/sitios-grabacion'
  AND  tipo = 'ENLACE';

INSERT INTO ctr_menu_roles (id_rol, id_menu, usuario_creacion, fecha_creacion, maquina_creacion)
SELECT r.id_rol, m.id_menu, 1, NOW(), 'migration-V70'
FROM ctr_menu m
CROSS JOIN ctr_roles r
WHERE m.detalle = '/administracion/sitios-grabacion'
  AND r.es_admin = 1
  AND NOT EXISTS (
      SELECT 1 FROM ctr_menu_roles mr
       WHERE mr.id_menu = m.id_menu AND mr.id_rol = r.id_rol
  );
