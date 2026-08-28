-- ============================================================
-- V7 – Tabla de eventos CAD, cierre multi-código e integraciones
-- Aplica a todas las bases de datos tenant CAD.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. CLIENTES DE INTEGRACIÓN EXTERNA
--    Registra qué sistemas externos tienen permiso de crear
--    eventos vía API (apps móviles, CCTV, sistemas de policía,
--    entidades de gobierno, etc.).
--    El API-key real NUNCA se guarda aquí; vive en Vault.
--    Aquí se guarda solo el hash SHA-256 del key para auditoría.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cad_integraciones_clientes (
    id                  SERIAL          PRIMARY KEY,
    nombre              VARCHAR(100)    NOT NULL,
    tipo                VARCHAR(30)     NOT NULL
                            CHECK (tipo IN (
                                'APP_MOVIL',
                                'EMPRESA_SEGURIDAD',
                                'SISTEMA_POLICIAL',
                                'GOBIERNO',
                                'OTRO'
                            )),
    api_key_hash        VARCHAR(128),           -- hash SHA-256 del API key (nunca el key real)
    sitio_graba         INTEGER         NOT NULL,
    vigente             CHAR(1)         NOT NULL DEFAULT 'S' CHECK (vigente IN ('S','N')),
    contacto            VARCHAR(200),
    descripcion         TEXT,
    fecha_creacion      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    usuario_crea        VARCHAR(50)
);

COMMENT ON TABLE cad_integraciones_clientes IS
    'Catálogo de sistemas externos autorizados para crear eventos CAD via API. '
    'El API key real se gestiona en Vault; aquí solo se guarda su hash para auditoría.';


