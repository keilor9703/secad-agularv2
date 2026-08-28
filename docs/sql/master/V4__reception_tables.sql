-- ============================================================
-- V4 – Reception support tables
-- Apply to every CAD tenant database.
-- ============================================================

-- 1. Sitios de grabación (operator positions / consoles)
CREATE TABLE IF NOT EXISTS cad_sitios_grabacion (
    consecutivo   INTEGER      PRIMARY KEY,
    descripcion   VARCHAR(200) NOT NULL
);

-- 2. Lugares geográficos (cities / municipalities)
CREATE TABLE IF NOT EXISTS cad_lugares_geograficos (
    codigo        INTEGER      PRIMARY KEY,
    descripcion   VARCHAR(200) NOT NULL
);

-- 3. Barrios (neighborhoods)
CREATE TABLE IF NOT EXISTS cad_barrios (
    codigo        INTEGER      NOT NULL,
    luge_codigo   INTEGER      NOT NULL REFERENCES cad_lugares_geograficos(codigo),
    descripcion   VARCHAR(200) NOT NULL,
    PRIMARY KEY (codigo, luge_codigo)
);

-- 4. Incident type catalog (case codes)
CREATE TABLE IF NOT EXISTS cad_casos (
    codigo        VARCHAR(50)  PRIMARY KEY,
    descripcion   VARCHAR(300) NOT NULL,
    vigente       CHAR(1)      NOT NULL DEFAULT 'S'
);

CREATE INDEX IF NOT EXISTS idx_casos_desc ON cad_casos USING gin(to_tsvector('spanish', descripcion));

-- 5. Agency forces (fuerzas de despacho)
CREATE TABLE IF NOT EXISTS cad_fuerzas (
    id            SERIAL       PRIMARY KEY,
    sitio_graba   INTEGER      NOT NULL DEFAULT 0,
    descripcion   VARCHAR(200) NOT NULL,
    abreviatura   VARCHAR(50),
    vigente       CHAR(1)      NOT NULL DEFAULT 'S'
);

CREATE INDEX IF NOT EXISTS idx_fuerzas_sitio ON cad_fuerzas(sitio_graba);

-- 6. Dispatch channels
CREATE TABLE IF NOT EXISTS cad_canales (
    codigo        INTEGER      NOT NULL,
    cadfuerz_id   INTEGER      NOT NULL REFERENCES cad_fuerzas(id),
    descripcion   VARCHAR(200) NOT NULL,
    vigente       CHAR(1)      NOT NULL DEFAULT 'S',
    PRIMARY KEY (codigo, cadfuerz_id)
);

CREATE INDEX IF NOT EXISTS idx_canales_fuerza ON cad_canales(cadfuerz_id);

