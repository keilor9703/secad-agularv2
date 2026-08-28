-- ══════════════════════════════════════════════════════════════════════════════
-- V25: Catálogo de agencias externas para despacho interagencial (§6.1 / §6.11)
--
-- Propósito:
--   Permite al operador, tanto desde Recepción como desde Eventos, remitir un
--   caso a agencias que NO usan SECAD, enviando los datos por API REST.
--   Las agencias que SÍ usan SECAD se gestionan seleccionando sus canales
--   (cad_canales) en el formulario de Recepción.
--
-- Tipos de agencia:
--   BOMBEROS | CRUZ_ROJA | TRANSITO | EJERCITO | PSICOSOCIAL | AMBULANCIA | OTRA
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Catálogo de agencias externas
CREATE TABLE IF NOT EXISTS cad_agencias_externas (
    id                  BIGINT        NOT NULL PRIMARY KEY,            -- Snowflake
    nombre              VARCHAR(100)  NOT NULL,
    descripcion         VARCHAR(255),
    tipo_agencia        VARCHAR(50)   NOT NULL DEFAULT 'OTRA',
    -- ── Configuración de API ──────────────────────────────────────────────────
    api_url             VARCHAR(500),                                   -- Endpoint destino
    api_metodo          VARCHAR(10)   NOT NULL DEFAULT 'POST',          -- POST | PUT
    -- Token de autenticación (Bearer o API-Key)
    api_token           TEXT,
    -- Cabeceras HTTP adicionales: { "X-Header": "valor" }
    api_cabeceras       JSONB,
    -- Mapeo de campos: { "campoNuestro": "campoDeEllos" }
    campo_mapeo         JSONB,
    -- ── Control ───────────────────────────────────────────────────────────────
    activa              BOOLEAN       NOT NULL DEFAULT TRUE,
    fecha_creacion      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    fecha_modificacion  TIMESTAMPTZ
);

-- 2. Registro auditado de cada despacho a agencia externa (§6.18)
CREATE TABLE IF NOT EXISTS cad_despachos_externos (
    id                  BIGINT        NOT NULL PRIMARY KEY,            -- Snowflake
    pedido_id           BIGINT        NOT NULL,                        -- cad_pedidos.id
    sitio_graba         INTEGER       NOT NULL,
    agencia_id          BIGINT        NOT NULL REFERENCES cad_agencias_externas(id),
    payload_enviado     JSONB,                                         -- JSON enviado
    http_status         SMALLINT,                                      -- Código HTTP respuesta
    respuesta_api       TEXT,                                          -- Cuerpo de respuesta
    enviado_por         VARCHAR(100),
    fecha_envio         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    exitoso             BOOLEAN       NOT NULL DEFAULT FALSE
);

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_cad_agencias_externas_activa
    ON cad_agencias_externas (activa)
    WHERE activa = TRUE;

CREATE INDEX IF NOT EXISTS idx_cad_despachos_externos_pedido
    ON cad_despachos_externos (pedido_id, sitio_graba);

CREATE INDEX IF NOT EXISTS idx_cad_despachos_externos_agencia
    ON cad_despachos_externos (agencia_id, fecha_envio DESC);

-- 4. Ítem de menú: Agencias Externas bajo Administración
DO $$
DECLARE
  v_id_admin   BIGINT;
  v_id_item    BIGINT;
BEGIN
  SELECT id_menu INTO v_id_admin
  FROM ctr_menu
  WHERE LOWER(descripcion) LIKE '%administraci%' AND vigente = 1
  ORDER BY id_menu LIMIT 1;

  IF v_id_admin IS NOT NULL THEN
    SELECT id_menu INTO v_id_item
    FROM ctr_menu
    WHERE idpadre = v_id_admin AND detalle = '/administracion/agencias-externas'
    LIMIT 1;

    IF v_id_item IS NULL THEN
      INSERT INTO ctr_menu
        (descripcion, idpadre, posicion, tipo, icono, vigente, detalle,
         usuario_creacion, fecha_creacion, maquina_creacion)
      VALUES
        ('Agencias Externas', v_id_admin, 60, 'ENLACE',
         'fa-solid fa-building-shield', 1, '/administracion/agencias-externas',
         1, NOW(), 'migration-V25')
      RETURNING id_menu INTO v_id_item;

      -- Asignar al rol Administrador (id=1) y SuperAdministrador (id=2)
      INSERT INTO ctr_menu_roles (id_rol, id_menu, usuario_creacion, fecha_creacion, maquina_creacion)
      SELECT r.id_rol, v_id_item, 1, NOW(), 'migration-V25'
      FROM (VALUES (1),(2)) AS r(id_rol)
      WHERE NOT EXISTS (
        SELECT 1 FROM ctr_menu_roles mr
        WHERE mr.id_rol = r.id_rol AND mr.id_menu = v_id_item
      );

      RAISE NOTICE 'V25: Ítem "Agencias Externas" creado con id = %', v_id_item;
    ELSE
      RAISE NOTICE 'V25: Ítem "Agencias Externas" ya existe con id = %', v_id_item;
    END IF;
  END IF;
END $$;

COMMENT ON TABLE cad_agencias_externas
    IS '§6.1 Catálogo de agencias que reciben casos por API REST (Bomberos, Cruz Roja, Tránsito…). No usan SECAD.';

COMMENT ON TABLE cad_despachos_externos
    IS '§6.18 Auditoría de envíos a agencias externas. Registra payload, HTTP status y resultado.';
