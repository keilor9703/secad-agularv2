-- ══════════════════════════════════════════════════════════════════════════════
-- V13 — Snowflake IDs para cad_pedidos
-- Elimina la secuencia BIGSERIAL y pasa la generación del id al backend,
-- igual que cad_actuaciones y cad_eventos.
-- Los registros existentes (id secuencial) se conservan intactos.
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Romper la dependencia con la secuencia (la columna deja de tener DEFAULT)
ALTER TABLE cad_pedidos ALTER COLUMN id DROP DEFAULT;

-- 2. Eliminar la secuencia automática si existe (nombre por convención PostgreSQL)
DROP SEQUENCE IF EXISTS cad_pedidos_id_seq;

-- 3. (Opcional) Asegurar que la columna sea NOT NULL — ya debería serlo,
--    pero lo reforzamos para evitar inserciones accidentales sin id.
ALTER TABLE cad_pedidos ALTER COLUMN id SET NOT NULL;

-- Nota: los valores existentes (1, 2, ... 15) no colisionarán con Snowflakes
-- futuros porque los Snowflakes del sistema inician en ≈ 3.1 × 10^17,
-- mucho más altos que cualquier secuencia pequeña.
