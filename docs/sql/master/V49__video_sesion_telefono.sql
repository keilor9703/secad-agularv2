-- ══════════════════════════════════════════════════════════════════════════
-- V49: Asociar el número de teléfono del ciudadano a la sesión de videollamada
--
-- cad_video_sesiones nunca guardó el número de teléfono al que se envió el
-- enlace (VideoLlamadaController.Crear lo usaba solo para enviar el SMS y lo
-- descartaba) — por eso la sección "Archivos multimedia" del caso no podía
-- mostrar a qué llamada correspondía cada grabación. Se agrega la columna;
-- el backend (VideoLlamadaController/DbVideoLlamadaRepository) la persiste
-- al crear la sesión.
-- Idempotente.
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE cad_video_sesiones ADD COLUMN IF NOT EXISTS numero_telefono VARCHAR(30);
