-- Master database schema: tenant registry and fallback auth tables
-- Apply to: Secad (central PostgreSQL database)

CREATE TABLE IF NOT EXISTS secad_tenants (
    id            SERIAL PRIMARY KEY,
    cod_dane      VARCHAR(10)  NOT NULL,
    cod_unidad    VARCHAR(30),
    nombre        VARCHAR(100) NOT NULL,
    departamento  VARCHAR(50),
    municipio     VARCHAR(100),
    categoria     CHAR(1)      NOT NULL DEFAULT 'A',
    db_host       VARCHAR(100) NOT NULL,
    db_port       INTEGER      NOT NULL DEFAULT 5432,
    db_name       VARCHAR(100) NOT NULL,
    db_username   VARCHAR(50)  NOT NULL,
    db_password   VARCHAR(500) NOT NULL,
    activo        BOOLEAN      NOT NULL DEFAULT TRUE,
    fecha_creacion      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_modificacion  TIMESTAMPTZ,
    CONSTRAINT uq_cod_dane UNIQUE (cod_dane)
);

CREATE TABLE IF NOT EXISTS secad_users_fallback (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(50)  NOT NULL,
    cod_dane      VARCHAR(10)  NOT NULL,
    password_hash VARCHAR(500) NOT NULL,
    activo        BOOLEAN      NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_username_fallback UNIQUE (username)
);

CREATE TABLE IF NOT EXISTS secad_audit_fallback (
    id            BIGSERIAL PRIMARY KEY,
    username      VARCHAR(50) NOT NULL,
    cod_dane      VARCHAR(10) NOT NULL,
    fecha_acceso  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_origen     VARCHAR(50),
    modo_fallback BOOLEAN     NOT NULL DEFAULT FALSE
);

-- Test tenant: Bogotá D.C.
INSERT INTO secad_tenants
    (cod_dane, cod_unidad, nombre, departamento, municipio, db_host, db_port, db_name, db_username, db_password)
VALUES
    ('11001', 'MEBOG', 'CAD Bogotá D.C.', 'Cundinamarca', 'Bogotá D.C.', 'localhost', 5433, 'secad_bogota', 'postgres', 'postgres')
ON CONFLICT (cod_dane) DO NOTHING;
