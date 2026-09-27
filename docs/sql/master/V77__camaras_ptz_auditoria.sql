-- ══════════════════════════════════════════════════════════════════════════════
--  V77: la auditoría de cámaras registra también quién MOVIÓ una
--
--  Apply to: cada base de TENANT/CAD.
--
--  ── Por qué ────────────────────────────────────────────────────────────────
--  Hasta ahora cad_camaras_visualizacion respondía «quién vio qué cámara». Con
--  el control PTZ hay una acción nueva y de otra naturaleza: mover una cámara
--  CAMBIA lo que el resto del sistema puede ver. Si alguien aparta una cámara
--  del cruce que vigilaba justo antes de un hecho, eso tiene que quedar
--  registrado con el mismo rigor que la consulta de video —y poder consultarse
--  junto a ella, no en otra tabla que nadie cruza—.
--
--  Por eso se amplía la tabla existente en vez de crear otra: la pregunta
--  «quién tocó esta cámara» se responde de una sola vez.
--
--  Es repetible.
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'cad_camaras_visualizacion') THEN
        RAISE EXCEPTION 'Falta V75: cad_camaras_visualizacion no existe todavía.';
    END IF;
END $$;

-- Qué se hizo con la cámara. 'VER' para todo lo registrado hasta hoy, que es
-- exactamente lo que era.
ALTER TABLE cad_camaras_visualizacion
    ADD COLUMN IF NOT EXISTS accion  VARCHAR(24)  NOT NULL DEFAULT 'VER';

-- El detalle del movimiento: comando, velocidad y duración, o el preset. Sin
-- esto la auditoría diría «movió la cámara» sin decir a dónde.
ALTER TABLE cad_camaras_visualizacion
    ADD COLUMN IF NOT EXISTS detalle VARCHAR(160);

COMMENT ON COLUMN cad_camaras_visualizacion.accion IS
    'VER = se consultó el video. Cualquier otro valor es el comando PTZ que se '
    'ejecutó, con el nombre que usa el VMS (LEFT, ZOOM_IN, GOTO_PRESET...). Las '
    'filas anteriores a V77 son todas VER, que es lo único que se registraba.';

COMMENT ON COLUMN cad_camaras_visualizacion.detalle IS
    'Para PTZ: comando, velocidad y duración, o el preset al que se envió.';

-- Consultar los movimientos por separado es lo que se va a pedir en una
-- investigación: «qué cámaras se movieron esa noche».
CREATE INDEX IF NOT EXISTS idx_camvis_accion
    ON cad_camaras_visualizacion (accion, fecha DESC)
    WHERE accion <> 'VER';

DO $$
BEGIN
    RAISE NOTICE 'V77: la auditoría de cámaras distingue consultas de movimientos.';
END $$;
