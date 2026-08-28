-- ============================================================
-- V12 – Catálogos de actividad policial y delitos
--
-- CONTEXTO
-- Al cerrar una actuación el despachador registra:
--   1. Clasificación: OPERATIVA (O) o PREVENTIVA (P)
--   2. Tipo de actividad: Captura, Incautación, Comparendo, etc.
--   3. Si la actividad requiere delito → artículo del Código Penal
-- Los resultados estructurados se guardan en cad_actuaciones_resultados.
--
-- Aplica a cada base de datos tenant CAD.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. CATÁLOGO DE ACTIVIDADES POLICIALES
--    Dos tipos: O=Operativa (produce resultado) y P=Preventiva.
--    requiere_delito: cuando es true, el operador debe elegir
--    el artículo del Código Penal (tabla cad_delitos).
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cad_act_policial (
    id              SERIAL       PRIMARY KEY,
    tipo            CHAR(1)      NOT NULL
                        CHECK (tipo IN ('O','P')),    -- O=Operativa, P=Preventiva
    codigo          VARCHAR(30)  NOT NULL UNIQUE,
    descripcion     VARCHAR(200) NOT NULL,
    requiere_delito BOOLEAN      NOT NULL DEFAULT false,
    vigente         BOOLEAN      NOT NULL DEFAULT true,
    orden           SMALLINT              DEFAULT 0
);

COMMENT ON TABLE  cad_act_policial IS
    'Catálogo de tipos de actividad policial usados al cerrar una actuación. '
    'O=Operativa (produce resultado concreto), P=Preventiva.';
COMMENT ON COLUMN cad_act_policial.requiere_delito IS
    'Si true, el operador debe seleccionar el artículo del Código Penal (cad_delitos).';

INSERT INTO cad_act_policial (tipo, codigo, descripcion, requiere_delito, orden) VALUES
  ('O', 'CAPTURA',          'Captura',                           true,  1),
  ('O', 'INCAUT_ARMAS',     'Incautación de armas',              false, 2),
  ('O', 'INCAUT_DROGAS',    'Incautación de drogas/narcóticos',  false, 3),
  ('O', 'INCAUT_VEHICULO',  'Incautación de vehículo',           false, 4),
  ('O', 'LESIONES',         'Lesiones personales',               true,  5),
  ('O', 'HURTO',            'Hurto (delito)',                    true,  6),
  ('O', 'HOMICIDIO',        'Homicidio',                         true,  7),
  ('O', 'COMPARENDO',       'Comparendo de tránsito',            false, 8),
  ('O', 'TRASLADO_PROT',    'Traslado por protección',           false, 9),
  ('O', 'RETENCION',        'Retención de persona',              false, 10),
  ('O', 'INFORME',          'Informe de novedad',                false, 11),
  ('O', 'ACCIDENTE',        'Accidente de tránsito',             false, 12),
  ('P', 'PRESENCIA',        'Presencia y actividad preventiva',  false, 20),
  ('P', 'MEDIACION',        'Mediación en conflicto',            false, 21),
  ('P', 'REQUISA_NEG',      'Requisa sin resultado',             false, 22),
  ('P', 'CONTROL_ZONA',     'Control de zona',                   false, 23),
  ('P', 'APOYO_CIUDADANO',  'Apoyo a ciudadano',                 false, 24),
  ('P', 'ORIENTACION',      'Orientación e información',         false, 25),
  ('P', 'PATRULLAJE',       'Patrullaje preventivo',             false, 26)
ON CONFLICT (codigo) DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- 2. CATÁLOGO DE DELITOS — Código Penal Colombiano
--    Ley 599 de 2000 (artículos más frecuentes en CAD).
--    Índice GIN sobre descripción y bien jurídico para
--    búsquedas por texto libre eficientes.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cad_delitos (
    id            SERIAL       PRIMARY KEY,
    articulo      VARCHAR(10)  NOT NULL UNIQUE,  -- "Art. 103"
    codigo        VARCHAR(20),                   -- código corto opcional
    descripcion   VARCHAR(300) NOT NULL,
    bien_juridico VARCHAR(100),                  -- bien jurídico tutelado
    vigente       BOOLEAN      NOT NULL DEFAULT true
);

COMMENT ON TABLE cad_delitos IS
    'Delitos del Código Penal Colombiano (Ley 599/2000). '
    'Usado cuando una actividad policial requiere registrar el delito (Captura, Hurto, etc.).';

CREATE INDEX IF NOT EXISTS idx_delitos_texto ON cad_delitos USING gin(
    to_tsvector('spanish', descripcion || ' ' || COALESCE(bien_juridico, ''))
);

