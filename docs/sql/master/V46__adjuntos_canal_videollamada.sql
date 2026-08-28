-- ============================================================
-- V46 – Permitir CanalOrigen='VIDEOLLAMADA' en cad_adjuntos
--
-- V45 (videollamadas) documenta que la grabación de una videollamada se
-- sube como un cad_adjuntos más, con CanalOrigen='VIDEOLLAMADA'
-- (ver AdjuntoController.SubirVideo), pero nunca amplió el CHECK que
-- V24 le puso a cad_adjuntos.canal_origen — que solo permite
-- 'MANUAL','API_CHAT','API_SMS','API_FOTO'. Cada intento de subir una
-- grabación viola ese constraint y el insert falla con un error de
-- Postgres, que AdjuntoController.SubirVideo captura genéricamente y
-- responde 500 "Error interno al subir la grabación."
--
-- El DO block busca el constraint por definición (no por nombre) para
-- no depender de si Postgres lo auto-nombró como
-- cad_adjuntos_canal_origen_check o distinto en cada tenant.
-- ============================================================

DO $$
DECLARE
    v_constraint_name TEXT;
BEGIN
    SELECT conname INTO v_constraint_name
    FROM pg_constraint
    WHERE conrelid = 'cad_adjuntos'::regclass
      AND contype  = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%canal_origen%';

    IF v_constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE cad_adjuntos DROP CONSTRAINT %I', v_constraint_name);
    END IF;
END $$;

ALTER TABLE cad_adjuntos
    ADD CONSTRAINT cad_adjuntos_canal_origen_check
    CHECK (canal_origen IN ('MANUAL','API_CHAT','API_SMS','API_FOTO','VIDEOLLAMADA'));
