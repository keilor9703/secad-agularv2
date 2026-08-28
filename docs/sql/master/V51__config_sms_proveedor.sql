-- ══════════════════════════════════════════════════════════════════════════
-- V51: Configuración del proveedor de SMS (tabla, por tenant)
--
-- Hasta ahora el proveedor de SMS (Infobip) y sus credenciales solo se
-- podían configurar editando appsettings.json / variables de entorno del
-- contenedor "api" (Sms:Infobip:BaseUrl/ApiKey/Sender) — cambiar de
-- proveedor requería tocar la infraestructura y reiniciar el backend.
--
-- Esta tabla es un "singleton" (siempre una sola fila, id=1) con el
-- proveedor activo y sus credenciales, editable desde
-- Administración → Proveedor SMS sin redeploy. InfobipProveedorSms es
-- reemplazado por una implementación que lee esta tabla y despacha al
-- proveedor configurado (Infobip o Inalambria Express por ahora).
--
-- Idempotente.
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ctr_config_sms (
    id               SMALLINT     PRIMARY KEY DEFAULT 1,
    proveedor        VARCHAR(30)  NOT NULL DEFAULT 'INFOBIP',
    base_url         VARCHAR(300),
    api_key          VARCHAR(500),
    sender           VARCHAR(50),
    usuario_modifica VARCHAR(120),
    fecha_modifica   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_config_sms_id_singleton CHECK (id = 1),
    CONSTRAINT ck_config_sms_proveedor CHECK (proveedor IN ('INFOBIP', 'INALAMBRIA_EXPRESS'))
);

COMMENT ON TABLE ctr_config_sms IS
  'Configuración del proveedor de SMS saliente (link de videollamada, etc). Fila única (id=1) — editable desde Administración → Proveedor SMS.';

INSERT INTO ctr_config_sms (id, proveedor)
VALUES (1, 'INFOBIP')
ON CONFLICT (id) DO NOTHING;
