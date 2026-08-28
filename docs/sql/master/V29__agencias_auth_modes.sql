-- ══════════════════════════════════════════════════════════════════════════════
-- V29: Modos de autenticación flexibles para agencias externas salientes
--
-- Agrega soporte para 6 modos de auth en cad_agencias_externas:
--   NONE       — Sin autenticación
--   BEARER     — Token estático en Authorization: Bearer <token>  (comportamiento previo)
--   BASIC      — HTTP Basic Auth: Authorization: Basic base64(usuario:password)
--   OAUTH2     — Client Credentials: SECAD pide token a token_url, luego lo usa como Bearer
--   API_KEY    — API Key en una cabecera personalizada (ej: X-Api-Key)
--   CREDS_BODY — Usuario/contraseña inyectados en el body del request junto con el caso
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE cad_agencias_externas
    ADD COLUMN IF NOT EXISTS tipo_auth    VARCHAR(20) NOT NULL DEFAULT 'BEARER',
    ADD COLUMN IF NOT EXISTS api_usuario  TEXT,                    -- usuario para BASIC/OAUTH2/CREDS_BODY
    ADD COLUMN IF NOT EXISTS api_password TEXT,                    -- contraseña (idealmente cifrada en prod)
    ADD COLUMN IF NOT EXISTS auth_extra   JSONB;                   -- config flexible por modo

COMMENT ON COLUMN cad_agencias_externas.tipo_auth IS
    'NONE | BEARER | BASIC | OAUTH2 | API_KEY | CREDS_BODY';

COMMENT ON COLUMN cad_agencias_externas.api_usuario IS
    'Usuario para BASIC (user:pass → Base64), OAUTH2 (client_id) y CREDS_BODY.';

COMMENT ON COLUMN cad_agencias_externas.api_password IS
    'Contraseña para BASIC, OAUTH2 (client_secret) y CREDS_BODY. Cifrar en producción.';

COMMENT ON COLUMN cad_agencias_externas.auth_extra IS
    'Configuración adicional por modo. Ejemplos:
     OAUTH2:     {"tokenUrl":"https://...","grantType":"client_credentials"}
     API_KEY:    {"keyHeader":"X-Api-Key"}
     CREDS_BODY: {"bodyUserField":"usuario","bodyPassField":"contrasena"}';

-- Marcar las agencias existentes con token como BEARER (retrocompatibilidad)
UPDATE cad_agencias_externas
   SET tipo_auth = 'BEARER'
 WHERE tipo_auth = 'BEARER'   -- ya es el default, solo para claridad
   AND api_token IS NOT NULL;
