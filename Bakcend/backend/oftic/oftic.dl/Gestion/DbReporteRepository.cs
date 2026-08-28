using Comun.Dtos.Reportes;
using Datos.Interfaz;
using Datos.Tenant;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace Datos.Gestion
{
    public class DbReporteRepository : IDbReporteRepository
    {
        private readonly TenantContext                 _tenant;
        private readonly ILogger<DbReporteRepository> _logger;

        public DbReporteRepository(TenantContext tenant, ILogger<DbReporteRepository> logger)
        {
            _tenant = tenant;
            _logger = logger;
        }

        public async Task<DtoReporteCompleto> GetReporteCompletoAsync(
            DtoReporteParams p, CancellationToken ct)
        {
            var (desde, hasta) = ResolveFechas(p);   // ambos son UTC para queries
            var result         = new DtoReporteCompleto();

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);

            // ── 1. RESUMEN ─────────────────────────────────────────────────────
            // COUNT(DISTINCT CASE ... THEN p.id END) evita la inflación por el JOIN 1:N
            // con cad_eventos (un pedido puede tener varios eventos de despacho).
            await using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = """
                    SELECT
                        COUNT(DISTINCT p.id)                                                                            AS total,
                        COUNT(DISTINCT CASE WHEN p.estado NOT IN ('C','V') THEN p.id END)                              AS activos,
                        COUNT(DISTINCT CASE WHEN p.estado = 'P'            THEN p.id END)                              AS pendientes,
                        COUNT(DISTINCT CASE WHEN p.estado IN ('C','V')     THEN p.id END)                              AS cerrados,
                        COUNT(DISTINCT CASE WHEN UPPER(COALESCE(p.prioridad,'')) IN ('01','FLASH')     THEN p.id END)  AS flash,
                        COUNT(DISTINCT CASE WHEN UPPER(COALESCE(p.prioridad,'')) IN ('02','INMEDIATA') THEN p.id END)  AS inmediata,
                        COUNT(DISTINCT CASE WHEN UPPER(COALESCE(p.prioridad,'')) IN ('03','RUTINA')    THEN p.id END)  AS rutina,
                        COUNT(DISTINCT CASE WHEN p.prioridad IS NULL OR p.prioridad = ''   THEN p.id END)              AS sin_prio,
                        COUNT(DISTINCT CASE WHEN e.id IS NOT NULL                          THEN p.id END)              AS con_evento
                    FROM  cad_pedidos p
                    LEFT  JOIN cad_eventos e ON e.pedido_id = p.id
                    WHERE p.fecha_creacion >= @fd
                      AND p.fecha_creacion <= @fh
                      AND p.enviar = 'S'
                    """;
                if (p.FuerzaId > 0) cmd.CommandText += "\n  AND e.fuerza_id = @fuerza";
                if (p.TurnoVigilancia > 0) cmd.CommandText += $"\n{TurnoSql(p.TurnoVigilancia)}";
                AddParams(cmd, desde, hasta, p.FuerzaId);

                await using var rdr = await cmd.ExecuteReaderAsync(ct);
                if (await rdr.ReadAsync(ct))
                {
                    result.Resumen = new DtoResumenReporte
                    {
                        TotalIncidentes = ToInt(rdr, 0),
                        Activos         = ToInt(rdr, 1),
                        Pendientes      = ToInt(rdr, 2),
                        Cerrados        = ToInt(rdr, 3),
                        Flash           = ToInt(rdr, 4),
                        Inmediatos      = ToInt(rdr, 5),
                        Rutina          = ToInt(rdr, 6),
                        SinPrioridad    = ToInt(rdr, 7),
                        ConEventoActivo = ToInt(rdr, 8),
                        FechaDesde      = desde.ToString("dd/MM/yyyy"),
                        FechaHasta      = hasta.ToString("dd/MM/yyyy")
                    };
                    result.Resumen.SinEventoAun =
                        result.Resumen.TotalIncidentes - result.Resumen.ConEventoActivo;
                }
            }

            // ── 2. POR ORIGEN ──────────────────────────────────────────────────
            // Cuenta eventos por canal de origen (el origen es atributo del evento, no del pedido).
            // COUNT(DISTINCT p.id) para contar incidentes únicos por canal.
            await using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = """
                    SELECT COALESCE(e.origen, 'SIN_ORIGEN') AS origen,
                           COUNT(DISTINCT p.id)              AS total
                    FROM   cad_pedidos p
                    LEFT   JOIN cad_eventos e ON e.pedido_id = p.id
                    WHERE  p.fecha_creacion >= @fd
                      AND  p.fecha_creacion <= @fh
                      AND  p.enviar = 'S'
                    """;
                if (p.FuerzaId > 0) cmd.CommandText += "\n  AND  e.fuerza_id = @fuerza";
                if (p.TurnoVigilancia > 0) cmd.CommandText += $"\n{TurnoSql(p.TurnoVigilancia)}";
                cmd.CommandText += "\nGROUP BY origen ORDER BY total DESC";
                AddParams(cmd, desde, hasta, p.FuerzaId);

                await using var rdr = await cmd.ExecuteReaderAsync(ct);
                var rows = new List<(string origen, int total)>();
                while (await rdr.ReadAsync(ct))
                    rows.Add((rdr.GetString(0), (int)rdr.GetInt64(1)));

                int gt = rows.Sum(r => r.total);
                result.PorOrigen = rows.Select(r => new DtoPorOrigen
                {
                    Origen     = r.origen,
                    Total      = r.total,
                    Porcentaje = gt > 0 ? Math.Round(r.total * 100.0 / gt, 1) : 0
                }).ToList();
            }

            // ── 3. POR FUERZA ──────────────────────────────────────────────────
            // Siempre muestra todas las fuerzas (fuerzaId ignorado aquí).
            // COUNT(DISTINCT p.id) evita inflar pedidos con múltiples eventos por fuerza.
            await using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = """
                    SELECT COALESCE(f.id, 0)                         AS fuerza_id,
                           COALESCE(f.descripcion, 'Sin fuerza')     AS fuerza,
                           COUNT(DISTINCT p.id)                      AS total,
                           COUNT(DISTINCT CASE WHEN p.estado NOT IN ('C','V') THEN p.id END) AS activos,
                           COUNT(DISTINCT CASE WHEN p.estado IN ('C','V')     THEN p.id END) AS cerrados
                    FROM   cad_pedidos p
                    LEFT   JOIN cad_eventos e ON e.pedido_id = p.id
                    LEFT   JOIN cad_fuerzas f ON f.id = e.fuerza_id
                    WHERE  p.fecha_creacion >= @fd
                      AND  p.fecha_creacion <= @fh
                      AND  p.enviar = 'S'
                    """;
                if (p.TurnoVigilancia > 0) cmd.CommandText += $"\n{TurnoSql(p.TurnoVigilancia)}";
                cmd.CommandText += "\nGROUP BY f.id, f.descripcion ORDER BY total DESC LIMIT 10";
                AddParams(cmd, desde, hasta, 0);

                await using var rdr = await cmd.ExecuteReaderAsync(ct);
                var rows = new List<DtoPorFuerza>();
                while (await rdr.ReadAsync(ct))
                    rows.Add(new DtoPorFuerza
                    {
                        FuerzaId = rdr.GetInt32(0),
                        Fuerza   = rdr.GetString(1),
                        Total    = (int)rdr.GetInt64(2),
                        Activos  = ToInt(rdr, 3),
                        Cerrados = ToInt(rdr, 4)
                    });

                int gt = rows.Sum(r => r.Total);
                foreach (var r in rows)
                    r.Porcentaje = gt > 0 ? Math.Round(r.Total * 100.0 / gt, 1) : 0;
                result.PorFuerza = rows;
            }

            // ── 4. TOP CASOS ───────────────────────────────────────────────────
            // COUNT(DISTINCT p.id) evita que un pedido con N eventos cuente N veces.
            await using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = """
                    SELECT p.codi_pedido,
                           COALESCE(c.descripcion, p.codi_pedido, 'Sin código') AS descripcion,
                           COUNT(DISTINCT p.id) AS total
                    FROM   cad_pedidos p
                    LEFT   JOIN cad_casos   c ON TRIM(UPPER(c.codigo)) = TRIM(UPPER(p.codi_pedido))
                    LEFT   JOIN cad_eventos e ON e.pedido_id = p.id
                    WHERE  p.fecha_creacion >= @fd
                      AND  p.fecha_creacion <= @fh
                      AND  p.enviar = 'S'
                      AND  p.codi_pedido IS NOT NULL
                      AND  p.codi_pedido <> ''
                    """;
                if (p.FuerzaId > 0) cmd.CommandText += "\n  AND  e.fuerza_id = @fuerza";
                if (p.TurnoVigilancia > 0) cmd.CommandText += $"\n{TurnoSql(p.TurnoVigilancia)}";
                cmd.CommandText += "\nGROUP BY p.codi_pedido, c.descripcion ORDER BY total DESC LIMIT 10";
                AddParams(cmd, desde, hasta, p.FuerzaId);

                await using var rdr = await cmd.ExecuteReaderAsync(ct);
                var rows = new List<(string cod, string desc, int total)>();
                while (await rdr.ReadAsync(ct))
                    rows.Add((rdr.IsDBNull(0) ? "" : rdr.GetString(0),
                              rdr.GetString(1),
                              (int)rdr.GetInt64(2)));

                int gt = rows.Sum(r => r.total);
                result.TopCasos = rows.Select(r => new DtoTopCaso
                {
                    CodigoCaso  = r.cod,
                    Descripcion = r.desc,
                    Total       = r.total,
                    Porcentaje  = gt > 0 ? Math.Round(r.total * 100.0 / gt, 1) : 0
                }).ToList();
            }

            // ── 5. TIEMPOS DE ATENCIÓN ─────────────────────────────────────────
            // LATERAL join: obtiene el primer despacho y primer cierre por pedido (MIN),
            // evitando que un pedido con N eventos distorsione el AVG N veces.
            await using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = """
                    SELECT
                        AVG(EXTRACT(EPOCH FROM (p.fecha_primer_acceso - p.fecha_creacion))/60.0)
                            AS avg_primer_acceso,
                        AVG(CASE WHEN t.fecha_despacho IS NOT NULL
                                 THEN EXTRACT(EPOCH FROM (t.fecha_despacho - p.fecha_creacion))/60.0
                                 END) AS avg_despacho,
                        AVG(CASE WHEN t.fecha_cierre IS NOT NULL
                                 THEN EXTRACT(EPOCH FROM (t.fecha_cierre - p.fecha_creacion))/60.0
                                 END) AS avg_cierre,
                        AVG(CASE WHEN UPPER(COALESCE(p.prioridad,'')) IN ('01','FLASH')
                                  AND t.fecha_despacho IS NOT NULL
                                 THEN EXTRACT(EPOCH FROM (t.fecha_despacho - p.fecha_creacion))/60.0
                                 END) AS avg_flash,
                        COUNT(CASE WHEN t.fecha_despacho IS NOT NULL THEN 1 END) AS con_despacho,
                        SUM(CASE WHEN p.estado IN ('C','V') THEN 1 ELSE 0 END)  AS cerrados
                    FROM  cad_pedidos p
                    LEFT  JOIN LATERAL (
                        SELECT MIN(e.fecha_despacho) AS fecha_despacho,
                               MIN(e.fecha_cierre)   AS fecha_cierre
                        FROM   cad_eventos e
                        WHERE  e.pedido_id = p.id
                    """;
                // Cuando hay filtro de fuerza, los tiempos se calculan sobre los eventos de esa fuerza
                if (p.FuerzaId > 0)
                    cmd.CommandText += "\n          AND    e.fuerza_id = @fuerza";
                cmd.CommandText += """

                    ) t ON TRUE
                    WHERE p.fecha_creacion >= @fd
                      AND p.fecha_creacion <= @fh
                      AND p.enviar = 'S'
                    """;
                if (p.FuerzaId > 0)
                    cmd.CommandText += "\n  AND EXISTS (SELECT 1 FROM cad_eventos ef WHERE ef.pedido_id = p.id AND ef.fuerza_id = @fuerza2)";

                if (p.TurnoVigilancia > 0) cmd.CommandText += $"\n{TurnoSql(p.TurnoVigilancia)}";
                AddParams(cmd, desde, hasta, p.FuerzaId);
                // El segundo parámetro de fuerza para el EXISTS final (si aplica)
                if (p.FuerzaId > 0)
                    cmd.Parameters.AddWithValue("@fuerza2", p.FuerzaId);

                await using var rdr = await cmd.ExecuteReaderAsync(ct);
                if (await rdr.ReadAsync(ct))
                    result.Tiempos = new DtoTiemposAtencion
                    {
                        MinutosPrimerAccesoPromedio = ToDouble(rdr, 0),
                        MinutosDespachoPromedio     = ToDouble(rdr, 1),
                        MinutosCierrePromedio       = ToDouble(rdr, 2),
                        MinutosFlashPromedio        = ToDouble(rdr, 3),
                        ConDespacho                 = ToInt(rdr, 4),
                        Cerrados                    = ToInt(rdr, 5)
                    };
            }

            // ── 6. SLA ─────────────────────────────────────────────────────────
            // Fase A: leer configuraciones SLA y cerrar el reader antes de abrir cmd2.
            // Npgsql no permite dos operaciones concurrentes sobre la misma conexión.
            var slaConfigs = new List<(int umbral, string nombre, string color)>();
            await using (var cmdSla = conn.CreateCommand())
            {
                cmdSla.CommandText = @"
                    SELECT id, nombre, umbral_minutos, color_hex
                    FROM   cad_config_sla
                    WHERE  activo = TRUE
                    ORDER  BY umbral_minutos ASC";
                await using var rdrSla = await cmdSla.ExecuteReaderAsync(ct);
                while (await rdrSla.ReadAsync(ct))
                    slaConfigs.Add((rdrSla.GetInt32(2), rdrSla.GetString(1), rdrSla.GetString(3)));
            } // rdrSla y cmdSla cerrados aquí — conexión libre para las queries siguientes

            // Fase B: calcular cumplimiento por cada umbral SLA
            foreach (var cfg in slaConfigs)
            {
                await using var cmd2 = conn.CreateCommand();
                // cfg.umbral viene de la BD (entero), no de input del usuario — interpolación segura.
                cmd2.CommandText = $"""
                    SELECT
                        SUM(CASE WHEN p.fecha_primer_acceso IS NOT NULL
                                  AND EXTRACT(EPOCH FROM (p.fecha_primer_acceso - p.fecha_creacion))/60.0 <= {cfg.umbral}
                                 THEN 1 ELSE 0 END) AS cumplieron,
                        SUM(CASE WHEN p.fecha_primer_acceso IS NOT NULL
                                  AND EXTRACT(EPOCH FROM (p.fecha_primer_acceso - p.fecha_creacion))/60.0 > {cfg.umbral}
                                 THEN 1 ELSE 0 END) AS incumplieron
                    FROM  cad_pedidos p
                    WHERE p.fecha_creacion >= @fd
                      AND p.fecha_creacion <= @fh
                      AND p.enviar = 'S'
                      AND p.fecha_primer_acceso IS NOT NULL
                    """;
                if (p.FuerzaId > 0)
                    cmd2.CommandText += "\n  AND EXISTS (SELECT 1 FROM cad_eventos ef WHERE ef.pedido_id = p.id AND ef.fuerza_id = @fuerza)";
                if (p.TurnoVigilancia > 0) cmd2.CommandText += $"\n{TurnoSql(p.TurnoVigilancia)}";
                AddParams(cmd2, desde, hasta, p.FuerzaId);

                await using var rdr2 = await cmd2.ExecuteReaderAsync(ct);
                if (await rdr2.ReadAsync(ct))
                {
                    int cum  = ToInt(rdr2, 0);
                    int incu = ToInt(rdr2, 1);
                    int tot  = cum + incu;
                    result.Sla.Add(new DtoSlaItem
                    {
                        Nombre                 = cfg.nombre,
                        UmbralMinutos          = cfg.umbral,
                        ColorHex               = cfg.color,
                        Cumplieron             = cum,
                        Incumplieron           = incu,
                        PorcentajeCumplimiento = tot > 0 ? Math.Round(cum * 100.0 / tot, 1) : 0
                    });
                }
            }

            // ── 7. POR HORA DEL DÍA ────────────────────────────────────────────
            // COUNT(DISTINCT p.id) evita inflar la distribución horaria por eventos múltiples.
            await using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = """
                    SELECT EXTRACT(HOUR FROM p.fecha_creacion AT TIME ZONE 'America/Bogota')::int AS hora,
                           COUNT(DISTINCT p.id) AS total
                    FROM   cad_pedidos p
                    LEFT   JOIN cad_eventos e ON e.pedido_id = p.id
                    WHERE  p.fecha_creacion >= @fd
                      AND  p.fecha_creacion <= @fh
                      AND  p.enviar = 'S'
                    """;
                if (p.FuerzaId > 0) cmd.CommandText += "\n  AND  e.fuerza_id = @fuerza";
                if (p.TurnoVigilancia > 0) cmd.CommandText += $"\n{TurnoSql(p.TurnoVigilancia)}";
                cmd.CommandText += "\nGROUP BY hora ORDER BY hora";
                AddParams(cmd, desde, hasta, p.FuerzaId);

                await using var rdr = await cmd.ExecuteReaderAsync(ct);
                var horaMap = new Dictionary<int, int>();
                while (await rdr.ReadAsync(ct))
                    horaMap[rdr.GetInt32(0)] = (int)rdr.GetInt64(1);

                result.PorHora = Enumerable.Range(0, 24)
                    .Select(h => new DtoPorHora { Hora = h, Total = horaMap.GetValueOrDefault(h, 0) })
                    .ToList();
            }

            // Mostrar las fechas del resumen en hora Colombia (lo que el usuario ve)
            result.Resumen.FechaDesde = UtcACol(desde).ToString("dd/MM/yyyy HH:mm");
            result.Resumen.FechaHasta = UtcACol(hasta).ToString("dd/MM/yyyy HH:mm");
            return result;
        }

        // ── Helpers ───────────────────────────────────────────────────────────

        // Colombia es UTC-5 y NO tiene horario de verano — offset fijo siempre.
        private static readonly TimeSpan ColombiaOffset = TimeSpan.FromHours(-5);

        // Convierte un DateTime UTC a su equivalente en hora Colombia (para mostrar).
        private static DateTime UtcACol(DateTime utc)
            => new DateTimeOffset(utc, TimeSpan.Zero).ToOffset(ColombiaOffset).DateTime;

        /// <summary>
        /// Interpreta las fechas de entrada como días en hora Colombia (UTC-5) y devuelve
        /// los extremos del rango convertidos a UTC para usarlos en queries timestamptz.
        ///
        /// Ejemplo: desde=2026-05-30 → 2026-05-30 00:00 COT = 2026-05-30 05:00 UTC
        ///          hasta=2026-05-30 → 2026-05-30 23:59:59 COT = 2026-05-31 04:59:59 UTC
        /// </summary>
        private static (DateTime desdeUtc, DateTime hastaUtc) ResolveFechas(DtoReporteParams p)
        {
            // "Ahora" en Colombia
            DateTime ahoraCol = DateTimeOffset.UtcNow.ToOffset(ColombiaOffset).DateTime;

            DateTime hastaCol = string.IsNullOrWhiteSpace(p.Hasta)
                ? ahoraCol
                : DateTime.ParseExact(p.Hasta, "yyyy-MM-dd",
                      System.Globalization.CultureInfo.InvariantCulture)
                  .Date.AddDays(1).AddSeconds(-1);  // 23:59:59 del día Colombia

            DateTime desdeCol = string.IsNullOrWhiteSpace(p.Desde)
                ? hastaCol.Date                     // inicio del mismo día Colombia
                : DateTime.ParseExact(p.Desde, "yyyy-MM-dd",
                      System.Globalization.CultureInfo.InvariantCulture).Date;

            // Límite de rango: máximo 2 años, para evitar reportes que escaneen toda la tabla (DoS).
            if (desdeCol < hastaCol.AddYears(-2)) desdeCol = hastaCol.AddYears(-2);

            // Convertir medianoche Colombia → UTC para comparar con timestamptz
            var desdeUtc = new DateTimeOffset(desdeCol, ColombiaOffset).UtcDateTime;
            var hastaUtc = new DateTimeOffset(hastaCol, ColombiaOffset).UtcDateTime;

            return (desdeUtc, hastaUtc);
        }

        private static void AddParams(NpgsqlCommand cmd, DateTime fd, DateTime fh, int fuerzaId)
        {
            cmd.Parameters.Add(new NpgsqlParameter("@fd", NpgsqlTypes.NpgsqlDbType.TimestampTz)
                { Value = DateTime.SpecifyKind(fd, DateTimeKind.Utc) });
            cmd.Parameters.Add(new NpgsqlParameter("@fh", NpgsqlTypes.NpgsqlDbType.TimestampTz)
                { Value = DateTime.SpecifyKind(fh, DateTimeKind.Utc) });
            if (fuerzaId > 0)
                cmd.Parameters.AddWithValue("@fuerza", fuerzaId);
        }

        /// <summary>
        /// Genera el fragmento SQL AND ... para filtrar por turno de vigilancia.
        /// Turno 1=Segundo(06-13h), 2=Tercer(14-21h), 3=Cuarto(22-05h). 0=sin filtro.
        /// col debe ser una columna TIMESTAMPTZ de la tabla ya aliasada.
        /// </summary>
        private static string TurnoSql(int turno, string col = "p.fecha_creacion") => turno switch
        {
            1 => $"AND EXTRACT(HOUR FROM {col} AT TIME ZONE 'America/Bogota') BETWEEN 6 AND 13",
            2 => $"AND EXTRACT(HOUR FROM {col} AT TIME ZONE 'America/Bogota') BETWEEN 14 AND 21",
            3 => $"AND (EXTRACT(HOUR FROM {col} AT TIME ZONE 'America/Bogota') >= 22 OR EXTRACT(HOUR FROM {col} AT TIME ZONE 'America/Bogota') < 6)",
            _ => ""
        };

        private static int     ToInt   (NpgsqlDataReader r, int col) => r.IsDBNull(col) ? 0 : Convert.ToInt32(r.GetValue(col));
        private static double? ToDouble(NpgsqlDataReader r, int col) => r.IsDBNull(col) ? null : Math.Round(Convert.ToDouble(r.GetValue(col)), 1);
        private static string  Str     (NpgsqlDataReader r, int col) => r.IsDBNull(col) ? "" : r.GetString(col);
        private static string? StrN    (NpgsqlDataReader r, int col) => r.IsDBNull(col) ? null : r.GetString(col);

        /// <summary>Convierte segundos a HH:MM:SS o null si el valor es null/negativo.</summary>
        private static string? SegsAHms(double? segs)
        {
            if (segs is null || segs < 0) return null;
            var ts = TimeSpan.FromSeconds(segs.Value);
            return $"{(int)ts.TotalHours:D2}:{ts.Minutes:D2}:{ts.Seconds:D2}";
        }

        // ════════════════════════════════════════════════════════════════════════
        // R1 — Llamadas por calidad
        // ════════════════════════════════════════════════════════════════════════

        private static readonly Dictionary<string, string> _descripcionCalidad = new(StringComparer.OrdinalIgnoreCase)
        {
            { "REAL",             "Pedido Efectivo"       },
            { "INFORMACION",      "Información General"   },
            { "NIÑO MOLESTANDO",  "Niño Molestando"       },
            { "PERSONAS MOLESTANDO", "Personas Molestando"},
            { "LLAMADA CORTADA",  "Llamada Cortada"       },
            { "NO CULTAS",        "No Cultas"             },
            { "PRUEBA",           "Llamada de Prueba"     },
        };

        public async Task<List<DtoPorCalidad>> GetPorCalidadAsync(
            DtoReporteParams p, CancellationToken ct)
        {
            var (desde, hasta) = ResolveFechas(p);
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();

            cmd.CommandText = """
                SELECT COALESCE(NULLIF(TRIM(p.cali_pedido),''), 'SIN CALIDAD') AS calidad,
                       COUNT(DISTINCT p.id) AS total
                FROM   cad_pedidos p
                WHERE  p.fecha_creacion >= @fd
                  AND  p.fecha_creacion <= @fh
                  AND  p.enviar = 'S'
                """;
            if (p.FuerzaId > 0) cmd.CommandText += "\n  AND  EXISTS (SELECT 1 FROM cad_eventos ev WHERE ev.pedido_id = p.id AND ev.fuerza_id = @fuerza)";
            if (p.TurnoVigilancia > 0) cmd.CommandText += $"\n{TurnoSql(p.TurnoVigilancia)}";
            cmd.CommandText += "\nGROUP  BY calidad\nORDER  BY total DESC";
            AddParams(cmd, desde, hasta, p.FuerzaId);

            var rows = new List<(string cali, int total)>();
            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            while (await rdr.ReadAsync(ct))
                rows.Add((rdr.GetString(0), (int)rdr.GetInt64(1)));

            int gran = rows.Sum(r => r.total);
            return rows.Select(r => new DtoPorCalidad
            {
                CaliPedido  = r.cali,
                Descripcion = _descripcionCalidad.TryGetValue(r.cali, out var d) ? d : r.cali,
                Total       = r.total,
                Porcentaje  = gran > 0 ? Math.Round(r.total * 100.0 / gran, 1) : 0
            }).ToList();
        }

        // ════════════════════════════════════════════════════════════════════════
        // R2 — Pedidos efectivos (tabla paginada)
        // ════════════════════════════════════════════════════════════════════════

        public async Task<DtoPagedResult<DtoPedidoEfectivo>> GetEfectivosAsync(
            DtoReporteParamsEx p, CancellationToken ct)
        {
            var (desde, hasta) = ResolveFechas(p);
            int page  = Math.Max(1, p.Page);
            int limit = Math.Clamp(p.Limit, 1, 500);
            int offset = (page - 1) * limit;

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);

            // Filtro de calidad: null/vacío = todos; si tiene valor filtra por ese código
            var filtroCalidad = string.IsNullOrWhiteSpace(p.Calidad) ? null : p.Calidad.Trim().ToUpperInvariant();

            // ── Count total ────────────────────────────────────────────────────
            int total = 0;
            await using (var cmdC = conn.CreateCommand())
            {
                cmdC.CommandText = """
                    SELECT COUNT(DISTINCT p.id)
                    FROM   cad_pedidos p
                    WHERE  p.fecha_creacion >= @fd
                      AND  p.fecha_creacion <= @fh
                      AND  p.enviar = 'S'
                    """;
                if (filtroCalidad != null) cmdC.CommandText += "\n  AND  UPPER(TRIM(p.cali_pedido)) = @cali";
                if (p.FuerzaId > 0) cmdC.CommandText += "\n  AND  EXISTS (SELECT 1 FROM cad_eventos ev WHERE ev.pedido_id = p.id AND ev.fuerza_id = @fuerza)";
                if (p.TurnoVigilancia > 0) cmdC.CommandText += $"\n{TurnoSql(p.TurnoVigilancia)}";
                AddParams(cmdC, desde, hasta, p.FuerzaId);
                if (filtroCalidad != null) cmdC.Parameters.AddWithValue("@cali", filtroCalidad);
                total = Convert.ToInt32(await cmdC.ExecuteScalarAsync(ct) ?? 0);
            }

            // ── Data ───────────────────────────────────────────────────────────
            var data = new List<DtoPedidoEfectivo>();
            await using (var cmdD = conn.CreateCommand())
            {
                cmdD.CommandText = """
                    SELECT
                        p.id::text                           AS id,
                        COALESCE(p.nume_telefono::text,'')   AS telefono,
                        p.nume_llamada::text                 AS nro_llamada,
                        TO_CHAR(p.hora_caso   AT TIME ZONE 'America/Bogota','DD/MM/YYYY HH24:MI:SS') AS hora_llamada,
                        COALESCE(p.codi_pedido,'')           AS codigo,
                        COALESCE(cas.descripcion, p.codi_pedido,'') AS desc_caso,
                        COALESCE(p.cali_pedido,'')           AS calidad,
                        COALESCE(p.prioridad,'')             AS prioridad,
                        -- Primera actuación de cada pedido (DISTINCT ON ordena por fecha_despacho ASC)
                        COALESCE(ac.canal_descripcion,'')    AS canal,
                        COALESCE(ac.unidad_asignada,'')      AS unidad,
                        COALESCE(ac.placa_unidad,'')         AS placa,
                        EXTRACT(EPOCH FROM (ac.fecha_despacho - p.hora_caso))  AS segs_asign,
                        EXTRACT(EPOCH FROM (ac.fecha_llegada  - p.hora_caso))  AS segs_llega,
                        EXTRACT(EPOCH FROM (ac.fecha_cierre   - p.hora_caso))  AS segs_termino,
                        EXTRACT(EPOCH FROM (ac.fecha_llegada  - ac.fecha_despacho)) AS segs_desplaz,
                        EXTRACT(EPOCH FROM (ac.fecha_cierre   - ac.fecha_llegada))  AS segs_atencion,
                        TO_CHAR(ac.fecha_despacho AT TIME ZONE 'America/Bogota','HH24:MI:SS') AS h_asigna,
                        TO_CHAR(ac.fecha_llegada  AT TIME ZONE 'America/Bogota','HH24:MI:SS') AS h_llega,
                        TO_CHAR(ac.fecha_cierre   AT TIME ZONE 'America/Bogota','HH24:MI:SS') AS h_termino
                    FROM   cad_pedidos p
                    LEFT   JOIN cad_casos cas ON TRIM(UPPER(cas.codigo)) = TRIM(UPPER(p.codi_pedido))
                    LEFT   JOIN LATERAL (
                        SELECT ac2.canal_descripcion, ac2.unidad_asignada, ac2.placa_unidad,
                               ac2.fecha_despacho, ac2.fecha_llegada, ac2.fecha_cierre
                        FROM   cad_actuaciones ac2
                        JOIN   cad_eventos     ev  ON ev.id = ac2.evento_id
                        WHERE  ev.pedido_id = p.id
                    """;
                if (p.FuerzaId > 0) cmdD.CommandText += "\n          AND    ev.fuerza_id = @fuerza";
                cmdD.CommandText += """

                        ORDER  BY ac2.fecha_despacho ASC NULLS LAST
                        LIMIT  1
                    ) ac ON TRUE
                    WHERE  p.fecha_creacion >= @fd
                      AND  p.fecha_creacion <= @fh
                      AND  p.enviar = 'S'
                    """;
                if (filtroCalidad != null) cmdD.CommandText += "\n  AND  UPPER(TRIM(p.cali_pedido)) = @cali";
                if (p.FuerzaId > 0) cmdD.CommandText += "\n  AND  EXISTS (SELECT 1 FROM cad_eventos ev2 WHERE ev2.pedido_id = p.id AND ev2.fuerza_id = @fuerza)";
                if (p.TurnoVigilancia > 0) cmdD.CommandText += $"\n{TurnoSql(p.TurnoVigilancia)}";
                cmdD.CommandText += "\nORDER BY p.hora_caso DESC NULLS LAST\nLIMIT @lim OFFSET @off";
                AddParams(cmdD, desde, hasta, p.FuerzaId);
                if (filtroCalidad != null) cmdD.Parameters.AddWithValue("@cali", filtroCalidad);
                cmdD.Parameters.AddWithValue("@lim", limit);
                cmdD.Parameters.AddWithValue("@off", offset);

                await using var rdr = await cmdD.ExecuteReaderAsync(ct);
                while (await rdr.ReadAsync(ct))
                {
                    var segsDesplaz  = rdr.IsDBNull(14) ? (double?)null : Convert.ToDouble(rdr.GetValue(14));
                    var segsAtencion = rdr.IsDBNull(15) ? (double?)null : Convert.ToDouble(rdr.GetValue(15));
                    var segsTotal    = rdr.IsDBNull(13) ? (double?)null : Convert.ToDouble(rdr.GetValue(13));

                    data.Add(new DtoPedidoEfectivo
                    {
                        NumeTelefono   = Str(rdr, 1),
                        NumeLlamada    = Str(rdr, 2),
                        HoraLlamada    = Str(rdr, 3),
                        CodigoCaso     = Str(rdr, 4),
                        DescCaso       = Str(rdr, 5),
                        CaliPedido     = Str(rdr, 6),
                        Prioridad      = Str(rdr, 7),
                        Canal          = Str(rdr, 8),
                        Unidad         = Str(rdr, 9),
                        Placa          = Str(rdr, 10),
                        HoraAsignacion = StrN(rdr, 16),
                        HoraLlegada    = StrN(rdr, 17),
                        HoraTermino    = StrN(rdr, 18),
                        TiempoLlegada  = SegsAHms(segsDesplaz),
                        TiempoAtencion = SegsAHms(segsAtencion),
                        TiempoTotal    = SegsAHms(segsTotal),
                    });
                }
            }

            return new DtoPagedResult<DtoPedidoEfectivo>
            {
                Total = total, Page = page, Limit = limit, Data = data
            };
        }

        // ════════════════════════════════════════════════════════════════════════
        // R3 — Tiempos detalle por unidad/actuación (paginada)
        // ════════════════════════════════════════════════════════════════════════

        public async Task<DtoPagedResult<DtoTiempoDetalleItem>> GetTiemposDetalleAsync(
            DtoReporteParamsEx p, CancellationToken ct)
        {
            var (desde, hasta) = ResolveFechas(p);
            int page   = Math.Max(1, p.Page);
            int limit  = Math.Clamp(p.Limit, 1, 500);
            int offset = (page - 1) * limit;

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);

            // ── Count ──────────────────────────────────────────────────────────
            int total = 0;
            await using (var cmdC = conn.CreateCommand())
            {
                cmdC.CommandText = """
                    SELECT COUNT(*)
                    FROM   cad_actuaciones ac
                    JOIN   cad_eventos     ev ON ev.id = ac.evento_id
                    JOIN   cad_pedidos     p  ON p.id  = ev.pedido_id
                    WHERE  p.fecha_creacion >= @fd
                      AND  p.fecha_creacion <= @fh
                      AND  p.enviar = 'S'
                    """;
                if (p.FuerzaId > 0) cmdC.CommandText += "\n  AND  ev.fuerza_id = @fuerza";
                if (p.TurnoVigilancia > 0) cmdC.CommandText += $"\n{TurnoSql(p.TurnoVigilancia)}";
                AddParams(cmdC, desde, hasta, p.FuerzaId);
                total = Convert.ToInt32(await cmdC.ExecuteScalarAsync(ct) ?? 0);
            }

            // ── Data ───────────────────────────────────────────────────────────
            var data = new List<DtoTiempoDetalleItem>();
            await using (var cmdD = conn.CreateCommand())
            {
                cmdD.CommandText = """
                    SELECT
                        COALESCE(f.descripcion,'Sin seccional')                                     AS seccional,
                        COALESCE(ac.unidad_asignada,'')                                             AS unidad,
                        p.id::text                                                                   AS nro_llamada,
                        COALESCE(p.codi_pedido,'')                                                  AS codigo,
                        COALESCE(cas.descripcion, p.codi_pedido,'')                                 AS desc_caso,
                        TO_CHAR(p.hora_caso          AT TIME ZONE 'America/Bogota','HH24:MI:SS')    AS h_llamada,
                        TO_CHAR(p.fecha_primer_acceso AT TIME ZONE 'America/Bogota','HH24:MI:SS')   AS h_callcent,
                        TO_CHAR(ev.fecha_despacho    AT TIME ZONE 'America/Bogota','HH24:MI:SS')    AS h_despacho,
                        TO_CHAR(ac.fecha_llegada     AT TIME ZONE 'America/Bogota','HH24:MI:SS')    AS h_llegada,
                        TO_CHAR(ac.fecha_cierre      AT TIME ZONE 'America/Bogota','HH24:MI:SS')    AS h_termino,
                        EXTRACT(EPOCH FROM (ac.fecha_llegada - ev.fecha_despacho))                  AS segs_desplaz,
                        EXTRACT(EPOCH FROM (ac.fecha_cierre  - ac.fecha_llegada))                   AS segs_atencion,
                        EXTRACT(EPOCH FROM (ac.fecha_cierre  - p.hora_caso))                        AS segs_total,
                        COALESCE(ac.placa_unidad,'')                                                AS placa,
                        COALESCE(p.prioridad,'')                                                    AS prioridad
                    FROM   cad_actuaciones ac
                    JOIN   cad_eventos     ev  ON ev.id      = ac.evento_id
                    JOIN   cad_pedidos     p   ON p.id       = ev.pedido_id
                    LEFT   JOIN cad_fuerzas f  ON f.id       = ev.fuerza_id
                    LEFT   JOIN cad_casos   cas ON TRIM(UPPER(cas.codigo)) = TRIM(UPPER(p.codi_pedido))
                    WHERE  p.fecha_creacion >= @fd
                      AND  p.fecha_creacion <= @fh
                      AND  p.enviar = 'S'
                    """;
                if (p.FuerzaId > 0) cmdD.CommandText += "\n  AND  ev.fuerza_id = @fuerza";
                if (p.TurnoVigilancia > 0) cmdD.CommandText += $"\n{TurnoSql(p.TurnoVigilancia)}";
                cmdD.CommandText += "\nORDER BY p.hora_caso DESC NULLS LAST, ac.fecha_despacho ASC NULLS LAST\nLIMIT @lim OFFSET @off";
                AddParams(cmdD, desde, hasta, p.FuerzaId);
                cmdD.Parameters.AddWithValue("@lim", limit);
                cmdD.Parameters.AddWithValue("@off", offset);

                await using var rdr = await cmdD.ExecuteReaderAsync(ct);
                while (await rdr.ReadAsync(ct))
                {
                    data.Add(new DtoTiempoDetalleItem
                    {
                        Seccional            = Str(rdr, 0),
                        Unidad               = Str(rdr, 1),
                        NroLlamada           = Str(rdr, 2),
                        CodigoCaso           = Str(rdr, 3),
                        DescCaso             = Str(rdr, 4),
                        HoraLlamada          = Str(rdr, 5),
                        HoraEnvioCentral     = StrN(rdr, 6),
                        HoraDespacho         = StrN(rdr, 7),
                        HoraLlegada          = StrN(rdr, 8),
                        HoraTermino          = StrN(rdr, 9),
                        TiempoDesplazamiento = SegsAHms(rdr.IsDBNull(10) ? null : Convert.ToDouble(rdr.GetValue(10))),
                        TiempoAtencionCaso   = SegsAHms(rdr.IsDBNull(11) ? null : Convert.ToDouble(rdr.GetValue(11))),
                        TiempoTotalCaso      = SegsAHms(rdr.IsDBNull(12) ? null : Convert.ToDouble(rdr.GetValue(12))),
                        Placa                = Str(rdr, 13),
                        Prioridad            = Str(rdr, 14),
                    });
                }
            }

            return new DtoPagedResult<DtoTiempoDetalleItem>
            {
                Total = total, Page = page, Limit = limit, Data = data
            };
        }

        // ════════════════════════════════════════════════════════════════════════
        // R4 — Trabajo de operadores y despachadores
        // ════════════════════════════════════════════════════════════════════════

        public async Task<List<DtoTrabajoOperador>> GetTrabajoOperadoresAsync(
            DtoReporteParams p, CancellationToken ct)
        {
            var (desde, hasta) = ResolveFechas(p);
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();

            cmd.CommandText = """
                SELECT
                    ev.usuario_genera                                                        AS usuario,
                    COUNT(DISTINCT ev.pedido_id)                                             AS casos_recibidos,
                    COUNT(DISTINCT ev.id)                                                    AS eventos_despachados,
                    COUNT(ac.id)                                                             AS actuaciones,
                    COUNT(DISTINCT CASE WHEN ev.fecha_cierre IS NOT NULL THEN ev.id END)    AS eventos_cerrados,
                    AVG(CASE WHEN ev.fecha_despacho IS NOT NULL AND p.fecha_primer_acceso IS NOT NULL
                             THEN EXTRACT(EPOCH FROM (ev.fecha_despacho - p.fecha_primer_acceso))/60.0
                             END)                                                            AS prom_min_despacho,
                    TO_CHAR(MIN(ev.fecha_creacion) AT TIME ZONE 'America/Bogota','HH24:MI') AS primera_actividad,
                    TO_CHAR(MAX(COALESCE(ev.fecha_cierre,ev.fecha_despacho,ev.fecha_creacion))
                            AT TIME ZONE 'America/Bogota','HH24:MI')                         AS ultima_actividad
                FROM   cad_eventos   ev
                JOIN   cad_pedidos   p  ON p.id  = ev.pedido_id
                LEFT   JOIN cad_actuaciones ac ON ac.evento_id = ev.id
                WHERE  p.fecha_creacion >= @fd
                  AND  p.fecha_creacion <= @fh
                  AND  p.enviar = 'S'
                  AND  ev.usuario_genera IS NOT NULL
                  AND  ev.usuario_genera <> ''
                """;
            if (p.FuerzaId > 0) cmd.CommandText += "\n  AND  ev.fuerza_id = @fuerza";
            if (p.TurnoVigilancia > 0) cmd.CommandText += $"\n{TurnoSql(p.TurnoVigilancia)}";
            cmd.CommandText += "\nGROUP  BY ev.usuario_genera\nORDER  BY casos_recibidos DESC";
            AddParams(cmd, desde, hasta, p.FuerzaId);

            var result = new List<DtoTrabajoOperador>();
            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            while (await rdr.ReadAsync(ct))
            {
                result.Add(new DtoTrabajoOperador
                {
                    Usuario            = Str(rdr, 0),
                    CasosRecibidos     = (int)rdr.GetInt64(1),
                    EventosDespachados = (int)rdr.GetInt64(2),
                    Actuaciones        = (int)rdr.GetInt64(3),
                    EventosCerrados    = (int)rdr.GetInt64(4),
                    PromMinDespacho    = ToDouble(rdr, 5),
                    PrimeraActividad   = Str(rdr, 6),
                    UltimaActividad    = Str(rdr, 7),
                });
            }
            return result;
        }

        // ════════════════════════════════════════════════════════════════════════
        // R5 — Llamadas por código (top configurable)
        // ════════════════════════════════════════════════════════════════════════

        public async Task<List<DtoTopCaso>> GetPorCodigoAsync(
            DtoReporteParamsEx p, CancellationToken ct)
        {
            var (desde, hasta) = ResolveFechas(p);
            int top = Math.Clamp(p.Top, 1, 500);

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();

            cmd.CommandText = """
                SELECT p.codi_pedido,
                       COALESCE(c.descripcion, p.codi_pedido, 'Sin código') AS descripcion,
                       COUNT(DISTINCT p.id) AS total
                FROM   cad_pedidos p
                LEFT   JOIN cad_casos   c ON TRIM(UPPER(c.codigo)) = TRIM(UPPER(p.codi_pedido))
                LEFT   JOIN cad_eventos e ON e.pedido_id = p.id
                WHERE  p.fecha_creacion >= @fd
                  AND  p.fecha_creacion <= @fh
                  AND  p.enviar = 'S'
                  AND  p.codi_pedido IS NOT NULL
                  AND  p.codi_pedido <> ''
                """;
            if (p.FuerzaId > 0) cmd.CommandText += "\n  AND  e.fuerza_id = @fuerza";
            if (p.TurnoVigilancia > 0) cmd.CommandText += $"\n{TurnoSql(p.TurnoVigilancia)}";
            cmd.CommandText += $"\nGROUP  BY p.codi_pedido, c.descripcion\nORDER  BY total DESC\nLIMIT  {top}";
            AddParams(cmd, desde, hasta, p.FuerzaId);

            var rows = new List<(string cod, string desc, int total)>();
            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            while (await rdr.ReadAsync(ct))
                rows.Add((Str(rdr, 0), Str(rdr, 1), (int)rdr.GetInt64(2)));

            int gran = rows.Sum(r => r.total);
            return rows.Select(r => new DtoTopCaso
            {
                CodigoCaso  = r.cod,
                Descripcion = r.desc,
                Total       = r.total,
                Porcentaje  = gran > 0 ? Math.Round(r.total * 100.0 / gran, 1) : 0
            }).ToList();
        }
    }
}
