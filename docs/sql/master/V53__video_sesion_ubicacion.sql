-- ══════════════════════════════════════════════════════════════════════════
-- V53: Última ubicación GPS conocida del ciudadano durante la videollamada
--
-- El navegador del ciudadano (video-ciudadano.ts) reporta su posición vía
-- navigator.geolocation.watchPosition mientras dura la sesión; cada
-- actualización se relaya al despachador por VideoSignalingHub.EnviarUbicacion
-- y se persiste aquí como la última posición conocida (no un histórico —
-- solo se necesita saber dónde está AHORA para despachar recursos, no dónde
-- ha estado). Si en el futuro se requiere un trazado histórico, esto se
-- movería a una tabla aparte en vez de agregarle más columnas a esta.
-- Idempotente.
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE cad_video_sesiones ADD COLUMN IF NOT EXISTS ultima_lat DOUBLE PRECISION;
ALTER TABLE cad_video_sesiones ADD COLUMN IF NOT EXISTS ultima_lng DOUBLE PRECISION;
ALTER TABLE cad_video_sesiones ADD COLUMN IF NOT EXISTS ultima_precision DOUBLE PRECISION;
ALTER TABLE cad_video_sesiones ADD COLUMN IF NOT EXISTS ultima_ubicacion_fecha TIMESTAMPTZ;
