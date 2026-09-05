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

                // Una fuerza pertenece SIEMPRE a un sitio de grabación: es la
                // unidad policial que la despacha, y de ella cuelga la marca
                // que separa los registros cuando dos unidades comparten CAD.
                // Al crear es obligatorio; al actualizar solo se valida si la
                // petición trae uno (0 = «no lo toques»).
                var sitioPedido = request.sitioGraba > 0
                    ? request.sitioGraba
                    : (id.HasValue && id.Value > 0 ? 0 : sitioGraba);

                if (sitioPedido > 0)
                {
                    await using var chkSitio = conn.CreateCommand();
                    chkSitio.CommandText = "SELECT 1 FROM cad_sitios_grabacion WHERE consecutivo = @s LIMIT 1";
                    chkSitio.Parameters.AddWithValue("s", sitioPedido);
                    if (await chkSitio.ExecuteScalarAsync(ct) is null)
                        return new DtoFuerzaResult
                        {
                            success = false,
                            message = $"El sitio de grabación {sitioPedido} no existe en este CAD."
                        };
                }
                else if (!id.HasValue || id.Value <= 0)
                {
                    // Sin esto la fuerza nacería en el sitio 0 y arrastraría ahí
                    // a todos los usuarios que se le asignaran después.
                    return new DtoFuerzaResult
                    {
                        success = false,
                        message = "Indique el sitio de grabación (unidad policial) de la fuerza. " +
                                  "Si el CAD todavía no tiene ninguno, regístrelo primero."
                    };
                }

                if (id.HasValue && id.Value > 0)
                {
                    // sitio_graba solo se toca si la petición lo trae: un
                    // cliente viejo, que no manda el campo, no debe mover de
                    // unidad a una fuerza que ya está bien clasificada.
                    int sitioAnterior = 0;
                    await using (var cmdAnt = conn.CreateCommand())
                    {
                        cmdAnt.CommandText = "SELECT COALESCE(sitio_graba, 0) FROM cad_fuerzas WHERE id = @id";
                        cmdAnt.Parameters.AddWithValue("id", id.Value);
                        var v = await cmdAnt.ExecuteScalarAsync(ct);
                        if (v is not null and not DBNull) sitioAnterior = Convert.ToInt32(v);
                    }

                    var cambiaDeSitio = sitioPedido > 0 && sitioPedido != sitioAnterior;

                    await using var tx = await conn.BeginTransactionAsync(ct);

                    await using (var cmd = conn.CreateCommand())
                    {
                        cmd.Transaction = tx;
                        cmd.CommandText = @"
UPDATE cad_fuerzas
   SET descripcion = @desc,
       abreviatura = @abr,
       vigente     = @vigente,
       sitio_graba = CASE WHEN @sitio > 0 THEN @sitio ELSE sitio_graba END
 WHERE id = @id";
                        cmd.Parameters.AddWithValue("id",      id.Value);
                        cmd.Parameters.AddWithValue("desc",    request.descripcion.Trim());
                        cmd.Parameters.AddWithValue("abr",     (object?)(request.abreviatura?.Trim()) ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("vigente", request.vigente ?? "S");
                        cmd.Parameters.AddWithValue("sitio",   sitioPedido);
                        await cmd.ExecuteNonQueryAsync(ct);
                    }

                    // La gente se muda con su fuerza. Dejarla atrás la deja sin
                    // ver ningún canal: Recepción filtra con
                    // `f.sitio_graba = <sitio del usuario>` y sin escape a 0.
                    // Solo se mueve a quien seguía en el sitio del que la
                    // fuerza sale; a quien ya estaba en otra unidad no se le
                    // toca, porque esa asignación la puso alguien a propósito.
                    var mudados = 0;
                    if (cambiaDeSitio)
                    {
                        await using var cmdU = conn.CreateCommand();
                        cmdU.Transaction = tx;
                        cmdU.CommandText = @"
UPDATE ctr_usuarios
   SET sitio_grabacion = @nuevo
 WHERE cadcana_fuerza_id = @fuerza
   AND COALESCE(sitio_grabacion, 0) = @anterior";
                        cmdU.Parameters.AddWithValue("nuevo",    sitioPedido);
                        cmdU.Parameters.AddWithValue("fuerza",   id.Value);
                        cmdU.Parameters.AddWithValue("anterior", sitioAnterior);
                        mudados = await cmdU.ExecuteNonQueryAsync(ct);
                    }

                    await tx.CommitAsync(ct);

                    return new DtoFuerzaResult
                    {
                        success = true,
                        id      = id.Value,
                        message = mudados > 0
                            ? $"Fuerza actualizada. {mudados} usuario(s) pasaron con ella al nuevo sitio."
                            : "Fuerza actualizada."
                    };
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
                    cmd.Parameters.AddWithValue("sitio",   sitioPedido);
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
       c.descripcion   AS canal_descripcion,
       s.descripcion   AS sitio_descripcion
FROM ctr_usuarios u
LEFT JOIN cad_fuerzas f ON f.id = u.cadcana_fuerza_id
LEFT JOIN cad_canales c ON c.cadfuerz_id = u.cadcana_fuerza_id
                       AND c.codigo = u.cadcana_codigo
LEFT JOIN cad_sitios_grabacion s ON s.consecutivo = u.sitio_grabacion
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
                canalDescripcion  = reader.IsDBNull(6) ? null : reader.GetString(6),
                sitioDescripcion  = reader.IsDBNull(7) ? null : reader.GetString(7)
            };
        }

        public async Task<DtoFuerzaResult> SaveUsuarioOperacionAsync(long idUsuario, DtoUsuarioOperacionRequest request, CancellationToken ct)
        {
            try
            {
                await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);

                // El sitio de la fuerza elegida: sirve de valor por defecto y,
                // cuando el administrador eligió sitio a mano, de verificación.
                int sitioDeLaFuerza = 0;
                if (request.cadcanaFuerzaId > 0)
                {
                    await using var cmdSitio = conn.CreateCommand();
                    cmdSitio.CommandText = "SELECT sitio_graba FROM cad_fuerzas WHERE id = @id LIMIT 1";
                    cmdSitio.Parameters.AddWithValue("id", request.cadcanaFuerzaId);
                    var val = await cmdSitio.ExecuteScalarAsync(ct);
                    if (val is not null and not DBNull) sitioDeLaFuerza = Convert.ToInt32(val);
                }

                // Manda lo que eligió el administrador. Si no eligió nada —o si
                // la petición viene de un cliente viejo que ni siquiera manda el
                // campo— se hereda el de la fuerza, que es como funcionaba antes.
                var sitioGraba = request.sitioGrabacion > 0 ? request.sitioGrabacion : sitioDeLaFuerza;

                // Un usuario de una unidad no puede quedar despachando el canal
                // de otra: es justamente lo que el sitio de grabación separa
                // cuando dos unidades comparten el mismo CAD físico.
                if (request.sitioGrabacion > 0 && sitioDeLaFuerza > 0 && request.sitioGrabacion != sitioDeLaFuerza)
                    return new DtoFuerzaResult
                    {
                        success = false,
                        message = "La fuerza elegida pertenece a otro sitio de grabación. " +
                                  "Elija una fuerza del mismo sitio que el usuario."
                    };

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

        public async Task<DtoFuerzaResult> ReasignarSitioAsync(int sitioOrigen, int sitioDestino, CancellationToken ct)
        {
            try
            {
                if (sitioDestino <= 0)
                    return new DtoFuerzaResult { success = false, message = "Indique el sitio de destino." };
                if (sitioOrigen == sitioDestino)
                    return new DtoFuerzaResult { success = false, message = "El origen y el destino son el mismo sitio." };

                await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);

                await using (var chk = conn.CreateCommand())
                {
                    chk.CommandText = "SELECT 1 FROM cad_sitios_grabacion WHERE consecutivo = @s LIMIT 1";
                    chk.Parameters.AddWithValue("s", sitioDestino);
                    if (await chk.ExecuteScalarAsync(ct) is null)
                        return new DtoFuerzaResult { success = false, message = "El sitio de destino no existe." };
                }

                // Las dos actualizaciones van juntas o no van. Mover las fuerzas
                // y dejar atrás a sus usuarios es peor que no mover nada:
                // Recepción filtra los canales con `f.sitio_graba = @sitio del
                // usuario`, sin escape, así que un despachador que se quede en
                // el sitio viejo deja de ver canal alguno.
                await using var tx = await conn.BeginTransactionAsync(ct);

                int usuarios;
                await using (var cmdU = conn.CreateCommand())
                {
                    cmdU.Transaction = tx;
                    cmdU.CommandText = @"
UPDATE ctr_usuarios u
   SET sitio_grabacion = @destino
 WHERE COALESCE(u.sitio_grabacion, 0) = @origen
   AND EXISTS (SELECT 1 FROM cad_fuerzas f
                WHERE f.id = u.cadcana_fuerza_id
                  AND COALESCE(f.sitio_graba, 0) = @origen)";
                    cmdU.Parameters.AddWithValue("origen",  sitioOrigen);
                    cmdU.Parameters.AddWithValue("destino", sitioDestino);
                    usuarios = await cmdU.ExecuteNonQueryAsync(ct);
                }

                int fuerzas;
                await using (var cmdF = conn.CreateCommand())
                {
                    cmdF.Transaction = tx;
                    cmdF.CommandText = "UPDATE cad_fuerzas SET sitio_graba = @destino WHERE COALESCE(sitio_graba, 0) = @origen";
                    cmdF.Parameters.AddWithValue("origen",  sitioOrigen);
                    cmdF.Parameters.AddWithValue("destino", sitioDestino);
                    fuerzas = await cmdF.ExecuteNonQueryAsync(ct);
                }

                await tx.CommitAsync(ct);

                return new DtoFuerzaResult
                {
                    success = true,
                    id      = sitioDestino,
                    message = fuerzas == 0
                        ? "No había fuerzas que mover."
                        : $"{fuerzas} fuerza(s) y {usuarios} usuario(s) quedaron en el nuevo sitio."
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error reasignando fuerzas de sitio {Origen} a {Destino}", sitioOrigen, sitioDestino);
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
