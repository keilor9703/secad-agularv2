-- ══════════════════════════════════════════════════════════════════════════
-- V54: Grabación de videollamada a prueba de fallos (material probatorio)
--
-- Antes la grabación se acumulaba ENTERA en la memoria del navegador del
-- despachador y solo se subía si él oprimía "Detener grabación". Cualquier
-- final abrupto (el ciudadano cuelga, el despachador refresca o navega, se
-- cae la red, se cierra Chrome) perdía la grabación completa.
--
-- Ahora el navegador sube el video en trozos mientras graba, y el servidor
-- los va anexando a un archivo temporal. La evidencia queda a salvo en disco
-- desde el primer trozo, sin importar qué le pase al puesto del despachador.
-- Estas columnas son el estado de esa grabación en curso.
--
-- Estados de grabacion_estado:
--   NULL        → nunca se grabó esta sesión
--   GRABANDO    → hay un archivo temporal recibiendo trozos
--   FINALIZADA  → se cerró y quedó registrada como adjunto del caso
--                 (ver cad_video_sesiones.adjunto_grabacion_id)
--
-- Una grabación GRABANDO cuyo ultimo_chunk quedó viejo es "huérfana": el
-- puesto del despachador murió sin cerrarla. El sweeper del backend
-- (GrabacionesHuerfanasService) la finaliza solo, de modo que la evidencia
-- termina siempre registrada en el caso.
--
-- Idempotente.
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE cad_video_sesiones ADD COLUMN IF NOT EXISTS grabacion_estado        VARCHAR(12);
ALTER TABLE cad_video_sesiones ADD COLUMN IF NOT EXISTS grabacion_archivo_temp  VARCHAR(400);
ALTER TABLE cad_video_sesiones ADD COLUMN IF NOT EXISTS grabacion_bytes         BIGINT NOT NULL DEFAULT 0;
ALTER TABLE cad_video_sesiones ADD COLUMN IF NOT EXISTS grabacion_inicio        TIMESTAMPTZ;
ALTER TABLE cad_video_sesiones ADD COLUMN IF NOT EXISTS grabacion_ultimo_chunk  TIMESTAMPTZ;
ALTER TABLE cad_video_sesiones ADD COLUMN IF NOT EXISTS grabacion_usuario       VARCHAR(120);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_video_grabacion_estado'
    ) THEN
        ALTER TABLE cad_video_sesiones
            ADD CONSTRAINT ck_video_grabacion_estado
            CHECK (grabacion_estado IS NULL OR grabacion_estado IN ('GRABANDO','FINALIZADA'));
    END IF;
END $$;

-- El sweeper busca exactamente por esto: grabaciones abiertas ordenadas por
-- cuándo llegó su último trozo.
CREATE INDEX IF NOT EXISTS idx_video_grabacion_abierta
    ON cad_video_sesiones (grabacion_ultimo_chunk)
    WHERE grabacion_estado = 'GRABANDO';

-- Buscar la videollamada vigente de un caso, para reconectarse a ella en vez
-- de generar un enlace nuevo cuando el despachador refresca o vuelve al caso.
CREATE INDEX IF NOT EXISTS idx_video_sesion_pedido_activa
    ON cad_video_sesiones (pedido_id)
    WHERE estado IN ('PENDIENTE','CONECTADA');

COMMENT ON COLUMN cad_video_sesiones.grabacion_estado IS
    'NULL=nunca grabó | GRABANDO=archivo temporal recibiendo trozos | FINALIZADA=cerrada y registrada como adjunto';