INSERT INTO cad_delitos (articulo, descripcion, bien_juridico) VALUES
  ('Art. 103',  'Homicidio',                                              'Vida e integridad personal'),
  ('Art. 104',  'Circunstancias de agravación - Homicidio',               'Vida e integridad personal'),
  ('Art. 111',  'Lesiones personales',                                    'Vida e integridad personal'),
  ('Art. 119',  'Lesiones con agente químico',                            'Vida e integridad personal'),
  ('Art. 135',  'Homicidio en persona protegida',                         'Personas protegidas por DIH'),
  ('Art. 165',  'Desaparición forzada',                                   'Libertad individual'),
  ('Art. 168',  'Secuestro simple',                                       'Libertad individual'),
  ('Art. 169',  'Secuestro extorsivo',                                    'Libertad individual'),
  ('Art. 175',  'Secuestro exprés',                                       'Libertad individual'),
  ('Art. 178',  'Tortura',                                                'Integridad personal'),
  ('Art. 180',  'Desplazamiento forzado',                                 'Libertad individual'),
  ('Art. 188',  'Tráfico de migrantes',                                   'Autonomía personal'),
  ('Art. 188A', 'Trata de personas',                                      'Autonomía personal'),
  ('Art. 205',  'Acceso carnal violento',                                 'Libertad e integridad sexual'),
  ('Art. 206',  'Acto sexual violento',                                   'Libertad e integridad sexual'),
  ('Art. 239',  'Hurto simple',                                           'Patrimonio económico'),
  ('Art. 240',  'Hurto calificado',                                       'Patrimonio económico'),
  ('Art. 241',  'Circunstancias de agravación - Hurto',                   'Patrimonio económico'),
  ('Art. 244',  'Extorsión',                                              'Patrimonio económico'),
  ('Art. 246',  'Estafa',                                                 'Patrimonio económico'),
  ('Art. 250',  'Abuso de confianza',                                     'Patrimonio económico'),
  ('Art. 263',  'Daño en bien ajeno',                                     'Patrimonio económico'),
  ('Art. 269A', 'Acceso abusivo a sistema informático',                   'Protección de la información'),
  ('Art. 340',  'Concierto para delinquir',                               'Seguridad pública'),
  ('Art. 343',  'Terrorismo',                                             'Seguridad pública'),
  ('Art. 345',  'Financiación del terrorismo',                            'Seguridad pública'),
  ('Art. 347',  'Amenazas',                                               'Seguridad pública'),
  ('Art. 365',  'Fabricación y tráfico de armas de fuego',               'Seguridad pública'),
  ('Art. 366',  'Fabricación y tráfico de armas blancas',                'Seguridad pública'),
  ('Art. 369',  'Porte ilegal de armas de defensa personal',             'Seguridad pública'),
  ('Art. 375',  'Conservación de plantaciones de coca',                  'Salud pública'),
  ('Art. 376',  'Tráfico de estupefacientes',                            'Salud pública'),
  ('Art. 377',  'Destinación ilícita de inmuebles para drogas',          'Salud pública'),
  ('Art. 381',  'Suministro ilegal de drogas',                           'Salud pública'),
  ('Art. 397',  'Peculado por apropiación',                              'Administración pública'),
  ('Art. 402',  'Prevaricato',                                           'Administración pública'),
  ('Art. 421',  'Receptación',                                           'Administración de justicia'),
  ('Art. 429',  'Violación de habitación ajena',                         'Libertad individual'),
  ('Art. 453',  'Obstrucción a la justicia',                             'Administración de justicia'),
  ('Art. 459',  'Homicidio culposo',                                     'Vida e integridad personal'),
  ('Art. 460',  'Lesiones culposas',                                     'Vida e integridad personal'),
  ('Art. 470',  'Conducción bajo influencia de alcohol o sustancias',    'Seguridad vial')
ON CONFLICT (articulo) DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- 3. RESULTADOS OPERATIVOS DE ACTUACIONES
--    Registro estructurado del resultado de cada actuación:
--    qué hizo la agencia, con qué clasificación y, si hubo
--    captura/delito, el artículo penal correspondiente.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cad_actuaciones_resultados (
    id                  BIGSERIAL    PRIMARY KEY,
    actuacion_id        BIGINT       NOT NULL UNIQUE
                            REFERENCES cad_actuaciones(id)
                            ON DELETE CASCADE,
    actividad_codigo    VARCHAR(30),     -- FK lógica a cad_act_policial.codigo
    actividad_tipo      CHAR(1)
                            CHECK (actividad_tipo IN ('O','P') OR actividad_tipo IS NULL),
    actividad_desc      VARCHAR(200),    -- snapshot al momento del registro
    delito_articulo     VARCHAR(10),     -- FK lógica a cad_delitos.articulo
    delito_desc         VARCHAR(300),    -- snapshot
    delito_bien_juridico VARCHAR(100),   -- snapshot
    observacion         TEXT,
    usuario_registra    VARCHAR(50),
    fecha_registra      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE cad_actuaciones_resultados IS
    'Resultado operativo estructurado de una actuación: tipo de actividad policial '
    '(Captura, Comparendo, Presencia…) y delito asociado si corresponde.';

CREATE INDEX IF NOT EXISTS idx_act_res_actividad ON cad_actuaciones_resultados(actividad_codigo)
    WHERE actividad_codigo IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_act_res_delito ON cad_actuaciones_resultados(delito_articulo)
    WHERE delito_articulo IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_act_res_tipo ON cad_actuaciones_resultados(actividad_tipo)
    WHERE actividad_tipo IS NOT NULL;


-- ────────────────────────────────────────────────────────────
-- 4. VERIFICACIÓN
-- ────────────────────────────────────────────────────────────
-- SELECT tipo, COUNT(*) FROM cad_act_policial GROUP BY tipo ORDER BY tipo;
-- SELECT COUNT(*) FROM cad_delitos;
-- SELECT COUNT(*) FROM cad_actuaciones_resultados;
