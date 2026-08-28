using Comun.Dtos.Camaras;
using Comun.Snowflake;
using Datos.Interfaz;
using Datos.Tenant;
using Microsoft.Extensions.Logging;
using Npgsql;
using NpgsqlTypes;
using System.Text.Json;

namespace Datos.Gestion
{
    /// <summary>
    /// CRUD de <c>cad_camara_integracion</c>. Los parámetros secretos
    /// (<c>config_secreto</c>) nunca se devuelven; en edición se conservan si el
    /// request los envía vacíos.
    /// </summary>
    public class DbCamaraIntegracionRepository : IDbCamaraIntegracionRepository
    {
        private readonly TenantContext                            _tenant;
        private readonly ISnowflakeGenerator                      _snowflake;
        private readonly ILogger<DbCamaraIntegracionRepository>   _logger;

        public DbCamaraIntegracionRepository(
            TenantContext tenant,
            ISnowflakeGenerator snowflake,
            ILogger<DbCamaraIntegracionRepository> logger)
        {
            _tenant    = tenant;
            _snowflake = snowflake;
            _logger    = logger;
        }

        private static string SerializeDict(Dictionary<string, string>? d) =>
            JsonSerializer.Serialize(d ?? new Dictionary<string, string>());

        private static Dictionary<string, string> DeserializeDict(string? json)
        {
            if (string.IsNullOrWhiteSpace(json)) return new();
            try { return JsonSerializer.Deserialize<Dictionary<string, string>>(json) ?? new(); }
            catch { return new(); }
        }

        public async Task<List<DtoCamaraIntegracion>> GetAllAsync(CancellationToken ct)
        {
            var result = new List<DtoCamaraIntegracion>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
SELECT i.id, i.nombre, i.descripcion, i.driver, i.base_url,
       i.config_publico::text,
       (i.config_secreto IS NOT NULL AND i.config_secreto::text <> '{}') AS tiene_secreto,
       i.activa,
       TO_CHAR(i.fecha_creacion     AT TIME ZONE 'America/Bogota','YYYY-MM-DD""T""HH24:MI:SS'),
       TO_CHAR(i.fecha_modificacion AT TIME ZONE 'America/Bogota','YYYY-MM-DD""T""HH24:MI:SS'),
       (SELECT COUNT(*) FROM cad_camaras c WHERE c.integracion_id = i.id) AS total_camaras
FROM   cad_camara_integracion i
ORDER  BY i.nombre ASC";

            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            while (await rdr.ReadAsync(ct))
                result.Add(new DtoCamaraIntegracion
                {
                    Id                = rdr.GetInt64(0).ToString(),
                    Nombre            = rdr.IsDBNull(1) ? "" : rdr.GetString(1),
                    Descripcion       = rdr.IsDBNull(2) ? null : rdr.GetString(2),
                    Driver            = rdr.IsDBNull(3) ? "" : rdr.GetString(3),
                    BaseUrl           = rdr.IsDBNull(4) ? null : rdr.GetString(4),
                    Config            = DeserializeDict(rdr.IsDBNull(5) ? null : rdr.GetString(5)),
                    TieneSecreto      = !rdr.IsDBNull(6) && rdr.GetBoolean(6),
                    Activa            = !rdr.IsDBNull(7) && rdr.GetBoolean(7),
                    FechaCreacion     = rdr.IsDBNull(8) ? null : rdr.GetString(8),
                    FechaModificacion = rdr.IsDBNull(9) ? null : rdr.GetString(9),
                    TotalCamaras      = rdr.IsDBNull(10) ? 0 : (int)rdr.GetInt64(10)
                });
            return result;
        }

