using Comun.Dtos.Operacion;
using Comun.Snowflake;
using Datos.Interfaz;
using Datos.Tenant;
using Microsoft.Extensions.Logging;
using Npgsql;
using NpgsqlTypes;

namespace Datos.Gestion
{
    public class DbAnotacionTurnoRepository : IDbAnotacionTurnoRepository
    {
        private readonly TenantContext                       _tenant;
        private readonly ILogger<DbAnotacionTurnoRepository> _logger;
        private readonly ISnowflakeGenerator                 _snowflake;

        private const string TsFormat = "DD/MM/YYYY HH24:MI:SS";

        public DbAnotacionTurnoRepository(
            TenantContext tenant,
            ILogger<DbAnotacionTurnoRepository> logger,
            ISnowflakeGenerator snowflake)
        {
            _tenant    = tenant;
            _logger    = logger;
            _snowflake = snowflake;
        }

        // ════════════════════════════════════════════════════════════════════════
        //  LISTA
        // ════════════════════════════════════════════════════════════════════════

        public async Task<List<DtoAnotacionTurno>> GetListAsync(
            int?     canalCodigo,
            int?     sitioGraba,
            string?  tipo,
            string?  fechaDesde,
            string?  fechaHasta,
            int      fuerzaId,
            CancellationToken ct)
        {
            var result = new List<DtoAnotacionTurno>();
            try
            {
                await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
                await using var cmd  = conn.CreateCommand();
                cmd.CommandText = $@"
SELECT a.id,
       a.tipo,
       a.titulo,
       a.descripcion,
       a.canal_codigo,
       COALESCE(c.descripcion, '')            AS canal_desc,
       a.fuerza_id,
       COALESCE(f.descripcion, '')            AS fuerza_desc,
       a.sitio_graba,
       a.username_creacion,
       a.nombre_completo,
       TO_CHAR(a.fecha_creacion AT TIME ZONE 'America/Bogota', '{TsFormat}') AS fecha_creacion,
       TO_CHAR(a.fecha_modifica AT TIME ZONE 'America/Bogota', '{TsFormat}') AS fecha_modifica,
       a.username_modifica
FROM   cad_anotaciones_turno a
-- cad_canales tiene PK compuesta (codigo, cadfuerz_id): codigo solo no es único
-- entre fuerzas. Sin el AND c.cadfuerz_id, este LEFT JOIN produce fan-out (la
-- misma anotación se duplica una vez por cada fuerza que comparte ese código).
LEFT   JOIN cad_canales c ON c.codigo = a.canal_codigo AND c.cadfuerz_id = a.fuerza_id
LEFT   JOIN cad_fuerzas f ON f.id     = a.fuerza_id
WHERE  a.vigente = 1
  AND  (@canal  IS NULL OR a.canal_codigo = @canal)
  AND  (@sitio  IS NULL OR a.sitio_graba  = @sitio)
  AND  (@tipo   IS NULL OR a.tipo         = @tipo)
  AND  (@desde  IS NULL OR (a.fecha_creacion AT TIME ZONE 'America/Bogota')::date >= @desde)
  AND  (@hasta  IS NULL OR (a.fecha_creacion AT TIME ZONE 'America/Bogota')::date <= @hasta)
  AND  (@fuerza = 0    OR a.fuerza_id     = @fuerza)
ORDER  BY a.fecha_creacion DESC
LIMIT  500";

                // Convertir las fechas string → DateOnly para que Npgsql las envíe
                // como tipo 'date' nativo de PostgreSQL y se comparen en zona Bogotá.
                DateOnly? desdeDate = null;
                DateOnly? hastaDate = null;
                if (fechaDesde is not null && DateOnly.TryParse(fechaDesde, out var dD)) desdeDate = dD;
                if (fechaHasta is not null && DateOnly.TryParse(fechaHasta, out var dH)) hastaDate = dH;

                // Los parámetros nullable deben declarar su NpgsqlDbType explícitamente.
                // Si se pasan como DBNull.Value sin tipo, PostgreSQL lanza 42P08
                // ("no se pudo determinar el tipo del parámetro $N") porque el
                // planificador no puede inferirlo sólo del contexto IS NULL.
                AddParam(cmd, "canal",  NpgsqlDbType.Integer, canalCodigo);
                AddParam(cmd, "sitio",  NpgsqlDbType.Integer, sitioGraba);
                AddParam(cmd, "tipo",   NpgsqlDbType.Varchar, tipo);
                AddParam(cmd, "desde",  NpgsqlDbType.Date,    desdeDate);
                AddParam(cmd, "hasta",  NpgsqlDbType.Date,    hastaDate);
                cmd.Parameters.AddWithValue("fuerza", fuerzaId);

                await using var reader = await cmd.ExecuteReaderAsync(ct);
                while (await reader.ReadAsync(ct))
                    result.Add(MapRow(reader));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error listando anotaciones de turno");
            }
            return result;
        }

