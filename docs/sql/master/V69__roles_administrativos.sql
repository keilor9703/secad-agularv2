-- ═══════════════════════════════════════════════════════════════════════════
--  V69: qué roles son administrativos lo declara el CAD, no un id fijo
--
--  Apply to: EACH TENANT/CAD database (no a la maestra).
--
--  Síntoma: un usuario con el rol «Administrador» de su CAD entraba al Hub de
--  Integraciones y la pestaña de Cámaras (VMS) devolvía error; con un
--  superadministrador funcionaba.
--
--  Causa: el claim es_admin del JWT se calculaba así
--
--      esAdmin = esSuperAdmin || roles.Contains(1)
--
--  con el 1 escrito a mano. Pero id_rol es un BIGSERIAL LOCAL a cada tenant:
--  en un CAD donde el rol «Administrador» se creó después —el de este caso lo
--  tiene con id 14— la comparación falla y el token sale con es_admin=false.
--  Todo endpoint protegido con [Authorize(Policy = "Administrador")] responde
--  entonces 403, y el frontend lo enseña como «error al cargar». Con un
--  superadministrador no se nota, porque el primer término de ese OR ya es
--  verdadero.
--
--  Es el mismo error que V66 quitó para el superadministrador: una autoridad
--  identificada por un número que significa cosas distintas en cada base.
--
--  La diferencia es que «administrador del CAD» SÍ es un rol del tenant. Lo
--  que faltaba era que el CAD pudiera decir cuáles de sus roles lo son, en vez
--  de que el código lo adivinara. Eso es esta columna.
--
--  Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE ctr_roles
    ADD COLUMN IF NOT EXISTS es_admin SMALLINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN ctr_roles.es_admin IS
    '1 = quien tenga este rol es administrador de ESTE CAD: se le firma el claim '
    'es_admin y alcanza las pantallas y endpoints de administración. Lo decide '
    'cada CAD desde Administración → Roles, no un id fijo en el código.';

-- ── Siembra: los que hoy hacen de administrador ───────────────────────────
--  Tres criterios, de más a menos fiable, y ninguno inventa nada:
--    1. El id 1, que es el que el código daba por administrador hasta ahora.
--    2. El que se llame «Administrador» —así se llama el de este CAD, con id
--       14— o «Super Admin», que hasta V66/V67 también entraba por ese OR.
--    3. Ninguno más: un rol operativo no se vuelve administrativo por error.
UPDATE ctr_roles
   SET es_admin = 1
 WHERE es_admin = 0
   AND ( id_rol = 1
      OR UPPER(REPLACE(TRIM(COALESCE(descripcion, '')), ' ', ''))
         IN ('ADMINISTRADOR', 'ADMINISTRADORA', 'ADMIN',
             'SUPERADMINISTRADOR', 'SUPERADMIN') );

-- ── Verificación ──────────────────────────────────────────────────────────
--  Debe salir al menos uno con es_admin = 1. Si no sale ninguno, este CAD se
--  quedaría sin administrador: márcalo a mano antes de redesplegar.
--      UPDATE ctr_roles SET es_admin = 1 WHERE id_rol = <el que corresponda>;
SELECT id_rol, descripcion, vigente, es_admin
FROM   ctr_roles
ORDER  BY es_admin DESC, id_rol;
