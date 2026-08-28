-- ══════════════════════════════════════════════════════════════════════════════
-- V33: Nota de integración MFA
--
-- Las tablas MFA (usuarios enrolados, dispositivos confiables, auditoría)
-- residen en la BASE DE DATOS del servicio centralizado Api2FA, NO en cada
-- tenant de SECAD. Este script solo documenta la integración.
--
-- Para la BD del Api2FA se requieren los procedimientos:
--   p_get_mfa(p_identificacion BIGINT, p_usuario_inst VARCHAR)
--   p_guardar_secreto(...)
--   p_intento_fallido(...)
--   p_validacion_ok(...)
--   p_trust_save(...)
--   p_trust_isvalid(...)
--   p_trust_clear_user(...)
--   p_reset_mfa(...)
--   p_reset_request(...)
--   p_reset_confirm(...)
--   p_reset_execute(...)
--
-- Configuración requerida en SECAD appsettings.json:
--   Mfa:Enabled         = true  (activar 2FA)
--   Mfa:ApiBaseUrl      = URL del Api2FA institucional
--   Mfa:Sistema         = "SECAD"
--   Mfa:HmacSecret      = secreto compartido con Api2FA:SistemasConfiables:SECAD
--   Mfa:AllowLoginOnServiceDown = false (por seguridad)
-- ══════════════════════════════════════════════════════════════════════════════

-- Tabla de auditoría local de intentos MFA (opcional, para trazabilidad en SECAD)
-- Si se desea registrar en el tenant del usuario (no en Api2FA):

CREATE TABLE IF NOT EXISTS cad_mfa_auditoria_local (
    id              BIGINT       PRIMARY KEY,
    usuario         VARCHAR(120) NOT NULL,
    identificacion  BIGINT       NOT NULL,
    evento          VARCHAR(30)  NOT NULL,  -- 'login_ok' | 'mfa_ok' | 'mfa_fail' | 'enroll_ok' | 'reset'
    ip              VARCHAR(45),
    fecha           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  cad_mfa_auditoria_local IS 'Auditoría local de eventos MFA por tenant. La fuente de verdad MFA está en Api2FA.';
COMMENT ON COLUMN cad_mfa_auditoria_local.evento IS 'login_ok=credenciales OK | mfa_ok=2FA exitoso | mfa_fail=código inválido | enroll_ok=enrolado | reset=reset ejecutado';

CREATE INDEX IF NOT EXISTS idx_mfa_aud_usuario ON cad_mfa_auditoria_local(usuario, fecha DESC);
