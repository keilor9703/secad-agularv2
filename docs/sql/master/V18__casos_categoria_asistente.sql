-- ═══════════════════════════════════════════════════════════════════════════
--  Migración V18 — Vinculación cad_casos ↔ cad_asistente_categorias
--
--  Objetivo : Permite que cada código de caso apunte a una categoría del
--             Asistente Inteligente, habilitando el despliegue automático de
--             preguntas orientadoras cuando el operador tipifica un incidente.
--
--  Múltiples casos pueden compartir la misma categoría.
--  Ej: "904 Hurto calificado" y "904A Hurto a residencias" → categoría HURTO.
--
--  Idempotente: usa ADD COLUMN IF NOT EXISTS y CREATE INDEX IF NOT EXISTS.
--  Requiere: V4 (cad_casos) y V17 (cad_asistente_categorias) aplicadas.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. Nueva columna FK ───────────────────────────────────────────────────

ALTER TABLE cad_casos
  ADD COLUMN IF NOT EXISTS id_categoria_asistente BIGINT
    REFERENCES cad_asistente_categorias(id) ON DELETE SET NULL;

COMMENT ON COLUMN cad_casos.id_categoria_asistente IS
  'FK a cad_asistente_categorias. Cuando está presente, el módulo de Recepción '
  'despliega automáticamente las preguntas orientadoras de esa categoría al '
  'tipificar el incidente con este código. NULL = sin asistente configurado.';


-- ── 2. Índice para consultas por categoría ────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_casos_cat_asistente
  ON cad_casos(id_categoria_asistente)
  WHERE id_categoria_asistente IS NOT NULL;


-- ── 3. Actualización de ejemplo (vincula datos de ejemplo de V17) ─────────
--  Solo actúa si la tabla ya tiene datos de V17 y los códigos coinciden.
--  Es seguro ejecutar repetidamente; no sobreescribe asignaciones previas.

DO $$
DECLARE
  v_cat_hurto     BIGINT;
  v_cat_accidente BIGINT;
  v_cat_rina      BIGINT;
BEGIN

  SELECT id INTO v_cat_hurto     FROM cad_asistente_categorias WHERE codigo = 'HURTO'             LIMIT 1;
  SELECT id INTO v_cat_accidente FROM cad_asistente_categorias WHERE codigo = 'ACCIDENTE_TRANSITO' LIMIT 1;
  SELECT id INTO v_cat_rina      FROM cad_asistente_categorias WHERE codigo = 'RINA'              LIMIT 1;

  -- Solo asigna si aún no tiene categoría (no sobreescribe configuración manual)
  IF v_cat_hurto IS NOT NULL THEN
    UPDATE cad_casos
    SET    id_categoria_asistente = v_cat_hurto
    WHERE  id_categoria_asistente IS NULL
      AND  (UPPER(descripcion) LIKE '%HURTO%'
         OR UPPER(codigo)      LIKE '%904%');
    RAISE NOTICE 'Categoría HURTO vinculada a % caso(s).', FOUND;
  END IF;

  IF v_cat_accidente IS NOT NULL THEN
    UPDATE cad_casos
    SET    id_categoria_asistente = v_cat_accidente
    WHERE  id_categoria_asistente IS NULL
      AND  (UPPER(descripcion) LIKE '%ACCIDENTE%'
         OR UPPER(descripcion) LIKE '%TRANSIT%');
    RAISE NOTICE 'Categoría ACCIDENTE_TRANSITO vinculada a % caso(s).', FOUND;
  END IF;

  IF v_cat_rina IS NOT NULL THEN
    UPDATE cad_casos
    SET    id_categoria_asistente = v_cat_rina
    WHERE  id_categoria_asistente IS NULL
      AND  (UPPER(descripcion) LIKE '%RIÑA%'
         OR UPPER(descripcion) LIKE '%RINA%'
         OR UPPER(codigo)      LIKE '%934%');
    RAISE NOTICE 'Categoría RINA vinculada a % caso(s).', FOUND;
  END IF;

END $$;


-- ── 4. Verificación ───────────────────────────────────────────────────────

SELECT
  c.codigo,
  c.descripcion,
  cat.codigo       AS categoria_codigo,
  cat.descripcion  AS categoria_descripcion
FROM   cad_casos c
JOIN   cad_asistente_categorias cat ON cat.id = c.id_categoria_asistente
ORDER  BY cat.orden, c.codigo
LIMIT  20;
