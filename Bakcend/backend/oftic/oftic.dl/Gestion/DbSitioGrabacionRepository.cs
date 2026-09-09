using Comun.Dtos.Entidades;
using Datos.Interfaz;
using Datos.Tenant;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace Datos.Gestion
{
    /// <summary>
    /// Catálogo de sitios de grabación del CAD.
    ///
    /// Nota sobre el esquema: la tabla nació en V4 con dos columnas y fue
    /// creciendo (cod_dane en V31; abreviatura y vigente en V70). El despliegue
    /// levanta la API ANTES de correr el SQL, así que aquí no se puede dar por
    /// sentado que las columnas nuevas existan: las lecturas las sacan por
    /// to_jsonb —que no falla si la columna no está— y las escrituras arman la
    /// lista de columnas después de preguntarle al catálogo de Postgres cuáles
    /// hay. Una API nueva sobre una base sin migrar sigue funcionando.
    /// </summary>
    public class DbSitioGrabacionRepository : IDbSitioGrabacionRepository
    {
        private readonly TenantContext _tenant;
        private readonly ILogger<DbSitioGrabacionRepository> _logger;

        public DbSitioGrabacionRepository(TenantContext tenant, ILogger<DbSitioGrabacionRepository> logger)
        {
            _tenant = tenant;
            _logger = logger;
        }

        // to_jsonb(s) ->> 'x' devuelve NULL cuando la columna no existe, en vez
        // de reventar la consulta: es lo que permite leer una base sin migrar.
        private const string SelectSitios = @"
SELECT s.consecutivo,
       s.descripcion,
       COALESCE(to_jsonb(s) ->> 'abreviatura', '')  AS abreviatura,
       COALESCE(to_jsonb(s) ->> 'cod_dane',    '')  AS cod_dane,
       COALESCE(to_jsonb(s) ->> 'vigente',     'S') AS vigente,
       (to_jsonb(s) ->> 'latitud')::numeric         AS latitud,
       (to_jsonb(s) ->> 'longitud')::numeric        AS longitud,
       (to_jsonb(s) ->> 'zoom_mapa')::int           AS zoom_mapa,
       (SELECT COUNT(*) FROM cad_fuerzas  f WHERE f.sitio_graba     = s.consecutivo) AS total_fuerzas,
       (SELECT COUNT(*) FROM ctr_usuarios u WHERE u.sitio_grabacion = s.consecutivo) AS total_usuarios
FROM cad_sitios_grabacion s";

        public async Task<List<DtoSitioGrabacion>> GetSitiosAsync(bool soloVigentes, CancellationToken ct)
        {
            var result = new List<DtoSitioGrabacion>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = SelectSitios
                + (soloVigentes ? "\nWHERE COALESCE(to_jsonb(s) ->> 'vigente', 'S') = 'S'" : "")
                + "\nORDER BY s.consecutivo";

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
                result.Add(Map(reader));

            return result;
        }

        public async Task<DtoSitioGrabacion?> GetSitioAsync(int consecutivo, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = SelectSitios + "\nWHERE s.consecutivo = @c\nLIMIT 1";
            cmd.Parameters.AddWithValue("c", consecutivo);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            return await reader.ReadAsync(ct) ? Map(reader) : null;
        }

        public async Task<DtoCentroMapa?> GetCentroMapaAsync(int consecutivo, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            // Igual que el resto del repositorio: por to_jsonb, para que una API
            // nueva sobre una base a la que todavía no se le ha pasado V72 no
            // reviente — devuelve NULL y el llamador cae al respaldo.
            //
            // El ORDER BY pone primero la unidad pedida: si tiene coordenadas
            // gana ella, y si no, sirve cualquier otra vigente del CAD antes que
            // mandar al operador a Bogotá.
            cmd.CommandText = @"
SELECT (to_jsonb(s) ->> 'latitud')::numeric   AS latitud,
       (to_jsonb(s) ->> 'longitud')::numeric  AS longitud,
       COALESCE((to_jsonb(s) ->> 'zoom_mapa')::int, 12) AS zoom,
       s.descripcion
FROM   cad_sitios_grabacion s
WHERE  to_jsonb(s) ->> 'latitud'  IS NOT NULL
  AND  to_jsonb(s) ->> 'longitud' IS NOT NULL
  AND  (s.consecutivo = @c OR COALESCE(to_jsonb(s) ->> 'vigente', 'S') = 'S')
ORDER BY (s.consecutivo = @c) DESC, s.consecutivo
LIMIT 1";
            cmd.Parameters.AddWithValue("c", consecutivo);

            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (!await r.ReadAsync(ct)) return null;

            return new DtoCentroMapa
            {
                latitud     = r.GetDecimal(0),
                longitud    = r.GetDecimal(1),
                zoom        = r.GetInt32(2),
                origen      = "sitio",
                descripcion = r.IsDBNull(3) ? null : r.GetString(3),
            };
        }

        public async Task<DtoFuerzaResult> SaveSitioAsync(int? consecutivo, DtoSitioGrabacionRequest request, CancellationToken ct)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.descripcion))
                    return Error("El nombre de la unidad es obligatorio.");

                await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
                var columnas = await ColumnasAsync(conn, ct);

                // Cada columna opcional entra en el SQL solo si la base ya la
                // tiene; lo que el usuario escribió en un campo que todavía no
                // existe se ignora en silencio hasta que se corra V70.
                var opcionales = new List<(string columna, object valor)>();
                if (columnas.Contains("cod_dane"))
                    opcionales.Add(("cod_dane", (object?)Limpiar(request.codDane) ?? DBNull.Value));
                if (columnas.Contains("abreviatura"))
                    opcionales.Add(("abreviatura", (object?)Limpiar(request.abreviatura)?.ToUpperInvariant() ?? DBNull.Value));
                if (columnas.Contains("vigente"))
                    opcionales.Add(("vigente", request.vigente == "N" ? "N" : "S"));
                if (columnas.Contains("latitud"))
                    opcionales.Add(("latitud", (object?)request.latitud ?? DBNull.Value));
                if (columnas.Contains("longitud"))
                    opcionales.Add(("longitud", (object?)request.longitud ?? DBNull.Value));
                if (columnas.Contains("zoom_mapa"))
                    opcionales.Add(("zoom_mapa", (object?)request.zoomMapa ?? DBNull.Value));

                if (consecutivo.HasValue && consecutivo.Value > 0)
                {
                    var sets = new List<string> { "descripcion = @desc" };
                    for (var i = 0; i < opcionales.Count; i++)
                        sets.Add($"{opcionales[i].columna} = @p{i}");

                    await using var cmd = conn.CreateCommand();
                    cmd.CommandText = $"UPDATE cad_sitios_grabacion SET {string.Join(", ", sets)} WHERE consecutivo = @c";
                    cmd.Parameters.AddWithValue("desc", request.descripcion.Trim());
                    for (var i = 0; i < opcionales.Count; i++)
                        cmd.Parameters.AddWithValue($"p{i}", opcionales[i].valor);
                    cmd.Parameters.AddWithValue("c", consecutivo.Value);

                    var filas = await cmd.ExecuteNonQueryAsync(ct);
                    return filas > 0
                        ? Ok(consecutivo.Value, "Sitio de grabación actualizado.")
                        : Error("El sitio de grabación no existe.");
                }

                // El consecutivo lo elige el CAD (la tabla no tiene secuencia:
                // el código debe coincidir con el que usa la planta telefónica).
                if (request.consecutivo <= 0)
                    return Error("El código del sitio de grabación debe ser un número mayor que 0.");

                await using (var chk = conn.CreateCommand())
                {
                    chk.CommandText = "SELECT 1 FROM cad_sitios_grabacion WHERE consecutivo = @c LIMIT 1";
                    chk.Parameters.AddWithValue("c", request.consecutivo);
                    if (await chk.ExecuteScalarAsync(ct) is not null)
                        return Error($"Ya existe un sitio de grabación con el código {request.consecutivo}.");
                }

                var cols = new List<string> { "consecutivo", "descripcion" };
                var vals = new List<string> { "@c", "@desc" };
                for (var i = 0; i < opcionales.Count; i++)
                {
                    cols.Add(opcionales[i].columna);
                    vals.Add($"@p{i}");
                }

                await using var ins = conn.CreateCommand();
                ins.CommandText = $"INSERT INTO cad_sitios_grabacion ({string.Join(", ", cols)}) VALUES ({string.Join(", ", vals)})";
                ins.Parameters.AddWithValue("c", request.consecutivo);
                ins.Parameters.AddWithValue("desc", request.descripcion.Trim());
                for (var i = 0; i < opcionales.Count; i++)
                    ins.Parameters.AddWithValue($"p{i}", opcionales[i].valor);
                await ins.ExecuteNonQueryAsync(ct);

                return Ok(request.consecutivo, "Sitio de grabación creado.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error guardando sitio de grabación consecutivo={C}", consecutivo);
                return Error($"Error: {ex.Message}");
            }
        }

        public async Task<DtoFuerzaResult> ToggleSitioAsync(int consecutivo, CancellationToken ct)
        {
            try
            {
                await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
                var columnas = await ColumnasAsync(conn, ct);
                if (!columnas.Contains("vigente"))
                    return Error("Esta base todavía no tiene la columna de vigencia (migración V70).");

                await using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
UPDATE cad_sitios_grabacion
   SET vigente = CASE WHEN vigente = 'S' THEN 'N' ELSE 'S' END
 WHERE consecutivo = @c
RETURNING vigente";
                cmd.Parameters.AddWithValue("c", consecutivo);
                var nuevo = (string?)await cmd.ExecuteScalarAsync(ct);
                if (nuevo is null) return Error("El sitio de grabación no existe.");

                return Ok(consecutivo, nuevo == "S" ? "Sitio de grabación activado." : "Sitio de grabación retirado.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error cambiando vigencia del sitio {C}", consecutivo);
                return Error($"Error: {ex.Message}");
            }
        }

        public async Task<DtoFuerzaResult> DeleteSitioAsync(int consecutivo, CancellationToken ct)
        {
            try
            {
                await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);

                int fuerzas, usuarios;
                await using (var chk = conn.CreateCommand())
                {
                    chk.CommandText = @"
SELECT (SELECT COUNT(*) FROM cad_fuerzas  WHERE sitio_graba     = @c),
       (SELECT COUNT(*) FROM ctr_usuarios WHERE sitio_grabacion = @c)";
                    chk.Parameters.AddWithValue("c", consecutivo);
                    await using var r = await chk.ExecuteReaderAsync(ct);
                    await r.ReadAsync(ct);
                    fuerzas  = Convert.ToInt32(r.GetValue(0));
                    usuarios = Convert.ToInt32(r.GetValue(1));
                }

                // Borrar un sitio en uso dejaría fuerzas y usuarios apuntando a
                // una unidad que ya no existe, y con ellos todo su histórico.
                if (fuerzas > 0 || usuarios > 0)
                    return Error(
                        $"No se puede eliminar: {fuerzas} fuerza(s) y {usuarios} usuario(s) están asignados a este sitio. " +
                        "Reasígnelos o retire el sitio en lugar de eliminarlo.");

                await using var cmd = conn.CreateCommand();
                cmd.CommandText = "DELETE FROM cad_sitios_grabacion WHERE consecutivo = @c";
                cmd.Parameters.AddWithValue("c", consecutivo);
                var filas = await cmd.ExecuteNonQueryAsync(ct);

                return filas > 0
                    ? Ok(consecutivo, "Sitio de grabación eliminado.")
                    : Error("El sitio de grabación no existe.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error eliminando sitio de grabación {C}", consecutivo);
                return Error($"Error: {ex.Message}");
            }
        }

        // ── Helpers ──────────────────────────────────────────────────────────

        /// <summary>Columnas que la tabla tiene HOY en esta base.</summary>
        private static async Task<HashSet<string>> ColumnasAsync(NpgsqlConnection conn, CancellationToken ct)
        {
            var cols = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'cad_sitios_grabacion'";
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct)) cols.Add(r.GetString(0));
            return cols;
        }

        private static string? Limpiar(string? valor)
        {
            var v = valor?.Trim();
            return string.IsNullOrEmpty(v) ? null : v;
        }

        private static DtoSitioGrabacion Map(NpgsqlDataReader r) => new()
        {
            consecutivo   = r.GetInt32(0),
            descripcion   = r.IsDBNull(1) ? string.Empty : r.GetString(1),
            abreviatura   = r.IsDBNull(2) || r.GetString(2).Length == 0 ? null : r.GetString(2),
            codDane       = r.IsDBNull(3) || r.GetString(3).Length == 0 ? null : r.GetString(3),
            vigente       = r.IsDBNull(4) ? "S" : r.GetString(4),
            latitud       = r.IsDBNull(5) ? null : r.GetDecimal(5),
            longitud      = r.IsDBNull(6) ? null : r.GetDecimal(6),
            zoomMapa      = r.IsDBNull(7) ? null : r.GetInt32(7),
            totalFuerzas  = Convert.ToInt32(r.GetValue(8)),
            totalUsuarios = Convert.ToInt32(r.GetValue(9))
        };

        private static DtoFuerzaResult Ok(int id, string mensaje) =>
            new() { success = true, id = id, message = mensaje };

        private static DtoFuerzaResult Error(string mensaje) =>
            new() { success = false, message = mensaje };
    }
}
