-- ============================================================
-- V19 – Soporte para usuarios civiles / otras entidades
-- Aplica a cada BD de tenant CAD.
-- ============================================================

-- Tipo de usuario: POLICIA autentica via OUD/PIP; CIVIL autentica localmente.
ALTER TABLE ctr_usuarios
    ADD COLUMN IF NOT EXISTS tipo_usuario VARCHAR(20) DEFAULT 'POLICIA';

COMMENT ON COLUMN ctr_usuarios.tipo_usuario
    IS 'POLICIA = autentica via OUD/PIP. CIVIL = autentica localmente via secad_users_fallback.';

-- Correo electrónico (opcional para policiales, útil para civiles)
ALTER TABLE ctr_usuarios
    ADD COLUMN IF NOT EXISTS email VARCHAR(200) NULL;

-- Entidad / institución de origen para usuarios civiles
ALTER TABLE ctr_usuarios
    ADD COLUMN IF NOT EXISTS entidad VARCHAR(200) NULL;

-- Actualizar registros existentes para que no queden con NULL
UPDATE ctr_usuarios SET tipo_usuario = 'POLICIA' WHERE tipo_usuario IS NULL;
