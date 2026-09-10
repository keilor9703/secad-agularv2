using Comun.Dtos.Camaras;
using Comun.Security;
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
        private readonly ICifradoSecretos                         _cifrado;
        private readonly ILogger<DbCamaraIntegracionRepository>   _logger;

        public DbCamaraIntegracionRepository(
            TenantContext tenant,
            ISnowflakeGenerator snowflake,
            ICifradoSecretos cifrado,
            ILogger<DbCamaraIntegracionRepository> logger)
        {
            _tenant    = tenant;
            _snowflake = snowflake;
            _cifrado   = cifrado;
            _logger    = logger;
        }

        /// <summary>
        /// Los secretos del driver (AppSecret, contraseñas) van cifrados en
        /// config_secreto_cifrado desde V75. La columna JSONB config_secreto
        /// queda como respaldo de lo que ya estaba escrito en claro; se lee de
        /// ahí mientras exista y se reescribe cifrado en el primer guardado.
        /// </summary>
        private async Task<Dictionary<string, string>> LeerSecretosAsync(
            NpgsqlConnection conn, long id, CancellationToken ct)
        {
            await using var sel = conn.CreateCommand();
            // to_jsonb(i) ->> …: la columna la añade V75 y el despliegue levanta
            // la API antes de correr el SQL.
            sel.CommandText = @"
SELECT to_jsonb(i) ->> 'config_secreto_cifrado', i.config_secreto::text
FROM   cad_camara_integracion i
WHERE  i.id = @id";
            sel.Parameters.AddWithValue("id", id);
            await using var r = await sel.ExecuteReaderAsync(ct);
            if (!await r.ReadAsync(ct)) return new();

            var cifrado = r.IsDBNull(0) ? null : r.GetString(0);
            if (!string.IsNullOrWhiteSpace(cifrado))
                return DeserializeDict(_cifrado.Descifrar(cifrado));

            return DeserializeDict(r.IsDBNull(1) ? null : r.GetString(1));
        }

        /// <summary>¿Ya corrió V75 en esta base?</summary>
        private static async Task<bool> TieneColumnaCifradaAsync(
            NpgsqlConnection conn, CancellationToken ct)
        {
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
SELECT 1 FROM information_schema.columns
WHERE  table_name = 'cad_camara_integracion'
  AND  column_name = 'config_secreto_cifrado'";
            return await cmd.ExecuteScalarAsync(ct) is not null;
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
       (   (i.config_secreto IS NOT NULL AND i.config_secreto::text <> '{}')
        OR COALESCE(to_jsonb(i) ->> 'config_secreto_cifrado', '') <> '' ) AS tiene_secreto,
       i.activa,
       TO_CHAR(i.fecha_creacion     AT TIME ZONE 'America/Bogota','YYYY-MM-DD""T""HH24:MI:SS'),
       TO_CHAR(i.fecha_modificacion AT TIME ZONE 'America/Bogota','YYYY-MM-DD""T""HH24:MI:SS'),
       (SELECT COUNT(*) FROM cad_camaras c WHERE c.integracion_id = i.id) AS total_camaras,
       to_jsonb(i) ->> 'nodo_edge_url' AS nodo_edge_url
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
                    TotalCamaras      = rdr.IsDBNull(10) ? 0 : (int)rdr.GetInt64(10),
                    NodoEdgeUrl       = rdr.IsDBNull(11) ? null : rdr.GetString(11)
                });
            return result;
        }

        public async Task<(bool, string, string?)> CreateAsync(
            DtoCamaraIntegracionRequest req, string usuario, CancellationToken ct)
        {
            var id = _snowflake.NextId();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            var cifra = await TieneColumnaCifradaAsync(conn, ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = $@"
INSERT INTO cad_camara_integracion
    (id, nombre, descripcion, driver, base_url,
     config_publico, config_secreto, activa, usuario_crea, fecha_creacion
     {(cifra ? ", config_secreto_cifrado, nodo_edge_url" : "")})
VALUES
    (@id, @nombre, @descripcion, @driver, @baseUrl,
     @config::jsonb, @secreto::jsonb, @activa, @usuario, NOW()
     {(cifra ? ", @secretoCif, @edge" : "")})";
            if (cifra)
            {
                cmd.Parameters.AddWithValue("secretoCif",
                    (object?)_cifrado.Cifrar(SerializeDict(req.Secretos)) ?? DBNull.Value);
                cmd.Parameters.AddWithValue("edge", (object?)req.NodoEdgeUrl ?? DBNull.Value);
            }
            cmd.Parameters.AddWithValue("id",          id);
            cmd.Parameters.AddWithValue("nombre",      req.Nombre.Trim());
            cmd.Parameters.AddWithValue("descripcion", (object?)req.Descripcion ?? DBNull.Value);
            cmd.Parameters.AddWithValue("driver",      req.Driver.Trim().ToUpperInvariant());
            cmd.Parameters.AddWithValue("baseUrl",     (object?)req.BaseUrl ?? DBNull.Value);
            cmd.Parameters.Add("config",  NpgsqlDbType.Text).Value = SerializeDict(req.Config);
            // Con la columna cifrada disponible, el JSONB en claro se deja vacío:
            // el secreto no puede quedar legible en dos sitios.
            cmd.Parameters.Add("secreto", NpgsqlDbType.Text).Value =
                cifra ? "{}" : SerializeDict(req.Secretos);
            cmd.Parameters.AddWithValue("activa",      req.Activa);
            cmd.Parameters.AddWithValue("usuario",     (object?)usuario ?? DBNull.Value);

            await cmd.ExecuteNonQueryAsync(ct);
            return (true, "Integración de cámaras creada.", id.ToString());
        }

        public async Task<(bool, string)> UpdateAsync(
            long id, DtoCamaraIntegracionRequest req, string usuario, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            var cifra = await TieneColumnaCifradaAsync(conn, ct);

            // Conservar los secretos anteriores cuando el request los envía vacíos:
            // se cargan los actuales y se sobreescriben solo los que llegan con valor.
            var secretosFinales = await LeerSecretosAsync(conn, id, ct);
            if (req.Secretos is not null)
                foreach (var kv in req.Secretos)
                    if (!string.IsNullOrWhiteSpace(kv.Value))
                        secretosFinales[kv.Key] = kv.Value;

            await using var cmd = conn.CreateCommand();
            cmd.CommandText = $@"
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
    {(cifra ? ", config_secreto_cifrado = @secretoCif, nodo_edge_url = @edge" : "")}
WHERE id = @id";
            if (cifra)
            {
                // Guardar aquí es también lo que MIGRA una fila que venía en
                // claro: se leyó del JSONB y se reescribe cifrada, vaciando el
                // original en el mismo UPDATE.
                cmd.Parameters.AddWithValue("secretoCif",
                    (object?)_cifrado.Cifrar(SerializeDict(secretosFinales)) ?? DBNull.Value);
                cmd.Parameters.AddWithValue("edge", (object?)req.NodoEdgeUrl ?? DBNull.Value);
            }
            cmd.Parameters.AddWithValue("id",          id);
            cmd.Parameters.AddWithValue("nombre",      req.Nombre.Trim());
            cmd.Parameters.AddWithValue("descripcion", (object?)req.Descripcion ?? DBNull.Value);
            cmd.Parameters.AddWithValue("driver",      req.Driver.Trim().ToUpperInvariant());
            cmd.Parameters.AddWithValue("baseUrl",     (object?)req.BaseUrl ?? DBNull.Value);
            cmd.Parameters.Add("config",  NpgsqlDbType.Text).Value = SerializeDict(req.Config);
            cmd.Parameters.Add("secreto", NpgsqlDbType.Text).Value =
                cifra ? "{}" : SerializeDict(secretosFinales);
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
            // Desde V76 la FK es ON DELETE SET NULL: las cámaras del censo
            // sobreviven a la baja del VMS, solo pierden el enlace.
            cmd.CommandText = "DELETE FROM cad_camara_integracion WHERE id = @id";
            cmd.Parameters.AddWithValue("id", id);
            var n = await cmd.ExecuteNonQueryAsync(ct);
            return n > 0 ? (true, "Integración eliminada.") : (false, "Integración no encontrada.");
        }
    }
}
