using Datos.Interfaz;
using Datos.Tenant;
using Microsoft.Extensions.Logging;

namespace Datos.Gestion
{
    public class DbAuthRepository : IDbAuthRepository
    {
        private readonly TenantContext _tenant;
        private readonly ILogger<DbAuthRepository> _logger;

        public DbAuthRepository(TenantContext tenant, ILogger<DbAuthRepository> logger)
        {
            _tenant = tenant;
            _logger = logger;
        }

        public async Task<(long? idUsuario, string identificacion, List<long> roles, int sitioGraba, int acd, int fuerzaId, int canalCodigo)> GetUsuarioYRolesAsync(string usuario, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);

            _logger.LogInformation("Buscando usuario: {Usuario}", usuario);

            long?  idUsuario      = null;
            string identificacion = "";   // cédula / identificación del empleado
            int    sitioGraba     = 0;
            int    acd            = 0;
            int    fuerzaId       = 0;
            int    canalCodigo    = 0;

            await using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"
SELECT id_usuario,
       COALESCE(identificacion, '')     AS identificacion,
       COALESCE(sitio_grabacion, 0)    AS sitio_grabacion,
       COALESCE(acd, 0)                AS acd,
       COALESCE(cadcana_fuerza_id, 0)  AS cadcana_fuerza_id,
       COALESCE(cadcana_codigo, 0)     AS cadcana_codigo
FROM ctr_usuarios
WHERE UPPER(username) = UPPER(@pUsuario) AND bloqueado = 0
LIMIT 1";
                cmd.Parameters.AddWithValue("pUsuario", usuario);

                await using var rdr = await cmd.ExecuteReaderAsync(ct);
                if (await rdr.ReadAsync(ct))
                {
                    idUsuario      = rdr.IsDBNull(0) ? null : (long?)Convert.ToInt64(rdr.GetValue(0));
                    identificacion = rdr.IsDBNull(1) ? "" : rdr.GetString(1);
                    sitioGraba     = rdr.IsDBNull(2) ? 0 : rdr.GetInt32(2);
                    acd            = rdr.IsDBNull(3) ? 0 : rdr.GetInt32(3);
                    fuerzaId       = rdr.IsDBNull(4) ? 0 : rdr.GetInt32(4);
                    canalCodigo    = rdr.IsDBNull(5) ? 0 : rdr.GetInt32(5);
                }
            }

            if (idUsuario is null)
            {
                _logger.LogWarning("Usuario no encontrado o bloqueado: {Usuario}", usuario);
                return (null, "", new List<long>(), 0, 0, 0, 0);
            }

            _logger.LogInformation("Usuario encontrado con ID: {IdUsuario}, identificacion: {Ident}",
                idUsuario, string.IsNullOrEmpty(identificacion) ? "(vacía)" : "OK");

            var roles = new List<long>();

            await using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"
SELECT DISTINCT id_rol
FROM ctr_roles_user
WHERE id_usuario = @pIdUsuario";
                cmd.Parameters.AddWithValue("pIdUsuario", idUsuario.Value);

                await using var reader = await cmd.ExecuteReaderAsync(ct);
                while (await reader.ReadAsync(ct))
                    roles.Add(reader.GetInt64(0));
            }

            _logger.LogInformation("Roles encontrados: {Count}", roles.Count);
            return (idUsuario.Value, identificacion, roles, sitioGraba, acd, fuerzaId, canalCodigo);
        }
    }
}
