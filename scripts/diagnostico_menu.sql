-- ══════════════════════════════════════════════════════════════════════════
-- Diagnóstico del menú lateral
--
-- Úsalo cuando el menú muestre un grupo (Operación, Super Admin,
-- Administración) sin hijos, o cuando falten ítems que sí deberían estar.
--
-- El menú NO sale de las rutas de Angular: sale de ctr_menu, y cada ítem se
-- muestra solo si está otorgado al rol del usuario en ctr_menu_roles. Por eso
-- un ítem puede existir y aun así no verse.
--
--   docker exec -i <contenedor> psql -U <usuario> -d <bd> < scripts/diagnostico_menu.sql
-- ══════════════════════════════════════════════════════════════════════════

\echo '=== 1. ¿Están sembrados los ítems? (esperado: ~30) ==='
SELECT COUNT(*) AS total_items,
       COUNT(*) FILTER (WHERE vigente = 1) AS vigentes
FROM ctr_menu;

\echo ''
\echo '=== 2. Árbol completo, con a qué roles está otorgado cada ítem ==='
\echo '    (roles vacío = existe pero NO lo ve nadie)'
SELECT
    COALESCE(p.descripcion, '— raíz —')            AS grupo,
    m.descripcion                                  AS item,
    m.detalle                                      AS ruta,
    CASE m.vigente WHEN 1 THEN 'sí' ELSE 'NO' END  AS vigente,
    COALESCE(
      (SELECT string_agg(mr.id_rol::text, ', ' ORDER BY mr.id_rol)
         FROM ctr_menu_roles mr WHERE mr.id_menu = m.id_menu),
      '(ninguno)'
    )                                              AS roles
FROM ctr_menu m
LEFT JOIN ctr_menu p   ON p.id_menu = m.idpadre
ORDER BY COALESCE(p.posicion, m.posicion), p.descripcion NULLS FIRST, m.posicion;

\echo ''
\echo '=== 3. Ítems que existen pero no ve NADIE (falta el grant) ==='
SELECT m.id_menu, m.descripcion, m.detalle
FROM   ctr_menu m
WHERE  NOT EXISTS (SELECT 1 FROM ctr_menu_roles mr WHERE mr.id_menu = m.id_menu)
ORDER  BY m.id_menu;

\echo ''
\echo '=== 4. Roles de un usuario concreto — cambia la cédula ==='
SELECT u.id_usuario, u.usuario, r.id_rol, r.descripcion AS rol
FROM   ctr_usuarios u
JOIN   ctr_usuario_roles ur ON ur.id_usuario = u.id_usuario
JOIN   ctr_roles r          ON r.id_rol = ur.id_rol
WHERE  u.identificacion = '1234188418';

\echo ''
\echo '=== 5. Qué vería ese usuario, según sus roles ==='
SELECT DISTINCT m.descripcion, m.detalle
FROM   ctr_menu m
JOIN   ctr_menu_roles mr ON mr.id_menu = m.id_menu
WHERE  m.vigente = 1
  AND  mr.id_rol IN (
         SELECT ur.id_rol FROM ctr_usuario_roles ur
         JOIN ctr_usuarios u ON u.id_usuario = ur.id_usuario
         WHERE u.identificacion = '1234188418')
ORDER  BY m.descripcion;
