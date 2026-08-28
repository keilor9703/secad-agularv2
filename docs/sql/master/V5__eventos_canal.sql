-- ============================================================
-- V5 – Eventos module: performance indexes & canal column
-- Apply to every CAD tenant database.
-- ============================================================

-- The Eventos module filters cad_pedidos by:
--   1. enviar = 'S'  (sent to dispatch)
--   2. The dispatcher's canal code appears in cad_pedidos_canales
--      OR in the denormalized cad_pedidos.canales field.

-- Index for fast canal-based lookups in cad_pedidos_canales
CREATE INDEX IF NOT EXISTS idx_pedcanales_canal
    ON cad_pedidos_canales(cadcana_codigo, cadcana_fuerz_id);

-- Index for fast event queue query (enviar + hora_caso)
CREATE INDEX IF NOT EXISTS idx_pedidos_enviar
    ON cad_pedidos(enviar, hora_caso DESC);

-- Ensure cadcana_codigo exists on ctr_usuarios (already in V4, idempotent)
ALTER TABLE ctr_usuarios ADD COLUMN IF NOT EXISTS cadcana_codigo INTEGER DEFAULT 0;

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed: update dispatcher users to have their canal assigned
-- Example (adjust IDs to match your data):
--
-- UPDATE ctr_usuarios SET cadcana_codigo = 1, cadcana_fuerza_id = 1
-- WHERE username = 'despachador1';
-- ──────────────────────────────────────────────────────────────────────────────
