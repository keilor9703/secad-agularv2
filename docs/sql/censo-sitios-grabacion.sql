-- ═══════════════════════════════════════════════════════════════════════════
--  Censo de sitios de grabación — SOLO LECTURA, no modifica nada
--
--  Córralo contra la base de UN CAD antes y después de aplicar V71, para ver
--  en qué estado quedó la clasificación.
--
--      psql -h <host> -U <usuario> -d <base> -f docs/sql/censo-sitios-grabacion.sql
--
--  o dentro del contenedor:
--
--      docker exec -i secad-postgres psql -U secad_app -d Secad_Bogota \
--        < docs/sql/censo-sitios-grabacion.sql
-- ═══════════════════════════════════════════════════════════════════════════

\echo ''
\echo '── 1. Sitios de grabación registrados en este CAD ──────────────────────'
SELECT s.consecutivo,
       s.descripcion,
       COALESCE(to_jsonb(s) ->> 'abreviatura', '—') AS sigla,
       COALESCE(to_jsonb(s) ->> 'cod_dane',    '—') AS dane,
       COALESCE(to_jsonb(s) ->> 'vigente',     'S') AS vigente,
       (SELECT COUNT(*) FROM cad_fuerzas  f WHERE f.sitio_graba     = s.consecutivo) AS fuerzas,
       (SELECT COUNT(*) FROM ctr_usuarios u WHERE u.sitio_grabacion = s.consecutivo) AS usuarios
FROM   cad_sitios_grabacion s
ORDER  BY s.consecutivo;

\echo ''
\echo '── 2. Lo que quedaría fuera del módulo (sitio 0 = sin clasificar) ──────'
SELECT 'fuerzas sin clasificar'  AS que, COUNT(*) AS cuantas FROM cad_fuerzas  WHERE COALESCE(sitio_graba,     0) = 0
UNION ALL
SELECT 'usuarios sin clasificar',       COUNT(*)             FROM ctr_usuarios WHERE COALESCE(sitio_grabacion, 0) = 0;

\echo ''
\echo '── 3. Fuerzas sin clasificar, una por una ──────────────────────────────'
SELECT f.id, f.descripcion, f.abreviatura, f.vigente,
       (SELECT COUNT(*) FROM cad_canales  c WHERE c.cadfuerz_id       = f.id) AS canales,
       (SELECT COUNT(*) FROM ctr_usuarios u WHERE u.cadcana_fuerza_id = f.id) AS usuarios
FROM   cad_fuerzas f
WHERE  COALESCE(f.sitio_graba, 0) = 0
ORDER  BY f.descripcion;

\echo ''
\echo '── 4. Fuerzas que apuntan a un sitio que NO existe ─────────────────────'
\echo '     (mientras haya alguna, V71 no puede crear la clave foránea)'
SELECT f.id, f.descripcion, f.sitio_graba AS sitio_inexistente
FROM   cad_fuerzas f
WHERE  NOT EXISTS (SELECT 1 FROM cad_sitios_grabacion s WHERE s.consecutivo = f.sitio_graba)
ORDER  BY f.sitio_graba, f.id;

\echo ''
\echo '── 5. El riesgo de Recepción: usuario y fuerza en sitios distintos ─────'
\echo '     Recepción filtra los canales con f.sitio_graba = <sitio del usuario>'
\echo '     SIN escape a 0. A quien aparezca aquí no le sale ningún canal.'
SELECT u.id_usuario,
       u.username,
       COALESCE(u.sitio_grabacion, 0) AS sitio_del_usuario,
       f.id                           AS fuerza,
       f.descripcion                  AS fuerza_descripcion,
       COALESCE(f.sitio_graba, 0)     AS sitio_de_la_fuerza
FROM   ctr_usuarios u
JOIN   cad_fuerzas  f ON f.id = u.cadcana_fuerza_id
WHERE  COALESCE(u.sitio_grabacion, 0) <> COALESCE(f.sitio_graba, 0)
ORDER  BY u.username;

\echo ''
\echo '── 6. Estado de la clave foránea ───────────────────────────────────────'
SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cad_fuerzas_sitio')
            THEN 'creada — una fuerza ya no puede apuntar a un sitio inexistente'
            ELSE 'pendiente — quedan fuerzas sin clasificar; vuelva a pasar V71 al terminar'
       END AS clave_foranea;
\echo ''