        // ════════════════════════════════════════════════════════════════════════
        //  GET BY ID
        // ════════════════════════════════════════════════════════════════════════

        public async Task<DtoAnotacionTurno?> GetByIdAsync(long id, int fuerzaId, CancellationToken ct)
        {
            try
            {
                await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
                await using var cmd  = conn.CreateCommand();
                cmd.CommandText = $@"
SELECT a.id, a.tipo, a.titulo, a.descripcion, a.canal_codigo,
       COALESCE(c.descripcion, '') AS canal_desc,
       a.fuerza_id,
       COALESCE(f.descripcion, '') AS fuerza_desc,
       a.sitio_graba, a.username_creacion, a.nombre_completo,
       TO_CHAR(a.fecha_creacion AT TIME ZONE 'America/Bogota', '{TsFormat}'),
       TO_CHAR(a.fecha_modifica AT TIME ZONE 'America/Bogota', '{TsFormat}'),
       a.username_modifica
FROM   cad_anotaciones_turno a
LEFT   JOIN cad_canales c ON c.codigo = a.canal_codigo AND c.cadfuerz_id = a.fuerza_id
LEFT   JOIN cad_fuerzas f ON f.id     = a.fuerza_id
WHERE  a.id = @id
  AND  a.vigente = 1
  AND  (@fuerza = 0 OR a.fuerza_id = @fuerza)";
                cmd.Parameters.AddWithValue("id", id);
                cmd.Parameters.AddWithValue("fuerza", fuerzaId);

                await using var reader = await cmd.ExecuteReaderAsync(ct);
                if (await reader.ReadAsync(ct)) return MapRow(reader);
            }
            catch (Exception ex) { _logger.LogError(ex, "Error GetById anotacion {Id}", id); }
            return null;
        }

        // ════════════════════════════════════════════════════════════════════════
        //  CREATE
        // ════════════════════════════════════════════════════════════════════════

