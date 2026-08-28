using Comun.Dtos.Videos;
using Datos.Interfaz;
using Datos.Tenant;
using Microsoft.Extensions.Logging;

namespace Datos.Gestion
{
    public class DbVideoRepository : IDbVideoRepository
    {
        private readonly TenantContext _tenant;
        private readonly ILogger<DbVideoRepository> _logger;

        public DbVideoRepository(TenantContext tenant, ILogger<DbVideoRepository> logger)
        {
            _tenant = tenant;
            _logger = logger;
        }

        public async Task<List<DtoVideo>> GetAllAsync(CancellationToken ct)
        {
            var result = new List<DtoVideo>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
SELECT id_video, descripcion, observaciones, ruta_video, fecha_creacion,
       usuario_creacion, vigente, fecha_modifica, usuario_modifica, maquina_modifica
FROM ctr_video
ORDER BY fecha_creacion DESC";

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
                result.Add(MapVideo(reader));

            return result;
        }

        public async Task<DtoVideo?> GetByIdAsync(long id, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
SELECT id_video, descripcion, observaciones, ruta_video, fecha_creacion,
       usuario_creacion, vigente, fecha_modifica, usuario_modifica, maquina_modifica
FROM ctr_video
WHERE id_video = @id";
            cmd.Parameters.AddWithValue("id", id);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            if (await reader.ReadAsync(ct))
                return MapVideo(reader);

            return null;
        }

        public async Task<DtoVideoResult> CreateAsync(DtoVideoRequest request, string usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        {
            var result = new DtoVideoResult();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);

            try
            {
                await using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
INSERT INTO ctr_video (descripcion, observaciones, usuario_creacion, ruta_video, fecha_creacion, vigente)
VALUES (@desc, @obs, @usuario, @ruta, NOW(), 1)
RETURNING id_video";

                cmd.Parameters.AddWithValue("desc", request.Descripcion ?? string.Empty);
                cmd.Parameters.AddWithValue("obs", (object?)request.Observaciones ?? DBNull.Value);
                cmd.Parameters.AddWithValue("usuario", usuarioAuditoria);
                cmd.Parameters.AddWithValue("ruta", (object?)request.RutaVideo ?? DBNull.Value);

                var newId = Convert.ToInt64(await cmd.ExecuteScalarAsync(ct));
                result.Success = true;
                result.Message = $"Video creado exitosamente. ID={newId}";
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = $"Error: {ex.Message}";
                _logger.LogError(ex, "Error creando video");
            }

            return result;
        }

        public async Task<DtoVideoResult> UpdateAsync(long id, DtoVideoRequest request, string usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        {
            var result = new DtoVideoResult();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);

            try
            {
                await using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
UPDATE ctr_video
   SET descripcion      = @desc,
       observaciones    = @obs,
       usuario_modifica = @usuario,
       maquina_modifica = @maquina,
       ruta_video       = @ruta,
       vigente          = @vigente,
       fecha_modifica   = NOW()
 WHERE id_video = @id";

                cmd.Parameters.AddWithValue("desc", request.Descripcion ?? string.Empty);
                cmd.Parameters.AddWithValue("obs", (object?)request.Observaciones ?? DBNull.Value);
                cmd.Parameters.AddWithValue("usuario", usuarioAuditoria);
                cmd.Parameters.AddWithValue("maquina", maquinaAuditoria ?? "N/A");
                cmd.Parameters.AddWithValue("ruta", (object?)request.RutaVideo ?? DBNull.Value);
                cmd.Parameters.AddWithValue("vigente", request.Vigente);
                cmd.Parameters.AddWithValue("id", id);

                var rows = await cmd.ExecuteNonQueryAsync(ct);
                result.Success = rows > 0;
                result.Message = rows > 0 ? "Video actualizado exitosamente." : "Video no encontrado.";
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = $"Error: {ex.Message}";
                _logger.LogError(ex, "Error actualizando video id={Id}", id);
            }

            return result;
        }

        public async Task<DtoVideoResult> DeleteAsync(long id, string usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        {
            var result = new DtoVideoResult();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);

            try
            {
                await using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
UPDATE ctr_video
   SET vigente          = 0,
       usuario_modifica = @usuario,
       fecha_modifica   = NOW()
 WHERE id_video = @id";

                cmd.Parameters.AddWithValue("usuario", usuarioAuditoria);
                cmd.Parameters.AddWithValue("id", id);

                var rows = await cmd.ExecuteNonQueryAsync(ct);
                result.Success = rows > 0;
                result.Message = rows > 0 ? "Video eliminado exitosamente." : "Video no encontrado.";
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = $"Error: {ex.Message}";
                _logger.LogError(ex, "Error eliminando video id={Id}", id);
            }

            return result;
        }

        private static DtoVideo MapVideo(Npgsql.NpgsqlDataReader reader) => new()
        {
            IdVideo = reader.GetInt64(0),
            Descripcion = reader.GetString(1),
            Observaciones = reader.IsDBNull(2) ? null : reader.GetString(2),
            RutaVideo = reader.IsDBNull(3) ? null : reader.GetString(3),
            FechaCreacion = reader.GetDateTime(4),
            UsuarioCreacion = reader.GetString(5),
            Vigente = reader.GetInt64(6),
            FechaModifica = reader.IsDBNull(7) ? null : reader.GetDateTime(7),
            UsuarioModifica = reader.IsDBNull(8) ? null : reader.GetString(8),
            MaquinaModifica = reader.IsDBNull(9) ? null : reader.GetString(9)
        };
    }
}
