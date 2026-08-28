-- ============================================================
-- V7b – ALTER cad_eventos: agregar columnas que faltan
--
-- CONTEXTO
-- La tabla cad_eventos fue creada en V4 con solo 4 columnas:
--   id, cadpedca_numellamada, cadpedca_sitio,
--   fecha_grabacion, usuario_creacion
--
-- V7 intentó crearla completa con CREATE TABLE IF NOT EXISTS
-- pero la saltó porque ya existía. Este script agrega todas
-- las columnas faltantes de forma idempotente (IF NOT EXISTS).
--
-- Aplica a cada base de datos tenant CAD.
-- Es seguro ejecutarlo varias veces.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. AGREGAR COLUMNAS FALTANTES A cad_eventos
--    Cada ADD COLUMN usa IF NOT EXISTS → seguro en re-ejecución.
--    Las columnas NOT NULL llevan DEFAULT para no fallar con
--    filas existentes.
-- ────────────────────────────────────────────────────────────
ALTER TABLE cad_eventos
    ADD COLUMN IF NOT EXISTS sitio_graba             INTEGER      NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS origen                  VARCHAR(20)  NOT NULL DEFAULT 'RECEPCION',
    ADD COLUMN IF NOT EXISTS integracion_cliente_id  INTEGER,
    ADD COLUMN IF NOT EXISTS origen_referencia_ext   VARCHAR(200),
    ADD COLUMN IF NOT EXISTS pedido_id               BIGINT,
    ADD COLUMN IF NOT EXISTS pedido_sitio_graba      INTEGER,
    ADD COLUMN IF NOT EXISTS fuerza_id               INTEGER,
    ADD COLUMN IF NOT EXISTS canal_codigo            INTEGER,
    ADD COLUMN IF NOT EXISTS cedu_empleado           VARCHAR(12),
    ADD COLUMN IF NOT EXISTS usuario_genera          VARCHAR(50)  NOT NULL DEFAULT 'SISTEMA',
    ADD COLUMN IF NOT EXISTS tipo_despachador        CHAR(1),
    ADD COLUMN IF NOT EXISTS turno_id                BIGINT,
    ADD COLUMN IF NOT EXISTS turno_accesorio_id      BIGINT,
    ADD COLUMN IF NOT EXISTS siedco_consecutivo      INTEGER,
    ADD COLUMN IF NOT EXISTS siedco_unde_codigo      INTEGER,
    ADD COLUMN IF NOT EXISTS estado                  CHAR(1)      NOT NULL DEFAULT 'P',
    ADD COLUMN IF NOT EXISTS fecha_creacion          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS fecha_despacho          TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS fecha_llegada           TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS fecha_cierre            TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS codigo_cierre_primario  VARCHAR(6),
    ADD COLUMN IF NOT EXISTS clasif_cierre           VARCHAR(2),
    ADD COLUMN IF NOT EXISTS observacion_cierre      TEXT,
    ADD COLUMN IF NOT EXISTS fecha_modificacion      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS usuario_modifica        VARCHAR(50);

-- ────────────────────────────────────────────────────────────
-- 2. CHECK CONSTRAINTS
--    NOT VALID = no valida filas históricas, solo las nuevas.
--    Cada bloque verifica si el constraint ya existe antes de
--    agregarlo para que sea re-ejecutable.
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_eventos_origen'
          AND conrelid = 'cad_eventos'::regclass
    ) THEN
        ALTER TABLE cad_eventos
            ADD CONSTRAINT chk_eventos_origen
            CHECK (origen IN ('CTI','RECEPCION','APP_MOVIL','INTEGRACION','SIEDCO','INTERNO','MANUAL'))
            NOT VALID;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_eventos_estado'
          AND conrelid = 'cad_eventos'::regclass
    ) THEN
        ALTER TABLE cad_eventos
            ADD CONSTRAINT chk_eventos_estado
            CHECK (estado IN ('P','D','A','C','V'))
            NOT VALID;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_eventos_tipo_desp'
          AND conrelid = 'cad_eventos'::regclass
    ) THEN
        ALTER TABLE cad_eventos
            ADD CONSTRAINT chk_eventos_tipo_desp
            CHECK (tipo_despachador IN ('D','O','S','N') OR tipo_despachador IS NULL)
            NOT VALID;
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 3. TABLAS HIJAS (IF NOT EXISTS — idempotente)
-- ────────────────────────────────────────────────────────────

