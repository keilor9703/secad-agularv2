-- ═══════════════════════════════════════════════════════════════════════════
--  Migración V21: Columnas de auditoría en ctr_roles_user
--  Tabla afectada : ctr_roles_user  (tenant DB)
--  Idempotente    : usa ADD COLUMN IF NOT EXISTS
--  Ejecutar en    : cada tenant (base de datos de CAD)
-- ═══════════════════════════════════════════════════════════════════════════

-- Agregar columnas de auditoría a ctr_roles_user si no existen
ALTER TABLE ctr_roles_user
    ADD COLUMN IF NOT EXISTS usuario_creacion BIGINT,
    ADD COLUMN IF NOT EXISTS fecha_creacion   TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS maquina_creacion VARCHAR(100);

-- Verificación
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'ctr_roles_user'
ORDER BY ordinal_position;