        public async Task<(bool, string, string?)> CreateAsync(
            DtoCamaraIntegracionRequest req, string usuario, CancellationToken ct)
        {
            var id = _snowflake.NextId();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
INSERT INTO cad_camara_integracion
    (id, nombre, descripcion, driver, base_url,
     config_publico, config_secreto, activa, usuario_crea, fecha_creacion)
VALUES
    (@id, @nombre, @descripcion, @driver, @baseUrl,
     @config::jsonb, @secreto::jsonb, @activa, @usuario, NOW())";
            cmd.Parameters.AddWithValue("id",          id);
            cmd.Parameters.AddWithValue("nombre",      req.Nombre.Trim());
            cmd.Parameters.AddWithValue("descripcion", (object?)req.Descripcion ?? DBNull.Value);
            cmd.Parameters.AddWithValue("driver",      req.Driver.Trim().ToUpperInvariant());
            cmd.Parameters.AddWithValue("baseUrl",     (object?)req.BaseUrl ?? DBNull.Value);
            cmd.Parameters.Add("config",  NpgsqlDbType.Text).Value = SerializeDict(req.Config);
            cmd.Parameters.Add("secreto", NpgsqlDbType.Text).Value = SerializeDict(req.Secretos);
            cmd.Parameters.AddWithValue("activa",      req.Activa);
            cmd.Parameters.AddWithValue("usuario",     (object?)usuario ?? DBNull.Value);

            await cmd.ExecuteNonQueryAsync(ct);
            return (true, "Integración de cámaras creada.", id.ToString());
        }

        public async Task<(bool, string)> UpdateAsync(
            long id, DtoCamaraIntegracionRequest req, string usuario, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);

            // Conservar los secretos anteriores cuando el request los envía vacíos:
            // se cargan los actuales y se sobreescriben solo los que llegan con valor.
            var secretosFinales = new Dictionary<string, string>();
            await using (var sel = conn.CreateCommand())
            {
                sel.CommandText = "SELECT config_secreto::text FROM cad_camara_integracion WHERE id=@id";
                sel.Parameters.AddWithValue("id", id);
                var actualJson = (string?)await sel.ExecuteScalarAsync(ct);
                secretosFinales = DeserializeDict(actualJson);
            }
            if (req.Secretos is not null)
                foreach (var kv in req.Secretos)
                    if (!string.IsNullOrWhiteSpace(kv.Value))
                        secretosFinales[kv.Key] = kv.Value;

            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
UPDATE cad_camara_integracion SET
    nombre             = @nombre,
    descripcion        = @descripcion,
    driver             = @driver,
    base_url           = @baseUrl,
    config_publico     = @config::jsonb,
    config_secreto     = @secreto::jsonb,
    activa             = @activa,
    usuario_modifica   = @usuario,
    fecha_modificacion = NOW()
WHERE id = @id";
            cmd.Parameters.AddWithValue("id",          id);
            cmd.Parameters.AddWithValue("nombre",      req.Nombre.Trim());
            cmd.Parameters.AddWithValue("descripcion", (object?)req.Descripcion ?? DBNull.Value);
            cmd.Parameters.AddWithValue("driver",      req.Driver.Trim().ToUpperInvariant());
            cmd.Parameters.AddWithValue("baseUrl",     (object?)req.BaseUrl ?? DBNull.Value);
            cmd.Parameters.Add("config",  NpgsqlDbType.Text).Value = SerializeDict(req.Config);
            cmd.Parameters.Add("secreto", NpgsqlDbType.Text).Value = SerializeDict(secretosFinales);
            cmd.Parameters.AddWithValue("activa",      req.Activa);
            cmd.Parameters.AddWithValue("usuario",     (object?)usuario ?? DBNull.Value);

            var n = await cmd.ExecuteNonQueryAsync(ct);
            return n > 0 ? (true, "Integración actualizada.") : (false, "Integración no encontrada.");
        }

        public async Task<(bool, string)> ToggleAsync(long id, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
UPDATE cad_camara_integracion
SET    activa = NOT activa, fecha_modificacion = NOW()
WHERE  id = @id";
            cmd.Parameters.AddWithValue("id", id);
            var n = await cmd.ExecuteNonQueryAsync(ct);
            return n > 0 ? (true, "Estado actualizado.") : (false, "Integración no encontrada.");
        }

        public async Task<(bool, string)> DeleteAsync(long id, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            // ON DELETE CASCADE limpia cad_camaras asociadas.
            cmd.CommandText = "DELETE FROM cad_camara_integracion WHERE id = @id";
            cmd.Parameters.AddWithValue("id", id);
            var n = await cmd.ExecuteNonQueryAsync(ct);
            return n > 0 ? (true, "Integración eliminada.") : (false, "Integración no encontrada.");
        }
    }
}
