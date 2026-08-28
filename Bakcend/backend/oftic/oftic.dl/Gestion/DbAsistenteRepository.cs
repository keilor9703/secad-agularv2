using Comun.Dtos.Operacion;
using Comun.Snowflake;
using Datos.Interfaz;
using Datos.Tenant;
using Microsoft.Extensions.Logging;
using Npgsql;
using NpgsqlTypes;

namespace Datos.Gestion
{
    /// <summary>
    /// Implementación PostgreSQL del repositorio §6.17 Asistente Inteligente.
    /// Tablas: cad_asistente_categorias, cad_asistente_preguntas.
    /// </summary>
    public class DbAsistenteRepository : IDbAsistenteRepository
    {
        private readonly TenantContext                     _tenant;
        private readonly ILogger<DbAsistenteRepository>   _logger;
        private readonly ISnowflakeGenerator               _snowflake;

        public DbAsistenteRepository(
            TenantContext tenant,
            ILogger<DbAsistenteRepository> logger,
            ISnowflakeGenerator snowflake)
        {
            _tenant    = tenant;
            _logger    = logger;
            _snowflake = snowflake;
        }

        // ════════════════════════════════════════════════════════════════════
        //  CATEGORÍAS — LISTA
        // ════════════════════════════════════════════════════════════════════

        public async Task<List<DtoAsistenteCategoria>> GetCategoriasAsync(
            bool soloActivas, CancellationToken ct)
        {
            var result = new List<DtoAsistenteCategoria>();
            try
            {
                await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
                await using var cmd  = conn.CreateCommand();
                cmd.CommandText = @"
SELECT c.id,
       c.codigo,
       c.descripcion,
       c.icono,
       c.orden,
       c.activo,
       COUNT(p.id) FILTER (WHERE p.activo)::int AS total_preguntas
FROM   cad_asistente_categorias c
LEFT   JOIN cad_asistente_preguntas p ON p.categoria_id = c.id
WHERE  (@soloActivas = FALSE OR c.activo = TRUE)
GROUP  BY c.id, c.codigo, c.descripcion, c.icono, c.orden, c.activo
ORDER  BY c.orden, c.descripcion";

                cmd.Parameters.AddWithValue("soloActivas", soloActivas);

                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                    result.Add(MapCategoria(r));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error listando categorías asistente");
            }
            return result;
        }

        // ════════════════════════════════════════════════════════════════════
        //  CATEGORÍAS — GET BY ID
        // ════════════════════════════════════════════════════════════════════

        public async Task<DtoAsistenteCategoria?> GetCategoriaByIdAsync(long id, CancellationToken ct)
        {
            try
            {
                await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
                await using var cmd  = conn.CreateCommand();
                cmd.CommandText = @"
SELECT c.id,
       c.codigo,
       c.descripcion,
       c.icono,
       c.orden,
       c.activo,
       COUNT(p.id) FILTER (WHERE p.activo)::int AS total_preguntas
FROM   cad_asistente_categorias c
LEFT   JOIN cad_asistente_preguntas p ON p.categoria_id = c.id
WHERE  c.id = @id
GROUP  BY c.id, c.codigo, c.descripcion, c.icono, c.orden, c.activo";

                cmd.Parameters.AddWithValue("id", id);

                await using var r = await cmd.ExecuteReaderAsync(ct);
                if (await r.ReadAsync(ct)) return MapCategoria(r);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error GetById categoría asistente {Id}", id);
            }
            return null;
        }

        // ════════════════════════════════════════════════════════════════════
        //  CATEGORÍAS — CREATE
        // ════════════════════════════════════════════════════════════════════

