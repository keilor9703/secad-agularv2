-- ============================================================
-- V8 – Actuaciones por canal: trazabilidad multi-agencia
--
-- CONTEXTO
-- Un solo incidente puede requerir respuesta de múltiples
-- agencias (Policía, Salud, Bomberos, Ejército, etc.).
-- Cada agencia tiene su propio ciclo de vida independiente:
-- su propio despacho, su propia llegada, su propio cierre
-- y sus propios códigos de cierre.
--
-- MODELO
--   cad_pedidos (1) → cad_eventos (1) → cad_actuaciones (N)
--                                              └→ cad_actuaciones_codigos (N)
--
-- Aplica a cada base de datos tenant CAD.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. TABLA PRINCIPAL DE ACTUACIONES
--    Una fila por agencia/canal despachado por evento.
--    Cada fila tiene su propio estado y sus propios timestamps.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cad_actuaciones (

    -- ── Identidad ───────────────────────────────────────────
    id                      BIGINT          NOT NULL,   -- Snowflake ID
    evento_id               BIGINT          NOT NULL
                                REFERENCES cad_eventos(id)
                                ON DELETE RESTRICT,

    -- Desnormalizado para queries directos sin JOIN a cad_eventos
    pedido_id               BIGINT,
    sitio_graba             INTEGER         NOT NULL DEFAULT 0,

    -- ── Agencia/Canal ────────────────────────────────────────
    fuerza_id               INTEGER,
    canal_codigo            INTEGER,
    -- Guardamos la descripción al momento del despacho (snapshot)
    -- para que renombrar el canal no altere el historial
    fuerza_descripcion      VARCHAR(200),
    canal_descripcion       VARCHAR(200),

    -- ── Quién despachó esta actuación ────────────────────────
    despachador_usuario     VARCHAR(50),
    tipo_despachador        CHAR(1)
                                CHECK (tipo_despachador IN ('D','O','S','N') OR tipo_despachador IS NULL),

    -- ── Recurso/Unidad asignada ──────────────────────────────
    -- Si la agencia despacha varias unidades, usar tabla hija
    -- cad_actuaciones_unidades (ver nota al final)
    unidad_asignada         VARCHAR(100),
    placa_unidad            VARCHAR(50),

    -- ── Estado PROPIO de esta actuación ──────────────────────
    -- Completamente independiente del estado de las demás actuaciones
    -- del mismo evento. La Policía puede estar "Atendida" mientras
    -- la Ambulancia sigue "En camino".
    estado                  CHAR(1)         NOT NULL DEFAULT 'P'
                                CHECK (estado IN (
                                    'P',    -- Pendiente  (asignada, sin despachar)
                                    'D',    -- Despachada (unidad en camino)
                                    'A',    -- Atendida   (unidad en sitio)
                                    'C',    -- Cerrada    (actuación finalizada)
                                    'V'     -- Anulada    (no fue necesaria / error)
                                )),

    -- ── Timestamps PROPIOS de esta actuación ─────────────────
    fecha_creacion          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    fecha_despacho          TIMESTAMPTZ,    -- cuándo esta agencia fue despachada
    fecha_llegada           TIMESTAMPTZ,    -- cuándo esta agencia llegó al lugar
    fecha_cierre            TIMESTAMPTZ,    -- cuándo esta agencia cerró su parte

    -- ── Cierre de esta actuación ─────────────────────────────
    -- Código PRIMARIO; los adicionales van en cad_actuaciones_codigos
    codigo_cierre_primario  VARCHAR(6),
    clasif_cierre           VARCHAR(2),
    observacion_cierre      TEXT,

    -- ── Prioridad y calificación de este canal específico ────
    -- Puede diferir de la calificación global del pedido
    cali_pedido             VARCHAR(50),

    -- ── Auditoría ────────────────────────────────────────────
    fecha_modificacion      TIMESTAMPTZ,
    usuario_modifica        VARCHAR(50),

    CONSTRAINT pk_actuaciones PRIMARY KEY (id)
);

COMMENT ON TABLE cad_actuaciones IS
    'Una actuación por agencia/canal por evento. '
    'Cada fila tiene su propio ciclo de vida (estado, timestamps, cierre) '
    'independiente de las demás agencias que atienden el mismo incidente.';

COMMENT ON COLUMN cad_actuaciones.estado IS
    'P=Pendiente, D=Despachada, A=Atendida (en sitio), C=Cerrada, V=Anulada. '
    'INDEPENDIENTE del estado de las demás actuaciones del mismo evento.';

COMMENT ON COLUMN cad_actuaciones.unidad_asignada IS
    'Identificador del recurso principal asignado (patrulla, ambulancia, camión, etc.). '
    'Si la agencia despacha múltiples unidades, usar cad_actuaciones_unidades.';


