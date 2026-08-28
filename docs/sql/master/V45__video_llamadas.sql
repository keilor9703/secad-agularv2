-- ══════════════════════════════════════════════════════════════════════════════
-- V45: Videollamada en vivo con el ciudadano (WebRTC punto-a-punto)
--
-- Un despachador, desde el detalle de un evento, genera una sesión. El "token"
-- que viaja en el link (.../video/{token}) NO se guarda en esta tabla — es un
-- JWT de corta vida, autocontenido y firmado por VideoSessionTokenService
-- (mismo patrón que MfaSessionTokenService), que ya lleva adentro el id de la
-- sesión, el pedido y el tenant. Esta tabla es solo el estado/auditoría de la
-- sesión, correlacionada por su id (Snowflake) — no por el token en sí.
--
-- La grabación (si se hace) se sube como un cad_adjuntos más — no requiere
-- almacenamiento aparte, ver TipoAdjunto='VIDEO' / CanalOrigen='VIDEOLLAMADA'.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cad_video_sesiones (
    id                   BIGINT       PRIMARY KEY,
    pedido_id            BIGINT       NOT NULL REFERENCES cad_pedidos(id),
    sitio_graba          INTEGER      NOT NULL,
    -- PENDIENTE (creada, esperando que el ciudadano toque el link) |
    -- CONECTADA (ciudadano y despachador presentes) |
    -- FINALIZADA (cerrada normalmente) |
    -- EXPIRADA (nadie conectó dentro del tiempo límite) |
    -- CANCELADA (el despachador la canceló antes de que conectara el ciudadano)
    estado               VARCHAR(12)  NOT NULL DEFAULT 'PENDIENTE',
    usuario_despachador  VARCHAR(120) NOT NULL,
    fecha_creacion       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    fecha_expira         TIMESTAMPTZ  NOT NULL,
    fecha_conectado      TIMESTAMPTZ,
    fecha_finalizado     TIMESTAMPTZ,
    ip_ciudadano         VARCHAR(45),
    adjunto_grabacion_id BIGINT REFERENCES cad_adjuntos(id),

    CONSTRAINT ck_video_sesion_estado
        CHECK (estado IN ('PENDIENTE','CONECTADA','FINALIZADA','EXPIRADA','CANCELADA'))
);

CREATE INDEX IF NOT EXISTS idx_video_sesion_pedido ON cad_video_sesiones(pedido_id);

COMMENT ON TABLE cad_video_sesiones IS 'Sesiones de videollamada WebRTC ciudadano-despachador. La validez del link la determina la firma/expiración del JWT (VideoSessionTokenService), no esta tabla — esta tabla es únicamente estado y auditoría, correlacionada por id.';