        public async Task<DtoAnotacionTurno> CreateAsync(
            DtoAnotacionTurnoRequest request,
            long   idUsuario,
            string username,
            string nombreCompleto,
            string maquina,
            CancellationToken ct)
        {
            var newId = _snowflake.NextId();
            try
            {
                await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
                await using var cmd  = conn.CreateCommand();
                cmd.CommandText = @"
INSERT INTO cad_anotaciones_turno
    (id, tipo, titulo, descripcion, canal_codigo, fuerza_id, sitio_graba,
     id_usuario_creacion, username_creacion, nombre_completo, maquina_creacion)
VALUES
    (@id, @tipo, @titulo, @desc, @canal, @fuerza, @sitio,
     @idUsr, @usr, @nombre, @maquina)";

                cmd.Parameters.AddWithValue("id",      newId);
                cmd.Parameters.AddWithValue("tipo",    request.Tipo ?? "GENERAL");
                cmd.Parameters.AddWithValue("titulo",  (object?)(request.Titulo?.Trim()) ?? DBNull.Value);
                cmd.Parameters.AddWithValue("desc",    request.Descripcion ?? "");
                cmd.Parameters.AddWithValue("canal",   (object?)request.CanalCodigo ?? DBNull.Value);
                cmd.Parameters.AddWithValue("fuerza",  (object?)request.FuerzaId    ?? DBNull.Value);
                cmd.Parameters.AddWithValue("sitio",   (object?)request.SitioGraba  ?? DBNull.Value);
                cmd.Parameters.AddWithValue("idUsr",   idUsuario);
                cmd.Parameters.AddWithValue("usr",     username);
                cmd.Parameters.AddWithValue("nombre",  nombreCompleto);
                cmd.Parameters.AddWithValue("maquina", maquina);

                await cmd.ExecuteNonQueryAsync(ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creando anotacion de turno");
                throw;
            }

            return (await GetByIdAsync(newId, 0, ct))
                ?? new DtoAnotacionTurno { Id = newId, Tipo = request.Tipo, Descripcion = request.Descripcion };
        }

        // ════════════════════════════════════════════════════════════════════════
        //  UPDATE
        // ════════════════════════════════════════════════════════════════════════

        public async Task<bool> UpdateAsync(
            long   id,
            DtoAnotacionTurnoRequest request,
            string username,
            bool   isAdmin,
            CancellationToken ct)
        {
            try
            {
                await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
                await using var cmd  = conn.CreateCommand();
                // El guard (username_creacion = @usr OR @isAdmin) hace que un intento
                // de editar la anotación de otro autor simplemente no afecte filas —
                // el controller lo traduce a "no encontrada o sin permiso", sin
                // distinguir los dos casos para no revelar si el id existe.
                cmd.CommandText = @"
UPDATE cad_anotaciones_turno
   SET tipo              = @tipo,
       titulo            = @titulo,
       descripcion       = @desc,
       fecha_modifica    = NOW(),
       username_modifica = @usr
 WHERE id = @id
   AND vigente = 1
   AND (username_creacion = @usr OR @isAdmin = TRUE)";

                cmd.Parameters.AddWithValue("id",      id);
                cmd.Parameters.AddWithValue("tipo",    request.Tipo ?? "GENERAL");
                cmd.Parameters.AddWithValue("titulo",  (object?)(request.Titulo?.Trim()) ?? DBNull.Value);
                cmd.Parameters.AddWithValue("desc",    request.Descripcion ?? "");
                cmd.Parameters.AddWithValue("usr",     username);
                cmd.Parameters.AddWithValue("isAdmin", isAdmin);

                return await cmd.ExecuteNonQueryAsync(ct) > 0;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error actualizando anotacion {Id}", id);
                return false;
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        //  DELETE
        // ════════════════════════════════════════════════════════════════════════

        public async Task<bool> DeleteAsync(long id, string username, bool isAdmin, CancellationToken ct)
        {
            try
            {
                await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
                await using var cmd  = conn.CreateCommand();
                // Borrado LÓGICO (vigente=0), no físico: el esquema (V16) fue diseñado
                // con una columna de vigencia e índices parciales WHERE vigente=1
                // justamente para retener la bitácora como constancia/evidencia de
                // turno aunque el operador la "elimine" de la vista activa.
                cmd.CommandText = @"
UPDATE cad_anotaciones_turno
   SET vigente           = 0,
       fecha_modifica    = NOW(),
       username_modifica = @usr
 WHERE id = @id
   AND vigente = 1
   AND (username_creacion = @usr OR @isAdmin = TRUE)";
                cmd.Parameters.AddWithValue("id",      id);
                cmd.Parameters.AddWithValue("usr",     username);
                cmd.Parameters.AddWithValue("isAdmin", isAdmin);
                return await cmd.ExecuteNonQueryAsync(ct) > 0;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error eliminando anotacion {Id}", id);
                return false;
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        //  MAPPER
        // ════════════════════════════════════════════════════════════════════════

        // ════════════════════════════════════════════════════════════════════════
        //  HELPER: parámetro tipado — evita 42P08 cuando el valor es NULL
        // ════════════════════════════════════════════════════════════════════════

        private static void AddParam(NpgsqlCommand cmd, string name, NpgsqlDbType dbType, object? value)
        {
            var p = new NpgsqlParameter(name, dbType) { IsNullable = true };
            p.Value = value ?? DBNull.Value;
            cmd.Parameters.Add(p);
        }

        private static DtoAnotacionTurno MapRow(NpgsqlDataReader r) => new()
        {
            Id               = r.GetInt64(0),
            Tipo             = r.IsDBNull(1)  ? "GENERAL" : r.GetString(1),
            Titulo           = r.IsDBNull(2)  ? null      : r.GetString(2),
            Descripcion      = r.IsDBNull(3)  ? ""        : r.GetString(3),
            CanalCodigo      = r.IsDBNull(4)  ? null      : r.GetInt32(4),
            CanalDesc        = r.IsDBNull(5)  ? null      : r.GetString(5),
            FuerzaId         = r.IsDBNull(6)  ? null      : r.GetInt32(6),
            FuerzaDesc       = r.IsDBNull(7)  ? null      : r.GetString(7),
            SitioGraba       = r.IsDBNull(8)  ? null      : r.GetInt32(8),
            UsernameCreacion = r.IsDBNull(9)  ? null      : r.GetString(9),
            NombreCompleto   = r.IsDBNull(10) ? null      : r.GetString(10),
            FechaCreacion    = r.IsDBNull(11) ? null      : r.GetString(11),
            FechaModifica    = r.IsDBNull(12) ? null      : r.GetString(12),
            UsuarioModifica  = r.IsDBNull(13) ? null      : r.GetString(13),
        };
    }
}
