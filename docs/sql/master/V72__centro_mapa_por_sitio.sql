-- ═══════════════════════════════════════════════════════════════════════════
--  V72: el mapa se abre donde trabaja el CAD, no en Bogotá
--
--  Apply to: la BD MAESTRA **y** cada BD de TENANT/CAD.
--  Cada bloque comprueba que su tabla exista, así que la mitad que no aplica
--  en esa base simplemente no hace nada (mismo patrón que V31).
--
--  El problema
--  ───────────
--  Los tres mapas del sistema —Recepción, Mapa de Incidentes y GIS
--  Estadístico— arrancan con `setView([4.7110, -74.0721], 12)`: Bogotá, a
--  mano, en el código. En Recepción existía la intención de corregirlo
--  después (`cargarCapaMunicipios` hace fitBounds sobre el polígono del
--  municipio), pero eso depende de un servicio ArcGIS externo: si tarda, si
--  responde vacío o si la red del CAD no lo alcanza, el mapa se queda en
--  Bogotá y el operador de Cali empieza cada llamada a 400 km de su ciudad.
--  Los otros dos mapas ni siquiera lo intentaban.
--
--  La solución
--  ───────────
--  El centro es un dato nuestro, no algo que se pide prestado a un tercero:
--
--    · cad_sitios_grabacion.latitud/longitud/zoom_mapa → la unidad policial.
--      Es el nivel correcto: un CAD que aloja dos unidades (Barranquilla:
--      MEBAR y DEATA) puede abrir cada una donde le corresponde.
--    · secad_tenants.latitud/longitud/zoom_mapa → el CAD. Es el respaldo
--      cuando el sitio no tiene coordenadas propias.
--
--  Ambas se siembran desde la tabla de abajo, que empareja por código DANE.
--  Un CAD que no esté en la lista las edita desde Administración → Sitios de
--  grabación y fuerzas → Administrar sitios.
--
--  El zoom va junto a las coordenadas porque no es constante: un municipio se
--  ve bien en 12 y un departamento entero necesita 9. Sin él, abrir el sitio
--  de un departamento en zoom de ciudad enseña un barrio de la capital.
--
--  Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Referencia común: código DANE → centro del mapa ────────────────────────
-- Las 32 capitales de departamento, los municipios grandes de área
-- metropolitana que hoy tienen o pueden tener CAD, y los códigos de dos
-- dígitos de los departamentos (para un sitio que representa al departamento
-- y no a un municipio, como el DEATA en Barranquilla), con un zoom más
-- abierto.
-- Sin ON COMMIT DROP: psql confirma cada sentencia por separado, así que la
-- tabla desaparecería antes del INSERT. Vive lo que dure la sesión y se borra
-- al final del archivo.
DROP TABLE IF EXISTS tmp_centros_dane;
CREATE TEMP TABLE tmp_centros_dane (
    cod_dane VARCHAR(10) PRIMARY KEY,
    nombre   VARCHAR(80) NOT NULL,
    latitud  NUMERIC(9,6) NOT NULL,
    longitud NUMERIC(9,6) NOT NULL,
    zoom     SMALLINT     NOT NULL
);

