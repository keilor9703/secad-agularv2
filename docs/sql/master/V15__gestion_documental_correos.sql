-- ============================================================
-- V15 — Gestión Documental: Módulo de Correos Electrónicos
-- Tablas : ctr_cuenta_email, ctr_cuenta_email_usuario,
--          ctr_correos_enviados, ctr_cuenta_email_radicado
-- Menú   : Gestión Documental + Correos Electrónicos
--          Administración      + Cuentas Email
-- ============================================================

-- ── 1. Cuentas SMTP ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ctr_cuenta_email (
    id_cuenta              BIGSERIAL    PRIMARY KEY,
    id_dominio_grupo       BIGINT       NOT NULL,
    nombre_cuenta          VARCHAR(120) NOT NULL,
    email                  VARCHAR(200) NOT NULL,
    clave_smtp             VARCHAR(512) NOT NULL,
    servidor_smtp          VARCHAR(200) NOT NULL DEFAULT 'smtp.gmail.com',
    puerto                 INTEGER      NOT NULL DEFAULT 587,
    ssl                    SMALLINT     NOT NULL DEFAULT 1,
    vigente                SMALLINT     NOT NULL DEFAULT 1,
    url_imagen_encabezado  VARCHAR(512),
    prioridad_alta         SMALLINT     NOT NULL DEFAULT 0,
    acuse_recibido         SMALLINT     NOT NULL DEFAULT 0,
    fecha_creacion         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ctr_cuenta_email IS
  'Cuentas SMTP configuradas por unidad. La clave se almacena cifrada con AES-256.';

CREATE INDEX IF NOT EXISTS idx_cte_vigente
    ON ctr_cuenta_email(vigente);

-- ── 2. Usuarios autorizados por cuenta ──────────────────────
CREATE TABLE IF NOT EXISTS ctr_cuenta_email_usuario (
    id_cuenta_email_usuario BIGSERIAL  PRIMARY KEY,
    id_cuenta               BIGINT     NOT NULL REFERENCES ctr_cuenta_email(id_cuenta) ON DELETE CASCADE,
    id_usuario              BIGINT     NOT NULL,
    vigente                 SMALLINT   NOT NULL DEFAULT 1,
    fecha_creacion          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_cuenta_usuario UNIQUE (id_cuenta, id_usuario)
);

COMMENT ON TABLE ctr_cuenta_email_usuario IS
  'Autoriza a usuarios específicos para enviar desde una cuenta SMTP. '
  'Un usuario sin entrada en esta tabla no puede usar la cuenta.';

CREATE INDEX IF NOT EXISTS idx_cteu_cuenta
    ON ctr_cuenta_email_usuario(id_cuenta, vigente);

CREATE INDEX IF NOT EXISTS idx_cteu_usuario
    ON ctr_cuenta_email_usuario(id_usuario, vigente);

-- ── 3. Histórico de correos enviados ────────────────────────
CREATE TABLE IF NOT EXISTS ctr_correos_enviados (
    id_envio            BIGSERIAL    PRIMARY KEY,
    id_cuenta_email     BIGINT       NOT NULL REFERENCES ctr_cuenta_email(id_cuenta),
    de_email            VARCHAR(200),
    para                TEXT,
    cc                  TEXT,
    asunto              VARCHAR(500),
    cuerpo              TEXT,
    prioridad_alta      SMALLINT     NOT NULL DEFAULT 0,
    acuse_recibido      SMALLINT     NOT NULL DEFAULT 0,
    tiene_adjuntos      BOOLEAN      NOT NULL DEFAULT FALSE,
    radicado            VARCHAR(50),
    id_clasificacion    BIGINT,
    nombre_clasificacion VARCHAR(200),
    id_usuario_envia    BIGINT,
    fecha               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ctr_correos_enviados IS
  'Trazabilidad de cada correo despachado por el módulo de Mensajería.';

CREATE INDEX IF NOT EXISTS idx_ce_fecha
    ON ctr_correos_enviados(fecha DESC);

CREATE INDEX IF NOT EXISTS idx_ce_cuenta
    ON ctr_correos_enviados(id_cuenta_email);

CREATE INDEX IF NOT EXISTS idx_ce_usuario
    ON ctr_correos_enviados(id_usuario_envia);

-- ── 4. Contador de radicados ─────────────────────────────────
CREATE TABLE IF NOT EXISTS ctr_cuenta_email_radicado (
    anio           INTEGER  NOT NULL,
    mes            INTEGER  NOT NULL,
    ultimo_numero  INTEGER  NOT NULL DEFAULT 0,
    CONSTRAINT pk_radicado PRIMARY KEY (anio, mes)
);

COMMENT ON TABLE ctr_cuenta_email_radicado IS
  'Secuencia de radicados por año/mes. '
  'Se actualiza atómicamente con INSERT … ON CONFLICT DO UPDATE.';

-- ── 5. Menú: Gestión Documental ─────────────────────────────
DO $$
DECLARE
  v_id_gestion  BIGINT;
  v_id_correos  BIGINT;
  v_id_cuentas  BIGINT;
  v_id_admin    BIGINT;
BEGIN

  -- ── Grupo "Gestión Documental" ───────────────────────────────
  SELECT id_menu INTO v_id_gestion
  FROM ctr_menu
  WHERE detalle IS NULL
    AND LOWER(descripcion) LIKE '%gesti%docum%'
    AND vigente = 1
  LIMIT 1;

  IF v_id_gestion IS NULL THEN
    INSERT INTO ctr_menu
      (descripcion, idpadre, posicion, tipo, icono, vigente, detalle,
       usuario_creacion, fecha_creacion, maquina_creacion)
    VALUES
      ('Gestión Documental', 0, 30, 'GRUPO',
       'fa-solid fa-folder-open', 1, NULL,
       1, NOW(), 'migration-V15')
    RETURNING id_menu INTO v_id_gestion;

    UPDATE ctr_menu SET idpadre = v_id_gestion
    WHERE id_menu = v_id_gestion;

    RAISE NOTICE 'Grupo Gestión Documental creado con id = %', v_id_gestion;
  ELSE
    RAISE NOTICE 'Grupo Gestión Documental ya existe con id = %', v_id_gestion;
  END IF;

  -- ── Ítem "Mensajería / Correos Electrónicos" ─────────────────
  SELECT id_menu INTO v_id_correos
  FROM ctr_menu
  WHERE idpadre = v_id_gestion
    AND detalle = '/gestion-documental/gestion-correos-electronicos'
  LIMIT 1;

  IF v_id_correos IS NULL THEN
    INSERT INTO ctr_menu
      (descripcion, idpadre, posicion, tipo, icono, vigente, detalle,
       usuario_creacion, fecha_creacion, maquina_creacion)
    VALUES
      ('Mensajería', v_id_gestion, 10, 'ENLACE',
       'fa-solid fa-envelope-open-text', 1,
       '/gestion-documental/gestion-correos-electronicos',
       1, NOW(), 'migration-V15')
    RETURNING id_menu INTO v_id_correos;
    RAISE NOTICE 'Ítem Mensajería creado con id = %', v_id_correos;
  ELSE
    RAISE NOTICE 'Ítem Mensajería ya existe con id = %', v_id_correos;
  END IF;

  -- ── Ítem "Cuentas Email" dentro de Administración ────────────
  SELECT id_menu INTO v_id_admin
  FROM ctr_menu
  WHERE detalle IS NULL
    AND LOWER(descripcion) LIKE '%admin%'
    AND vigente = 1
  LIMIT 1;

  IF v_id_admin IS NOT NULL THEN
    SELECT id_menu INTO v_id_cuentas
    FROM ctr_menu
    WHERE idpadre = v_id_admin
      AND detalle = '/administracion/cuentas-email'
    LIMIT 1;

    IF v_id_cuentas IS NULL THEN
      INSERT INTO ctr_menu
        (descripcion, idpadre, posicion, tipo, icono, vigente, detalle,
         usuario_creacion, fecha_creacion, maquina_creacion)
      VALUES
        ('Cuentas Email', v_id_admin, 90, 'ENLACE',
         'fa-solid fa-at', 1, '/administracion/cuentas-email',
         1, NOW(), 'migration-V15')
      RETURNING id_menu INTO v_id_cuentas;
      RAISE NOTICE 'Ítem Cuentas Email creado con id = %', v_id_cuentas;
    ELSE
      RAISE NOTICE 'Ítem Cuentas Email ya existe con id = %', v_id_cuentas;
    END IF;
  END IF;

END $$;

-- ── 6. Asignar nuevos ítems al rol Superadmin (id_rol = 1) ──
INSERT INTO ctr_menu_roles (id_rol, id_menu, usuario_creacion, fecha_creacion, maquina_creacion)
SELECT 1, m.id_menu, 1, NOW(), 'migration-V15'
FROM ctr_menu m
WHERE m.detalle IN (
    '/gestion-documental/gestion-correos-electronicos',
    '/administracion/cuentas-email'
)
  AND NOT EXISTS (
    SELECT 1 FROM ctr_menu_roles mr
    WHERE mr.id_rol = 1 AND mr.id_menu = m.id_menu
  );

-- ── 7. Dominios: Clasificación de la Información ────────────
-- El frontend filtra d.idPadre = 198 (nodo "Clasificación de la
-- Información"). Si ese nodo no existe aún, crearlo junto con
-- los valores típicos de la Ley 1712/2014.
DO $$
DECLARE
  v_id_padre BIGINT;
BEGIN
  SELECT id_dominio INTO v_id_padre
  FROM ctr_dominio
  WHERE id_dominio = 198
  LIMIT 1;

  IF v_id_padre IS NULL THEN
    INSERT INTO ctr_dominio
      (id_dominio, descripcion, id_padre, vigente,
       usuario_creacion, fecha_creacion, maquina_creacion)
    VALUES
      (198, 'Clasificación de la Información', 0, 1,
       1, NOW(), 'migration-V15')
    ON CONFLICT (id_dominio) DO NOTHING;

    -- children: only insert if none exist yet for this parent
    IF NOT EXISTS (SELECT 1 FROM ctr_dominio WHERE id_padre = 198 LIMIT 1) THEN
      INSERT INTO ctr_dominio
        (descripcion, id_padre, vigente, usuario_creacion, fecha_creacion, maquina_creacion)
      VALUES
        ('Pública',              198, 1, 1, NOW(), 'migration-V15'),
        ('Pública Clasificada',  198, 1, 1, NOW(), 'migration-V15'),
        ('Reservada',            198, 1, 1, NOW(), 'migration-V15'),
        ('Secreta',              198, 1, 1, NOW(), 'migration-V15');
    END IF;

    RAISE NOTICE 'Nodo Clasificación de la Información (198) + valores seed insertados.';
  ELSE
    RAISE NOTICE 'Nodo Clasificación de la Información ya existe (id = 198).';
  END IF;
END $$;

-- ── 8. Verificación ─────────────────────────────────────────
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'ctr_cuenta_email',
    'ctr_cuenta_email_usuario',
    'ctr_correos_enviados',
    'ctr_cuenta_email_radicado'
  )
ORDER BY tablename;