-- ────────────────────────────────────────────────────────────
-- 2. TABLA PRINCIPAL DE EVENTOS
--    Un evento = una decisión de despacho.
--    Relación: cad_pedidos (1) → cad_eventos (1..N)
--              cad_eventos  (1) → cad_pedidos_canales (1..N)
--              cad_eventos  (1) → cad_eventos_codigos_cierre (0..N)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cad_eventos (

    -- ── Identidad ─────────────────────────────────────────────────────────
    id                      BIGINT          NOT NULL,       -- Snowflake ID (generado por la app)
    sitio_graba             INTEGER         NOT NULL,

    -- ── Origen del evento ─────────────────────────────────────────────────
    -- Discriminador esencial para analítica y para el merge Main↔Edge.
    origen                  VARCHAR(20)     NOT NULL DEFAULT 'RECEPCION'
                                CHECK (origen IN (
                                    'CTI',          -- llamada vía centralita telefónica
                                    'RECEPCION',    -- digitado manualmente por operador
                                    'APP_MOVIL',    -- ciudadano desde app
                                    'INTEGRACION',  -- sistema externo via API REST
                                    'SIEDCO',       -- integración base nacional de criminalidad
                                    'INTERNO',      -- sistema radio / interno policial
                                    'MANUAL'        -- despacho manual directo por despachador
                                )),

    -- FK al cliente de integración (solo para origen APP_MOVIL / INTEGRACION)
    integracion_cliente_id  INTEGER
                                REFERENCES cad_integraciones_clientes(id)
                                ON DELETE RESTRICT,
    -- Referencia/ID que el sistema externo asigna a este evento en su propio sistema
    origen_referencia_ext   VARCHAR(200),

    -- ── Vínculo con la llamada (pedido) que originó el evento ─────────────
    -- NULL si el evento se crea sin una llamada previa (despacho proactivo)
    pedido_id               BIGINT,                         -- FK lógica → cad_pedidos.nume_llamada (Snowflake)
    pedido_sitio_graba      INTEGER,                        -- desnormalizado para joins eficientes

    -- ── Asignación de despacho ─────────────────────────────────────────────
    -- Canal/unidad PRINCIPAL asignada; todos los canales están en cad_pedidos_canales
    fuerza_id               INTEGER,                        -- FK cad_fuerzas
    canal_codigo            INTEGER,                        -- FK cad_canales (jurisdicción principal)

    -- ── Personal ───────────────────────────────────────────────────────────
    cedu_empleado           VARCHAR(12),                    -- cédula del empleado que genera
    usuario_genera          VARCHAR(50)     NOT NULL,       -- usuario del sistema que genera
    tipo_despachador        CHAR(1)
                                CHECK (tipo_despachador IN ('D','O','S','N') OR tipo_despachador IS NULL),
                                -- D=despachador, O=operador recepción, S=sistema automático, N=no aplica

    -- ── Turno de servicio ──────────────────────────────────────────────────
    turno_id                BIGINT,                         -- FK cad_turnos (turno principal)
    turno_accesorio_id      BIGINT,                         -- FK cad_turnos (turno de apoyo)

    -- ── SIEDCO ────────────────────────────────────────────────────────────
    siedco_consecutivo      INTEGER,                        -- HECH_CONSECUTIVO
    siedco_unde_codigo      INTEGER,                        -- HECH_UNDE_CODIGO

    -- ── Máquina de estados ─────────────────────────────────────────────────
    estado                  CHAR(1)         NOT NULL DEFAULT 'P'
                                CHECK (estado IN (
                                    'P',    -- Pendiente  (creado, aún no despachado)
                                    'D',    -- Despachado (unidad en camino)
                                    'A',    -- Atendido   (unidad en el lugar del hecho)
                                    'C',    -- Cerrado    (caso finalizado con código de cierre)
                                    'V'     -- Anulado    (falsa alarma, duplicado, cierre rápido)
                                )),

    -- ── Ciclo temporal (NO separar fecha y hora — error Oracle-era) ────────
    fecha_creacion          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    fecha_despacho          TIMESTAMPTZ,        -- ¿cuándo se despachó la unidad?
    fecha_llegada           TIMESTAMPTZ,        -- ¿cuándo llegó al lugar del hecho?
    fecha_cierre            TIMESTAMPTZ,        -- ¿cuándo se cerró formalmente el evento?

    -- ── Cierre (código primario — los adicionales en tabla hija) ──────────
    codigo_cierre_primario  VARCHAR(6),         -- código principal de cierre (FK lógica a catálogo)
    clasif_cierre           VARCHAR(2),         -- clasificación de cierre (FK lógica a catálogo)
    observacion_cierre      TEXT,               -- notas libres de cierre

    -- ── Auditoría ──────────────────────────────────────────────────────────
    fecha_modificacion      TIMESTAMPTZ,
    usuario_modifica        VARCHAR(50),

    CONSTRAINT pk_eventos PRIMARY KEY (id)
);

COMMENT ON TABLE cad_eventos IS
    'Evento de despacho CAD. Un evento = una decisión de despacho. '
    'id es Snowflake (node-partitioned), safe para merge Main↔Edge.';

COMMENT ON COLUMN cad_eventos.estado IS
    'P=Pendiente, D=Despachado, A=Atendido, C=Cerrado, V=Anulado';
COMMENT ON COLUMN cad_eventos.origen IS
    'CTI | RECEPCION | APP_MOVIL | INTEGRACION | SIEDCO | INTERNO | MANUAL';
COMMENT ON COLUMN cad_eventos.pedido_id IS
    'FK lógica a cad_pedidos.nume_llamada (Snowflake BIGINT). '
    'NULL si el evento se creó directamente sin llamada previa.';


-- ────────────────────────────────────────────────────────────
-- 3. CÓDIGOS DE CIERRE DEL EVENTO (tabla hija — N por evento)
--    Permite registrar múltiples códigos al cerrar un evento:
--    código primario, secundario, disposición, novedad, etc.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cad_eventos_codigos_cierre (
    evento_id           BIGINT          NOT NULL
                            REFERENCES cad_eventos(id)
                            ON DELETE CASCADE,
    orden               SMALLINT        NOT NULL
                            CHECK (orden BETWEEN 1 AND 20),
    codigo_cierre       VARCHAR(6)      NOT NULL,
    tipo_codigo         VARCHAR(20)     NOT NULL DEFAULT 'CIERRE'
                            CHECK (tipo_codigo IN (
                                'CIERRE',       -- código de cierre del caso
                                'DISPOSICION',  -- qué hizo la unidad (captura, informe, etc.)
                                'NOVEDAD'       -- novedad adicional
                            )),
    descripcion_libre   TEXT,
    usuario_registra    VARCHAR(50)     NOT NULL,
    fecha_registra      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_eventos_codigos PRIMARY KEY (evento_id, orden)
);

