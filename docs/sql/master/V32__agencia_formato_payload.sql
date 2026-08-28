-- ══════════════════════════════════════════════════════════════════════════════
-- V32: Formato de payload para agencias externas salientes
--
-- PLANO       → Body simple con los campos del caso y el mapeo aplicado.
--               Es lo que espera la mayoría de agencias (Bomberos, Cruz Roja, etc.).
--               Ejemplo: { "direccion_emergencia": "Cra 7...", "tipo_incidente": "310" }
--
-- ESTRUCTURADO → Body jerárquico completo con secciones _secad, caso, ubicacion,
--               reportante, despacho, actuaciones. Para agencias sofisticadas
--               o integraciones con otro SECAD.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE cad_agencias_externas
    ADD COLUMN IF NOT EXISTS formato_payload VARCHAR(15) NOT NULL DEFAULT 'PLANO';

COMMENT ON COLUMN cad_agencias_externas.formato_payload IS
    'PLANO = body simple con campos mapeados (default, para la mayoría de agencias). '
    'ESTRUCTURADO = body jerárquico completo con secciones _secad/caso/ubicacion/etc.';