-- Clientes de integración externa
CREATE TABLE IF NOT EXISTS cad_integraciones_clientes (
    id               SERIAL       PRIMARY KEY,
    nombre           VARCHAR(100) NOT NULL,
    tipo             VARCHAR(30)  NOT NULL
                         CHECK (tipo IN ('APP_MOVIL','EMPRESA_SEGURIDAD',
                                         'SISTEMA_POLICIAL','GOBIERNO','OTRO')),
    api_key_hash     VARCHAR(128),
    sitio_graba      INTEGER      NOT NULL,
    vigente          CHAR(1)      NOT NULL DEFAULT 'S' CHECK (vigente IN ('S','N')),
    contacto         VARCHAR(200),
    descripcion      TEXT,
    fecha_creacion   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    usuario_crea     VARCHAR(50)
);

-- FK de cad_eventos → cad_integraciones_clientes
-- (solo se agrega si la columna y la tabla existen y el FK no existe aún)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_eventos_integracion'
          AND conrelid = 'cad_eventos'::regclass
    ) THEN
        ALTER TABLE cad_eventos
            ADD CONSTRAINT fk_eventos_integracion
            FOREIGN KEY (integracion_cliente_id)
            REFERENCES cad_integraciones_clientes(id)
            ON DELETE RESTRICT
            NOT VALID;
    END IF;
END $$;

-- Códigos de cierre por evento (N por evento)
CREATE TABLE IF NOT EXISTS cad_eventos_codigos_cierre (
    evento_id           BIGINT      NOT NULL
                            REFERENCES cad_eventos(id) ON DELETE CASCADE,
    orden               SMALLINT    NOT NULL CHECK (orden BETWEEN 1 AND 20),
    codigo_cierre       VARCHAR(6)  NOT NULL,
    tipo_codigo         VARCHAR(20) NOT NULL DEFAULT 'CIERRE'
                            CHECK (tipo_codigo IN ('CIERRE','DISPOSICION','NOVEDAD')),
    descripcion_libre   TEXT,
    usuario_registra    VARCHAR(50) NOT NULL,
    fecha_registra      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pk_eventos_codigos PRIMARY KEY (evento_id, orden)
);

-- ────────────────────────────────────────────────────────────
-- 4. ÍNDICES (todos IF NOT EXISTS — idempotente)
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_eventos_pedido
    ON cad_eventos(pedido_id)
    WHERE pedido_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eventos_sitio_estado
    ON cad_eventos(sitio_graba, estado, fecha_creacion DESC);

CREATE INDEX IF NOT EXISTS idx_eventos_canal
    ON cad_eventos(fuerza_id, canal_codigo)
    WHERE canal_codigo IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eventos_origen
    ON cad_eventos(origen, fecha_creacion DESC);

CREATE INDEX IF NOT EXISTS idx_eventos_cierre
    ON cad_eventos(estado, fecha_cierre DESC)
    WHERE estado IN ('C','V');

CREATE INDEX IF NOT EXISTS idx_codigos_cierre_evento
    ON cad_eventos_codigos_cierre(evento_id);

-- ────────────────────────────────────────────────────────────
-- 5. BACKFILL: rellenar pedido_id y sitio_graba en los
--    registros históricos de cad_eventos que venían de V4.
--    Esos registros tienen cadpedca_numellamada / cadpedca_sitio
--    pero los nuevos campos quedan en NULL/DEFAULT.
-- ────────────────────────────────────────────────────────────
UPDATE cad_eventos
SET    pedido_id        = cadpedca_numellamada,
       pedido_sitio_graba = cadpedca_sitio,
       sitio_graba      = COALESCE(cadpedca_sitio, 0),
       usuario_genera   = COALESCE(usuario_genera, 'MIGRACION_V7B'),
       fecha_creacion   = COALESCE(fecha_grabacion, NOW())
WHERE  pedido_id IS NULL
  AND  cadpedca_numellamada IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 6. VERIFICACIÓN (ejecutar después para confirmar)
-- ────────────────────────────────────────────────────────────
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM   information_schema.columns
-- WHERE  table_name = 'cad_eventos'
-- ORDER  BY ordinal_position;
--
-- SELECT COUNT(*) FROM cad_eventos;
-- SELECT COUNT(*) FROM cad_eventos_codigos_cierre;
-- SELECT COUNT(*) FROM cad_integraciones_clientes;
