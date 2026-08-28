-- ============================================================
-- V44 — Integración de Cámaras (VMS) configurable por el administrador
-- Aplica a cada base de datos tenant CAD.
--
-- Permite que un administrador registre y configure, desde la UI (Hub de
-- Integraciones → tab Cámaras), la conexión a uno o varios VMS (HikCentral,
-- ONVIF/RTSP genérico, u otros a futuro) SIN intervención en el código fuente.
-- El "driver" (cómo hablar con cada marca) vive en el backend; la configuración
-- por municipio vive en estas tablas.
--
-- Ver diseño: docs/CCTV_HIKCENTRAL_DISENO_TECNICO.md y CCTV_VMS_INTEGRACION.md
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. INTEGRACIÓN VMS (configuración por tenant)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cad_camara_integracion (
    id                 BIGINT        PRIMARY KEY,   -- Snowflake
    nombre             VARCHAR(120)  NOT NULL,
    descripcion        VARCHAR(500),
    -- Identificador del driver soportado por el backend: 'HIKCENTRAL', 'ONVIF_RTSP', ...
    driver             VARCHAR(40)   NOT NULL,
    -- URL/host base del VMS (ej. https://10.x.x.x:443 para HikCentral).
    base_url           VARCHAR(300),
    -- Parámetros NO secretos del driver (esquema, puertos, preferencias de stream…).
    config_publico     JSONB         NOT NULL DEFAULT '{}'::jsonb,
    -- Parámetros SECRETOS del driver (appSecret, password…). NUNCA se devuelven al
    -- frontend (solo se escriben). Se recomienda cifrado en reposo vía Vault en una
    -- entrega posterior (mismo mecanismo que las credenciales de BD por tenant).
    config_secreto     JSONB         NOT NULL DEFAULT '{}'::jsonb,
    activa             BOOLEAN       NOT NULL DEFAULT TRUE,
    usuario_crea       VARCHAR(100),
    usuario_modifica   VARCHAR(100),
    fecha_creacion     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    fecha_modificacion TIMESTAMPTZ
);

COMMENT ON TABLE cad_camara_integracion IS
    'Integraciones a sistemas de video (VMS) configurables por el administrador '
    'desde el Hub de Integraciones. El driver (cómo hablar con cada VMS) es código; '
    'la configuración por municipio es dato.';
COMMENT ON COLUMN cad_camara_integracion.config_secreto IS
    'Parámetros secretos del driver. Write-only: el backend nunca los devuelve al '
    'frontend. Cifrar en reposo (Vault) en entrega posterior.';

CREATE INDEX IF NOT EXISTS idx_camara_integracion_activa
    ON cad_camara_integracion(activa);

-- ────────────────────────────────────────────────────────────
-- 2. CATÁLOGO DE CÁMARAS (georreferenciado)
--    Como la API del VMS no siempre expone las coordenadas de cámaras fijas
--    (caso HikCentral), estas se siembran desde la lista provista por la Policía
--    (o export del e-map) y se emparejan por camera_index_code. El estado y la
--    URL de stream se resuelven en vivo contra el VMS.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cad_camaras (
    id                 BIGINT        PRIMARY KEY,   -- Snowflake
    integracion_id     BIGINT        NOT NULL
                         REFERENCES cad_camara_integracion(id) ON DELETE CASCADE,
    -- ID de la cámara en el VMS (cameraIndexCode en HikCentral).
    camara_codigo      VARCHAR(64)   NOT NULL,
    nombre             VARCHAR(128),
    region_codigo      VARCHAR(64),
    latitud            DOUBLE PRECISION,
    longitud           DOUBLE PRECISION,
    tiene_ptz          BOOLEAN       NOT NULL DEFAULT FALSE,
    -- Estado reportado por el VMS: 0 desconocido, 1 online, 2 offline.
    estado             SMALLINT      NOT NULL DEFAULT 0,
    activa             BOOLEAN       NOT NULL DEFAULT TRUE,
    fecha_sync         TIMESTAMPTZ,
    fecha_creacion     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (integracion_id, camara_codigo)
);

COMMENT ON TABLE cad_camaras IS
    'Catálogo georreferenciado de cámaras por integración VMS. Coordenadas '
    'sembradas desde la lista de la Policía; estado y stream se resuelven en vivo.';

CREATE INDEX IF NOT EXISTS idx_camaras_integracion
    ON cad_camaras(integracion_id);

-- Índice espacial PostGIS para "cámara más cercana" (KNN / ST_DWithin).
-- Se agrega solo si la extensión PostGIS está instalada (ya usada en V40).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
        -- columna geografía derivada de lat/lng (se rellena en el sync/siembra).
        BEGIN
            ALTER TABLE cad_camaras
                ADD COLUMN IF NOT EXISTS geo geography(Point, 4326);
        EXCEPTION WHEN duplicate_column THEN NULL;
        END;
        CREATE INDEX IF NOT EXISTS idx_camaras_geo
            ON cad_camaras USING GIST (geo);
    END IF;
END$$;
