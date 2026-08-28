using Comun.Dtos.Mapa;
using Datos.Interfaz;
using Datos.Tenant;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace Datos.Gestion
{
    /// <summary>
    /// Repositorio del módulo GIS Estadístico Delincuencial.
    /// Consulta histórico de incidentes cerrados con sus coordenadas y
    /// computa las métricas/agregaciones necesarias para los paneles.
    /// </summary>
    public class DbMapaEstadisticoRepository : IDbMapaEstadisticoRepository
    {
        private readonly TenantContext                          _tenant;
        private readonly ILogger<DbMapaEstadisticoRepository>  _logger;
        private const int MaxPuntos     = 5_000;
        private const int DbTimeoutSec  = 30;

        public DbMapaEstadisticoRepository(TenantContext tenant,
            ILogger<DbMapaEstadisticoRepository> logger)
        {
            _tenant = tenant;
            _logger = logger;
        }

        public async Task<DtoAnalisisEstadistico> GetAnalisisAsync(
            DtoFiltroEstadistico filtro, CancellationToken ct)
        {
            var result = new DtoAnalisisEstadistico();

            // CancellationToken con timeout propio para no dejar conexiones colgadas
            using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(DbTimeoutSec));
            using var linkedCts  = CancellationTokenSource.CreateLinkedTokenSource(ct, timeoutCts.Token);
            var qct = linkedCts.Token;

            // Parsear fechas — default: últimos 30 días
            if (!DateOnly.TryParse(filtro.Desde, out var desde))
                desde = DateOnly.FromDateTime(DateTime.Now.AddDays(-30));
            if (!DateOnly.TryParse(filtro.Hasta, out var hasta))
                hasta = DateOnly.FromDateTime(DateTime.Now);

            // Asegurar rango razonable (máx. 2 años) — antes solo estaba comentado,
            // sin ningún clamp real: un rango arbitrariamente amplio escanea el
            // histórico completo de cad_pedidos en 6 queries de agregación por
            // request, invocable por cualquier operador autenticado.
            if (desde < hasta.AddYears(-2))
                desde = hasta.AddYears(-2);

            var desdeTs = desde.ToDateTime(TimeOnly.MinValue);
            var hastaTs = hasta.ToDateTime(new TimeOnly(23, 59, 59));

            try
            {
                await using var conn = await _tenant.DataSource.OpenConnectionAsync(qct);

                // ── Construir cláusula WHERE compartida ───────────────────────
                var (whereSql, parámetros) = BuildWhere(filtro, desdeTs, hastaTs);

                // ── 1. Puntos del mapa (máx. 5.000, ordenados más recientes) ─
                result.Puntos = await GetPuntosAsync(conn, whereSql, parámetros, qct);

                // ── 2. Métricas agregadas ─────────────────────────────────────
                result.Metricas = await GetMetricasAsync(conn, whereSql, parámetros, qct);
            }
            catch (OperationCanceledException)
            {
                _logger.LogWarning("[GIS Estadístico] Consulta cancelada o timeout (filtro: {D}–{H})",
                    filtro.Desde, filtro.Hasta);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[GIS Estadístico] Error en GetAnalisisAsync");
            }

            return result;
        }

        // ── Construcción dinámica del WHERE ───────────────────────────────────

        private static (string sql, Dictionary<string, object> p) BuildWhere(
            DtoFiltroEstadistico f, DateTime desdeTs, DateTime hastaTs)
        {
            var p   = new Dictionary<string, object>();
            var sb  = new System.Text.StringBuilder();

            sb.Append(@"
    p.hora_caso >= @desde
AND p.hora_caso <= @hasta");
            p["desde"] = desdeTs;
            p["hasta"] = hastaTs;

            if (f.SoloCerrados)
                sb.Append("\nAND p.estado IN ('C','V')");

            if (!string.IsNullOrWhiteSpace(f.CodiPedido))
            {
                sb.Append("\nAND UPPER(TRIM(p.codi_pedido)) = UPPER(TRIM(@codi))");
                p["codi"] = f.CodiPedido.Trim();
            }

            var prio = (f.Prioridad ?? "").ToUpperInvariant().Trim();
            if (prio is "FLASH" or "INMEDIATA" or "RUTINA")
            {
                sb.Append("\nAND UPPER(TRIM(p.prioridad)) = @prio");
                p["prio"] = prio;
            }

            if (!string.IsNullOrWhiteSpace(f.Ciudad))
            {
                sb.Append("\nAND UPPER(p.ciudad) LIKE '%' || UPPER(@ciudad) || '%'");
                p["ciudad"] = f.Ciudad.Trim();
            }

            if (!string.IsNullOrWhiteSpace(f.Barrio))
            {
                sb.Append("\nAND UPPER(p.barrio) LIKE '%' || UPPER(@barrio) || '%'");
                p["barrio"] = f.Barrio.Trim();
            }

            if (f.SitioGraba > 0)
            {
                sb.Append("\nAND p.sitio_graba = @sitio");
                p["sitio"] = f.SitioGraba;
            }

            if (f.CanalCodigo > 0)
            {
                // cad_canales.codigo no es único por sí solo (PK compuesta con
                // cadfuerz_id: cada fuerza numera sus canales desde 1) — sin el
                // AND de fuerza, este filtro mezclaba incidentes de canales
                // homónimos de otra fuerza.
                sb.Append(@"
AND EXISTS (
    SELECT 1 FROM cad_eventos ev
    WHERE ev.pedido_id   = p.id
      AND ev.canal_codigo = @canal
      AND (@canalFuerza = 0 OR ev.fuerza_id = @canalFuerza)
)");
                p["canal"]       = f.CanalCodigo;
                p["canalFuerza"] = f.CanalFuerzaId;
            }

            // Turno de vigilancia — franja horaria sobre hora_caso en hora Colombia.
            // 1=Primer turno (22-05h), 2=Segundo (06-13h), 3=Tercer (14-21h) — misma
            // numeración que GetTurnoActual() en DbPedidoRepository.cs.
            switch (f.TurnoVigilancia)
            {
                case 1:
                    sb.Append("\nAND (EXTRACT(HOUR FROM p.hora_caso AT TIME ZONE 'America/Bogota') >= 22 OR EXTRACT(HOUR FROM p.hora_caso AT TIME ZONE 'America/Bogota') < 6)");
                    break;
                case 2:
                    sb.Append("\nAND EXTRACT(HOUR FROM p.hora_caso AT TIME ZONE 'America/Bogota') BETWEEN 6 AND 13");
                    break;
                case 3:
                    sb.Append("\nAND EXTRACT(HOUR FROM p.hora_caso AT TIME ZONE 'America/Bogota') BETWEEN 14 AND 21");
                    break;
            }

            return (sb.ToString(), p);
        }

        private static NpgsqlCommand BuildCmd(NpgsqlConnection conn, string sql,
            Dictionary<string, object> p)
        {
            var cmd = conn.CreateCommand();
            cmd.CommandText    = sql;
            cmd.CommandTimeout = 30;
            foreach (var kv in p)
                cmd.Parameters.AddWithValue(kv.Key, kv.Value);
            return cmd;
        }

        // ── Puntos del mapa ───────────────────────────────────────────────────

        private async Task<List<DtoPuntoEstadistico>> GetPuntosAsync(
            NpgsqlConnection conn, string where,
            Dictionary<string, object> p, CancellationToken ct)
        {
            var sql = $@"
SELECT p.id::TEXT,
       COALESCE(p.codi_pedido, '')     AS codi_pedido,
       COALESCE(c1.descripcion, '')    AS desc_pedido,
       COALESCE(p.dire_caso, '')       AS dire_caso,
       COALESCE(p.barrio, '')          AS barrio,
       COALESCE(p.ciudad, '')          AS ciudad,
       p.latitud_caso::FLOAT,
       p.longitud_caso::FLOAT,
       COALESCE(p.prioridad, '03')     AS prioridad,
       COALESCE(p.estado, '')          AS estado,
       TO_CHAR(p.hora_caso AT TIME ZONE 'America/Bogota','DD/MM/YYYY HH24:MI') AS hora_caso
FROM cad_pedidos p
LEFT JOIN cad_casos c1 ON c1.codigo = p.codi_pedido
WHERE {where}
  AND p.latitud_caso  IS NOT NULL AND p.latitud_caso  <> '' AND p.latitud_caso  <> '0'
  AND p.longitud_caso IS NOT NULL AND p.longitud_caso <> '' AND p.longitud_caso <> '0'
  AND p.latitud_caso  ~ '^[-]?[0-9]+\.?[0-9]*$'
  AND p.longitud_caso ~ '^[-]?[0-9]+\.?[0-9]*$'
ORDER BY p.hora_caso DESC
LIMIT {MaxPuntos}";

            var result = new List<DtoPuntoEstadistico>();
            await using var cmd = BuildCmd(conn, sql, p);
            await using var r   = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                var prio = (r.IsDBNull(8) ? "" : r.GetString(8)).ToUpperInvariant().Trim();
                result.Add(new DtoPuntoEstadistico
                {
                    Id          = r.GetString(0),
                    CodiPedido  = r.GetString(1),
                    DescPedido  = r.GetString(2),
                    DireCaso    = r.GetString(3),
                    Barrio      = r.GetString(4),
                    Ciudad      = r.GetString(5),
                    Lat         = r.GetDouble(6),
                    Lng         = r.GetDouble(7),
                    Prioridad   = prio,
                    Estado      = r.IsDBNull(9)  ? "" : r.GetString(9),
                    HoraCaso    = r.IsDBNull(10) ? "" : r.GetString(10),
                    // Mayor intensidad en el heatmap para casos de alta prioridad
                    Intensidad  = prio == "FLASH" ? 1.0 : prio == "INMEDIATA" ? 0.65 : 0.35
                });
            }
            return result;
        }

        // ── Métricas ──────────────────────────────────────────────────────────

        private async Task<DtoMetricasEstadisticas> GetMetricasAsync(
            NpgsqlConnection conn, string where,
            Dictionary<string, object> p, CancellationToken ct)
        {
            var m = new DtoMetricasEstadisticas();

            // Usamos conexión propia para aislar el estado tras leer los puntos.
            try
            {
                await using var connM = await _tenant.DataSource.OpenConnectionAsync(ct);

                // ── Totales por prioridad ──────────────────────────────────────
                var sqlTotales = $@"
SELECT
    COUNT(*)                                                             AS total,
    COUNT(*) FILTER (WHERE UPPER(TRIM(p.prioridad)) IN ('FLASH','01'))     AS flash,
    COUNT(*) FILTER (WHERE UPPER(TRIM(p.prioridad)) IN ('INMEDIATA','02')) AS inmediata,
    COUNT(*) FILTER (WHERE UPPER(TRIM(p.prioridad)) IN ('RUTINA','03'))    AS rutina,
    COUNT(*) FILTER (WHERE p.latitud_caso IS NOT NULL
                        AND p.latitud_caso <> ''
                        AND p.latitud_caso <> '0')                       AS con_coords
FROM cad_pedidos p
WHERE {where}";

                // El reader debe quedar dentro de su propio bloque para que Npgsql
                // lo cierre antes de ejecutar los siguientes comandos en la misma conexión.
                await using (var cmdT = BuildCmd(connM, sqlTotales, p))
                await using (var rT   = await cmdT.ExecuteReaderAsync(ct))
                {
                    if (await rT.ReadAsync(ct))
                    {
                        m.Total          = Convert.ToInt32(rT.GetValue(0));
                        m.TotalFlash     = Convert.ToInt32(rT.GetValue(1));
                        m.TotalInmd      = Convert.ToInt32(rT.GetValue(2));
                        m.TotalRutina    = Convert.ToInt32(rT.GetValue(3));
                        m.TotalOtros     = m.Total - m.TotalFlash - m.TotalInmd - m.TotalRutina;
                        m.ConCoordenadas = Convert.ToInt32(rT.GetValue(4));
                    }
                } // <-- rT y cmdT se cierran aquí, ANTES de las siguientes queries

                // ── Top tipos de caso ──────────────────────────────────────────
                try {
                    m.PorTipoCaso = await AgruparAsync(connM, p, ct, $@"
SELECT COALESCE(p.codi_pedido,'SIN CODIGO') AS clave,
       COALESCE(c1.descripcion, p.codi_pedido,'Sin descripcion') AS descripcion,
       COUNT(*) AS total
FROM cad_pedidos p
LEFT JOIN cad_casos c1 ON c1.codigo = p.codi_pedido
WHERE {where}
GROUP BY p.codi_pedido, c1.descripcion
ORDER BY 3 DESC
LIMIT 20");
                } catch (Exception ex) { _logger.LogWarning(ex, "[GIS] PorTipoCaso fallo"); }

                // ── Por hora del día ───────────────────────────────────────────
                try {
                    m.PorHora = await AgruparAsync(connM, p, ct, $@"
SELECT EXTRACT(HOUR FROM p.hora_caso AT TIME ZONE 'America/Bogota')::INT::TEXT AS clave,
       EXTRACT(HOUR FROM p.hora_caso AT TIME ZONE 'America/Bogota')::INT::TEXT AS descripcion,
       COUNT(*) AS total
FROM cad_pedidos p
WHERE {where}
GROUP BY 1
ORDER BY 1::INT");
                } catch (Exception ex) { _logger.LogWarning(ex, "[GIS] PorHora fallo"); }

                // ── Por día de semana ──────────────────────────────────────────
                try {
                    m.PorDiaSemana = await AgruparAsync(connM, p, ct, $@"
SELECT EXTRACT(DOW FROM p.hora_caso AT TIME ZONE 'America/Bogota')::INT::TEXT AS clave,
       CASE EXTRACT(DOW FROM p.hora_caso AT TIME ZONE 'America/Bogota')::INT
           WHEN 0 THEN 'Domingo'  WHEN 1 THEN 'Lunes'   WHEN 2 THEN 'Martes'
           WHEN 3 THEN 'Miercoles' WHEN 4 THEN 'Jueves' WHEN 5 THEN 'Viernes'
           ELSE 'Sabado' END AS descripcion,
       COUNT(*) AS total
FROM cad_pedidos p
WHERE {where}
GROUP BY 1, 2
ORDER BY 1::INT");
                } catch (Exception ex) { _logger.LogWarning(ex, "[GIS] PorDiaSemana fallo"); }

                // ── Tendencia mensual ──────────────────────────────────────────
                try {
                    m.PorMes = await AgruparAsync(connM, p, ct, $@"
SELECT TO_CHAR(p.hora_caso AT TIME ZONE 'America/Bogota','YYYY-MM') AS clave,
       TO_CHAR(p.hora_caso AT TIME ZONE 'America/Bogota','YYYY-MM') AS descripcion,
       COUNT(*) AS total
FROM cad_pedidos p
WHERE {where}
GROUP BY 1
ORDER BY 1
LIMIT 36");
                } catch (Exception ex) { _logger.LogWarning(ex, "[GIS] PorMes fallo"); }

                // ── Top ciudades ───────────────────────────────────────────────
                try {
                    m.PorCiudad = await AgruparAsync(connM, p, ct, $@"
SELECT COALESCE(NULLIF(TRIM(p.ciudad),''),'Sin ciudad') AS clave,
       COALESCE(NULLIF(TRIM(p.ciudad),''),'Sin ciudad') AS descripcion,
       COUNT(*) AS total
FROM cad_pedidos p
WHERE {where}
GROUP BY 1
ORDER BY 3 DESC
LIMIT 15");
                } catch (Exception ex) { _logger.LogWarning(ex, "[GIS] PorCiudad fallo"); }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[GIS Estadistico] Error en GetMetricasAsync");
            }

            // ── Por prioridad (construido desde los totales) ───────────────────
            m.PorPrioridad = new List<DtoAgrupacion>
            {
                new() { Clave = "FLASH",    Descripcion = "Flash",    Total = m.TotalFlash },
                new() { Clave = "INMEDIATA",Descripcion = "Inmediata",Total = m.TotalInmd  },
                new() { Clave = "RUTINA",   Descripcion = "Rutina",   Total = m.TotalRutina },
            };
            if (m.TotalOtros > 0)
                m.PorPrioridad.Add(new() { Clave = "OTROS", Descripcion = "Sin prioridad", Total = m.TotalOtros });

            return m;
        }

        private static async Task<List<DtoAgrupacion>> AgruparAsync(
            NpgsqlConnection conn, Dictionary<string, object> p,
            CancellationToken ct, string sql)
        {
            var result = new List<DtoAgrupacion>();
            await using var cmd = conn.CreateCommand();
            cmd.CommandText    = sql;
            cmd.CommandTimeout = 30;
            foreach (var kv in p) cmd.Parameters.AddWithValue(kv.Key, kv.Value);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
                result.Add(new DtoAgrupacion
                {
                    Clave       = r.IsDBNull(0) ? "" : r.GetString(0),
                    Descripcion = r.IsDBNull(1) ? "" : r.GetString(1),
                    Total       = Convert.ToInt32(r.GetValue(2))
                });
            return result;
        }

        // ── Ciudades disponibles en el tenant ─────────────────────────────────

        public async Task<List<string>> GetCiudadesAsync(int sitioGraba, CancellationToken ct)
        {
            var result = new List<string>();
            try
            {
                await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
                await using var cmd  = conn.CreateCommand();
                // sitioGraba=0 (solo super-admin) omite el filtro — antes esta consulta
                // nunca lo aplicaba, contradiciendo el propio contrato documentado
                // ("para operadores solo las del tenant actual").
                cmd.CommandText = @"
SELECT DISTINCT TRIM(ciudad) AS ciudad
FROM   cad_pedidos
WHERE  ciudad IS NOT NULL AND TRIM(ciudad) <> ''
  AND  (@sitio = 0 OR sitio_graba = @sitio)
ORDER  BY ciudad
LIMIT  100";
                cmd.Parameters.AddWithValue("sitio", sitioGraba);
                cmd.CommandTimeout = 15;
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                    if (!r.IsDBNull(0)) result.Add(r.GetString(0));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[GIS Estadístico] Error en GetCiudadesAsync");
            }
            return result;
        }

        // ── Barrios por ciudad (o todos si ciudad vacía) ───────────────────────

        public async Task<List<string>> GetBarriosAsync(string? ciudad, int sitioGraba, CancellationToken ct)
        {
            var result = new List<string>();
            try
            {
                await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
                await using var cmd  = conn.CreateCommand();
                var filtCiudad = string.IsNullOrWhiteSpace(ciudad) ? "" : ciudad.Trim();
                cmd.CommandText = @"
SELECT DISTINCT TRIM(barrio) AS barrio
FROM   cad_pedidos
WHERE  barrio IS NOT NULL AND TRIM(barrio) <> ''
  AND  (@ciudad = '' OR UPPER(TRIM(ciudad)) = UPPER(@ciudad))
  AND  (@sitio  = 0  OR sitio_graba = @sitio)
ORDER  BY barrio
LIMIT  300";
                cmd.Parameters.AddWithValue("ciudad", filtCiudad);
                cmd.Parameters.AddWithValue("sitio",  sitioGraba);
                cmd.CommandTimeout = 15;
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                    if (!r.IsDBNull(0)) result.Add(r.GetString(0));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[GIS Estadístico] Error en GetBarriosAsync");
            }
            return result;
        }
    }
}
