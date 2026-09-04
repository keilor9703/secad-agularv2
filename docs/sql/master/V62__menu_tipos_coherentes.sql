-- ═══════════════════════════════════════════════════════════════════════════
--  V62: un solo vocabulario para ctr_menu.tipo
--
--  Apply to: EACH TENANT/CAD database (no a la maestra).
--
--  Síntoma: en Administración → Menú no se entendía qué era cada fila. Los
--  grupos decían «Grupo», las pantallas decían unas «Submenú» y otras
--  «Enlace», y «Gestión Documental» (id 33) aparecía como submenú siendo un
--  contenedor con un hijo dentro.
--
--  Causa: en la columna `tipo` conviven dos vocabularios que nadie unificó.
--
--    · El de la aplicación, que es el que sabe leer el frontend:
--          'S'   destino (o contenedor, si no lleva ruta)
--          'frm' ruta interna obligatoria
--          'url' hipervínculo externo
--          'pdf' documento
--
--    · El que introdujeron las migraciones a partir de V47:
--          'GRUPO'   contenedor
--          'ENLACE'  destino interno
--
--  Funcionaba de casualidad: 'GRUPO' no casaba con ninguna rama de
--  resolveMenuTarget y caía en el catch-all de compatibilidad. El frontend ya
--  reconoce los dos de forma explícita (menu-destination.ts), así que esta
--  migración no arregla nada roto: deja los DATOS diciendo una sola cosa, para
--  que la pantalla de administración se pueda leer.
--
--  Queda en dos conceptos, que son los que hay de verdad:
--      GRUPO → contenedor. No navega; se le cuelgan pantallas debajo.
--      S     → pantalla con ruta propia. No admite hijos.
--  'url' y 'pdf' NO se tocan: son destinos de otra naturaleza (externo y
--  documento) y siguen siendo tipos legítimos.
--
--  Idempotente: la segunda pasada no encuentra filas que cambiar.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Lo que contiene, es grupo ──────────────────────────────────────────
--  Un contenedor se reconoce por dos cosas a la vez: no lleva ruta (no navega
--  a ninguna parte) y hay filas colgando de él —o es una raíz, que por la
--  convención de V10 se apunta a sí misma. No basta con «no tiene ruta»: una
--  fila suelta sin ruta ni hijos es un resto, no un grupo.
UPDATE ctr_menu AS m
SET    tipo = 'GRUPO'
WHERE  m.tipo <> 'GRUPO'
  AND  m.tipo NOT IN ('url', 'pdf')
  AND  COALESCE(TRIM(m.detalle), '') = ''
  AND  (
        m.idpadre = m.id_menu
        OR EXISTS (SELECT 1 FROM ctr_menu h
                   WHERE h.idpadre = m.id_menu AND h.id_menu <> m.id_menu)
       );

-- ── 2. Lo que navega dentro de la app, es pantalla ────────────────────────
--  'ENLACE' y 'S' significan exactamente lo mismo para el frontend. Se queda
--  'S', que es el término que ofrece el formulario de administración.
UPDATE ctr_menu
SET    tipo = 'S'
WHERE  tipo = 'ENLACE';

-- ── 3. Verificación ───────────────────────────────────────────────────────
--  Debe quedar un puñado de GRUPO sin ruta, y todo lo demás con ruta.
SELECT m.tipo,
       COUNT(*)                                                  AS filas,
       COUNT(*) FILTER (WHERE COALESCE(TRIM(m.detalle), '') = '') AS sin_ruta,
       COUNT(*) FILTER (WHERE COALESCE(TRIM(m.detalle), '') <> '') AS con_ruta
FROM   ctr_menu m
WHERE  m.vigente = 1
GROUP  BY m.tipo
ORDER  BY m.tipo;
