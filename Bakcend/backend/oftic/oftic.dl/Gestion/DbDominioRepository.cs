using Comun.Dtos.Dominio;
using Datos.Interfaz;
using Datos.Tenant;
using Microsoft.Extensions.Logging;

namespace Datos.Gestion
{
    public class DbDominioRepository : IDbDominioRepository
    {
        private readonly TenantContext _tenant;
        private readonly ILogger<DbDominioRepository> _logger;

        public DbDominioRepository(TenantContext tenant, ILogger<DbDominioRepository> logger)
        {
            _tenant = tenant;
            _logger = logger;
        }

        public async Task<List<DtoDominio>> GetAllAsync(CancellationToken ct)
        {
            var result = new List<DtoDominio>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
SELECT id_dominio, descripcion, id_padre, abreviatura, observacion, vigente
FROM ctr_dominio
ORDER BY id_padre, descripcion";

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
                result.Add(MapDominio(reader));

            return result;
        }

        public async Task<DtoDominioResult> CreateAsync(DtoDominioRequest request, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        {
            var result = new DtoDominioResult();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx = await conn.BeginTransactionAsync(ct);

            try
            {
                await using var cmd = conn.CreateCommand();
                cmd.Transaction = tx;
                cmd.CommandText = @"
INSERT INTO ctr_dominio
    (descripcion, id_padre, abreviatura, observacion, vigente,
     usuario_creacion, fecha_creacion, maquina_creacion)
VALUES
    (@desc, @idPadre, @abrev, @obs, 1,
     @usuario, NOW(), @maquina)
RETURNING id_dominio";

                cmd.Parameters.AddWithValue("desc", Truncate(request.Descripcion, 100));
                cmd.Parameters.AddWithValue("idPadre", request.IdPadre);
                cmd.Parameters.AddWithValue("abrev", Truncate(request.Abreviatura, 100));
                cmd.Parameters.AddWithValue("obs", Truncate(request.Observacion, 100));
                cmd.Parameters.AddWithValue("usuario", usuarioAuditoria.ToString()[..Math.Min(usuarioAuditoria.ToString().Length, 50)]);
                cmd.Parameters.AddWithValue("maquina", Truncate(maquinaAuditoria ?? "N/A", 100));

                result.Id = Convert.ToInt64(await cmd.ExecuteScalarAsync(ct));
                result.Success = true;
                result.Message = "Dominio creado exitosamente.";

                await tx.CommitAsync(ct);
                _logger.LogInformation("Dominio creado con ID={Id}", result.Id);
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync(ct);
                result.Success = false;
                result.Message = $"Error: {ex.Message}";
                _logger.LogError(ex, "Error creando dominio");
            }

            return result;
        }

        public async Task<DtoDominioResult> UpdateAsync(long id, DtoDominioRequest request, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        {
            var result = new DtoDominioResult();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx = await conn.BeginTransactionAsync(ct);

            try
            {
                await using var cmd = conn.CreateCommand();
                cmd.Transaction = tx;
                cmd.CommandText = @"
UPDATE ctr_dominio
   SET descripcion      = @desc,
       id_padre         = @idPadre,
       vigente          = @vigente,
       abreviatura      = @abrev,
       observacion      = @obs,
       usuario_modifica = @usuario,
       fecha_modifica   = NOW(),
       maquina_modifica = @maquina
 WHERE id_dominio = @id";

                cmd.Parameters.AddWithValue("desc", Truncate(request.Descripcion, 100));
                cmd.Parameters.AddWithValue("idPadre", request.IdPadre);
                cmd.Parameters.AddWithValue("vigente", request.Vigente);
                cmd.Parameters.AddWithValue("abrev", Truncate(request.Abreviatura, 100));
                cmd.Parameters.AddWithValue("obs", Truncate(request.Observacion, 100));
                cmd.Parameters.AddWithValue("usuario", Truncate(usuarioAuditoria.ToString(), 50));
                cmd.Parameters.AddWithValue("maquina", Truncate(maquinaAuditoria ?? "N/A", 100));
                cmd.Parameters.AddWithValue("id", id);

                var rows = await cmd.ExecuteNonQueryAsync(ct);
                result.Success = rows > 0;
                result.Message = rows > 0 ? "Dominio actualizado." : "Dominio no encontrado.";
                result.Id = id;

                if (result.Success)
                    await tx.CommitAsync(ct);
                else
                    await tx.RollbackAsync(ct);
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync(ct);
                result.Success = false;
                result.Message = $"Error: {ex.Message}";
                _logger.LogError(ex, "Error actualizando dominio id={Id}", id);
            }

            return result;
        }

        public async Task<DtoDominioResult> DeletelogicalAsync(long id, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        {
            var result = new DtoDominioResult();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx = await conn.BeginTransactionAsync(ct);

            try
            {
                await using var cmd = conn.CreateCommand();
                cmd.Transaction = tx;
                cmd.CommandText = @"
UPDATE ctr_dominio
   SET vigente          = 0,
       usuario_modifica = @usuario,
       fecha_modifica   = NOW(),
       maquina_modifica = @maquina
 WHERE id_dominio = @id";

                cmd.Parameters.AddWithValue("usuario", Truncate(usuarioAuditoria.ToString(), 50));
                cmd.Parameters.AddWithValue("maquina", Truncate(maquinaAuditoria ?? "N/A", 100));
                cmd.Parameters.AddWithValue("id", id);

                var rows = await cmd.ExecuteNonQueryAsync(ct);
                result.Success = rows > 0;
                result.Message = rows > 0 ? "Dominio eliminado lógicamente." : "Dominio no encontrado.";

                if (result.Success)
                    await tx.CommitAsync(ct);
                else
                    await tx.RollbackAsync(ct);
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync(ct);
                result.Success = false;
                result.Message = $"Error: {ex.Message}";
            }

            return result;
        }

        private static string Truncate(string? value, int maxLen)
        {
            var s = (value ?? string.Empty).Trim();
            return s.Length > maxLen ? s[..maxLen] : s;
        }

        private static DtoDominio MapDominio(Npgsql.NpgsqlDataReader reader) => new()
        {
            IdDominio = reader.IsDBNull(0) ? 0 : reader.GetInt64(0),
            Descripcion = reader.IsDBNull(1) ? string.Empty : reader.GetString(1),
            IdPadre = reader.GetInt64(2),
            Abreviatura = reader.IsDBNull(3) ? string.Empty : reader.GetString(3),
            Observacion = reader.IsDBNull(4) ? string.Empty : reader.GetString(4),
            Vigente = reader.IsDBNull(5) ? 1 : reader.GetInt32(5)
        };
    }
}
