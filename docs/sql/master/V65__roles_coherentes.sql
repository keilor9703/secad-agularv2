-- ═══════════════════════════════════════════════════════════════════════════
--  V65: que las dos tablas de roles digan lo mismo
--
--  Apply to: EACH TENANT/CAD database (no a la maestra).
--
--  Síntoma: a un usuario le aparecían roles que no se podían retirar
--  («No se encontró un rol vigente para retirar») y, peor, seguía viendo los
--  módulos de Super Admin después de retirárselo.
--
--  Causa: los roles de un usuario viven en DOS tablas y nadie las mantenía
--  sincronizadas.
--
--    · ctr_roles_user_admin — el registro con vigencia, fecha_fin e historia.
--      Lo leen la pantalla de «Roles y permisos» y el menú lateral.
--    · ctr_roles_user       — una tabla plana, sin vigencia. Es la que leía
--      DbAuthRepository para firmar el JWT, y de ella salen es_admin y
--      es_super_admin, que son los que de verdad abren o cierran puertas.
--
--  Asignar un rol escribía en las dos. Retirarlo solo actualizaba la primera.
--  De modo que el acceso REAL nunca se retiraba: el token siguiente volvía a
--  traer el rol. El código ya está corregido —el retiro toca las dos tablas y
--  el JWT respeta la vigencia—, pero eso solo arregla los retiros FUTUROS.
--  Esta migración limpia lo que ya quedó mal.
--
--  Idempotente: la segunda pasada no encuentra nada que borrar.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Quitar de la tabla plana los roles ya retirados o vencidos ─────────
--  Solo se borra lo que el histórico declara NO vigente: si existe cualquier
--  concesión viva del mismo rol (se retiró y se volvió a conceder), la fila
--  se queda donde está.
DELETE FROM ctr_roles_user ru
WHERE EXISTS (
        SELECT 1 FROM ctr_roles_user_admin a
        WHERE  a.id_usuario = ru.id_usuario
          AND  a.id_rol     = ru.id_rol
      )
  AND NOT EXISTS (
        SELECT 1 FROM ctr_roles_user_admin a
        WHERE  a.id_usuario = ru.id_usuario
          AND  a.id_rol     = ru.id_rol
          AND  COALESCE(a.vigente, 0) = 1
          AND  (a.fecha_fin IS NULL OR a.fecha_fin >= CURRENT_DATE)
      );

-- ── 2. Los roles de un usuario BLOQUEADO no siguen en la tabla plana ──────
--  Retirar un usuario ponía bloqueado = 1 y marcaba su histórico, pero le
--  dejaba los roles en la tabla plana. Al desbloquearlo reaparecía con todo.
DELETE FROM ctr_roles_user ru
USING  ctr_usuarios u
WHERE  u.id_usuario = ru.id_usuario
  AND  u.bloqueado  = 1;

-- ── 3. Verificación ───────────────────────────────────────────────────────
--  Lo que queda en la plana debe ser, para cada usuario, lo mismo que el
--  histórico da por vigente (o todo lo suyo, si no tiene histórico). Si esta
--  consulta devuelve filas, hay una discrepancia que mirar a mano.
SELECT ru.id_usuario, ru.id_rol, 'en la plana pero no vigente en el histórico' AS discrepancia
FROM   ctr_roles_user ru
WHERE  EXISTS (SELECT 1 FROM ctr_roles_user_admin a WHERE a.id_usuario = ru.id_usuario)
  AND  NOT EXISTS (
         SELECT 1 FROM ctr_roles_user_admin a
         WHERE  a.id_usuario = ru.id_usuario AND a.id_rol = ru.id_rol
           AND  COALESCE(a.vigente, 0) = 1
           AND  (a.fecha_fin IS NULL OR a.fecha_fin >= CURRENT_DATE))
UNION ALL
SELECT a.id_usuario, a.id_rol, 'vigente en el histórico pero ausente de la plana'
FROM   ctr_roles_user_admin a
WHERE  COALESCE(a.vigente, 0) = 1
  AND  (a.fecha_fin IS NULL OR a.fecha_fin >= CURRENT_DATE)
  AND  NOT EXISTS (SELECT 1 FROM ctr_roles_user ru
                   WHERE ru.id_usuario = a.id_usuario AND ru.id_rol = a.id_rol)
ORDER  BY 1, 2;
