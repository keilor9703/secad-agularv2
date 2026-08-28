-- ══════════════════════════════════════════════════════════════════════════════
-- V35: Ampliar cedu_empleado VARCHAR(12) → VARCHAR(20)
--
-- Problema: cad_eventos.cedu_empleado fue declarada VARCHAR(12) pensando en
-- cédulas colombianas (máx. 10 dígitos). Sin embargo, cuando el usuario inicia
-- sesión por fallback local (sin OUD), el sistema usa el id_usuario interno
-- (BIGINT / Snowflake ID de hasta 19 dígitos) como identificador del empleado,
-- lo que excede el límite y produce el error 22001.
--
-- Solución: ampliar a VARCHAR(20) para cubrir tanto cédulas reales (≤12)
-- como identificadores internos (Snowflake ≤19).
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE cad_eventos
    ALTER COLUMN cedu_empleado TYPE VARCHAR(20);

-- Verificación
SELECT column_name, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'cad_eventos'
  AND column_name = 'cedu_empleado';
