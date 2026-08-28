-- ═══════════════════════════════════════════════════════════════════════════
--  Migración V17 — §6.17 Asistente Inteligente
--  Tablas  : cad_asistente_categorias, cad_asistente_preguntas
--  Menú    : ítem "Asistente Inteligente" bajo el grupo Administración
--  Idempotente: CREATE TABLE IF NOT EXISTS + comprobación previa en menú
--  Ejecutar en : cada tenant que necesite el módulo §6.17
-- ═══════════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════════════
--  1. TABLA DE CATEGORÍAS
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cad_asistente_categorias (
    id                 BIGINT       NOT NULL PRIMARY KEY,   -- Snowflake ID
    codigo             VARCHAR(50)  NOT NULL UNIQUE,        -- ej: HURTO, ACCIDENTE_TRANSITO
    descripcion        VARCHAR(200) NOT NULL,
    icono              VARCHAR(100) NOT NULL DEFAULT 'fa-circle-question',
    orden              INTEGER      NOT NULL DEFAULT 0,
    activo             BOOLEAN      NOT NULL DEFAULT TRUE,

    -- Auditoría
    username_creacion  VARCHAR(100),
    fecha_creacion     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE cad_asistente_categorias IS
  '§6.17 Asistente Inteligente — categorías de tipo de incidente que agrupan '
  'preguntas orientadoras para el despachador. Ej: HURTO, ACCIDENTE_TRANSITO, RIÑA.';

COMMENT ON COLUMN cad_asistente_categorias.codigo IS
  'Código único en mayúsculas (sin espacios). Ej: HURTO, ACCIDENTE_TRANSITO, EMERGENCIA_MEDICA.';

COMMENT ON COLUMN cad_asistente_categorias.id IS
  'Snowflake ID generado por el servidor. No usar SERIAL/BIGSERIAL.';


-- ── Índices ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_asistente_cat_orden
    ON cad_asistente_categorias(orden, descripcion)
    WHERE activo = TRUE;


-- ══════════════════════════════════════════════════════════════════════════
--  2. TABLA DE PREGUNTAS
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cad_asistente_preguntas (
    id                 BIGINT       NOT NULL PRIMARY KEY,   -- Snowflake ID
    categoria_id       BIGINT       REFERENCES cad_asistente_categorias(id) ON DELETE CASCADE,
    pregunta           TEXT         NOT NULL,
    ayuda              VARCHAR(500),                        -- hint / texto de ayuda

    -- TipoRespuesta: TEXTO | SINO | NUMERO | SELECCION
    tipo_respuesta     VARCHAR(20)  NOT NULL DEFAULT 'TEXTO',
    -- JSON array de strings, solo para tipo_respuesta = 'SELECCION'. Ej: ["Sí","No","No sé"]
    opciones           JSONB,

    obligatoria        BOOLEAN      NOT NULL DEFAULT FALSE,
    orden              INTEGER      NOT NULL DEFAULT 0,
    activo             BOOLEAN      NOT NULL DEFAULT TRUE,

    -- Auditoría
    username_creacion  VARCHAR(100),
    fecha_creacion     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE cad_asistente_preguntas IS
  '§6.17 Asistente Inteligente — preguntas orientadoras mostradas al despachador '
  'al tipificar un incidente. tipo_respuesta: TEXTO | SINO | NUMERO | SELECCION. '
  'No se persisten respuestas — son solo guías visuales.';

COMMENT ON COLUMN cad_asistente_preguntas.tipo_respuesta IS
  'TEXTO: campo libre | SINO: Sí/No | NUMERO: campo numérico | SELECCION: combo de opciones JSON.';

COMMENT ON COLUMN cad_asistente_preguntas.opciones IS
  'JSON array de strings. Solo válido para tipo_respuesta = SELECCION. '
  'Ejemplo: ["Leve","Grave","Muy grave"]';

COMMENT ON COLUMN cad_asistente_preguntas.categoria_id IS
  'FK a cad_asistente_categorias. NULL = pregunta global (se muestra en todas las categorías).';


-- ── Índices ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_asistente_preg_cat
    ON cad_asistente_preguntas(categoria_id, orden)
    WHERE activo = TRUE;

CREATE INDEX IF NOT EXISTS idx_asistente_preg_tipo
    ON cad_asistente_preguntas(tipo_respuesta)
    WHERE activo = TRUE;


-- ══════════════════════════════════════════════════════════════════════════
--  3. DATOS DE EJEMPLO (se insertan solo si las tablas están vacías)
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_cat_hurto     BIGINT := 1700000000000001;
  v_cat_accidente BIGINT := 1700000000000002;
  v_cat_rina      BIGINT := 1700000000000003;
BEGIN

  IF NOT EXISTS (SELECT 1 FROM cad_asistente_categorias LIMIT 1) THEN

    -- Categorías de ejemplo
    INSERT INTO cad_asistente_categorias (id, codigo, descripcion, icono, orden, activo, username_creacion)
    VALUES
      (v_cat_hurto,     'HURTO',             'Hurto',               'fa-mask',              1, TRUE, 'migration-V17'),
      (v_cat_accidente, 'ACCIDENTE_TRANSITO', 'Accidente de Tránsito','fa-car-burst',         2, TRUE, 'migration-V17'),
      (v_cat_rina,      'RINA',              'Riña',                'fa-person-falling-burst',3, TRUE, 'migration-V17');

    -- Preguntas para HURTO
    INSERT INTO cad_asistente_preguntas
        (id, categoria_id, pregunta, ayuda, tipo_respuesta, obligatoria, orden, activo, username_creacion)
    VALUES
      (1700000000001001, v_cat_hurto, '¿Cuántas personas cometieron el hurto?',
       'Número aproximado de victimarios visibles', 'NUMERO', FALSE, 1, TRUE, 'migration-V17'),
      (1700000000001002, v_cat_hurto, '¿Los sospechosos portaban armas?',
       'Indique si había armas blancas, de fuego u otros objetos contundentes', 'SINO', TRUE, 2, TRUE, 'migration-V17'),
      (1700000000001003, v_cat_hurto, '¿Se llevaron algún vehículo?',
       NULL, 'SINO', FALSE, 3, TRUE, 'migration-V17'),
      (1700000000001004, v_cat_hurto, '¿Cuál fue el objeto hurtado?',
       'Celular, bolso, vehículo, dinero, etc.', 'TEXTO', FALSE, 4, TRUE, 'migration-V17'),
      (1700000000001005, v_cat_hurto, '¿Hay víctimas lesionadas?',
       NULL, 'SINO', TRUE, 5, TRUE, 'migration-V17');

    -- Preguntas para ACCIDENTE_TRANSITO
    INSERT INTO cad_asistente_preguntas
        (id, categoria_id, pregunta, ayuda, tipo_respuesta, opciones, obligatoria, orden, activo, username_creacion)
    VALUES
      (1700000000002001, v_cat_accidente, '¿Cuántos vehículos están involucrados?',
       NULL, 'NUMERO', NULL, FALSE, 1, TRUE, 'migration-V17'),
      (1700000000002002, v_cat_accidente, '¿Hay personas atrapadas?',
       'Personas que no pueden salir por sus propios medios del vehículo', 'SINO', NULL, TRUE, 2, TRUE, 'migration-V17'),
      (1700000000002003, v_cat_accidente, '¿Cuántos heridos hay en la escena?',
       NULL, 'NUMERO', NULL, TRUE, 3, TRUE, 'migration-V17'),
      (1700000000002004, v_cat_accidente, '¿Tipo de vía donde ocurrió?',
       NULL, 'SELECCION', '["Vía urbana","Autopista / carretera","Vía rural","Parqueadero","Otro"]', FALSE, 4, TRUE, 'migration-V17'),
      (1700000000002005, v_cat_accidente, '¿Hay fuga de combustible o incendio?',
       NULL, 'SINO', NULL, TRUE, 5, TRUE, 'migration-V17');

    -- Preguntas para RIÑA
    INSERT INTO cad_asistente_preguntas
        (id, categoria_id, pregunta, ayuda, tipo_respuesta, obligatoria, orden, activo, username_creacion)
    VALUES
      (1700000000003001, v_cat_rina, '¿Cuántas personas están involucradas en la riña?',
       NULL, 'NUMERO', FALSE, 1, TRUE, 'migration-V17'),
      (1700000000003002, v_cat_rina, '¿Se observan armas blancas o de fuego?',
       NULL, 'SINO', TRUE, 2, TRUE, 'migration-V17'),
      (1700000000003003, v_cat_rina, '¿Hay heridos visibles?',
       NULL, 'SINO', TRUE, 3, TRUE, 'migration-V17'),
      (1700000000003004, v_cat_rina, '¿Continúa la agresión en este momento?',
       'Indique si la situación sigue activa o ya cesó', 'SINO', TRUE, 4, TRUE, 'migration-V17');

    RAISE NOTICE 'Datos de ejemplo del Asistente Inteligente insertados correctamente.';
  ELSE
    RAISE NOTICE 'La tabla cad_asistente_categorias ya contiene datos — no se insertan ejemplos.';
  END IF;

END $$;


-- ══════════════════════════════════════════════════════════════════════════
--  4. ÍTEM DE MENÚ — "Asistente Inteligente" bajo el grupo Administración
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_id_admin      BIGINT;
  v_id_asistente  BIGINT;
BEGIN

  -- ── Localizar el grupo "Administración" (búsqueda flexible) ─────────────
  --   · No filtra por detalle IS NULL: el nodo padre puede tener o no detalle.
  --   · Excluye el nodo raíz (auto-referenciado) y nodos hoja que tengan ruta.
  --   · Ordena por id_menu para obtener siempre el mismo registro.
  SELECT id_menu INTO v_id_admin
  FROM ctr_menu
  WHERE LOWER(descripcion) LIKE '%administraci%'
    AND vigente = 1
    AND id_menu <> COALESCE(idpadre, 0)      -- excluir nodo raíz auto-referenciado
  ORDER BY id_menu
  LIMIT 1;

  -- Si aún no se encontró, intenta sin filtro de vigente
  IF v_id_admin IS NULL THEN
    SELECT id_menu INTO v_id_admin
    FROM ctr_menu
    WHERE LOWER(descripcion) LIKE '%administraci%'
    ORDER BY id_menu
    LIMIT 1;
  END IF;

  IF v_id_admin IS NULL THEN
    -- No fatal: avisa y omite la creación del ítem de menú.
    -- Las tablas y datos de ejemplo ya fueron creados correctamente.
    RAISE NOTICE 'AVISO: No se encontró el grupo "Administración" en ctr_menu. '
                 'El ítem de menú del Asistente Inteligente deberá crearse manualmente '
                 'desde el módulo Administración → Menú.';
  ELSE

    RAISE NOTICE 'Grupo Administración encontrado con id_menu = %', v_id_admin;

    -- ── Crear ítem "Asistente Inteligente" si no existe ──────────────────
    SELECT id_menu INTO v_id_asistente
    FROM ctr_menu
    WHERE idpadre = v_id_admin
      AND detalle = '/administracion/asistente'
    LIMIT 1;

    IF v_id_asistente IS NULL THEN
      INSERT INTO ctr_menu
        (descripcion, idpadre, posicion, tipo, icono, vigente, detalle,
         usuario_creacion, fecha_creacion, maquina_creacion)
      VALUES
        ('Asistente Inteligente', v_id_admin, 55, 'ENLACE',
         'fa-solid fa-robot', 1, '/administracion/asistente',
         1, NOW(), 'migration-V17')
      RETURNING id_menu INTO v_id_asistente;

      RAISE NOTICE 'Ítem "Asistente Inteligente" creado con id = %', v_id_asistente;
    ELSE
      RAISE NOTICE 'Ítem "Asistente Inteligente" ya existe con id = %', v_id_asistente;
    END IF;

  END IF;

END $$;


-- ── 4b. Asignar el ítem al rol "Superadmin" (id_rol = 1) ────────────────

INSERT INTO ctr_menu_roles (id_rol, id_menu, usuario_creacion, fecha_creacion, maquina_creacion)
SELECT 1, m.id_menu, 1, NOW(), 'migration-V17'
FROM ctr_menu m
WHERE m.detalle = '/administracion/asistente'
  AND NOT EXISTS (
    SELECT 1
    FROM ctr_menu_roles mr
    WHERE mr.id_rol  = 1
      AND mr.id_menu = m.id_menu
  );


-- ══════════════════════════════════════════════════════════════════════════
--  5. VERIFICACIÓN FINAL
-- ══════════════════════════════════════════════════════════════════════════

SELECT
  'tabla'  AS objeto,
  obj      AS nombre,
  CASE WHEN to_regclass(obj) IS NOT NULL THEN 'OK' ELSE 'FALTA' END AS estado
FROM (VALUES
  ('cad_asistente_categorias'),
  ('cad_asistente_preguntas')
) t(obj)

UNION ALL

SELECT
  'menu',
  m.descripcion || ' → ' || m.detalle,
  'id=' || m.id_menu::text
FROM ctr_menu m
WHERE m.detalle = '/administracion/asistente'

UNION ALL

SELECT
  'categorias',
  'registros de ejemplo',
  COUNT(*)::text
FROM cad_asistente_categorias;
