-- ══════════════════════════════════════════════════════════════════════════
-- V55: Persistir el chat de la videollamada (trazabilidad y prueba)
--
-- Hasta ahora el chat entre despachador y ciudadano viajaba por un
-- RTCDataChannel punto a punto: los mensajes NUNCA tocaban el servidor. Eso
-- estaba bien para latencia, pero significaba que al cerrar el caso no quedaba
-- ningún rastro de la conversación.
--
-- Es un problema serio: en una emergencia el chat es a menudo donde está la
-- información crítica — "no puedo hablar", "estoy en el baúl de un carro",
-- la placa del vehículo. Al revisar el caso cerrado (módulo Pedido, jefe de
-- turno) eso debe poder consultarse, y puede ser material probatorio.
--
-- Ahora el chat pasa por VideoSignalingHub, que lo guarda aquí y lo reenvía al
-- otro extremo. Se conserva el orden real por fecha.
--
-- Idempotente.
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cad_video_chat_mensajes (
    id         BIGINT       PRIMARY KEY,
    sesion_id  BIGINT       NOT NULL REFERENCES cad_video_sesiones(id),
    pedido_id  BIGINT       NOT NULL,
    -- Quién escribió: el despachador del CAD o el ciudadano en su celular.
    emisor     VARCHAR(12)  NOT NULL,
    texto      VARCHAR(2000) NOT NULL,
    -- Usuario del CAD cuando emisor='DESPACHADOR'; null cuando es el ciudadano
    -- (que es anónimo por diseño: su única credencial es el token del enlace).
    usuario    VARCHAR(120),
    fecha      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_video_chat_emisor CHECK (emisor IN ('DESPACHADOR','CIUDADANO'))
);

-- Se consulta siempre por caso (revisión del incidente) o por sesión, en orden
-- cronológico: la conversación solo se entiende en orden.
CREATE INDEX IF NOT EXISTS idx_video_chat_pedido ON cad_video_chat_mensajes (pedido_id, fecha);
CREATE INDEX IF NOT EXISTS idx_video_chat_sesion ON cad_video_chat_mensajes (sesion_id, fecha);

COMMENT ON TABLE cad_video_chat_mensajes IS
    'Transcripción del chat de cada videollamada. Se persiste para trazabilidad del caso y como posible material probatorio; antes viajaba solo P2P y no quedaba registro.';
