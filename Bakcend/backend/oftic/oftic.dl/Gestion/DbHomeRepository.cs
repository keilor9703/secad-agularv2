using Comun.Dtos.Home;
using Datos.Interfaz;
using Datos.Tenant;
using Npgsql;

namespace Datos.Gestion
{
    public class DbHomeRepository : IDbHomeRepository
    {
        private readonly TenantContext _tenant;

        public DbHomeRepository(TenantContext tenant)
        {
            _tenant = tenant;
        }

        public async Task<DtoHomeStats> GetStatsAsync(CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);

            return new DtoHomeStats
            {
                usuariosActivos = await CountAsync(conn, @"
SELECT COUNT(1) FROM ctr_usuarios WHERE COALESCE(bloqueado, 0) = 0", ct),

                reportesGenerados = await CountAsync(conn, @"
SELECT COUNT(1) FROM ctr_auditoria
WHERE fecha_creacion >= DATE_TRUNC('month', NOW())", ct),

                alertasSistema = await CountAsync(conn, @"
SELECT COUNT(1) FROM ctr_roles_user_admin
WHERE COALESCE(vigente, 0) = 1
  AND fecha_fin IS NOT NULL
  AND fecha_fin <= CURRENT_DATE + 7", ct)
            };
        }

        private static async Task<int> CountAsync(NpgsqlConnection conn, string sql, CancellationToken ct)
        {
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = sql;
            var value = await cmd.ExecuteScalarAsync(ct);
            return value is null || value == DBNull.Value ? 0 : Convert.ToInt32(value);
        }
    }
}
