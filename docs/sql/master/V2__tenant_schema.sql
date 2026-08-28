-- Tenant database schema: apply to each CAD PostgreSQL database (e.g. secad_bogota)

CREATE TABLE IF NOT EXISTS ctr_usuarios (
    id_usuario       BIGSERIAL PRIMARY KEY,
    username         VARCHAR(100) NOT NULL,
    identificacion   VARCHAR(30),
    grad_alfabetico  VARCHAR(50),
    apellidos        VARCHAR(100),
    nombres          VARCHAR(100),
    funcionario      INTEGER     DEFAULT 0,
    unde_laborando   INTEGER     DEFAULT 0,
    codigo_cargo     INTEGER     DEFAULT 0,
    bloqueado        SMALLINT    NOT NULL DEFAULT 0,
    usuario_creacion BIGINT,
    fecha_creacion   TIMESTAMPTZ DEFAULT NOW(),
    maquina_creacion VARCHAR(100),
    usuario_modifica BIGINT,
    fecha_modifica   TIMESTAMPTZ,
    maquina_modifica VARCHAR(100),
    CONSTRAINT uq_username UNIQUE (username)
);

CREATE TABLE IF NOT EXISTS ctr_roles (
    id_rol           BIGSERIAL PRIMARY KEY,
    descripcion      VARCHAR(100),
    vigente          SMALLINT    DEFAULT 1,
    usuario_creacion VARCHAR(100),
    fecha_creacion   TIMESTAMPTZ DEFAULT NOW(),
    maquina_creacion VARCHAR(100),
    usuario_modifica BIGINT,
    fecha_modifica   TIMESTAMPTZ,
    maquina_modifica VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS ctr_roles_user (
    id         BIGSERIAL PRIMARY KEY,
    id_usuario BIGINT NOT NULL,
    id_rol     BIGINT NOT NULL,
    CONSTRAINT uq_usuario_rol UNIQUE (id_usuario, id_rol)
);

CREATE TABLE IF NOT EXISTS ctr_roles_user_admin (
    id               BIGSERIAL PRIMARY KEY,
    id_usuario       BIGINT  NOT NULL,
    id_rol           BIGINT  NOT NULL,
    justificacion    VARCHAR(1000),
    fecha_fin        DATE,
    vigente          SMALLINT    DEFAULT 1,
    usuario_creacion BIGINT,
    fecha_creacion   TIMESTAMPTZ DEFAULT NOW(),
    maquina_creacion VARCHAR(100),
    usuario_modifica BIGINT,
    fecha_modifica   TIMESTAMPTZ,
    maquina_modifica VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS ctr_menu (
    id_menu          BIGSERIAL PRIMARY KEY,
    descripcion      VARCHAR(200),
    idpadre          BIGINT      NOT NULL DEFAULT 0,
    posicion         INTEGER     DEFAULT 0,
    tipo             VARCHAR(50),
    icono            VARCHAR(100),
    vigente          SMALLINT    DEFAULT 1,
    detalle          VARCHAR(500),
    usuario_creacion BIGINT,
    fecha_creacion   TIMESTAMPTZ DEFAULT NOW(),
    maquina_creacion VARCHAR(100),
    usuario_modifica BIGINT,
    fecha_modifica   TIMESTAMPTZ,
    maquina_modifica VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS ctr_menu_roles (
    id_menurol       BIGSERIAL PRIMARY KEY,
    id_menu          BIGINT NOT NULL,
    id_rol           BIGINT NOT NULL,
    usuario_creacion BIGINT,
    fecha_creacion   TIMESTAMPTZ DEFAULT NOW(),
    maquina_creacion VARCHAR(100),
    CONSTRAINT uq_menu_rol UNIQUE (id_menu, id_rol)
);

CREATE TABLE IF NOT EXISTS ctr_auditoria (
    id            BIGSERIAL PRIMARY KEY,
    id_usuario    BIGINT,
    username      VARCHAR(100),
    accion        VARCHAR(200),
    detalle       TEXT,
    fecha_creacion TIMESTAMPTZ DEFAULT NOW(),
    ip_origen     VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS ctr_dominio (
    id_dominio       BIGSERIAL PRIMARY KEY,
    descripcion      VARCHAR(100) NOT NULL,
    id_padre         BIGINT       NOT NULL DEFAULT 0,
    abreviatura      VARCHAR(100),
    observacion      VARCHAR(100),
    vigente          SMALLINT     DEFAULT 1,
    usuario_creacion BIGINT,
    fecha_creacion   TIMESTAMPTZ  DEFAULT NOW(),
    maquina_creacion VARCHAR(100),
    usuario_modifica BIGINT,
    fecha_modifica   TIMESTAMPTZ,
    maquina_modifica VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS ctr_video (
    id_video         BIGSERIAL PRIMARY KEY,
    descripcion      VARCHAR(255) NOT NULL,
    observaciones    VARCHAR(500),
    ruta_video       VARCHAR(500),
    usuario_creacion VARCHAR(50),
    fecha_creacion   TIMESTAMPTZ  DEFAULT NOW(),
    vigente          SMALLINT     DEFAULT 1,
    usuario_modifica VARCHAR(50),
    fecha_modifica   TIMESTAMPTZ,
    maquina_modifica VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS ctr_linea_mando (
    id_linea_mando   BIGSERIAL PRIMARY KEY,
    identificacion   VARCHAR(20),
    nombre           VARCHAR(100),
    apellidos        VARCHAR(100),
    grado            VARCHAR(50),
    cargo            VARCHAR(100),
    peso             VARCHAR(10),
    unidad           VARCHAR(200),
    foto_base64      TEXT,
    orden            INTEGER     DEFAULT 1,
    vigente          SMALLINT    DEFAULT 1,
    usuario_creacion BIGINT,
    fecha_creacion   TIMESTAMPTZ DEFAULT NOW(),
    maquina_creacion VARCHAR(100),
    usuario_modifica BIGINT,
    fecha_modifica   TIMESTAMPTZ,
    maquina_modifica VARCHAR(100)
);

-- Seed: Super Admin role (id=1)
INSERT INTO ctr_roles (descripcion, vigente) VALUES ('Administrador', 1);
SELECT SETVAL('ctr_roles_id_rol_seq', (SELECT MAX(id_rol) FROM ctr_roles));

-- Seed: Admin user (username must match OUD username or dev login; bloqueado=0 = active)
INSERT INTO ctr_usuarios (username, identificacion, bloqueado, usuario_creacion, fecha_creacion)
VALUES ('admin', '0000000000', 0, 1, NOW())
ON CONFLICT (username) DO NOTHING;

-- Assign Administrador role to admin user via both role tables
INSERT INTO ctr_roles_user (id_usuario, id_rol)
SELECT u.id_usuario, 1
FROM ctr_usuarios u WHERE u.username = 'admin'
ON CONFLICT (id_usuario, id_rol) DO NOTHING;

INSERT INTO ctr_roles_user_admin (id_usuario, id_rol, justificacion, vigente, usuario_creacion, fecha_creacion)
SELECT u.id_usuario, 1, 'Rol inicial de administración', 1, 1, NOW()
FROM ctr_usuarios u WHERE u.username = 'admin';
