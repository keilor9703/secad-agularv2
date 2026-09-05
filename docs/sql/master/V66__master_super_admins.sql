-- ═══════════════════════════════════════════════════════════════════════════
--  V66: el superadministrador deja de ser un rol de tenant
--
--  Apply to: MASTER database (Secad). Ver también V67, que es la contraparte
--  en cada tenant, y scripts/migrar-superadmins.sh, que SIEMBRA esta tabla.
--
--  ⚠ ORDEN OBLIGATORIO:  V66  →  migrar-superadmins.sh  →  V67
--    Si se aplica V67 antes de sembrar, se pierde el rastro de quién era
--    superadministrador y no quedará nadie que pueda entrar a /super.
--
--  ── Por qué ──────────────────────────────────────────────────────────────
--
--  «SuperAdministrador» no es un rol dentro de un CAD: es una autoridad SOBRE
--  todos los CAD. Estaba guardado como el rol 2 de la tabla ctr_roles de cada
--  tenant, con tres consecuencias malas:
--
--    · Cada CAD llevaba en su catálogo un rol que allí no significa nada.
--    · La autoridad sobre TODO el sistema vivía en la base de UN CAD: quien
--      restaurara un respaldo viejo de ese tenant, o lo tocara por fuera de la
--      aplicación, alteraba un privilegio nacional.
--    · Para tener superadministradores de dos CAD había que sembrar el rol en
--      dos bases distintas.
--
--  Y existía además una puerta lateral peor: Menu:SuperUserIds en
--  appsettings.json daba es_super_admin a los id_usuario 1 y 2 de CUALQUIER
--  tenant. Como V2 siembra el usuario «admin» sin id explícito y la columna es
--  BIGSERIAL, ese admin recibe el id 1 en cada CAD nuevo: el administrador
--  sembrado de cualquier tenant era superadministrador de todo el sistema, sin
--  ningún rol. Esa opción se elimina junto con esta migración.
--
--  ── La clave es el username, no el id ────────────────────────────────────
--
--  ctr_usuarios.id_usuario es local a cada tenant; el mismo número identifica
--  a personas distintas en CAD distintos. Lo que cruza tenants es el username
--  de OUD, que es como ya identifica la maestra a los usuarios civiles en
--  secad_users_fallback. Se guarda normalizado en minúsculas para que la
--  comparación no dependa de cómo lo escriba quien entra.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS secad_super_admins (
    username         VARCHAR(100) PRIMARY KEY,
    nombre           VARCHAR(200),
    -- Informativo: de qué CAD proviene la persona. No restringe nada — un
    -- superadministrador lo es en todos los CAD, incluido el suyo.
    cod_dane_origen  VARCHAR(10),
    activo           BOOLEAN      NOT NULL DEFAULT TRUE,
    observacion      VARCHAR(500),
    usuario_creacion VARCHAR(100),
    fecha_creacion   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    usuario_modifica VARCHAR(100),
    fecha_modifica   TIMESTAMPTZ,
    CONSTRAINT chk_super_admin_username_minusculas
        CHECK (username = LOWER(username) AND LENGTH(TRIM(username)) > 0)
);

COMMENT ON TABLE secad_super_admins IS
    'Quiénes son superadministradores del SISTEMA. Única fuente de verdad de '
    'es_super_admin: ni los roles de los tenants ni la configuración lo otorgan.';

-- Búsqueda por CAD de origen para la pantalla de administración.
CREATE INDEX IF NOT EXISTS idx_super_admins_origen
    ON secad_super_admins(cod_dane_origen);

-- ── Verificación ──────────────────────────────────────────────────────────
--  Recién aplicada la tabla está VACÍA, y eso significa que NADIE es
--  superadministrador. Es correcto: la siembra la hace
--  scripts/migrar-superadmins.sh, que recorre los tenants y trae a quien
--  tuviera el rol 2. Ejecútalo ANTES de aplicar V67.
SELECT COUNT(*) AS superadministradores_registrados FROM secad_super_admins;
