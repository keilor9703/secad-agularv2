using Datos.Interfaz;
using Datos.Tenant;

namespace Datos.Gestion
{
    public class DbConfigSmsRepository : IDbConfigSmsRepository
    {
        private readonly TenantContext _tenant;

        public DbConfigSmsRepository(TenantContext tenant) => _tenant = tenant;

        public async Task<ConfigSmsRegistro> GetAsync(CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = """
                SELECT proveedor, base_url, api_key, sender, usuario_modifica, fecha_modifica
                FROM   ctr_config_sms
                WHERE  id = 1
                """;
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            if (!await reader.ReadAsync(ct))
                return new ConfigSmsRegistro(); // no debería pasar — la migración V51 siembra la fila

            return new ConfigSmsRegistro
            {
                Proveedor       = reader.GetString(0),
                BaseUrl         = reader.IsDBNull(1) ? null : reader.GetString(1),
                ApiKey          = reader.IsDBNull(2) ? null : reader.GetString(2),
                Sender          = reader.IsDBNull(3) ? null : reader.GetString(3),
                UsuarioModifica = reader.IsDBNull(4) ? null : reader.GetString(4),
                FechaModifica   = reader.IsDBNull(5) ? null : reader.GetDateTime(5)
            };
        }

        public async Task GuardarAsync(ConfigSmsRegistro registro, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = """
                UPDATE ctr_config_sms
                SET    proveedor        = @proveedor,
                       base_url         = @baseUrl,
                       api_key          = @apiKey,
                       sender           = @sender,
                       usuario_modifica = @usuario,
                       fecha_modifica   = NOW()
                WHERE  id = 1
                """;
            cmd.Parameters.AddWithValue("@proveedor", registro.Proveedor);
            cmd.Parameters.AddWithValue("@baseUrl",   (object?)registro.BaseUrl ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@apiKey",    (object?)registro.ApiKey ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@sender",    (object?)registro.Sender ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@usuario",   (object?)registro.UsuarioModifica ?? DBNull.Value);
            await cmd.ExecuteNonQueryAsync(ct);
        }
    }
}
