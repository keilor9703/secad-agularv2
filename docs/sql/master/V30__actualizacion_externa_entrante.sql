-- ══════════════════════════════════════════════════════════════════════════════
-- V30: Auditoría de actualizaciones de estado recibidas desde agencias externas
--
-- Flujo: Agencia externa → PIP → SECAD POST /api/ActualizacionExterna/{casoId}
-- Autenticación: misma X-Api-Key que RecepcionExterna (configurada en appsettings).
-- Cada actualización recibida se registra aquí antes de procesar,
-- igual que cad_auditoria_recepcion_externa lo hace para entrantes.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cad_auditoria_actualizacion_externa (
    id                  BIGINT          NOT NULL PRIMARY KEY,       -- Snowflake
    caso_id             BIGINT          NOT NULL,                   -- cad_pedidos.id
    actuacion_id        BIGINT,                                     -- cad_actuaciones.id (si se resolvió)
    agencia_nombre      VARCHAR(200),                               -- nombre de la agencia que actualiza
    estado_reportado    CHAR(1),                                    -- D / A / C / V
    payload_crudo       JSONB,                                      -- body tal como llegó de PIP
    procesado           BOOLEAN         NOT NULL DEFAULT FALSE,
    error               TEXT,
    ip_origen           VARCHAR(50),
    fecha_recepcion     TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE cad_auditoria_actualizacion_externa IS
    'Registro de cada actualización de estado recibida de agencias externas via PIP. '
    'Equivalente a cad_auditoria_recepcion_externa para el flujo de retroalimentación.';

CREATE INDEX IF NOT EXISTS idx_audit_actxext_caso
    ON cad_auditoria_actualizacion_externa(caso_id);

CREATE INDEX IF NOT EXISTS idx_audit_actxext_fecha
    ON cad_auditoria_actualizacion_externa(fecha_recepcion DESC);
