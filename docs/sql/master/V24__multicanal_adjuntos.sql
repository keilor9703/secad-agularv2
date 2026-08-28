-- =============================================================================
-- V24 — Recepción multicanal: adjuntos (fotos) + auditoría Chat/SMS
-- =============================================================================

-- ── 1. Ampliar CHECK de origen en cad_eventos ──────────────────────────────
-- El constraint se llama chk_eventos_origen (creado en V7b).
-- Solo ejecuta el ALTER si CHAT/SMS no están aún en el CHECK.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE  conname   = 'chk_eventos_origen'
      AND  conrelid  = 'cad_eventos'::regclass
      AND  pg_get_constraintdef(oid) LIKE '%CHAT%'
  ) THEN
    ALTER TABLE cad_eventos DROP CONSTRAINT IF EXISTS chk_eventos_origen;
    ALTER TABLE cad_eventos
        ADD CONSTRAINT chk_eventos_origen
        CHECK (origen IN (
            'CTI','RECEPCION','APP_MOVIL','INTEGRACION',
            'SIEDCO','INTERNO','MANUAL','CHAT','SMS'
        ));
    RAISE NOTICE 'chk_eventos_origen ampliado con CHAT y SMS.';
  ELSE
    RAISE NOTICE 'chk_eventos_origen ya incluye CHAT/SMS — sin cambios.';
  END IF;
END $$;

-- ── 2. Tabla de adjuntos (fotos / documentos ligados a pedidos) ────────────

CREATE TABLE IF NOT EXISTS cad_adjuntos (
    id               BIGINT        PRIMARY KEY,          -- Snowflake ID
    pedido_id        BIGINT        NOT NULL,              -- FK → cad_pedidos
    sitio_graba      INTEGER       NOT NULL,
    tipo_adjunto     VARCHAR(20)   NOT NULL DEFAULT 'FOTO'
                         CHECK (tipo_adjunto IN ('FOTO','DOCUMENTO','AUDIO','VIDEO')),
    nombre_original  VARCHAR(255)  NOT NULL,
    nombre_guardado  VARCHAR(255)  NOT NULL,              -- UUID + ext
    ruta_relativa    VARCHAR(500)  NOT NULL,              -- relativa a /uploads
    mime_type        VARCHAR(100)  NOT NULL,
    tamanio_bytes    BIGINT        NOT NULL DEFAULT 0,
    descripcion      VARCHAR(255),
    canal_origen     VARCHAR(30)   NOT NULL DEFAULT 'MANUAL'
                         CHECK (canal_origen IN ('MANUAL','API_CHAT','API_SMS','API_FOTO')),
    subido_por       VARCHAR(100)  NOT NULL,
    fecha_subida     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cad_adjuntos_pedido
    ON cad_adjuntos (pedido_id, sitio_graba);

CREATE INDEX IF NOT EXISTS idx_cad_adjuntos_tipo
    ON cad_adjuntos (tipo_adjunto);

-- ── 3. Tabla de auditoría para recepciones externas (Chat / SMS) ───────────

CREATE TABLE IF NOT EXISTS cad_recepciones_externas (
    id               BIGINT        PRIMARY KEY,           -- Snowflake ID
    canal            VARCHAR(20)   NOT NULL
                         CHECK (canal IN ('CHAT','SMS')),
    payload_crudo    JSONB         NOT NULL,              -- payload recibido sin procesar
    pedido_id        BIGINT,                              -- null si falló la creación
    procesado        BOOLEAN       NOT NULL DEFAULT FALSE,
    error            TEXT,
    ip_origen        VARCHAR(50),
    fecha_recepcion  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rec_ext_canal
    ON cad_recepciones_externas (canal, fecha_recepcion DESC);

CREATE INDEX IF NOT EXISTS idx_rec_ext_pedido
    ON cad_recepciones_externas (pedido_id)
    WHERE pedido_id IS NOT NULL;
