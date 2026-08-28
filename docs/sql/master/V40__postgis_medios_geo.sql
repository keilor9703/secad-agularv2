-- ══════════════════════════════════════════════════════════════════════════════
-- V40 – Índice de apoyo para "sugerir el cuadrante libre más cercano" sobre
--       cad_medios_disponibles — SIN PostGIS.
--
-- ⚠️  CAMBIO DE DISEÑO: la versión original de este script requería
--     `CREATE EXTENSION postgis`, pero esa extensión no está instalable a
--     nivel de sistema operativo en todos los servidores Postgres de los
--     tenants (falla con "extension postgis is not available" cuando el
--     paquete no está presente en el SO, algo que no se resuelve con SQL).
--
--     Se reemplazó por un cálculo de distancia Haversine en SQL plano sobre
--     latitud/longitud (ver DbTurnoRepository.G_GetRecursoMasCercanoAsync) —
--     a la escala de un CAD (decenas de medios activos por canal), un
--     recorrido completo con ORDER BY sobre esa fórmula es perfectamente
--     eficiente; no hace falta un índice espacial ni PostGIS para esto.
--
--     Este script ya NO crea ninguna extensión ni columna generada — solo dos
--     índices btree comunes, puramente opcionales, que aceleran el filtro
--     "latitud/longitud no nulos" y el join/lookup del resto de la consulta.
--     Si esta migración ya fue aplicada en su versión anterior (con
--     ubicacion_geo/PostGIS) en algún ambiente, no pasa nada: el bloque de
--     abajo revierte esa columna si existe, ya que dejó de usarse en
--     G_GetRecursoMasCercanoAsync.
--
-- Consumido por: DbTurnoRepository.G_GetRecursoMasCercanoAsync
--                (GET api/Turnos/canal/{canalCodigo}/sugerencia-recurso)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Revertir la columna generada de PostGIS si quedó de un intento previo ──
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_name  = 'cad_medios_disponibles'
      AND  column_name = 'ubicacion_geo'
  ) THEN
    DROP INDEX IF EXISTS idx_medios_ubicacion_geo;
    ALTER TABLE cad_medios_disponibles DROP COLUMN ubicacion_geo;
    RAISE NOTICE 'Columna ubicacion_geo (PostGIS) eliminada — ya no se usa.';
  END IF;
END $$;

-- ── 2. Índices btree simples (opcionales, sin extensiones) ───────────────────
CREATE INDEX IF NOT EXISTS idx_medios_lat_lng
  ON cad_medios_disponibles (latitud, longitud)
  WHERE latitud IS NOT NULL AND longitud IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_medios_canal_estado_turno
  ON cad_medios_disponibles (canal_codigo, estado, turno_id);

-- ── Verificación ───────────────────────────────────────────────────────────
SELECT indexname, indexdef
FROM   pg_indexes
WHERE  tablename = 'cad_medios_disponibles'
  AND  indexname IN ('idx_medios_lat_lng', 'idx_medios_canal_estado_turno');