COMMENT ON TABLE cad_eventos_codigos_cierre IS
    'Uno o más códigos de cierre por evento. '
    'orden=1 es el código primario; los demás son secundarios/disposición/novedad.';


-- ────────────────────────────────────────────────────────────
-- 4. ÍNDICES DE RENDIMIENTO
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_eventos_pedido
    ON cad_eventos(pedido_id)
    WHERE pedido_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eventos_sitio_estado
    ON cad_eventos(sitio_graba, estado, fecha_creacion DESC);

CREATE INDEX IF NOT EXISTS idx_eventos_canal
    ON cad_eventos(fuerza_id, canal_codigo)
    WHERE canal_codigo IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eventos_origen
    ON cad_eventos(origen, fecha_creacion DESC);

CREATE INDEX IF NOT EXISTS idx_eventos_cierre
    ON cad_eventos(estado, fecha_cierre DESC)
    WHERE estado IN ('C','V');

CREATE INDEX IF NOT EXISTS idx_codigos_cierre_evento
    ON cad_eventos_codigos_cierre(evento_id);


-- ────────────────────────────────────────────────────────────
-- 5. BACKFILL: crear registros en cad_eventos para eventos
--    históricos que ya existen en cad_pedidos_canales
--    (los que tienen cadeven_nume_evento NOT NULL)
--    Se inserta con origen='RECEPCION' y estado inferido
--    del estado del pedido original.
-- ────────────────────────────────────────────────────────────
INSERT INTO cad_eventos (
    id, sitio_graba, origen,
    pedido_id, pedido_sitio_graba,
    fuerza_id, canal_codigo,
    usuario_genera, tipo_despachador,
    estado, fecha_creacion
)
SELECT DISTINCT ON (pc.cadeven_nume_evento)
    pc.cadeven_nume_evento          AS id,
    pc.cadpedi_sitiograba           AS sitio_graba,
    'RECEPCION'                     AS origen,
    pc.cadpedi_numellamada          AS pedido_id,
    pc.cadpedi_sitiograba           AS pedido_sitio_graba,
    pc.cadcana_fuerz_id             AS fuerza_id,
    pc.cadcana_codigo               AS canal_codigo,
    COALESCE(pc.usua_modifica, 'MIGRACION_V7') AS usuario_genera,
    'O'                             AS tipo_despachador,
    CASE COALESCE(p.estado, 'A')
        WHEN 'C' THEN 'C'
        WHEN 'V' THEN 'V'
        ELSE 'P'
    END                             AS estado,
    COALESCE(pc.fecha_grabacion, NOW()) AS fecha_creacion
FROM cad_pedidos_canales pc
LEFT JOIN cad_pedidos p
    ON p.sitio_graba   = pc.cadpedi_sitiograba
   AND p.nume_llamada  = pc.cadpedi_numellamada
WHERE pc.cadeven_nume_evento IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM cad_eventos e WHERE e.id = pc.cadeven_nume_evento
  )
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 6. VERIFICACIÓN (ejecutar para confirmar la migración)
-- ────────────────────────────────────────────────────────────
-- SELECT
--     (SELECT COUNT(*) FROM cad_eventos)                       AS total_eventos,
--     (SELECT COUNT(*) FROM cad_eventos_codigos_cierre)        AS total_codigos_cierre,
--     (SELECT COUNT(*) FROM cad_integraciones_clientes)        AS total_integraciones,
--     (SELECT COUNT(DISTINCT cadeven_nume_evento)
--      FROM cad_pedidos_canales
--      WHERE cadeven_nume_evento IS NOT NULL)                   AS canales_con_evento,
--     (SELECT COUNT(*) FROM cad_eventos WHERE origen='RECEPCION') AS eventos_backfill;
