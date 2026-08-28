-- ══════════════════════════════════════════════════════════════════════════════
-- V17: Recepción multicanal — Chat, SMS y adjuntos/fotos (§6.7)
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Ampliar el CHECK constraint de cad_eventos.origen para incluir CHAT y SMS
--    El constraint se llama chk_eventos_origen (definido en V7b).
--    Solo se modifica si CHAT/SMS no están ya incluidos.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE  conname  = 'chk_eventos_origen'
      AND  conrelid = 'cad_eventos'::regclass
      AND  pg_get_constraintdef(oid) LIKE '%CHAT%'
  ) THEN
    ALTER TABLE cad_eventos DROP CONSTRAINT IF EXISTS chk_eventos_origen;
    ALTER TABLE cad_eventos
        ADD CONSTRAINT chk_eventos_origen
        CHECK (origen IN (
            'CTI', 'RECEPCION', 'APP_MOVIL', 'INTEGRACION',
            'SIEDCO', 'INTERNO', 'MANUAL', 'CHAT', 'SMS'
        ));
    RAISE NOTICE 'V17: chk_eventos_origen ampliado con CHAT y SMS.';
  ELSE
    RAISE NOTICE 'V17: chk_eventos_origen ya incluye CHAT/SMS — sin cambios.';
  END IF;
END;
$$;

-- 2. Tabla de adjuntos (fotos, documentos) vinculados a pedidos
CREATE TABLE IF NOT EXISTS cad_adjuntos (
    id               BIGINT        NOT NULL PRIMARY KEY,        -- Snowflake
    pedido_id        BIGINT        NOT NULL,                    -- cad_pedidos.id
    sitio_graba      INTEGER       NOT NULL,
    tipo_adjunto     VARCHAR(20)   NOT NULL DEFAULT 'FOTO'
                         CHECK (tipo_adjunto IN ('FOTO','DOCUMENTO','AUDIO','VIDEO')),
    nombre_original  VARCHAR(255)  NOT NULL,                    -- nombre que subió el usuario
    nombre_guardado  VARCHAR(255)  NOT NULL,                    -- nombre en disco (UUID + ext)
    ruta_relativa    VARCHAR(500)  NOT NULL,                    -- relativa a /uploads/adjuntos/
    mime_type        VARCHAR(100),
    tamanio_bytes    BIGINT,
    descripcion      VARCHAR(255),
    canal_origen     VARCHAR(30)   NOT NULL DEFAULT 'MANUAL'
                         CHECK (canal_origen IN ('MANUAL','API_CHAT','API_SMS','API_FOTO')),
    subido_por       VARCHAR(100),
    fecha_subida     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cad_adjuntos_pedido
    ON cad_adjuntos (pedido_id, sitio_graba);

CREATE INDEX IF NOT EXISTS idx_cad_adjuntos_tipo
    ON cad_adjuntos (tipo_adjunto);

-- 3. Tabla de auditoría de recepciones por canal externo (Chat / SMS)
--    Guarda el payload crudo recibido antes de transformarlo en pedido+evento.
CREATE TABLE IF NOT EXISTS cad_recepciones_externas (
    id              BIGINT        NOT NULL PRIMARY KEY,
    canal           VARCHAR(20)   NOT NULL
                        CHECK (canal IN ('CHAT','SMS')),
    payload_crudo   JSONB         NOT NULL,
    pedido_id       BIGINT,                                    -- null si falló la creación
    procesado       BOOLEAN       NOT NULL DEFAULT FALSE,
    error           TEXT,
    ip_origen       VARCHAR(50),
    fecha_recepcion TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rec_ext_canal
    ON cad_recepciones_externas (canal, fecha_recepcion DESC);

COMMENT ON TABLE cad_adjuntos
    IS '§6.7 Archivos adjuntos (fotos, docs, audio, video) vinculados a pedidos. Archivos en /uploads/adjuntos/{sitio}/{pedidoId}/.';

COMMENT ON TABLE cad_recepciones_externas
    IS '§6.7 Auditoría de mensajes entrantes por Chat y SMS antes de crear el pedido/evento. Permite replay y diagnóstico.';
