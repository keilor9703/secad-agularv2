-- Incident / Call management schema: apply to each CAD tenant database

CREATE TABLE IF NOT EXISTS cad_pedidos (
    id                  BIGSERIAL    PRIMARY KEY,
    sitio_graba         INTEGER      NOT NULL DEFAULT 0,
    nume_llamada        BIGINT,
    hora_caso           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    nume_telefono       BIGINT,
    prop_telefono       VARCHAR(200),
    nomb_llamante       VARCHAR(200),
    barrio              VARCHAR(200),
    ciudad              VARCHAR(200),
    dire_llamante       VARCHAR(300),
    dire_caso           VARCHAR(300),
    latitud_caso        VARCHAR(50),
    longitud_caso       VARCHAR(50),
    cordx               VARCHAR(50),
    cordy               VARCHAR(50),
    tiposhape           VARCHAR(50),
    radio               INTEGER      DEFAULT 0,
    comentario          TEXT,
    codi_pedido         VARCHAR(50),
    codi_pedido2        VARCHAR(50),
    tipo_pedido         VARCHAR(50),
    cali_pedido         VARCHAR(50),
    importancia         VARCHAR(50),
    prioridad           VARCHAR(50),
    disp_telefonico     VARCHAR(100),
    celda_marcacion     VARCHAR(100),
    canales             VARCHAR(500),
    canal_fuerza        VARCHAR(50),
    enviar              VARCHAR(5)   DEFAULT 'N',
    -- A = Activo, C = Cerrado, P = Pendiente
    estado              VARCHAR(20)  DEFAULT 'A',
    -- Reference to associated parent incident (optional)
    pedido_padre_sitio  INTEGER,
    pedido_padre_num    BIGINT,
    -- Audit
    usuario_creacion    BIGINT,
    fecha_creacion      TIMESTAMPTZ  DEFAULT NOW(),
    maquina_creacion    VARCHAR(100),
    usuario_modifica    BIGINT,
    fecha_modifica      TIMESTAMPTZ,
    maquina_modifica    VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_pedidos_estado  ON cad_pedidos(estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_hora    ON cad_pedidos(hora_caso DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_codi    ON cad_pedidos(codi_pedido);
CREATE INDEX IF NOT EXISTS idx_pedidos_sitio   ON cad_pedidos(sitio_graba);

-- ─── Annotations (notes) per incident ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cad_anotaciones (
    id                  BIGSERIAL    PRIMARY KEY,
    id_pedido           BIGINT       NOT NULL REFERENCES cad_pedidos(id) ON DELETE CASCADE,
    titulo              VARCHAR(200),
    anotacion           TEXT,
    tipo_anotacion      VARCHAR(50)  DEFAULT 'GENERAL',
    usuario_creacion    BIGINT,
    username_creacion   VARCHAR(100),
    fecha_creacion      TIMESTAMPTZ  DEFAULT NOW(),
    maquina_creacion    VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_anotaciones_pedido ON cad_anotaciones(id_pedido);
