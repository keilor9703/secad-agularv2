-- ══════════════════════════════════════════════════════════════════════════════
-- V76: cad_camaras acepta el censo institucional de cámaras CCTV
--
-- El inventario nacional de cámaras lo lleva OTRO sistema institucional, no el
-- VMS. De ahí sale un censo con ~29.000 cámaras (unidad policial, municipio,
-- nombre, número, dirección, coordenadas y si está operativa), y de ahí salen
-- las COORDENADAS, que la OpenAPI de HikCentral no expone para cámaras fijas
-- (§5 del diseño técnico).
--
-- Eso obliga a un cambio de modelo. V44 asumió que una cámara existe porque el
-- VMS la reporta —`integracion_id` NOT NULL—, pero en la realidad son dos
-- hechos distintos sobre la misma cámara:
--
--   · EXISTE y está en tal sitio          → lo dice el censo institucional.
--   · Se puede VER el video               → lo dice el VMS, si la conoce.
--
-- Un municipio puede tener 200 cámaras censadas y un HikCentral que solo
-- administra 80. Las otras 120 siguen siendo útiles: el despachador ve dónde
-- están y sabe que existen, aunque no pueda reproducirlas. Con la FK
-- obligatoria no había forma de guardarlas.
--
-- Por eso `integracion_id` pasa a ser opcional y la tabla gana las columnas del
-- censo. Una sola tabla y no dos: es una sola cámara del mundo real, con un
-- registro de inventario y, cuando se logra emparejar, un enlace al VMS.
--
-- Base: TENANT (una por CAD).
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'cad_camaras') THEN
        RAISE NOTICE 'V76: no existe cad_camaras (falta V44) — nada que hacer.';
        RETURN;
    END IF;

    -- ── 1. El enlace con el VMS deja de ser obligatorio ──────────────────────
    ALTER TABLE cad_camaras ALTER COLUMN integracion_id DROP NOT NULL;

    -- camara_codigo es el id EN EL VMS. Una cámara solo censada no lo tiene
    -- todavía; se rellena al emparejarla.
    ALTER TABLE cad_camaras ALTER COLUMN camara_codigo DROP NOT NULL;

    -- El UNIQUE (integracion_id, camara_codigo) de V44 ya no basta: en Postgres
    -- los NULL no chocan entre sí, así que dejaría entrar infinitas cámaras sin
    -- emparejar. Se reemplaza por un índice parcial sobre las que sí tienen VMS.
    ALTER TABLE cad_camaras DROP CONSTRAINT IF EXISTS cad_camaras_integracion_id_camara_codigo_key;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_camaras_vms
        ON cad_camaras (integracion_id, camara_codigo)
        WHERE integracion_id IS NOT NULL AND camara_codigo IS NOT NULL;

    -- Borrar la integración ya no puede llevarse la cámara por delante. V44 la
    -- puso ON DELETE CASCADE porque sin VMS la fila no tenía sentido; ahora sí
    -- lo tiene: la cámara existe en el inventario aunque se dé de baja el
    -- HikCentral que la reproducía. Pierde el enlace, no el registro.
    ALTER TABLE cad_camaras DROP CONSTRAINT IF EXISTS cad_camaras_integracion_id_fkey;
    ALTER TABLE cad_camaras
        ADD CONSTRAINT cad_camaras_integracion_id_fkey
        FOREIGN KEY (integracion_id) REFERENCES cad_camara_integracion(id)
        ON DELETE SET NULL;

    -- ── 2. Columnas del censo ────────────────────────────────────────────────
    -- Unidad policial dueña de la cámara (MEBOG, METUN…). Es la misma noción
    -- que sitio_graba en el resto de SECAD y es lo que decide qué cámaras ve
    -- cada CAD: Recepción y Eventos filtran estrictamente por unidad.
    ALTER TABLE cad_camaras ADD COLUMN IF NOT EXISTS unidad         VARCHAR(16);
    ALTER TABLE cad_camaras ADD COLUMN IF NOT EXISTS sitio_graba    INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE cad_camaras ADD COLUMN IF NOT EXISTS region         VARCHAR(16);
    ALTER TABLE cad_camaras ADD COLUMN IF NOT EXISTS departamento   VARCHAR(80);
    ALTER TABLE cad_camaras ADD COLUMN IF NOT EXISTS municipio      VARCHAR(120);
    -- Número/identificador local de la cámara en el censo ("32", "CAM 40"). No
    -- es numérico en todas las unidades, por eso va como texto.
    ALTER TABLE cad_camaras ADD COLUMN IF NOT EXISTS numero_censo   VARCHAR(40);
    ALTER TABLE cad_camaras ADD COLUMN IF NOT EXISTS direccion      VARCHAR(300);
    -- ESTADOFUNCIONAMIENTO del censo. Distinto de `estado`, que es el
    -- online/offline que reporta el VMS en vivo: una cámara puede estar dada de
    -- alta y operativa en el inventario y estar caída ahora mismo.
    ALTER TABLE cad_camaras ADD COLUMN IF NOT EXISTS operativa      BOOLEAN;
    -- Corte (ANIO/MES) del censo del que salió la fila. Dice qué tan vieja es
    -- la información y permite que una recarga solo pise lo más antiguo.
    ALTER TABLE cad_camaras ADD COLUMN IF NOT EXISTS censo_periodo  DATE;
    -- De dónde salió la fila: 'CENSO' (inventario institucional), 'VMS'
    -- (descubierta sincronizando) o 'MANUAL' (la cargó un administrador).
    ALTER TABLE cad_camaras ADD COLUMN IF NOT EXISTS origen         VARCHAR(12) NOT NULL DEFAULT 'CENSO';
    -- Cómo se recuperó la coordenada del censo: 'directa', 'por departamento'
    -- (hubo que desambiguar) o 'volteada' (lat/lon venían intercambiadas). El
    -- export de origen trae las coordenadas sin punto decimal, así que conviene
    -- poder auditar de dónde salió cada punto del mapa.
    ALTER TABLE cad_camaras ADD COLUMN IF NOT EXISTS coord_calidad  VARCHAR(20);

    COMMENT ON COLUMN cad_camaras.unidad IS
        'Unidad policial del censo (MEBOG, METUN…). Es la que decide qué cámaras '
        've cada CAD.';
    COMMENT ON COLUMN cad_camaras.operativa IS
        'ESTADOFUNCIONAMIENTO del inventario. NO es el online/offline en vivo del '
        'VMS, que va en la columna estado.';
    COMMENT ON COLUMN cad_camaras.origen IS
        'CENSO = inventario institucional · VMS = descubierta al sincronizar · '
        'MANUAL = cargada por un administrador.';

    -- Clave natural del censo: no trae id propio, pero unidad + municipio +
    -- número + nombre sí identifica una cámara (verificado sobre las 29.127
    -- filas del archivo). Es lo que hace repetible la siembra.
    CREATE UNIQUE INDEX IF NOT EXISTS ux_camaras_censo
        ON cad_camaras (unidad, municipio, numero_censo, nombre)
        WHERE origen = 'CENSO';

    -- El despachador siempre pregunta lo mismo: cámaras de MI unidad, activas,
    -- con coordenada, ordenadas por distancia al caso.
    CREATE INDEX IF NOT EXISTS idx_camaras_unidad_geo
        ON cad_camaras (unidad, latitud, longitud)
        WHERE activa AND latitud IS NOT NULL AND longitud IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_camaras_sitio
        ON cad_camaras (sitio_graba)
        WHERE activa;

    RAISE NOTICE 'V76: cad_camaras lista para el censo institucional.';
END $$;

-- ── Nota sobre PostGIS ────────────────────────────────────────────────────────
-- El diseño técnico (§6-§7) proponía una columna geography y un índice GiST
-- para el KNN. No aplica: V40 quitó PostGIS de este proyecto porque la
-- extensión no es instalable en los servidores Postgres de todos los tenants,
-- y reescribió «recurso más cercano» con Haversine en SQL plano. La búsqueda de
-- cámaras cercanas usa ese mismo camino —a escala de un municipio (cientos de
-- cámaras) un recorrido con ORDER BY sobre la fórmula es de sobra— apoyada en
-- idx_camaras_unidad_geo. V44 ya creaba la columna geo solo si PostGIS existía,
-- así que en la práctica nunca se creó.
