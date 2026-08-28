-- ============================================================
-- V9 – Módulo de Turnos de Vigilancia
--
-- CONTEXTO
-- Los recursos en campo (patrullas, motos, ambulancias, etc.)
-- trabajan en turnos de 6-9 horas.
-- Este módulo registra qué recursos están activos en cada
-- franja horaria, a qué canal de radio están asignados
-- y su estado en tiempo real (libre/ocupado/fuera de servicio).
--
-- Es el INSUMO PRINCIPAL del módulo de Eventos:
-- el despachador ve los recursos de su canal y les asigna
-- incidentes registrando los tiempos de despacho/llegada.
--
-- JERARQUÍA
--   cad_turnos (1)
--     └─ cad_turnos_unidades (N)   ← estaciones/cuadrantes
--          └─ cad_medios_disponibles (N)   ← patrullas/motos
--               └─ cad_personal_disponible (N)   ← policías/personal
--
-- INTEGRACIÓN EXTERNA
--   SIVICC → provee minuta oficial (quién trabaja hoy)
--   GESPO  → provee ubicación GPS en tiempo real
--
-- Aplica a cada base de datos tenant CAD.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. CATÁLOGO DE ESTADOS DE MEDIO
--    Se usan códigos numéricos para compatibilidad con legado
--    y con la vista V_MEDIOS que consumen otras apps.
-- ────────────────────────────────────────────────────────────
--  27 = Libre
--  28 = Ocupado (atendiendo un incidente)
--  29 = Fuera de servicio / avería
--  30 = En ruta (despachado, aún no llega)
--  31 = Disponible en base (no en calle)
-- Los dominios se registran en cad_referencias_secad
-- con nombre = 'ESTADO_MEDIO'. Aquí solo los documentamos.


-- ────────────────────────────────────────────────────────────
-- 2. HEADER DE TURNO
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cad_turnos (
    id                  BIGINT          NOT NULL,   -- Snowflake ID
    sitio_graba         INTEGER         NOT NULL DEFAULT 0,
    fuerza_id           INTEGER         NOT NULL,   -- FK cad_fuerzas
    clase_turno         SMALLINT        NOT NULL,   -- 1=Primer, 2=Segundo, 3=Tercer
    tipo_turno          INTEGER,                    -- FK cad_referencias_secad(TIPO_TURNO)
    hora_inicia         TIMESTAMPTZ     NOT NULL,
    hora_termina        TIMESTAMPTZ     NOT NULL,
    -- No puede ser GENERATED ALWAYS AS (hora_inicia::date) STORED: el cast
    -- timestamptz→date depende del TimeZone de sesión, así que Postgres lo
    -- marca STABLE, no IMMUTABLE, y las columnas generadas exigen IMMUTABLE
    -- ("generation expression is not immutable"). Se calcula en su lugar con
    -- el trigger trg_turnos_dia_inicia más abajo — el código de la app nunca
    -- inserta este valor a mano, siempre deja que la base lo calcule.
    dia_inicia          DATE            NOT NULL DEFAULT CURRENT_DATE,
    consignas           TEXT,
    estado              CHAR(1)         NOT NULL DEFAULT 'A'
                            CHECK (estado IN ('A','C','V')),
                            -- A=Activo, C=Cerrado, V=Anulado
    -- Integración SIVICC
    sivicc_sincronizado BOOLEAN         NOT NULL DEFAULT FALSE,
    sivicc_fecha_sync   TIMESTAMPTZ,
    -- Auditoría
    fecha_creacion      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    usuario_crea        VARCHAR(50),
    fecha_modificacion  TIMESTAMPTZ,
    usuario_modifica    VARCHAR(50),

    CONSTRAINT pk_turnos PRIMARY KEY (id),
    CONSTRAINT chk_turnos_clase    CHECK (clase_turno BETWEEN 1 AND 3),
    CONSTRAINT chk_turnos_estado   CHECK (estado IN ('A','C','V')),
    CONSTRAINT chk_turnos_duracion CHECK (
        EXTRACT(EPOCH FROM (hora_termina - hora_inicia)) / 3600.0
        BETWEEN 6 AND 9
    )
);

COMMENT ON TABLE cad_turnos IS
    'Header de turno de vigilancia. Un turno define un bloque de '
    '6-9 horas en el que los recursos de una fuerza están activos.';

