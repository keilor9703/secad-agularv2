-- ============================================================
-- V14 — SLA configuration + access audit for Events module
-- ============================================================

-- ── 1. Tabla de configuración de SLAs (thresholds) ──────────
CREATE TABLE IF NOT EXISTS cad_config_sla (
    id             SERIAL PRIMARY KEY,
    nombre         VARCHAR(50)  NOT NULL UNIQUE,
    umbral_minutos INTEGER      NOT NULL DEFAULT 5,
    color_hex      VARCHAR(10)  NOT NULL DEFAULT '#f59e0b',
    descripcion    VARCHAR(200),
    activo         BOOLEAN      NOT NULL DEFAULT TRUE,
    orden          INTEGER      NOT NULL DEFAULT 1,
    fecha_mod      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE cad_config_sla IS
  'Umbrales de SLA para la semaforización del módulo de Eventos. '
  'Configurable desde el panel de administración — NO hardcodear en el frontend.';

-- Seed: valores por defecto operativos
INSERT INTO cad_config_sla (nombre, umbral_minutos, color_hex, descripcion, orden) VALUES
  ('SIN_ACCESO',      1, '#f59e0b',
   'Evento en cola sin que ningún despachador lo haya abierto (advertencia temprana)', 1),
  ('GESTION_CRITICA', 10, '#ef4444',
   'Evento abierto (accedido) pero sin cerrar después de N minutos (estado crítico)',  2)
ON CONFLICT (nombre) DO NOTHING;

-- ── 2. Tabla de auditoría de accesos ────────────────────────
CREATE TABLE IF NOT EXISTS cad_auditoria_acceso_evento (
    id           BIGSERIAL    PRIMARY KEY,
    pedido_id    BIGINT       NOT NULL,
    usuario_id   BIGINT,
    username     VARCHAR(100),
    fecha_acceso TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    ip_origen    VARCHAR(50),
    accion       VARCHAR(50)  NOT NULL DEFAULT 'VIEW'
);

COMMENT ON TABLE cad_auditoria_acceso_evento IS
  'Registra cada vez que un despachador ve o gestiona un evento. '
  'Cumplimiento Ley 1581/2012 — trazabilidad de acceso a información de incidentes.';

CREATE INDEX IF NOT EXISTS idx_audit_pedido_id
    ON cad_auditoria_acceso_evento(pedido_id);

CREATE INDEX IF NOT EXISTS idx_audit_fecha_acceso
    ON cad_auditoria_acceso_evento(fecha_acceso DESC);

-- ── 3. Primer acceso por evento ──────────────────────────────
-- Se llena automáticamente la primera vez que el despachador
-- abre el detalle del evento (EventoController.GetById).
ALTER TABLE cad_pedidos
    ADD COLUMN IF NOT EXISTS fecha_primer_acceso TIMESTAMPTZ;

COMMENT ON COLUMN cad_pedidos.fecha_primer_acceso IS
  'Timestamp del primer acceso al detalle del evento por un despachador. '
  'NULL = evento en cola, nunca visto. Usado para la semaforización SLA.';