-- ────────────────────────────────────────────────────────────
-- 2. CÓDIGOS DE CIERRE POR ACTUACIÓN (N por actuación)
--    Permite múltiples códigos cuando una agencia cierra su parte.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cad_actuaciones_codigos (
    actuacion_id        BIGINT          NOT NULL
                            REFERENCES cad_actuaciones(id)
                            ON DELETE CASCADE,
    orden               SMALLINT        NOT NULL CHECK (orden BETWEEN 1 AND 20),
    codigo_cierre       VARCHAR(6)      NOT NULL,
    tipo_codigo         VARCHAR(20)     NOT NULL DEFAULT 'CIERRE'
                            CHECK (tipo_codigo IN ('CIERRE','DISPOSICION','NOVEDAD')),
    descripcion_libre   TEXT,
    usuario_registra    VARCHAR(50)     NOT NULL,
    fecha_registra      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_actuaciones_codigos PRIMARY KEY (actuacion_id, orden)
);

COMMENT ON TABLE cad_actuaciones_codigos IS
    'Códigos de cierre para una actuación específica de una agencia. '
    'Orden=1 es el código primario. Permite registrar captura, informe, '
    'novedades y disposiciones de forma granular por agencia.';


-- ────────────────────────────────────────────────────────────
-- 3. UNIDADES POR ACTUACIÓN (opcional — para despachos multi-unidad)
--    Cuando una agencia envía más de un recurso al mismo incidente.
--    Ejemplo: 2 patrullas + 1 moto de la misma jurisdicción.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cad_actuaciones_unidades (
    id                  BIGSERIAL       PRIMARY KEY,
    actuacion_id        BIGINT          NOT NULL
                            REFERENCES cad_actuaciones(id)
                            ON DELETE CASCADE,
    unidad_codigo       VARCHAR(100)    NOT NULL,   -- identificador de la unidad
    placa               VARCHAR(50),
    tipo_unidad         VARCHAR(50),                -- PATRULLA, AMBULANCIA, CAMION, etc.
    fecha_despacho      TIMESTAMPTZ,
    fecha_llegada       TIMESTAMPTZ,
    fecha_liberacion    TIMESTAMPTZ,
    estado              CHAR(1)         DEFAULT 'D'
                            CHECK (estado IN ('D','A','L','V')),
                            -- D=Despachada, A=Atendiendo, L=Liberada, V=Anulada
    observacion         TEXT,
    fecha_creacion      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE cad_actuaciones_unidades IS
    'Recursos individuales despachados dentro de una actuación. '
    'Usar cuando una agencia envía más de una unidad al mismo incidente.';


-- ────────────────────────────────────────────────────────────
-- 4. NOTAS/ANOTACIONES POR ACTUACIÓN
--    Cada agencia puede agregar notas a su actuación durante el
--    desarrollo del incidente (noticias de campo, novedades, etc.)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cad_actuaciones_notas (
    id                  BIGSERIAL       PRIMARY KEY,
    actuacion_id        BIGINT          NOT NULL
                            REFERENCES cad_actuaciones(id)
                            ON DELETE CASCADE,
    nota                TEXT            NOT NULL,
    tipo_nota           VARCHAR(30)     DEFAULT 'GENERAL'
                            CHECK (tipo_nota IN ('GENERAL','NOVEDAD','ALERTA','CIERRE')),
    usuario_registra    VARCHAR(50)     NOT NULL,
    fecha_registra      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────
-- 5. ÍNDICES DE RENDIMIENTO
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_actuaciones_evento
    ON cad_actuaciones(evento_id);

CREATE INDEX IF NOT EXISTS idx_actuaciones_pedido
    ON cad_actuaciones(pedido_id)
    WHERE pedido_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_actuaciones_canal
    ON cad_actuaciones(fuerza_id, canal_codigo);

CREATE INDEX IF NOT EXISTS idx_actuaciones_estado
    ON cad_actuaciones(estado, fecha_creacion DESC);

CREATE INDEX IF NOT EXISTS idx_actuaciones_unidades
    ON cad_actuaciones_unidades(actuacion_id);

CREATE INDEX IF NOT EXISTS idx_actuaciones_notas
    ON cad_actuaciones_notas(actuacion_id);


-- ────────────────────────────────────────────────────────────
-- 6. FUNCIÓN: recalcular estado global del evento
--    Se llama cada vez que una actuación cambia de estado.
--    Regla:
--      Todas C o V  → evento = C (Cerrado)
--      Al menos 1 A → evento = A (Atendido)
--      Al menos 1 D → evento = D (En curso)
--      Todas P      → evento = P (Pendiente)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_recalcular_estado_evento(p_evento_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
    v_total     INTEGER;
    v_cerradas  INTEGER;
    v_atendidas INTEGER;
    v_despacho  INTEGER;
    v_nuevo_estado CHAR(1);
BEGIN
    SELECT
        COUNT(*)                                        ,
        COUNT(*) FILTER (WHERE estado IN ('C','V'))    ,
        COUNT(*) FILTER (WHERE estado = 'A')           ,
        COUNT(*) FILTER (WHERE estado = 'D')
    INTO v_total, v_cerradas, v_atendidas, v_despacho
    FROM cad_actuaciones
    WHERE evento_id = p_evento_id;

    -- Sin actuaciones: no cambiar
    IF v_total = 0 THEN RETURN; END IF;

    IF v_cerradas = v_total THEN
        v_nuevo_estado := 'C';   -- todas cerradas/anuladas
    ELSIF v_atendidas > 0 THEN
        v_nuevo_estado := 'A';   -- al menos una en sitio
    ELSIF v_despacho > 0 THEN
        v_nuevo_estado := 'D';   -- al menos una en camino
    ELSE
        v_nuevo_estado := 'P';   -- todas pendientes
    END IF;

    UPDATE cad_eventos
    SET    estado             = v_nuevo_estado,
           fecha_modificacion = NOW()
    WHERE  id = p_evento_id
      AND  estado <> v_nuevo_estado;  -- solo escribe si cambia
END;
$$;

COMMENT ON FUNCTION fn_recalcular_estado_evento IS
    'Recalcula el estado global de un evento basado en el estado '
    'de todas sus actuaciones. Llamar después de cada UPDATE en cad_actuaciones.';


-- ────────────────────────────────────────────────────────────
-- 7. TRIGGER: auto-recalcular estado del evento al cambiar
--    el estado de cualquier actuación
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_actuacion_estado_change()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    -- Solo recalcular si el estado realmente cambió
    IF (TG_OP = 'INSERT') OR (OLD.estado IS DISTINCT FROM NEW.estado) THEN
        PERFORM fn_recalcular_estado_evento(NEW.evento_id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_actuaciones_estado ON cad_actuaciones;

CREATE TRIGGER trg_actuaciones_estado
    AFTER INSERT OR UPDATE OF estado
    ON cad_actuaciones
    FOR EACH ROW
    EXECUTE FUNCTION trg_actuacion_estado_change();


-- ────────────────────────────────────────────────────────────
-- 8. MIGRACIÓN DE DATOS EXISTENTES
--    Los registros en cad_pedidos_canales que ya tienen un
--    cadeven_nume_evento se convierten en actuaciones.
--    Esto asegura que el historial quede en el nuevo modelo.
-- ────────────────────────────────────────────────────────────
INSERT INTO cad_actuaciones (
    id, evento_id, pedido_id, sitio_graba,
    fuerza_id, canal_codigo,
    despachador_usuario, tipo_despachador,
    cali_pedido,
    estado, fecha_creacion
)
SELECT
    -- Generar un ID derivado del id de cad_pedidos_canales
    -- para no depender de la secuencia.
    -- Usamos el id existente como base (registros históricos no tienen Snowflake)
    pc.id                               AS id,
    pc.cadeven_nume_evento              AS evento_id,
    pc.cadpedi_numellamada              AS pedido_id,
    pc.cadpedi_sitiograba               AS sitio_graba,
    pc.cadcana_fuerz_id                 AS fuerza_id,
    pc.cadcana_codigo                   AS canal_codigo,
    COALESCE(pc.usua_modifica,'MIGRACION_V8') AS despachador_usuario,
    'O'                                 AS tipo_despachador,
    pc.cali_pedido,
    CASE COALESCE(pc.estado,'A')
        WHEN 'C' THEN 'C'
        WHEN 'V' THEN 'V'
        ELSE 'P'
    END                                 AS estado,
    COALESCE(pc.fecha_grabacion, NOW()) AS fecha_creacion
FROM cad_pedidos_canales pc
WHERE pc.cadeven_nume_evento IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM cad_actuaciones a WHERE a.id = pc.id
  )
ON CONFLICT (id) DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- 9. VERIFICACIÓN
-- ────────────────────────────────────────────────────────────
-- SELECT
--   (SELECT COUNT(*) FROM cad_actuaciones)            AS actuaciones,
--   (SELECT COUNT(*) FROM cad_actuaciones_codigos)    AS codigos,
--   (SELECT COUNT(*) FROM cad_actuaciones_unidades)   AS unidades,
--   (SELECT COUNT(*) FROM cad_actuaciones_notas)      AS notas;
--
-- -- Ver el estado multi-agencia de un evento específico:
-- SELECT a.id, f.descripcion AS fuerza, c.descripcion AS canal,
--        a.estado, a.unidad_asignada,
--        a.fecha_despacho, a.fecha_llegada, a.fecha_cierre
-- FROM   cad_actuaciones a
-- LEFT   JOIN cad_fuerzas f ON f.id = a.fuerza_id
-- LEFT   JOIN cad_canales c ON c.codigo = a.canal_codigo
-- WHERE  a.evento_id = <ID_EVENTO>
-- ORDER  BY a.fecha_creacion;