-- 7. CTI interface table (incoming telephony events) — renombrada a
-- cad_plantatel por V38. El IF NOT EXISTS de abajo no basta por sí solo: en
-- una re-corrida completa DESPUÉS de que V38 ya renombró la tabla, esta
-- CREATE (mirando solo el nombre viejo) la recrearía vacía, y V38 luego
-- fallaría al intentar renombrarla porque el nombre nuevo ya existe. Se
-- comprueba también que cad_plantatel no exista ya.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'cad_plantatel') THEN
        CREATE TABLE IF NOT EXISTS cad_interfaz_cti (
            id             BIGSERIAL    PRIMARY KEY,
            sitio_graba    INTEGER      NOT NULL DEFAULT 0,
            acd            INTEGER      NOT NULL DEFAULT 0,
            registrada     CHAR(1)      NOT NULL DEFAULT 'N',
            nume_telefono  BIGINT,
            fecha_registro TIMESTAMPTZ  DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_cti_sitio_acd_reg
            ON cad_interfaz_cti(sitio_graba, acd, registrada);
    END IF;
END $$;

-- 8. SECAD reference catalog (TIPO_PEDIDO, CALI_PEDIDO, ESTADO_CASO, …)
CREATE TABLE IF NOT EXISTS cad_referencias_secad (
    id            SERIAL       PRIMARY KEY,
    nombre        VARCHAR(100) NOT NULL,   -- category key, e.g. 'TIPO_PEDIDO'
    codigo        VARCHAR(50)  NOT NULL,
    descripcion   VARCHAR(200),
    abreviatura   VARCHAR(50),
    UNIQUE (nombre, codigo)
);

CREATE INDEX IF NOT EXISTS idx_referencias_nombre ON cad_referencias_secad(nombre);

-- 9. Dispatch events (one per incident, links incident to dispatched resources)
CREATE TABLE IF NOT EXISTS cad_eventos (
    id                    BIGSERIAL   PRIMARY KEY,
    cadpedca_numellamada  BIGINT,
    cadpedca_sitio        INTEGER,
    fecha_grabacion       TIMESTAMPTZ DEFAULT NOW(),
    usuario_creacion      BIGINT
);

CREATE INDEX IF NOT EXISTS idx_eventos_llamada ON cad_eventos(cadpedca_numellamada);

-- 10. Channels selected per incident
CREATE TABLE IF NOT EXISTS cad_pedidos_canales (
    id                    BIGSERIAL   PRIMARY KEY,
    cadpedi_sitiograba    INTEGER     NOT NULL,
    cadpedi_numellamada   BIGINT      NOT NULL,
    cadcana_fuerz_id      INTEGER     NOT NULL,
    cadcana_codigo        INTEGER     NOT NULL,
    cali_pedido           VARCHAR(50),
    comentario            TEXT,
    estado                VARCHAR(20) DEFAULT 'A',
    enviar                CHAR(1)     DEFAULT 'N',
    cadeven_sitio_graba   INTEGER,
    cadeven_nume_evento   BIGINT,
    fecha_grabacion       TIMESTAMPTZ DEFAULT NOW(),
    fecha_modificacion    TIMESTAMPTZ,
    usua_modifica         VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_pedcanales_llamada
    ON cad_pedidos_canales(cadpedi_numellamada);

-- 11. Sequences (call-number & event-number counters)
CREATE SEQUENCE IF NOT EXISTS seq_pedidos START 1 INCREMENT 1;
CREATE SEQUENCE IF NOT EXISTS seq_eventos  START 1 INCREMENT 1;

-- ── Extend cad_pedidos with columns required by reception module ──────────────
ALTER TABLE cad_pedidos ADD COLUMN IF NOT EXISTS luge_codigo         INTEGER;
ALTER TABLE cad_pedidos ADD COLUMN IF NOT EXISTS codi_barrio         INTEGER;
ALTER TABLE cad_pedidos ADD COLUMN IF NOT EXISTS luge_barrio         INTEGER;
ALTER TABLE cad_pedidos ADD COLUMN IF NOT EXISTS fech_caso           TIMESTAMPTZ;
ALTER TABLE cad_pedidos ADD COLUMN IF NOT EXISTS cadpedi_sitio_graba INTEGER;   -- associated-call site
ALTER TABLE cad_pedidos ADD COLUMN IF NOT EXISTS cadpedi_nume_llamada BIGINT;   -- associated-call number
ALTER TABLE cad_pedidos ADD COLUMN IF NOT EXISTS total_canales       CHAR(1) DEFAULT 'N';
ALTER TABLE cad_pedidos ADD COLUMN IF NOT EXISTS cadusua_usuario     VARCHAR(100);
ALTER TABLE cad_pedidos ADD COLUMN IF NOT EXISTS cadpoli_cedu_empleado BIGINT;

-- ── Extend ctr_usuarios with reception-specific claims ───────────────────────
ALTER TABLE ctr_usuarios ADD COLUMN IF NOT EXISTS sitio_grabacion    INTEGER DEFAULT 0;
ALTER TABLE ctr_usuarios ADD COLUMN IF NOT EXISTS acd               INTEGER DEFAULT 0;
ALTER TABLE ctr_usuarios ADD COLUMN IF NOT EXISTS cadcana_fuerza_id INTEGER DEFAULT 0;
ALTER TABLE ctr_usuarios ADD COLUMN IF NOT EXISTS cadcana_codigo    INTEGER DEFAULT 0;