INSERT INTO tmp_centros_dane (cod_dane, nombre, latitud, longitud, zoom) VALUES
    -- Capitales de departamento
    ('11001','Bogotá D.C.',              4.711000, -74.072100, 12),
    ('05001','Medellín',                 6.244200, -75.581200, 12),
    ('76001','Cali',                     3.451600, -76.532000, 12),
    ('08001','Barranquilla',            10.968500, -74.781300, 12),
    ('13001','Cartagena',               10.391000, -75.479400, 12),
    ('68001','Bucaramanga',              7.119300, -73.122700, 12),
    ('54001','Cúcuta',                   7.893900, -72.507800, 12),
    ('66001','Pereira',                  4.808700, -75.690600, 12),
    ('17001','Manizales',                5.070300, -75.513800, 12),
    ('73001','Ibagué',                   4.438900, -75.232200, 12),
    ('47001','Santa Marta',             11.240800, -74.199000, 12),
    ('50001','Villavicencio',            4.142000, -73.626600, 12),
    ('41001','Neiva',                    2.927300, -75.281900, 12),
    ('52001','Pasto',                    1.213600, -77.281100, 12),
    ('63001','Armenia',                  4.533900, -75.681100, 12),
    ('19001','Popayán',                  2.444800, -76.614700, 12),
    ('70001','Sincelejo',                9.304700, -75.397800, 12),
    ('23001','Montería',                 8.747900, -75.881400, 12),
    ('20001','Valledupar',              10.463100, -73.253200, 12),
    ('44001','Riohacha',                11.544400, -72.907200, 12),
    ('27001','Quibdó',                   5.694700, -76.661100, 12),
    ('18001','Florencia',                1.614400, -75.606200, 12),
    ('85001','Yopal',                    5.337800, -72.395900, 12),
    ('15001','Tunja',                    5.535300, -73.367800, 12),
    ('86001','Mocoa',                    1.151900, -76.648300, 12),
    ('88001','San Andrés',              12.584700, -81.700600, 13),
    ('81001','Arauca',                   7.090200, -70.761700, 12),
    ('99001','Puerto Carreño',           6.188900, -67.485900, 12),
    ('94001','Inírida',                  3.865300, -67.923900, 12),
    ('97001','Mitú',                     1.247800, -70.173300, 12),
    ('95001','San José del Guaviare',    2.572900, -72.645900, 12),
    ('91001','Leticia',                 -4.215300, -69.940600, 12),
    -- Municipios grandes de área metropolitana
    ('25754','Soacha',                   4.579400, -74.216800, 13),
    ('08758','Soledad',                 10.918400, -74.766900, 13),
    ('05088','Bello',                    6.337800, -75.556100, 13),
    ('05360','Itagüí',                   6.171900, -75.598300, 13),
    ('05266','Envigado',                 6.166700, -75.583300, 13),
    ('05615','Rionegro',                 6.155300, -75.373900, 13),
    ('68276','Floridablanca',            7.062500, -73.086900, 13),
    ('68307','Girón',                    7.068700, -73.171200, 13),
    ('68547','Piedecuesta',              6.987800, -73.049800, 13),
    ('76520','Palmira',                  3.539400, -76.303600, 13),
    ('76109','Buenaventura',             3.880100, -77.031200, 12),
    ('66170','Dosquebradas',             4.833900, -75.676400, 13),
    ('52356','Ipiales',                  0.825600, -77.644400, 13),
    -- Departamentos (código de dos dígitos), centrados en su capital y con
    -- el zoom abierto que necesita un territorio entero.
    ('05','Antioquia',                   6.244200, -75.581200,  8),
    ('08','Atlántico',                  10.968500, -74.781300, 10),
    ('11','Bogotá D.C.',                 4.711000, -74.072100, 11),
    ('13','Bolívar',                    10.391000, -75.479400,  8),
    ('15','Boyacá',                      5.535300, -73.367800,  8),
    ('17','Caldas',                      5.070300, -75.513800,  9),
    ('18','Caquetá',                     1.614400, -75.606200,  8),
    ('19','Cauca',                       2.444800, -76.614700,  8),
    ('20','Cesar',                      10.463100, -73.253200,  8),
    ('23','Córdoba',                     8.747900, -75.881400,  9),
    ('25','Cundinamarca',                4.711000, -74.072100,  9),
    ('27','Chocó',                       5.694700, -76.661100,  8),
    ('41','Huila',                       2.927300, -75.281900,  8),
    ('44','La Guajira',                 11.544400, -72.907200,  8),
    ('47','Magdalena',                  11.240800, -74.199000,  8),
    ('50','Meta',                        4.142000, -73.626600,  8),
    ('52','Nariño',                      1.213600, -77.281100,  8),
    ('54','Norte de Santander',          7.893900, -72.507800,  8),
    ('63','Quindío',                     4.533900, -75.681100, 10),
    ('66','Risaralda',                   4.808700, -75.690600,  9),
    ('68','Santander',                   7.119300, -73.122700,  8),
    ('70','Sucre',                       9.304700, -75.397800,  9),
    ('73','Tolima',                      4.438900, -75.232200,  8),
    ('76','Valle del Cauca',             3.451600, -76.532000,  8),
    ('81','Arauca',                      7.090200, -70.761700,  8),
    ('85','Casanare',                    5.337800, -72.395900,  8),
    ('86','Putumayo',                    1.151900, -76.648300,  8),
    ('88','San Andrés y Providencia',   12.584700, -81.700600, 10),
    ('91','Amazonas',                   -4.215300, -69.940600,  7),
    ('94','Guainía',                     3.865300, -67.923900,  7),
    ('95','Guaviare',                    2.572900, -72.645900,  8),
    ('97','Vaupés',                      1.247800, -70.173300,  7),
    ('99','Vichada',                     6.188900, -67.485900,  7);


-- ── A. BASE DE TENANT: el sitio de grabación ───────────────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_name = 'cad_sitios_grabacion') THEN

        ALTER TABLE cad_sitios_grabacion ADD COLUMN IF NOT EXISTS latitud   NUMERIC(9,6);
        ALTER TABLE cad_sitios_grabacion ADD COLUMN IF NOT EXISTS longitud  NUMERIC(9,6);
        ALTER TABLE cad_sitios_grabacion ADD COLUMN IF NOT EXISTS zoom_mapa SMALLINT;

        COMMENT ON COLUMN cad_sitios_grabacion.latitud IS
            'Centro del mapa para esta unidad policial. Es lo que ve el operador al abrir '
            'Recepción; sin esto el mapa arrancaba en Bogotá para todo el país.';
        COMMENT ON COLUMN cad_sitios_grabacion.zoom_mapa IS
            'Acercamiento inicial. 12-13 para un municipio, 8-9 para un departamento.';

        -- Solo donde falte: si alguien ya afinó el centro a mano, no se pisa.
        UPDATE cad_sitios_grabacion s
           SET latitud   = c.latitud,
               longitud  = c.longitud,
               zoom_mapa = c.zoom
          FROM tmp_centros_dane c
         WHERE s.cod_dane = c.cod_dane
           AND (s.latitud IS NULL OR s.longitud IS NULL);
    END IF;
END $$;


-- ── B. BASE MAESTRA: el CAD, como respaldo del sitio ───────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_name = 'secad_tenants') THEN

        ALTER TABLE secad_tenants ADD COLUMN IF NOT EXISTS latitud   NUMERIC(9,6);
        ALTER TABLE secad_tenants ADD COLUMN IF NOT EXISTS longitud  NUMERIC(9,6);
        ALTER TABLE secad_tenants ADD COLUMN IF NOT EXISTS zoom_mapa SMALLINT;

        COMMENT ON COLUMN secad_tenants.latitud IS
            'Centro del mapa del CAD. Respaldo de cad_sitios_grabacion.latitud: se usa '
            'cuando la unidad del usuario no tiene coordenadas propias.';

        UPDATE secad_tenants t
           SET latitud   = c.latitud,
               longitud  = c.longitud,
               zoom_mapa = c.zoom
          FROM tmp_centros_dane c
         WHERE t.cod_dane = c.cod_dane
           AND (t.latitud IS NULL OR t.longitud IS NULL);
    END IF;
END $$;

DROP TABLE IF EXISTS tmp_centros_dane;
