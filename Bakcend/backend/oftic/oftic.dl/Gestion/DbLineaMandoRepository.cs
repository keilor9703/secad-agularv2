using Comun.Dtos.LineasMando;
using Datos.Interfaz;
using Datos.Tenant;
using Microsoft.Extensions.Logging;

namespace Datos.Gestion
{
    public class DbLineaMandoRepository : IDbLineaMandoRepository
    {
        private readonly TenantContext _tenant;
        private readonly ILogger<DbLineaMandoRepository> _logger;

        public DbLineaMandoRepository(TenantContext tenant, ILogger<DbLineaMandoRepository> logger)
        {
            _tenant = tenant;
            _logger = logger;
        }

        public async Task<List<DtoLineaMando>> GetAllAsync(CancellationToken ct)
        {
            var result = new List<DtoLineaMando>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
SELECT id_linea_mando, identificacion, nombre, apellidos, grado, cargo,
       peso, unidad, foto_base64, orden, vigente
FROM ctr_linea_mando
ORDER BY orden, id_linea_mando";

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
                result.Add(MapLineaMando(reader));

            return result;
        }

        public async Task<DtoLineaMando?> GetByIdAsync(long id, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
SELECT id_linea_mando, identificacion, nombre, apellidos, grado, cargo,
       peso, unidad, foto_base64, orden, vigente
FROM ctr_linea_mando
WHERE id_linea_mando = @id";
            cmd.Parameters.AddWithValue("id", id);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            if (await reader.ReadAsync(ct))
                return MapLineaMando(reader);

            return null;
        }

        public async Task<DtoLineaMando?> GetByIdentificacionAsync(string identificacion, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
SELECT id_linea_mando, identificacion, nombre, apellidos, grado, cargo,
       peso, unidad, foto_base64, orden, vigente
FROM ctr_linea_mando
WHERE identificacion = @identificacion
LIMIT 1";
            cmd.Parameters.AddWithValue("identificacion", identificacion);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            if (await reader.ReadAsync(ct))
                return MapLineaMando(reader);

            return null;
        }

