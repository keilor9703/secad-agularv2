-- ══════════════════════════════════════════════════════════════════════════════
-- V42 – cad_medios_disponibles.origen
--
-- Hallazgo de auditoría: cad_turnos_unidades ya distingue el origen de cada
-- unidad/estación (MANUAL vs SIVICC — ver V9__turnos.sql), pero
-- cad_medios_disponibles (la tabla que realmente ve el despachador) no tenía
-- ninguna columna equivalente. No había forma de saber, mirando una patrulla,
-- si llegó por importación de GESPO o fue creada a mano.
--
-- Se agrega la misma columna/CHECK que ya existe en cad_turnos_unidades, con el
-- mismo significado. P_AgregarMedioAsync (manual) queda igual — el DEFAULT
-- 'MANUAL' ya lo cubre. P_ImportarDesdeSiviccAsync ahora escribe 'SIVICC'
-- explícitamente al insertar/reimportar un medio.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE cad_medios_disponibles
    ADD COLUMN IF NOT EXISTS origen VARCHAR(10) NOT NULL DEFAULT 'MANUAL';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE  table_name = 'cad_medios_disponibles' AND constraint_name = 'chk_medios_origen'
  ) THEN
    ALTER TABLE cad_medios_disponibles
      ADD CONSTRAINT chk_medios_origen CHECK (origen IN ('MANUAL', 'SIVICC'));
  END IF;
END $$;

COMMENT ON COLUMN cad_medios_disponibles.origen IS
    'MANUAL: creado a mano por el operador (P_AgregarMedioAsync). '
    'SIVICC: importado desde la minuta digital de GESPO (P_ImportarDesdeSiviccAsync). '
    'Mismo significado que cad_turnos_unidades.origen.';

-- ── Verificación ───────────────────────────────────────────────────────────
SELECT origen, COUNT(*) FROM cad_medios_disponibles GROUP BY origen;
