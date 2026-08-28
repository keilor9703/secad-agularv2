-- ═══════════════════════════════════════════════════════════════════════════
--  Migración V16 — §6.15 Bitácora de Turno (Anotaciones Generales)
--  Tablas  : cad_anotaciones_turno
--  Menú    : ítem "Bitácora" bajo el grupo Operación
--  Idempotente: CREATE TABLE IF NOT EXISTS + INSERT con comprobación de
--               existencia previa (no usa ON CONFLICT en menú)
--  Ejecutar en : cada tenant que necesite el módulo §6.15
-- ═══════════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════════════
--  1. TABLA PRINCIPAL
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cad_anotaciones_turno (
    id                  BIGINT       NOT NULL PRIMARY KEY,   -- Snowflake ID
    tipo                VARCHAR(30)  NOT NULL DEFAULT 'GENERAL',
    titulo              VARCHAR(200),
    descripcion         TEXT         NOT NULL,

    -- Contexto operativo (opcionales — tomados del JWT del usuario)
    canal_codigo        INTEGER,
    fuerza_id           INTEGER,
    sitio_graba         INTEGER,

    -- Auditoría de creación
    id_usuario_creacion BIGINT,
    username_creacion   VARCHAR(100),
    nombre_completo     VARCHAR(200),
    maquina_creacion    VARCHAR(100),
    fecha_creacion      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- Auditoría de modificación
    username_modifica   VARCHAR(100),
    fecha_modifica      TIMESTAMPTZ,

    -- Vigencia lógica
    vigente             SMALLINT     NOT NULL DEFAULT 1
);

COMMENT ON TABLE cad_anotaciones_turno IS
  '§6.15 Bitácora de Turno — registro de anotaciones generales durante el turno: '
  'comunicados, revistas, actividades operativas/preventivas, novedades con personal, etc. '
  'Cada registro obtiene un ID único mediante el generador Snowflake.';

COMMENT ON COLUMN cad_anotaciones_turno.tipo IS
  'Categoría de la anotación: COMUNICADO | REVISTA | OPERATIVA | PREVENTIVA | NOVEDAD_PERSONAL | GENERAL';

COMMENT ON COLUMN cad_anotaciones_turno.id IS
  'Snowflake ID generado por el servidor (ISnowflakeGenerator). '
  'No usar SERIAL/BIGSERIAL — debe provenir del generador centralizado.';


-- ── Índices ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_anot_turno_canal
    ON cad_anotaciones_turno(canal_codigo)
    WHERE vigente = 1;

CREATE INDEX IF NOT EXISTS idx_anot_turno_fecha
    ON cad_anotaciones_turno(fecha_creacion DESC)
    WHERE vigente = 1;

CREATE INDEX IF NOT EXISTS idx_anot_turno_tipo
    ON cad_anotaciones_turno(tipo)
    WHERE vigente = 1;

CREATE INDEX IF NOT EXISTS idx_anot_turno_sitio
    ON cad_anotaciones_turno(sitio_graba)
    WHERE vigente = 1;


-- ══════════════════════════════════════════════════════════════════════════
--  2. ÍTEM DE MENÚ — "Bitácora de Turno" bajo el grupo Operación
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_id_operacion  BIGINT;
  v_id_bitacora   BIGINT;
BEGIN

  -- ── Localizar el grupo "Operación" (creado en V10) ─────────────────────
  SELECT id_menu INTO v_id_operacion
  FROM ctr_menu
  WHERE detalle IS NULL
    AND LOWER(descripcion) LIKE '%operaci%'
    AND vigente = 1
  LIMIT 1;

  IF v_id_operacion IS NULL THEN
    RAISE EXCEPTION
      'No se encontró el grupo "Operación" en ctr_menu. '
      'Asegúrese de ejecutar V10 antes que V16.';
  END IF;

  -- ── Crear ítem "Bitácora de Turno" si no existe ─────────────────────────
  SELECT id_menu INTO v_id_bitacora
  FROM ctr_menu
  WHERE idpadre = v_id_operacion
    AND detalle = '/operacion/anotaciones'
  LIMIT 1;

  IF v_id_bitacora IS NULL THEN
    INSERT INTO ctr_menu
      (descripcion, idpadre, posicion, tipo, icono, vigente, detalle,
       usuario_creacion, fecha_creacion, maquina_creacion)
    VALUES
      ('Bitácora de Turno', v_id_operacion, 40, 'ENLACE',
       'fa-solid fa-book-open-reader', 1, '/operacion/anotaciones',
       1, NOW(), 'migration-V16')
    RETURNING id_menu INTO v_id_bitacora;

    RAISE NOTICE 'Ítem "Bitácora de Turno" creado con id = %', v_id_bitacora;
  ELSE
    RAISE NOTICE 'Ítem "Bitácora de Turno" ya existe con id = %', v_id_bitacora;
  END IF;

END $$;


-- ── 2b. Asignar el nuevo ítem al rol "Superadmin" (id_rol = 1) ──────────
INSERT INTO ctr_menu_roles (id_rol, id_menu, usuario_creacion, fecha_creacion, maquina_creacion)
SELECT 1, m.id_menu, 1, NOW(), 'migration-V16'
FROM ctr_menu m
WHERE m.detalle = '/operacion/anotaciones'
  AND NOT EXISTS (
    SELECT 1
    FROM ctr_menu_roles mr
    WHERE mr.id_rol  = 1
      AND mr.id_menu = m.id_menu
  );


-- ══════════════════════════════════════════════════════════════════════════
--  3. VERIFICACIÓN FINAL
-- ══════════════════════════════════════════════════════════════════════════

SELECT
  'tabla'   AS objeto,
  'cad_anotaciones_turno' AS nombre,
  CASE WHEN to_regclass('cad_anotaciones_turno') IS NOT NULL
       THEN 'OK' ELSE 'FALTA' END AS estado

UNION ALL

SELECT
  'menu',
  m.descripcion || ' → ' || m.detalle,
  'id=' || m.id_menu::text
FROM ctr_menu m
WHERE m.detalle = '/operacion/anotaciones';
