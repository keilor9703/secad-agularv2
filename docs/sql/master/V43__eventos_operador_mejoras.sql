-- ============================================================
-- V43 — Mejoras operativas del módulo de Eventos (despacho)
-- Aplica a cada base de datos tenant CAD.
--
-- Agrupa el soporte de esquema para varias mejoras pedidas tras
-- una auditoría del módulo desde la perspectiva de un despachador:
--   1. Historial + motivo obligatorio al cambiar cad_pedidos.estado
--   2. Solicitud de apoyo urgente por actuación (seguridad del funcionario)
--
-- NOTA: "vincular casos duplicados" NO requiere migración — reutiliza
-- las columnas cad_pedidos.pedido_padre_sitio/pedido_padre_num que ya
-- existen desde V3 (hasta ahora sin ninguna acción de UI que las usara).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. HISTORIAL DE CAMBIOS DE ESTADO DE cad_pedidos
--    Antes, SetEstadoAsync solo sobrescribía usuario_modifica/
--    fecha_modifica — no quedaba rastro de POR QUÉ ni de los
--    estados intermedios. Ahora cada cambio manual de estado
--    (Activo/Pendiente/Seguimiento/Revisión) exige un motivo y
--    queda registrado acá para auditoría.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cad_pedidos_estado_historial (
    id              BIGSERIAL       PRIMARY KEY,
    pedido_id       BIGINT          NOT NULL,
    estado_anterior VARCHAR(20),
    estado_nuevo    VARCHAR(20)     NOT NULL,
    motivo          VARCHAR(500),
    usuario         BIGINT,
    username        VARCHAR(100),
    fecha           TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE cad_pedidos_estado_historial IS
    'Rastro de auditoría de cada cambio manual de cad_pedidos.estado '
    '(vía PUT api/Evento/{id}/estado) — quién, cuándo, desde/hacia qué '
    'estado y por qué. Antes de V43 solo quedaba el último cambio.';

CREATE INDEX IF NOT EXISTS idx_pedidos_estado_historial_pedido
    ON cad_pedidos_estado_historial(pedido_id, fecha DESC);


-- ────────────────────────────────────────────────────────────
-- 2. SOLICITUD DE APOYO URGENTE (seguridad del funcionario)
--    Antes no existía ninguna forma de que una unidad en campo
--    (o el despachador en su nombre) señalizara una emergencia
--    puntual sobre la actuación que está gestionando.
-- ────────────────────────────────────────────────────────────
ALTER TABLE cad_actuaciones
    ADD COLUMN IF NOT EXISTS solicita_apoyo      BOOLEAN      NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS fecha_solicita_apoyo TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS apoyo_atendido_por   VARCHAR(50),
    ADD COLUMN IF NOT EXISTS fecha_apoyo_atendido  TIMESTAMPTZ;

COMMENT ON COLUMN cad_actuaciones.solicita_apoyo IS
    'TRUE mientras la actuación tiene una solicitud de apoyo urgente activa '
    '(código de auxilio). Se limpia al marcar "atendido", no al cerrar la '
    'actuación — un apoyo puede resolverse sin que el caso termine.';

-- Índice parcial: solo interesa consultar rápido las que están activas,
-- que en cualquier momento dado deberían ser muy pocas (idealmente 0).
CREATE INDEX IF NOT EXISTS idx_actuaciones_solicita_apoyo
    ON cad_actuaciones(solicita_apoyo)
    WHERE solicita_apoyo = TRUE;