        public async Task<DtoLineaMandoResult> CreateAsync(DtoLineaMandoRequest request, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        {
            var result = new DtoLineaMandoResult();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx = await conn.BeginTransactionAsync(ct);

            try
            {
                await using var cmd = conn.CreateCommand();
                cmd.Transaction = tx;
                cmd.CommandText = @"
INSERT INTO ctr_linea_mando
    (identificacion, nombre, apellidos, grado, cargo, peso, unidad, foto_base64, orden,
     vigente, usuario_creacion, fecha_creacion, maquina_creacion)
VALUES
    (@ident, @nombre, @apell, @grado, @cargo, @peso, @unidad, @foto, @orden,
     1, @usuario, NOW(), @maquina)
RETURNING id_linea_mando";

                BindRequest(cmd, request, usuarioAuditoria, maquinaAuditoria);
                result.Id = Convert.ToInt64(await cmd.ExecuteScalarAsync(ct));
                result.Success = true;
                result.Message = "Línea de mando creada exitosamente.";

                await tx.CommitAsync(ct);
                _logger.LogInformation("Línea de mando creada ID={Id}", result.Id);
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync(ct);
                result.Success = false;
                result.Message = $"Error: {ex.Message}";
                _logger.LogError(ex, "Error creando línea de mando");
            }

            return result;
        }

        public async Task<DtoLineaMandoResult> UpdateAsync(long id, DtoLineaMandoRequest request, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        {
            var result = new DtoLineaMandoResult();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx = await conn.BeginTransactionAsync(ct);

            try
            {
                await using var cmd = conn.CreateCommand();
                cmd.Transaction = tx;
                cmd.CommandText = @"
UPDATE ctr_linea_mando
   SET identificacion   = @ident,
       nombre           = @nombre,
       apellidos        = @apell,
       grado            = @grado,
       cargo            = @cargo,
       peso             = @peso,
       unidad           = @unidad,
       foto_base64      = @foto,
       orden            = @orden,
       usuario_modifica = @usuario,
       fecha_modifica   = NOW(),
       maquina_modifica = @maquina
 WHERE id_linea_mando = @id";

                BindRequest(cmd, request, usuarioAuditoria, maquinaAuditoria);
                cmd.Parameters.AddWithValue("id", id);

                var rows = await cmd.ExecuteNonQueryAsync(ct);
                result.Success = rows > 0;
                result.Message = rows > 0 ? "Línea de mando actualizada." : "Registro no encontrado.";
                result.Id = id;

                if (result.Success) await tx.CommitAsync(ct);
                else await tx.RollbackAsync(ct);
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync(ct);
                result.Success = false;
                result.Message = $"Error: {ex.Message}";
                _logger.LogError(ex, "Error actualizando línea de mando id={Id}", id);
            }

            return result;
        }

        public async Task<DtoLineaMandoResult> DeleteAsync(long id, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        {
            var result = new DtoLineaMandoResult();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx = await conn.BeginTransactionAsync(ct);

            try
            {
                await using var cmd = conn.CreateCommand();
                cmd.Transaction = tx;
                cmd.CommandText = @"
DELETE FROM ctr_linea_mando WHERE id_linea_mando = @id";
                cmd.Parameters.AddWithValue("id", id);

                var rows = await cmd.ExecuteNonQueryAsync(ct);
                result.Success = rows > 0;
                result.Message = rows > 0 ? "Línea de mando eliminada." : "Registro no encontrado.";

                if (result.Success) await tx.CommitAsync(ct);
                else await tx.RollbackAsync(ct);
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync(ct);
                result.Success = false;
                result.Message = $"Error: {ex.Message}";
            }

            return result;
        }

        public async Task<DtoLineaMandoResult> SetVigenteAsync(long id, int vigente, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        {
            var result = new DtoLineaMandoResult();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx = await conn.BeginTransactionAsync(ct);

            try
            {
                await using var cmd = conn.CreateCommand();
                cmd.Transaction = tx;
                cmd.CommandText = @"
UPDATE ctr_linea_mando
   SET vigente          = @vigente,
       usuario_modifica = @usuario,
       fecha_modifica   = NOW(),
       maquina_modifica = @maquina
 WHERE id_linea_mando = @id";

                cmd.Parameters.AddWithValue("vigente", vigente);
                cmd.Parameters.AddWithValue("usuario", usuarioAuditoria.ToString());
                cmd.Parameters.AddWithValue("maquina", maquinaAuditoria ?? "N/A");
                cmd.Parameters.AddWithValue("id", id);

                var rows = await cmd.ExecuteNonQueryAsync(ct);
                result.Success = rows > 0;
                result.Message = rows > 0
                    ? (vigente == 1 ? "Activado correctamente." : "Inactivado correctamente.")
                    : "Registro no encontrado.";

                if (result.Success) await tx.CommitAsync(ct);
                else await tx.RollbackAsync(ct);
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync(ct);
                result.Success = false;
                result.Message = $"Error: {ex.Message}";
                _logger.LogError(ex, "Error actualizando vigente id={Id}", id);
            }

            return result;
        }

        private static void BindRequest(Npgsql.NpgsqlCommand cmd, DtoLineaMandoRequest r, long usuario, string maquina)
        {
            cmd.Parameters.AddWithValue("ident", Truncate(r.Identificacion, 20));
            cmd.Parameters.AddWithValue("nombre", Truncate(r.Nombre, 100));
            cmd.Parameters.AddWithValue("apell", Truncate(r.Apellidos, 100));
            cmd.Parameters.AddWithValue("grado", Truncate(r.Grado, 50));
            cmd.Parameters.AddWithValue("cargo", Truncate(r.Cargo, 100));
            cmd.Parameters.AddWithValue("peso", Truncate(r.Peso, 10));
            cmd.Parameters.AddWithValue("unidad", Truncate(r.Unidad, 200));
            cmd.Parameters.AddWithValue("foto", (object?)NormalizeBase64(r.FotoBase64) ?? DBNull.Value);
            cmd.Parameters.AddWithValue("orden", r.Orden);
            cmd.Parameters.AddWithValue("usuario", Truncate(usuario.ToString(), 50));
            cmd.Parameters.AddWithValue("maquina", Truncate(maquina ?? "N/A", 100));
        }

        private static string Truncate(string? value, int max)
        {
            var s = (value ?? string.Empty).Trim();
            return s.Length > max ? s[..max] : s;
        }

        private static string? NormalizeBase64(string? raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return null;
            var v = raw.Trim();
            var comma = v.IndexOf(',');
            if (v.StartsWith("data:", StringComparison.OrdinalIgnoreCase) && comma > -1)
                v = v[(comma + 1)..];
            return v;
        }

        private static DtoLineaMando MapLineaMando(Npgsql.NpgsqlDataReader r) => new()
        {
            IdLineaMando = r.GetInt64(0),
            Identificacion = r.IsDBNull(1) ? string.Empty : r.GetString(1),
            Nombre = r.IsDBNull(2) ? string.Empty : r.GetString(2),
            Apellidos = r.IsDBNull(3) ? string.Empty : r.GetString(3),
            Grado = r.IsDBNull(4) ? string.Empty : r.GetString(4),
            Cargo = r.IsDBNull(5) ? string.Empty : r.GetString(5),
            Peso = r.IsDBNull(6) ? string.Empty : r.GetString(6),
            Unidad = r.IsDBNull(7) ? string.Empty : r.GetString(7),
            FotoBase64 = r.IsDBNull(8) ? null : r.GetString(8),
            Orden = r.IsDBNull(9) ? 1 : r.GetInt32(9),
            Vigente = r.IsDBNull(10) ? 1 : r.GetInt32(10)
        };
    }
}