        public async Task<DtoAsistenteCategoria> CreateCategoriaAsync(
            DtoAsistenteCategoriaRequest req, string username, CancellationToken ct)
        {
            var newId = _snowflake.NextId();
            try
            {
                await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
                await using var cmd  = conn.CreateCommand();
                cmd.CommandText = @"
INSERT INTO cad_asistente_categorias
    (id, codigo, descripcion, icono, orden, activo, username_creacion)
VALUES
    (@id, @codigo, @desc, @icono, @orden, @activo, @usr)";

                cmd.Parameters.AddWithValue("id",     newId);
                cmd.Parameters.AddWithValue("codigo", req.Codigo.Trim().ToUpperInvariant());
                cmd.Parameters.AddWithValue("desc",   req.Descripcion.Trim());
                cmd.Parameters.AddWithValue("icono",  req.Icono.Trim());
                cmd.Parameters.AddWithValue("orden",  req.Orden);
                cmd.Parameters.AddWithValue("activo", req.Activo);
                cmd.Parameters.AddWithValue("usr",    username);

                await cmd.ExecuteNonQueryAsync(ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creando categoría asistente");
                throw;
            }

            return (await GetCategoriaByIdAsync(newId, ct))
                ?? new DtoAsistenteCategoria { Id = newId, Codigo = req.Codigo, Descripcion = req.Descripcion };
        }

        // ════════════════════════════════════════════════════════════════════
        //  CATEGORÍAS — UPDATE
        // ════════════════════════════════════════════════════════════════════

        public async Task<bool> UpdateCategoriaAsync(
            long id, DtoAsistenteCategoriaRequest req, CancellationToken ct)
        {
            try
            {
                await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
                await using var cmd  = conn.CreateCommand();
                cmd.CommandText = @"
UPDATE cad_asistente_categorias
   SET codigo      = @codigo,
       descripcion = @desc,
       icono       = @icono,
       orden       = @orden,
       activo      = @activo
 WHERE id = @id";

                cmd.Parameters.AddWithValue("id",     id);
                cmd.Parameters.AddWithValue("codigo", req.Codigo.Trim().ToUpperInvariant());
                cmd.Parameters.AddWithValue("desc",   req.Descripcion.Trim());
                cmd.Parameters.AddWithValue("icono",  req.Icono.Trim());
                cmd.Parameters.AddWithValue("orden",  req.Orden);
                cmd.Parameters.AddWithValue("activo", req.Activo);

                return await cmd.ExecuteNonQueryAsync(ct) > 0;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error actualizando categoría asistente {Id}", id);
                return false;
            }
        }

        // ════════════════════════════════════════════════════════════════════
        //  CATEGORÍAS — DELETE
        // ════════════════════════════════════════════════════════════════════

        public async Task<bool> DeleteCategoriaAsync(long id, CancellationToken ct)
        {
            try
            {
                await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
                await using var cmd  = conn.CreateCommand();
                // Las preguntas hijas se eliminan en cascada (ON DELETE CASCADE en V17)
                cmd.CommandText = "DELETE FROM cad_asistente_categorias WHERE id = @id";
                cmd.Parameters.AddWithValue("id", id);
                return await cmd.ExecuteNonQueryAsync(ct) > 0;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error eliminando categoría asistente {Id}", id);
                return false;
            }
        }

        // ════════════════════════════════════════════════════════════════════
        //  PREGUNTAS — LISTA
        // ════════════════════════════════════════════════════════════════════

        public async Task<List<DtoAsistentePregunta>> GetPreguntasAsync(
            long? categoriaId, bool soloActivas, CancellationToken ct)
        {
            var result = new List<DtoAsistentePregunta>();
            try
            {
                await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
                await using var cmd  = conn.CreateCommand();
                cmd.CommandText = @"
SELECT p.id,
       p.categoria_id,
       c.descripcion    AS categoria_desc,
       p.pregunta,
       p.ayuda,
       p.tipo_respuesta,
       p.opciones,
       p.obligatoria,
       p.orden,
       p.activo
FROM   cad_asistente_preguntas p
LEFT   JOIN cad_asistente_categorias c ON c.id = p.categoria_id
WHERE  (@categoriaId IS NULL OR p.categoria_id = @categoriaId)
  AND  (@soloActivas = FALSE OR p.activo = TRUE)
ORDER  BY p.orden, p.pregunta";

                // categoriaId es nullable → debe usar NpgsqlDbType explícito para evitar 42P08
                AddParam(cmd, "categoriaId", NpgsqlDbType.Bigint, categoriaId);
                cmd.Parameters.AddWithValue("soloActivas", soloActivas);

                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                    result.Add(MapPregunta(r));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error listando preguntas asistente");
            }
            return result;
        }

        // ════════════════════════════════════════════════════════════════════
        //  PREGUNTAS — GET BY ID
        // ════════════════════════════════════════════════════════════════════

        public async Task<DtoAsistentePregunta?> GetPreguntaByIdAsync(long id, CancellationToken ct)
        {
            try
            {
                await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
                await using var cmd  = conn.CreateCommand();
                cmd.CommandText = @"
SELECT p.id,
       p.categoria_id,
       c.descripcion    AS categoria_desc,
       p.pregunta,
       p.ayuda,
       p.tipo_respuesta,
       p.opciones,
       p.obligatoria,
       p.orden,
       p.activo
FROM   cad_asistente_preguntas p
LEFT   JOIN cad_asistente_categorias c ON c.id = p.categoria_id
WHERE  p.id = @id";

                cmd.Parameters.AddWithValue("id", id);

                await using var r = await cmd.ExecuteReaderAsync(ct);
                if (await r.ReadAsync(ct)) return MapPregunta(r);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error GetById pregunta asistente {Id}", id);
            }
            return null;
        }

        // ════════════════════════════════════════════════════════════════════
        //  PREGUNTAS — CREATE
        // ════════════════════════════════════════════════════════════════════

        public async Task<DtoAsistentePregunta> CreatePreguntaAsync(
            DtoAsistentePreguntaRequest req, string username, CancellationToken ct)
        {
            var newId = _snowflake.NextId();
            try
            {
                await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
                await using var cmd  = conn.CreateCommand();
                cmd.CommandText = @"
INSERT INTO cad_asistente_preguntas
    (id, categoria_id, pregunta, ayuda, tipo_respuesta, opciones,
     obligatoria, orden, activo, username_creacion)
VALUES
    (@id, @catId, @pregunta, @ayuda, @tipo, @opciones,
     @oblig, @orden, @activo, @usr)";

                cmd.Parameters.AddWithValue("id",       newId);
                AddParam(cmd, "catId",    NpgsqlDbType.Bigint,  req.CategoriaId);
                cmd.Parameters.AddWithValue("pregunta", req.Pregunta.Trim());
                AddParam(cmd, "ayuda",    NpgsqlDbType.Varchar, req.Ayuda?.Trim());
                cmd.Parameters.AddWithValue("tipo",     req.TipoRespuesta.Trim().ToUpperInvariant());
                AddParam(cmd, "opciones", NpgsqlDbType.Jsonb,   req.Opciones);
                cmd.Parameters.AddWithValue("oblig",    req.Obligatoria);
                cmd.Parameters.AddWithValue("orden",    req.Orden);
                cmd.Parameters.AddWithValue("activo",   req.Activo);
                cmd.Parameters.AddWithValue("usr",      username);

                await cmd.ExecuteNonQueryAsync(ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creando pregunta asistente");
                throw;
            }

            return (await GetPreguntaByIdAsync(newId, ct))
                ?? new DtoAsistentePregunta { Id = newId, Pregunta = req.Pregunta };
        }

        // ════════════════════════════════════════════════════════════════════
        //  PREGUNTAS — UPDATE
        // ════════════════════════════════════════════════════════════════════

        public async Task<bool> UpdatePreguntaAsync(
            long id, DtoAsistentePreguntaRequest req, string username, CancellationToken ct)
        {
            try
            {
                await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
                await using var cmd  = conn.CreateCommand();
                cmd.CommandText = @"
UPDATE cad_asistente_preguntas
   SET categoria_id   = @catId,
       pregunta       = @pregunta,
       ayuda          = @ayuda,
       tipo_respuesta = @tipo,
       opciones       = @opciones,
       obligatoria    = @oblig,
       orden          = @orden,
       activo         = @activo
 WHERE id = @id";

                cmd.Parameters.AddWithValue("id",       id);
                AddParam(cmd, "catId",    NpgsqlDbType.Bigint,  req.CategoriaId);
                cmd.Parameters.AddWithValue("pregunta", req.Pregunta.Trim());
                AddParam(cmd, "ayuda",    NpgsqlDbType.Varchar, req.Ayuda?.Trim());
                cmd.Parameters.AddWithValue("tipo",     req.TipoRespuesta.Trim().ToUpperInvariant());
                AddParam(cmd, "opciones", NpgsqlDbType.Jsonb,   req.Opciones);
                cmd.Parameters.AddWithValue("oblig",    req.Obligatoria);
                cmd.Parameters.AddWithValue("orden",    req.Orden);
                cmd.Parameters.AddWithValue("activo",   req.Activo);

                return await cmd.ExecuteNonQueryAsync(ct) > 0;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error actualizando pregunta asistente {Id}", id);
                return false;
            }
        }

        // ════════════════════════════════════════════════════════════════════
        //  PREGUNTAS — DELETE
        // ════════════════════════════════════════════════════════════════════

        public async Task<bool> DeletePreguntaAsync(long id, CancellationToken ct)
        {
            try
            {
                await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
                await using var cmd  = conn.CreateCommand();
                cmd.CommandText = "DELETE FROM cad_asistente_preguntas WHERE id = @id";
                cmd.Parameters.AddWithValue("id", id);
                return await cmd.ExecuteNonQueryAsync(ct) > 0;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error eliminando pregunta asistente {Id}", id);
                return false;
            }
        }

        // ════════════════════════════════════════════════════════════════════
        //  HELPERS
        // ════════════════════════════════════════════════════════════════════

        /// <summary>
        /// Crea un parámetro Npgsql con tipo explícito para evitar el error 42P08
        /// ("no se pudo determinar el tipo del parámetro") cuando el valor es NULL
        /// dentro de cláusulas IS NULL en PostgreSQL.
        /// </summary>
        private static void AddParam(NpgsqlCommand cmd, string name, NpgsqlDbType dbType, object? value)
        {
            var p = new NpgsqlParameter(name, dbType) { IsNullable = true };
            p.Value = value ?? DBNull.Value;
            cmd.Parameters.Add(p);
        }

        private static DtoAsistenteCategoria MapCategoria(NpgsqlDataReader r) => new()
        {
            Id             = r.GetInt64(0),
            Codigo         = r.GetString(1),
            Descripcion    = r.GetString(2),
            Icono          = r.IsDBNull(3) ? "fa-circle-question" : r.GetString(3),
            Orden          = r.GetInt32(4),
            Activo         = r.GetBoolean(5),
            TotalPreguntas = r.IsDBNull(6) ? 0 : r.GetInt32(6),
        };

        private static DtoAsistentePregunta MapPregunta(NpgsqlDataReader r) => new()
        {
            Id            = r.GetInt64(0),
            CategoriaId   = r.IsDBNull(1) ? null : r.GetInt64(1),
            CategoriaDesc = r.IsDBNull(2) ? null : r.GetString(2),
            Pregunta      = r.GetString(3),
            Ayuda         = r.IsDBNull(4) ? null : r.GetString(4),
            TipoRespuesta = r.GetString(5),
            Opciones      = r.IsDBNull(6) ? null : r.GetString(6),
            Obligatoria   = r.GetBoolean(7),
            Orden         = r.GetInt32(8),
            Activo        = r.GetBoolean(9),
        };
    }
}