COMMENT ON COLUMN cad_turnos.clase_turno IS
    '1=Primer turno (06-14h), 2=Segundo turno (14-22h), 3=Tercer turno (22-06h). '
    'Usado para sincronización con SIVICC (sigla_fisica + turno + fecha).';

COMMENT ON COLUMN cad_turnos.consignas IS
    'Instrucciones generales del turno para todos los recursos. '
    'Equivalente a CONSIGNAS en el sistema Oracle anterior.';

-- dia_inicia se mantiene con este trigger en vez de GENERATED ALWAYS AS
-- STORED (ver comentario en la definición de la columna, arriba).
CREATE OR REPLACE FUNCTION fn_turnos_set_dia_inicia()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    NEW.dia_inicia := NEW.hora_inicia::date;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_turnos_dia_inicia ON cad_turnos;
CREATE TRIGGER trg_turnos_dia_inicia
    BEFORE INSERT OR UPDATE OF hora_inicia ON cad_turnos
    FOR EACH ROW
    EXECUTE FUNCTION fn_turnos_set_dia_inicia();


-- ────────────────────────────────────────────────────────────
-- 3. UNIDADES / ESTACIONES EN TURNO
--    Cada fila = una estación policial o cuadrante activo
--    en este turno (ej: ESTACION SUR, CUADRANTE 01-NORTE).
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cad_turnos_unidades (
    id              BIGSERIAL       PRIMARY KEY,
    turno_id        BIGINT          NOT NULL
                        REFERENCES cad_turnos(id) ON DELETE CASCADE,
    -- Identificación de la unidad
    unidad_codigo   VARCHAR(50)     NOT NULL,   -- código interno o CONS_SIATH de SIVICC
    unidad_desc     VARCHAR(200),               -- snapshot de la descripción
    fuerza_id       INTEGER,
    consignas       TEXT,
    -- Origen del registro
    origen          VARCHAR(10)     NOT NULL DEFAULT 'MANUAL'
                        CHECK (origen IN ('MANUAL','SIVICC')),
    -- Si viene de SIVICC:
    sivicc_minuta_id    INTEGER,                -- V_MINUTA_SIVICC.minuta_id
    sivicc_consecutivo  INTEGER,                -- V_MINUTA_SIVICC.consecutivo (CONS_SIATH)
    -- Auditoría
    fecha_creacion  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_turno_unidad UNIQUE (turno_id, unidad_codigo)
);

COMMENT ON TABLE cad_turnos_unidades IS
    'Estaciones o cuadrantes activos en un turno. '
    'Origen MANUAL: ingresado por el operador. '
    'Origen SIVICC: importado automáticamente de la minuta oficial.';


-- ────────────────────────────────────────────────────────────
-- 4. MEDIOS / RECURSOS DISPONIBLES
--    El CORAZÓN del módulo de Eventos:
--    cada fila = una patrulla/moto asignada a un canal de radio.
--    El despachador ve esta tabla en tiempo real.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cad_medios_disponibles (
    id                  BIGINT          NOT NULL,   -- Snowflake
    sitio_graba         INTEGER         NOT NULL DEFAULT 0,
    turno_id            BIGINT          NOT NULL
                            REFERENCES cad_turnos(id) ON DELETE CASCADE,
    turno_unidad_id     BIGINT
                            REFERENCES cad_turnos_unidades(id) ON DELETE SET NULL,
    unidad_codigo       VARCHAR(50),
    fuerza_id           INTEGER,

    -- Canal de radio asignado
    canal_fuerza_id     INTEGER,
    canal_codigo        INTEGER,
    canal_desc          VARCHAR(200),   -- snapshot

    -- Identificación del recurso (patrulla / cuadrante)
    patrulla_codigo     VARCHAR(100)    NOT NULL,   -- cuadranteid de SIVICC
    patrulla_desc       VARCHAR(200),               -- cuadrante de SIVICC
    tipo_medio          SMALLINT        NOT NULL DEFAULT 22,
    -- 20=MOTO, 21=BICICLETA, 22=PATRULLA/CAMIONETA, 23=AMBULANCIA,
    -- 24=CAMION_BOMBEROS, 25=HELICÓPTERO, 26=LANCHA

    -- Estado operativo
    estado              SMALLINT        NOT NULL DEFAULT 27,
    -- 27=LIBRE, 28=OCUPADO, 29=FUERA_DE_SERVICIO, 30=EN_RUTA, 31=EN_BASE

    -- Ubicación GPS en tiempo real (actualizada desde GESPO)
    latitud             NUMERIC(10,7),
    longitud            NUMERIC(10,7),
    velocidad_kmh       NUMERIC(6,2),
    rumbo_grados        NUMERIC(5,2),
    fecha_ubicacion     TIMESTAMPTZ,    -- timestamp de la última posición

    -- Incidente actual (si estado=OCUPADO o EN_RUTA)
    evento_id           BIGINT,         -- FK cad_eventos
    actuacion_id        BIGINT,         -- FK cad_actuaciones

    -- Auditoría
    fecha_creacion      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    fecha_modificacion  TIMESTAMPTZ,
    usuario_modifica    VARCHAR(50),

    CONSTRAINT pk_medios_disponibles PRIMARY KEY (id),
    CONSTRAINT uq_patrulla_turno UNIQUE (turno_id, patrulla_codigo)
);

