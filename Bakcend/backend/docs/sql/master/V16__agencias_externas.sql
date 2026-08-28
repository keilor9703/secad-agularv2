-- ══════════════════════════════════════════════════════════════════════════════
-- V16: Catálogo de agencias externas para despacho interagencial (§6.1 / §6.11)
--
-- Propósito:
--   Permite al operador, tanto desde Recepción como desde Eventos, remitir un
--   caso a agencias que NO usan SECAD, enviando los datos por API REST.
--   Las agencias que SÍ usan SECAD se gestionan simplemente seleccionando sus
--   canales (cad_canales) en el formulario de Recepción.
--
-- Tipos de agencia (tipo_agencia):
--   BOMBEROS | CRUZ_ROJA | TRANSITO | EJERCITO | PSICOSOCIAL | AMBULANCIA | OTRA
--
-- Seguridad:
--   api_token se almacena en texto — en producción debe cifrarse (Vault / KMS).
--   Se recomienda usar un token de servicio dedicado por agencia.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cad_agencias_externas (
    id                  BIGINT        NOT NULL PRIMARY KEY,            -- Snowflake
    nombre              VARCHAR(100)  NOT NULL,
    descripcion         VARCHAR(255),
    tipo_agencia        VARCHAR(50)   NOT NULL DEFAULT 'OTRA',
    -- ── Configuración de API ──────────────────────────────────────────────────
    api_url             VARCHAR(500),                                   -- Endpoint destino
    api_metodo          VARCHAR(10)   NOT NULL DEFAULT 'POST',          -- POST | PUT
    -- Token de autenticación (Bearer o API-Key); null = sin autenticación
    api_token           TEXT,
    -- Cabeceras HTTP adicionales en formato JSON: { "X-Header": "valor" }
    api_cabeceras       JSONB,
    -- Mapeo de campos: { "campoNuestro": "campoDeEllos" }
    -- Campos soportados: id, codDane, codiPedido, direCaso, latitud, longitud,
    --                    ciudad, prioridad, descripcion, nombLlamante, telefono
    campo_mapeo         JSONB,
    -- ── Control ───────────────────────────────────────────────────────────────
    activa              BOOLEAN       NOT NULL DEFAULT TRUE,
    fecha_creacion      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    fecha_modificacion  TIMESTAMPTZ
);

-- Registro auditado de cada despacho a agencia externa
CREATE TABLE IF NOT EXISTS cad_despachos_externos (
    id                  BIGINT        NOT NULL PRIMARY KEY,            -- Snowflake
    pedido_id           BIGINT        NOT NULL,                        -- cad_pedidos.id
    sitio_graba         INTEGER       NOT NULL,
    agencia_id          BIGINT        NOT NULL REFERENCES cad_agencias_externas(id),
    -- Datos del envío
    payload_enviado     JSONB,                                         -- JSON que se envió
    http_status         SMALLINT,                                      -- Código HTTP respuesta
    respuesta_api       TEXT,                                          -- Cuerpo de la respuesta
    -- Control
    enviado_por         VARCHAR(100),
    fecha_envio         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    exitoso             BOOLEAN       NOT NULL DEFAULT FALSE
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_cad_despachos_externos_pedido
    ON cad_despachos_externos (pedido_id, sitio_graba);

CREATE INDEX IF NOT EXISTS idx_cad_agencias_externas_activa
    ON cad_agencias_externas (activa)
    WHERE activa = TRUE;

COMMENT ON TABLE cad_agencias_externas
    IS 'Catálogo de agencias externas que reciben casos por API REST (Bomberos, Cruz Roja, Tránsito, etc.)';

COMMENT ON TABLE cad_despachos_externos
    IS 'Registro auditado de cada envío de caso a una agencia externa. Trazabilidad §6.18.';
