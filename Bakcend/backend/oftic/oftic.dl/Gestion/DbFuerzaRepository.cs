using Comun.Dtos.Entidades;
using Datos.Interfaz;
using Datos.Tenant;
using Microsoft.Extensions.Logging;

namespace Datos.Gestion
{
    public class DbFuerzaRepository : IDbFuerzaRepository
    {
        private readonly TenantContext _tenant;
        private readonly ILogger<DbFuerzaRepository> _logger;

        public DbFuerzaRepository(TenantContext tenant, ILogger<DbFuerzaRepository> logger)
        {
            _tenant = tenant;
            _logger = logger;
        }

        // ── Fuerzas ──────────────────────────────────────────────────────────

        public async Task<List<DtoFuerza>> GetFuerzasAsync(int sitioGraba, CancellationToken ct)
        {
            var result = new List<DtoFuerza>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            // sitioGraba = 0  → admin sin estación asignada: devuelve TODAS las fuerzas del tenant
            // sitioGraba > 0  → filtra por la estación específica
            cmd.CommandText = @"
SELECT f.id,
       f.sitio_graba,
       f.descripcion,
       f.abreviatura,
       f.vigente,
       COUNT(DISTINCT c.codigo)       AS total_canales,
       COUNT(DISTINCT u.id_usuario)   AS total_usuarios
FROM cad_fuerzas f
LEFT JOIN cad_canales  c ON c.cadfuerz_id = f.id
LEFT JOIN ctr_usuarios u ON u.cadcana_fuerza_id = f.id
WHERE (@sitioGraba = 0 OR f.sitio_graba = @sitioGraba)
GROUP BY f.id, f.sitio_graba, f.descripcion, f.abreviatura, f.vigente
ORDER BY f.descripcion";
            cmd.Parameters.AddWithValue("sitioGraba", sitioGraba);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
                result.Add(MapFuerza(reader));

            return result;
        }

        public async Task<DtoFuerza?> GetFuerzaAsync(int id, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
SELECT f.id, f.sitio_graba, f.descripcion, f.abreviatura, f.vigente,
       COUNT(DISTINCT c.codigo)     AS total_canales,
       COUNT(DISTINCT u.id_usuario) AS total_usuarios
FROM cad_fuerzas f
LEFT JOIN cad_canales  c ON c.cadfuerz_id = f.id
LEFT JOIN ctr_usuarios u ON u.cadcana_fuerza_id = f.id
WHERE f.id = @id
GROUP BY f.id, f.sitio_graba, f.descripcion, f.abreviatura, f.vigente";
            cmd.Parameters.AddWithValue("id", id);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            if (await reader.ReadAsync(ct)) return MapFuerza(reader);
            return null;
        }