COMMENT ON TABLE cad_medios_disponibles IS
    'Recursos operativos disponibles en un turno (patrullas, motos, ambulancias). '
    'Esta tabla es el insumo en tiempo real para el módulo de Eventos: '
    'el despachador ve los recursos de su canal, su estado y su posición GPS.';

COMMENT ON COLUMN cad_medios_disponibles.estado IS
    '27=Libre, 28=Ocupado (en incidente), 29=Fuera de servicio, '
    '30=En ruta (despachado, en camino), 31=En base (disponible).';

COMMENT ON COLUMN cad_medios_disponibles.latitud IS
    'Última latitud reportada por GESPO. NULL si no hay posición reciente.';

COMMENT ON COLUMN cad_medios_disponibles.fecha_ubicacion IS
    'Momento de la última actualización GPS desde GESPO. '
    'Si es NULL o > 10 min, el recurso se considera "sin señal".';


-- ────────────────────────────────────────────────────────────
-- 5. PERSONAL DISPONIBLE POR RECURSO
--    Los policías / personal asignados a cada patrulla/moto.
--    Máx. 2 por recurso (conductor + tripulante).
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cad_personal_disponible (
    id                      BIGSERIAL       PRIMARY KEY,
    sitio_graba             INTEGER         NOT NULL DEFAULT 0,
    turno_id                BIGINT          NOT NULL,
    medio_id                BIGINT          NOT NULL
                                REFERENCES cad_medios_disponibles(id) ON DELETE CASCADE,
    cedu_empleado           VARCHAR(20)     NOT NULL,   -- ID del policía (from SIVICC)
    nombre_policial         VARCHAR(200),
    desc_cargo              VARCHAR(100),               -- conductor, tripulante, etc.
    observacion             TEXT,
    fecha_creacion          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE cad_personal_disponible IS
    'Personal policial asignado a cada recurso en turno. '
    'Importado desde V_PERSONAL_MINUTA de SIVICC o ingresado manualmente. '
    'Máximo 2 personas por medio (conductor + tripulante).';


-- ────────────────────────────────────────────────────────────
-- 6. LOG DE CAMBIOS DE ESTADO DE MEDIOS
--    Trazabilidad completa: cuándo pasó libre ↔ ocupado.
--    Alimenta métricas de tiempo de respuesta.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cad_medios_estado_log (
    id              BIGSERIAL       PRIMARY KEY,
    medio_id        BIGINT          NOT NULL
                        REFERENCES cad_medios_disponibles(id) ON DELETE CASCADE,
    estado_anterior SMALLINT,
    estado_nuevo    SMALLINT        NOT NULL,
    evento_id       BIGINT,         -- si el cambio fue por un incidente
    actuacion_id    BIGINT,
    usuario         VARCHAR(50),
    observacion     TEXT,
    fecha_cambio    TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE cad_medios_estado_log IS
    'Historial de cambios de estado de cada medio. '
    'Permite calcular tiempos de respuesta y métricas de disponibilidad.';


-- ────────────────────────────────────────────────────────────
-- 7. ÍNDICES DE RENDIMIENTO
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_turnos_fuerza_dia
    ON cad_turnos(fuerza_id, dia_inicia, clase_turno);

CREATE INDEX IF NOT EXISTS idx_turnos_sitio_estado
    ON cad_turnos(sitio_graba, estado, dia_inicia DESC);

CREATE INDEX IF NOT EXISTS idx_turnos_unidades_turno
    ON cad_turnos_unidades(turno_id);

CREATE INDEX IF NOT EXISTS idx_medios_turno
    ON cad_medios_disponibles(turno_id);

CREATE INDEX IF NOT EXISTS idx_medios_canal
    ON cad_medios_disponibles(canal_codigo, estado)
    WHERE canal_codigo IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_medios_estado
    ON cad_medios_disponibles(estado, turno_id);

CREATE INDEX IF NOT EXISTS idx_medios_evento
    ON cad_medios_disponibles(evento_id)
    WHERE evento_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_personal_medio
    ON cad_personal_disponible(medio_id);

CREATE INDEX IF NOT EXISTS idx_medios_log_medio
    ON cad_medios_estado_log(medio_id, fecha_cambio DESC);


-- ────────────────────────────────────────────────────────────
-- 8. FUNCIÓN: obtener medios activos por canal
--    Usada por el módulo de Eventos para mostrar recursos
--    disponibles al despachador según su canal asignado.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_medios_activos_por_canal(
    p_canal_codigo  INTEGER,
    p_sitio_graba   INTEGER DEFAULT NULL
)
RETURNS TABLE (
    id              BIGINT,
    patrulla_codigo VARCHAR(100),
    patrulla_desc   VARCHAR(200),
    canal_desc      VARCHAR(200),
    tipo_medio      SMALLINT,
    estado          SMALLINT,
    latitud         NUMERIC(10,7),
    longitud        NUMERIC(10,7),
    velocidad_kmh   NUMERIC(6,2),
    fecha_ubicacion TIMESTAMPTZ,
    evento_id       BIGINT,
    turno_id        BIGINT,
    -- Personal del recurso
    personal        JSONB
)
LANGUAGE sql STABLE AS $$
    SELECT  m.id,
            m.patrulla_codigo,
            m.patrulla_desc,
            m.canal_desc,
            m.tipo_medio,
            m.estado,
            m.latitud,
            m.longitud,
            m.velocidad_kmh,
            m.fecha_ubicacion,
            m.evento_id,
            m.turno_id,
            -- Agrupamos el personal en JSON para evitar filas duplicadas
            COALESCE(
                (SELECT jsonb_agg(jsonb_build_object(
                    'cedu',   p.cedu_empleado,
                    'nombre', p.nombre_policial,
                    'cargo',  p.desc_cargo
                ))
                 FROM cad_personal_disponible p
                 WHERE p.medio_id = m.id),
                '[]'::jsonb
            ) AS personal
    FROM    cad_medios_disponibles m
    JOIN    cad_turnos t ON t.id = m.turno_id
    WHERE   m.canal_codigo = p_canal_codigo
      AND   t.estado = 'A'
      AND   t.hora_inicia <= NOW()
      AND   t.hora_termina >= NOW()
      AND   (p_sitio_graba IS NULL OR m.sitio_graba = p_sitio_graba)
    ORDER BY m.estado ASC, m.patrulla_codigo ASC
$$;

COMMENT ON FUNCTION fn_medios_activos_por_canal IS
    'Devuelve los recursos activos en turno para un canal de radio, '
    'incluyendo el personal asignado en JSON. '
    'Solo incluye turnos cuya franja horaria cubre NOW().';


-- ────────────────────────────────────────────────────────────
-- 9. FUNCIÓN: registrar cambio de estado + log atómico
--    Actualiza cad_medios_disponibles y escribe en el log
--    en una sola llamada.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_cambiar_estado_medio(
    p_medio_id      BIGINT,
    p_nuevo_estado  SMALLINT,
    p_evento_id     BIGINT   DEFAULT NULL,
    p_actuacion_id  BIGINT   DEFAULT NULL,
    p_usuario       VARCHAR  DEFAULT 'SISTEMA',
    p_observacion   TEXT     DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
    v_estado_anterior SMALLINT;
BEGIN
    -- Obtener estado actual
    SELECT estado INTO v_estado_anterior
    FROM   cad_medios_disponibles
    WHERE  id = p_medio_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Medio % no encontrado', p_medio_id;
    END IF;

    -- Solo actuar si el estado realmente cambia
    IF v_estado_anterior = p_nuevo_estado THEN RETURN; END IF;

    -- Actualizar el medio
    UPDATE cad_medios_disponibles
    SET    estado             = p_nuevo_estado,
           evento_id          = CASE WHEN p_nuevo_estado IN (28,30) THEN p_evento_id
                                     ELSE NULL END,
           actuacion_id       = CASE WHEN p_nuevo_estado IN (28,30) THEN p_actuacion_id
                                     ELSE NULL END,
           fecha_modificacion = NOW(),
           usuario_modifica   = p_usuario
    WHERE  id = p_medio_id;

    -- Escribir log
    INSERT INTO cad_medios_estado_log
        (medio_id, estado_anterior, estado_nuevo,
         evento_id, actuacion_id, usuario, observacion, fecha_cambio)
    VALUES
        (p_medio_id, v_estado_anterior, p_nuevo_estado,
         p_evento_id, p_actuacion_id, p_usuario, p_observacion, NOW());
END;
$$;

COMMENT ON FUNCTION fn_cambiar_estado_medio IS
    'Actualiza el estado de un medio disponible y escribe el log de cambio '
    'en una sola transacción atómica. Llamar cuando se despacha o libera un recurso.';


-- ────────────────────────────────────────────────────────────
-- 10. REGISTROS DE DOMINIOS EN cad_referencias_secad
--     Para los tipos y estados de medio.
--     Solo inserta si no existen (idempotente).
-- ────────────────────────────────────────────────────────────
INSERT INTO cad_referencias_secad (nombre, codigo, descripcion, abreviatura)
SELECT 'ESTADO_MEDIO', v.codigo, v.descripcion, v.abrev
FROM (VALUES
    ('27','Libre',              'LIBRE'),
    ('28','Ocupado',            'OCUPADO'),
    ('29','Fuera de servicio',  'FUERA_SVC'),
    ('30','En ruta',            'EN_RUTA'),
    ('31','En base',            'EN_BASE')
) AS v(codigo, descripcion, abrev)
WHERE NOT EXISTS (
    SELECT 1 FROM cad_referencias_secad r
    WHERE r.nombre = 'ESTADO_MEDIO' AND r.codigo = v.codigo
);

INSERT INTO cad_referencias_secad (nombre, codigo, descripcion, abreviatura)
SELECT 'TIPO_MEDIO', v.codigo, v.descripcion, v.abrev
FROM (VALUES
    ('20','Motocicleta',        'MOTO'),
    ('21','Bicicleta',          'BICI'),
    ('22','Patrulla/Camioneta', 'PATRULLA'),
    ('23','Ambulancia',         'AMB'),
    ('24','Camión Bomberos',    'BOMBA'),
    ('25','Helicóptero',        'HELI'),
    ('26','Lancha',             'LANCHA')
) AS v(codigo, descripcion, abrev)
WHERE NOT EXISTS (
    SELECT 1 FROM cad_referencias_secad r
    WHERE r.nombre = 'TIPO_MEDIO' AND r.codigo = v.codigo
);

INSERT INTO cad_referencias_secad (nombre, codigo, descripcion, abreviatura)
SELECT 'CLASE_TURNO', v.codigo, v.descripcion, v.abrev
FROM (VALUES
    ('1','Primer Turno',   'T1'),
    ('2','Segundo Turno',  'T2'),
    ('3','Tercer Turno',   'T3')
) AS v(codigo, descripcion, abrev)
WHERE NOT EXISTS (
    SELECT 1 FROM cad_referencias_secad r
    WHERE r.nombre = 'CLASE_TURNO' AND r.codigo = v.codigo
);


-- ────────────────────────────────────────────────────────────
-- 11. VERIFICACIÓN
-- ────────────────────────────────────────────────────────────
-- SELECT (SELECT COUNT(*) FROM cad_turnos)              AS turnos,
--        (SELECT COUNT(*) FROM cad_turnos_unidades)     AS unidades,
--        (SELECT COUNT(*) FROM cad_medios_disponibles)  AS medios,
--        (SELECT COUNT(*) FROM cad_personal_disponible) AS personal,
--        (SELECT COUNT(*) FROM cad_medios_estado_log)   AS logs;
--
-- -- Ver recursos activos para un canal:
-- SELECT * FROM fn_medios_activos_por_canal(101);
