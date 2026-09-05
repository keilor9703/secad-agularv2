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
                // Los roles que se firman en el JWT —y de los que salen es_admin y
                // es_super_admin— deben ser los MISMOS que decide el menú lateral
                // (DbMenuRepository) y los que muestra la pantalla de roles. Antes
                // esto leía la tabla plana a secas: sin vigencia y sin fecha de
                // vencimiento. Un rol retirado o vencido seguía viajando en el
                // token, así que el usuario conservaba el acceso real aunque las
                // dos pantallas dijeran lo contrario.
                //
                // Manda ctr_roles_user_admin, que es donde vive la vigencia. La
                // tabla plana solo se usa como respaldo para usuarios que no
                // tienen NINGUNA fila en el histórico (datos heredados o sembrados
                // por migración) — el mismo criterio de respaldo que aplica la
                // pantalla de roles, para que las tres vistas coincidan.
                cmd.CommandText = @"
SELECT DISTINCT rua.id_rol
FROM   ctr_roles_user_admin rua
WHERE  rua.id_usuario = @pIdUsuario
  AND  COALESCE(rua.vigente, 0) = 1
  AND  (rua.fecha_fin IS NULL OR rua.fecha_fin >= CURRENT_DATE)
UNION
SELECT DISTINCT ru.id_rol
FROM   ctr_roles_user ru
WHERE  ru.id_usuario = @pIdUsuario
  AND  NOT EXISTS (SELECT 1 FROM ctr_roles_user_admin a
                   WHERE a.id_usuario = ru.id_usuario)";
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