        public async Task<DtoFuerzaResult> SaveFuerzaAsync(int? id, DtoFuerzaRequest request, int sitioGraba, CancellationToken ct)
        {
            try
            {
                await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
                if (id.HasValue && id.Value > 0)
                {
                    // Actualizar
                    await using var cmd = conn.CreateCommand();
                    cmd.CommandText = @"
UPDATE cad_fuerzas
   SET descripcion = @desc,
       abreviatura = @abr,
       vigente     = @vigente
 WHERE id = @id";
                    cmd.Parameters.AddWithValue("id",      id.Value);
                    cmd.Parameters.AddWithValue("desc",    request.descripcion.Trim());
                    cmd.Parameters.AddWithValue("abr",     (object?)(request.abreviatura?.Trim()) ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("vigente", request.vigente ?? "S");
                    await cmd.ExecuteNonQueryAsync(ct);
                    return new DtoFuerzaResult { success = true, id = id.Value, message = "Fuerza actualizada." };
                }
                else
                {
                    // Crear — el id es provisto por el usuario (no SERIAL)
                    if (request.id <= 0)
                        return new DtoFuerzaResult { success = false, message = "El código de la fuerza debe ser un número mayor que 0." };

                    // Verificar que el id no esté en uso
                    await using (var chk = conn.CreateCommand())
                    {
                        chk.CommandText = "SELECT 1 FROM cad_fuerzas WHERE id = @id LIMIT 1";
                        chk.Parameters.AddWithValue("id", request.id);
                        var existe = await chk.ExecuteScalarAsync(ct);
                        if (existe is not null)
                            return new DtoFuerzaResult { success = false, message = $"Ya existe una fuerza con el código {request.id}." };
                    }

                    await using var cmd = conn.CreateCommand();
                    cmd.CommandText = @"
INSERT INTO cad_fuerzas (id, sitio_graba, descripcion, abreviatura, vigente)
VALUES (@id, @sitio, @desc, @abr, @vigente)";
                    cmd.Parameters.AddWithValue("id",      request.id);
                    cmd.Parameters.AddWithValue("sitio",   sitioGraba);
                    cmd.Parameters.AddWithValue("desc",    request.descripcion.Trim());
                    cmd.Parameters.AddWithValue("abr",     (object?)(request.abreviatura?.Trim()) ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("vigente", request.vigente ?? "S");
                    await cmd.ExecuteNonQueryAsync(ct);
                    return new DtoFuerzaResult { success = true, id = request.id, message = "Fuerza creada." };
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error guardando fuerza id={Id}", id);
                return new DtoFuerzaResult { success = false, message = $"Error: {ex.Message}" };
            }
        }

        public async Task<DtoFuerzaResult> ToggleFuerzaAsync(int id, CancellationToken ct)
        {
            try
            {
                await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
                await using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
UPDATE cad_fuerzas
   SET vigente = CASE WHEN vigente = 'S' THEN 'N' ELSE 'S' END
 WHERE id = @id
RETURNING vigente";
                cmd.Parameters.AddWithValue("id", id);
                var nuevo = (string?)await cmd.ExecuteScalarAsync(ct);
                var estado = nuevo == "S" ? "activada" : "desactivada";
                return new DtoFuerzaResult { success = true, id = id, message = $"Fuerza {estado}." };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error toggling fuerza id={Id}", id);
                return new DtoFuerzaResult { success = false, message = $"Error: {ex.Message}" };
            }
        }

        // ── Canales ──────────────────────────────────────────────────────────

        public async Task<List<DtoCanalFuerza>> GetCanalesAsync(int fuerzaId, CancellationToken ct)
        {
            var result = new List<DtoCanalFuerza>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
SELECT codigo, cadfuerz_id, descripcion, vigente
FROM cad_canales
WHERE cadfuerz_id = @fuerzaId
ORDER BY codigo";
            cmd.Parameters.AddWithValue("fuerzaId", fuerzaId);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
                result.Add(new DtoCanalFuerza
                {
                    codigo      = reader.GetInt32(0),
                    fuerzaId    = reader.GetInt32(1),
                    descripcion = reader.GetString(2),
                    vigente     = reader.GetString(3)
                });

            return result;
        }

        public async Task<DtoFuerzaResult> SaveCanalAsync(int fuerzaId, int? codigo, DtoCanalRequest request, CancellationToken ct)
        {
            try
            {
                await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);

                if (codigo.HasValue && codigo.Value > 0)
                {
                    // Actualizar canal existente
                    await using var cmd = conn.CreateCommand();
                    cmd.CommandText = @"
UPDATE cad_canales
   SET descripcion = @desc,
       vigente     = @vigente
 WHERE cadfuerz_id = @fuerzaId AND codigo = @codigo";
                    cmd.Parameters.AddWithValue("desc",     request.descripcion.Trim());
                    cmd.Parameters.AddWithValue("vigente",  request.vigente ?? "S");
                    cmd.Parameters.AddWithValue("fuerzaId", fuerzaId);
                    cmd.Parameters.AddWithValue("codigo",   codigo.Value);
                    await cmd.ExecuteNonQueryAsync(ct);
                    return new DtoFuerzaResult { success = true, id = codigo.Value, message = "Canal actualizado." };
                }
                else
                {
                    // Crear canal: auto-asignar próximo código
                    int nextCodigo;
                    {
                        await using var cmdMax = conn.CreateCommand();
                        cmdMax.CommandText = "SELECT COALESCE(MAX(codigo), 0) + 1 FROM cad_canales WHERE cadfuerz_id = @fuerzaId";
                        cmdMax.Parameters.AddWithValue("fuerzaId", fuerzaId);
                        nextCodigo = Convert.ToInt32(await cmdMax.ExecuteScalarAsync(ct));
                    }
                    {
                        await using var cmdIns = conn.CreateCommand();
                        cmdIns.CommandText = @"
INSERT INTO cad_canales (codigo, cadfuerz_id, descripcion, vigente)
VALUES (@codigo, @fuerzaId, @desc, @vigente)";
                        cmdIns.Parameters.AddWithValue("codigo",   nextCodigo);
                        cmdIns.Parameters.AddWithValue("fuerzaId", fuerzaId);
                        cmdIns.Parameters.AddWithValue("desc",     request.descripcion.Trim());
                        cmdIns.Parameters.AddWithValue("vigente",  request.vigente ?? "S");
                        await cmdIns.ExecuteNonQueryAsync(ct);
                    }
                    return new DtoFuerzaResult { success = true, id = nextCodigo, message = "Canal creado." };
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error guardando canal fuerzaId={FuerzaId} codigo={Codigo}", fuerzaId, codigo);
                return new DtoFuerzaResult { success = false, message = $"Error: {ex.Message}" };
            }
        }

        public async Task<DtoFuerzaResult> ToggleCanalAsync(int fuerzaId, int codigo, CancellationToken ct)
        {
            try
            {
                await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
                await using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
UPDATE cad_canales
   SET vigente = CASE WHEN vigente = 'S' THEN 'N' ELSE 'S' END
 WHERE cadfuerz_id = @fuerzaId AND codigo = @codigo
RETURNING vigente";
                cmd.Parameters.AddWithValue("fuerzaId", fuerzaId);
                cmd.Parameters.AddWithValue("codigo",   codigo);
                var nuevo = (string?)await cmd.ExecuteScalarAsync(ct);
                var estado = nuevo == "S" ? "activado" : "desactivado";
                return new DtoFuerzaResult { success = true, id = codigo, message = $"Canal {estado}." };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error toggling canal fuerzaId={FuerzaId} codigo={Codigo}", fuerzaId, codigo);
                return new DtoFuerzaResult { success = false, message = $"Error: {ex.Message}" };
            }
        }

        // ── Usuarios en fuerza ───────────────────────────────────────────────

        public async Task<List<DtoUsuarioEnFuerza>> GetUsuariosByFuerzaAsync(int fuerzaId, CancellationToken ct)
        {
            var result = new List<DtoUsuarioEnFuerza>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
SELECT u.id_usuario,
       u.username,
       CASE WHEN UPPER(COALESCE(u.tipo_usuario, 'POLICIA')) = 'CIVIL'
            THEN TRIM(COALESCE(u.nombres,'') || ' ' || COALESCE(u.apellidos,''))
            ELSE TRIM(COALESCE(u.grad_alfabetico,'') || ' ' || COALESCE(u.apellidos,'') || ' ' || COALESCE(u.nombres,''))
       END AS nombre_completo,
       COALESCE(u.cadcana_codigo, 0) AS canal_codigo,
       COALESCE(c.descripcion, '')   AS canal_descripcion,
       COALESCE(u.acd, 0)            AS acd
FROM ctr_usuarios u
LEFT JOIN cad_canales c
       ON c.cadfuerz_id = @fuerzaId AND c.codigo = u.cadcana_codigo
WHERE u.cadcana_fuerza_id = @fuerzaId
ORDER BY nombre_completo";
            cmd.Parameters.AddWithValue("fuerzaId", fuerzaId);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
                result.Add(new DtoUsuarioEnFuerza
                {
                    idUsuario        = Convert.ToInt64(reader.GetValue(0)),
                    username         = reader.GetString(1),
                    nombreCompleto   = reader.GetString(2),
                    canalCodigo      = reader.GetInt32(3),
                    canalDescripcion = reader.IsDBNull(4) ? null : reader.GetString(4),
                    acd              = reader.GetInt32(5)
                });

            return result;
        }

        // ── Datos operacionales de usuario ───────────────────────────────────

        public async Task<DtoUsuarioOperacion?> GetUsuarioOperacionAsync(long idUsuario, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
SELECT u.cadcana_fuerza_id,
       u.cadcana_codigo,
       u.acd,
       u.sitio_grabacion,
       f.descripcion   AS fuerza_descripcion,
       f.abreviatura   AS fuerza_abreviatura,
       c.descripcion   AS canal_descripcion
FROM ctr_usuarios u
LEFT JOIN cad_fuerzas f ON f.id = u.cadcana_fuerza_id
LEFT JOIN cad_canales c ON c.cadfuerz_id = u.cadcana_fuerza_id
                       AND c.codigo = u.cadcana_codigo
WHERE u.id_usuario = @id
LIMIT 1";
            cmd.Parameters.AddWithValue("id", idUsuario);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            if (!await reader.ReadAsync(ct)) return null;

            return new DtoUsuarioOperacion
            {
                cadcanaFuerzaId   = reader.IsDBNull(0) ? 0 : reader.GetInt32(0),
                cadcanaCodigo     = reader.IsDBNull(1) ? 0 : reader.GetInt32(1),
                acd               = reader.IsDBNull(2) ? 0 : reader.GetInt32(2),
                sitioGrabacion    = reader.IsDBNull(3) ? 0 : reader.GetInt32(3),
                fuerzaDescripcion = reader.IsDBNull(4) ? null : reader.GetString(4),
                fuerzaAbreviatura = reader.IsDBNull(5) ? null : reader.GetString(5),
                canalDescripcion  = reader.IsDBNull(6) ? null : reader.GetString(6)
            };
        }

        public async Task<DtoFuerzaResult> SaveUsuarioOperacionAsync(long idUsuario, DtoUsuarioOperacionRequest request, CancellationToken ct)
        {
            try
            {
                await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);

                // Derivar sitio_grabacion desde la fuerza seleccionada
                int sitioGraba = 0;
                if (request.cadcanaFuerzaId > 0)
                {
                    await using var cmdSitio = conn.CreateCommand();
                    cmdSitio.CommandText = "SELECT sitio_graba FROM cad_fuerzas WHERE id = @id LIMIT 1";
                    cmdSitio.Parameters.AddWithValue("id", request.cadcanaFuerzaId);
                    var val = await cmdSitio.ExecuteScalarAsync(ct);
                    if (val is not null and not DBNull) sitioGraba = Convert.ToInt32(val);
                }

                await using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
UPDATE ctr_usuarios
   SET cadcana_fuerza_id = @fuerzaId,
       cadcana_codigo    = @canalCodigo,
       acd               = @acd,
       sitio_grabacion   = @sitioGraba
 WHERE id_usuario = @id";
                cmd.Parameters.AddWithValue("fuerzaId",   request.cadcanaFuerzaId);
                cmd.Parameters.AddWithValue("canalCodigo", request.cadcanaCodigo);
                cmd.Parameters.AddWithValue("acd",        request.acd);
                cmd.Parameters.AddWithValue("sitioGraba", sitioGraba);
                cmd.Parameters.AddWithValue("id",         idUsuario);

                var affected = await cmd.ExecuteNonQueryAsync(ct);
                return affected > 0
                    ? new DtoFuerzaResult { success = true, id = (int)idUsuario, message = "Datos operacionales guardados." }
                    : new DtoFuerzaResult { success = false, message = "Usuario no encontrado." };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error guardando operación de usuario id={Id}", idUsuario);
                return new DtoFuerzaResult { success = false, message = $"Error: {ex.Message}" };
            }
        }

        // ── Helpers ──────────────────────────────────────────────────────────

        private static DtoFuerza MapFuerza(Npgsql.NpgsqlDataReader r) => new()
        {
            id            = r.GetInt32(0),
            sitioGraba    = r.GetInt32(1),
            descripcion   = r.GetString(2),
            abreviatura   = r.IsDBNull(3) ? null : r.GetString(3),
            vigente       = r.GetString(4),
            totalCanales  = Convert.ToInt32(r.GetValue(5)),
            totalUsuarios = Convert.ToInt32(r.GetValue(6))
        };
    }
}
