-- V23: Salud CADs — extend secad_tenants with operational health columns
-- Apply to: MASTER database (secad_tenants lives in master schema)

ALTER TABLE secad_tenants
    ADD COLUMN IF NOT EXISTS nivel_operacion   SMALLINT     DEFAULT 1,          -- 1=Normal 2=Degradado 3=Offline
    ADD COLUMN IF NOT EXISTS latencia_ms       INTEGER,                          -- último ping (ms)
    ADD COLUMN IF NOT EXISTS ultima_sincro     TIMESTAMPTZ,                      -- último sync exitoso
    ADD COLUMN IF NOT EXISTS incidentes_activos INTEGER      DEFAULT 0,
    ADD COLUMN IF NOT EXISTS observaciones     VARCHAR(500),
    ADD COLUMN IF NOT EXISTS suspendido        BOOLEAN      NOT NULL DEFAULT FALSE;

-- Historical health snapshots per CAD (trend charts)
CREATE TABLE IF NOT EXISTS secad_salud_historial (
    id              BIGSERIAL    PRIMARY KEY,
    cod_dane        VARCHAR(10)  NOT NULL,
    nivel_operacion SMALLINT     NOT NULL,
    latencia_ms     INTEGER,
    observacion     VARCHAR(500),
    registrado_en   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_salud_hist_dane_ts
    ON secad_salud_historial (cod_dane, registrado_en DESC);

-- Active incident tracking per CAD
CREATE TABLE IF NOT EXISTS secad_incidentes_cad (
    id                BIGSERIAL    PRIMARY KEY,
    cod_dane          VARCHAR(10)  NOT NULL,
    descripcion       VARCHAR(500) NOT NULL,
    nivel             SMALLINT     NOT NULL DEFAULT 2,        -- 2=Degradado 3=Offline
    activo            BOOLEAN      NOT NULL DEFAULT TRUE,
    fecha_inicio      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    fecha_resolucion  TIMESTAMPTZ,
    resuelto_por      VARCHAR(100),
    reportado_por     VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS ix_incidentes_cod_dane
    ON secad_incidentes_cad (cod_dane, activo, fecha_inicio DESC);
