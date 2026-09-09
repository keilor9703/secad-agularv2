using Comun.Dtos.Integraciones;
using Comun.Snowflake;
using Datos.Interfaz;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace Datos.Gestion
{
    /// <summary>
    /// Acceso a secad_api_keys en la base MAESTRA.
    ///
    /// Todo lo de aquí tolera que la tabla todavía no exista: el despliegue
    /// levanta la API ANTES de correr el SQL, así que entre esos dos momentos
    /// una consulta a una tabla nueva reventaría con 42P01 y dejaría el sistema
    /// sin recibir integraciones. Cuando falta, se responde «no hay llaves» y
    /// los endpoints externos caen a la clave global de appsettings, que es
    /// exactamente el comportamiento anterior.
    /// </summary>
    public class DbApiKeyRepository : IDbApiKeyRepository
    {
        private const string TablaInexistente = "42P01";

        private readonly NpgsqlDataSource _masterDb;
        private readonly ISnowflakeGenerator _snowflake;
        private readonly ILogger<DbApiKeyRepository> _logger;

        public DbApiKeyRepository(
            NpgsqlDataSource masterDb,
            ISnowflakeGenerator snowflake,
            ILogger<DbApiKeyRepository> logger)
        {
            _masterDb   = masterDb;
            _snowflake  = snowflake;
            _logger     = logger;
        }

        // ── Resolución en caliente ───────────────────────────────────────────

        public async Task<DtoApiKeyResuelta?> ResolverAsync(string huella, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(huella)) return null;

            try
            {
                await using var conn = await _masterDb.OpenConnectionAsync(ct);
                await using var cmd = conn.CreateCommand();
                // Un solo viaje para las dos posibilidades: la llave vigente y
                // la anterior mientras esté en gracia. El ORDER BY deja primero
                // la vigente por si alguien reusó un secreto.
                cmd.CommandText = @"
SELECT id, cod_dane, nombre, alcance, sitio_graba_defecto,
       (huella <> @h) AS en_gracia
FROM   secad_api_keys
WHERE  activa
  AND  ( huella = @h
      OR (huella_anterior = @h AND anterior_expira IS NOT NULL AND anterior_expira > NOW()) )
ORDER BY (huella = @h) DESC
LIMIT 1";
                cmd.Parameters.AddWithValue("h", huella);

                await using var r = await cmd.ExecuteReaderAsync(ct);
                if (!await r.ReadAsync(ct)) return null;

                return new DtoApiKeyResuelta
                {
                    Id                = r.GetInt64(0),
                    CodDane           = r.GetString(1),
                    Nombre            = r.GetString(2),
                    Alcance           = r.GetString(3),
                    SitioGrabaDefecto = r.GetInt32(4),
                    EnGracia          = r.GetBoolean(5),
                };
            }
            catch (PostgresException ex) when (ex.SqlState == TablaInexistente)
            {
                // Base sin V73 todavía: no hay llaves que resolver.
                return null;
            }
        }

        public async Task RegistrarUsoAsync(long id, string? ip, CancellationToken ct)
        {
            try
            {
                await using var conn = await _masterDb.OpenConnectionAsync(ct);
                await using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
UPDATE secad_api_keys
   SET ultimo_uso = NOW(), ultimo_uso_ip = @ip, total_usos = total_usos + 1
 WHERE id = @id";
                cmd.Parameters.AddWithValue("id", id);
                cmd.Parameters.AddWithValue("ip", (object?)ip ?? DBNull.Value);
                await cmd.ExecuteNonQueryAsync(ct);
            }
            catch (Exception ex)
            {
                // Contabilidad, no autorización: que no se pueda anotar el uso
                // jamás debe impedir que entre un caso.
                _logger.LogWarning(ex, "No se pudo registrar el uso de la llave {Id}", id);
            }
        }

        // ── Administración ───────────────────────────────────────────────────

        private const string Campos = @"
    id, cod_dane, nombre, alcance, prefijo, sitio_graba_defecto, activa, notas,
    anterior_expira, ultimo_uso, ultimo_uso_ip, total_usos,
    fecha_creacion, usuario_creacion, fecha_revocacion";

        private static DtoApiKey Map(NpgsqlDataReader r) => new()
        {
            Id                = r.GetInt64(0),
            CodDane           = r.GetString(1),
            Nombre            = r.GetString(2),
            Alcance           = r.GetString(3),
            Prefijo           = r.GetString(4),
            SitioGrabaDefecto = r.GetInt32(5),
            Activa            = r.GetBoolean(6),
            Notas             = r.IsDBNull(7)  ? null : r.GetString(7),
            AnteriorExpira    = r.IsDBNull(8)  ? null : r.GetDateTime(8),
            UltimoUso         = r.IsDBNull(9)  ? null : r.GetDateTime(9),
            UltimoUsoIp       = r.IsDBNull(10) ? null : r.GetString(10),
            TotalUsos         = r.GetInt64(11),
            FechaCreacion     = r.GetDateTime(12),
            UsuarioCreacion   = r.IsDBNull(13) ? null : r.GetString(13),
            FechaRevocacion   = r.IsDBNull(14) ? null : r.GetDateTime(14),
        };

        public async Task<List<DtoApiKey>> ListarAsync(string codDane, CancellationToken ct)
        {
            var lista = new List<DtoApiKey>();
            try
            {
                await using var conn = await _masterDb.OpenConnectionAsync(ct);
                await using var cmd = conn.CreateCommand();
                cmd.CommandText = $"SELECT {Campos} FROM secad_api_keys WHERE cod_dane = @d ORDER BY activa DESC, fecha_creacion DESC";
                cmd.Parameters.AddWithValue("d", codDane);
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct)) lista.Add(Map(r));
            }
            catch (PostgresException ex) when (ex.SqlState == TablaInexistente)
            {
                _logger.LogWarning("secad_api_keys no existe todavía: falta aplicar V73 en la maestra.");
            }
            return lista;
        }

        public async Task<DtoApiKey?> ObtenerAsync(long id, string codDane, CancellationToken ct)
        {
            try
            {
                await using var conn = await _masterDb.OpenConnectionAsync(ct);
                await using var cmd = conn.CreateCommand();
                cmd.CommandText = $"SELECT {Campos} FROM secad_api_keys WHERE id = @id AND cod_dane = @d";
                cmd.Parameters.AddWithValue("id", id);
                cmd.Parameters.AddWithValue("d", codDane);
                await using var r = await cmd.ExecuteReaderAsync(ct);
                return await r.ReadAsync(ct) ? Map(r) : null;
            }
            catch (PostgresException ex) when (ex.SqlState == TablaInexistente) { return null; }
        }

        public async Task<string?> ObtenerClaveCifradaAsync(long id, string codDane, CancellationToken ct)
        {
            try
            {
                await using var conn = await _masterDb.OpenConnectionAsync(ct);
                await using var cmd = conn.CreateCommand();
                // El cod_dane en el WHERE no es decorativo: impide que el
                // administrador de un CAD lea la llave de otro pasando un id.
                cmd.CommandText = "SELECT clave_cifrada FROM secad_api_keys WHERE id = @id AND cod_dane = @d";
                cmd.Parameters.AddWithValue("id", id);
                cmd.Parameters.AddWithValue("d", codDane);
                return await cmd.ExecuteScalarAsync(ct) as string;
            }
            catch (PostgresException ex) when (ex.SqlState == TablaInexistente) { return null; }
        }

        public async Task<DtoApiKeyResult> CrearAsync(DtoApiKeyPersistencia llave, CancellationToken ct)
        {
            try
            {
                await using var conn = await _masterDb.OpenConnectionAsync(ct);
                await using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
INSERT INTO secad_api_keys
    (id, cod_dane, nombre, alcance, prefijo, huella, clave_cifrada,
     sitio_graba_defecto, notas, usuario_creacion)
VALUES
    (@id, @dane, @nom, @alc, @pre, @hue, @cif, @sitio, @notas, @usr)";
                cmd.Parameters.AddWithValue("id",    llave.Id);
                cmd.Parameters.AddWithValue("dane",  llave.CodDane);
                cmd.Parameters.AddWithValue("nom",   llave.Nombre);
                cmd.Parameters.AddWithValue("alc",   llave.Alcance);
                cmd.Parameters.AddWithValue("pre",   llave.Prefijo);
                cmd.Parameters.AddWithValue("hue",   llave.Huella);
                cmd.Parameters.AddWithValue("cif",   llave.ClaveCifrada);
                cmd.Parameters.AddWithValue("sitio", llave.SitioGrabaDefecto);
                cmd.Parameters.AddWithValue("notas", (object?)llave.Notas ?? DBNull.Value);
                cmd.Parameters.AddWithValue("usr",   (object?)llave.UsuarioCreacion ?? DBNull.Value);
                await cmd.ExecuteNonQueryAsync(ct);
                return new DtoApiKeyResult { success = true, message = "Llave creada." };
            }
            catch (PostgresException ex) when (ex.SqlState == TablaInexistente)
            {
                return new DtoApiKeyResult
                {
                    success = false,
                    message = "La base maestra todavía no tiene la tabla de llaves. Aplique la migración V73."
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creando llave para {Dane}", llave.CodDane);
                return new DtoApiKeyResult { success = false, message = $"Error: {ex.Message}" };
            }
        }

        public async Task<DtoApiKeyResult> RegenerarAsync(
            long id, string codDane, string prefijo, string huella, string claveCifrada,
            DateTime anteriorExpira, string? usuario, CancellationToken ct)
        {
            try
            {
                await using var conn = await _masterDb.OpenConnectionAsync(ct);
                await using var cmd = conn.CreateCommand();
                // La vigente pasa a ser la anterior con fecha de caducidad, y
                // entra la nueva. Las dos sirven durante la ventana.
                cmd.CommandText = @"
UPDATE secad_api_keys
   SET huella_anterior        = huella,
       clave_anterior_cifrada = clave_cifrada,
       anterior_expira        = @exp,
       prefijo                = @pre,
       huella                 = @hue,
       clave_cifrada          = @cif,
       fecha_modificacion     = NOW(),
       usuario_modifica       = @usr
 WHERE id = @id AND cod_dane = @d AND activa";
                cmd.Parameters.AddWithValue("exp", anteriorExpira);
                cmd.Parameters.AddWithValue("pre", prefijo);
                cmd.Parameters.AddWithValue("hue", huella);
                cmd.Parameters.AddWithValue("cif", claveCifrada);
                cmd.Parameters.AddWithValue("usr", (object?)usuario ?? DBNull.Value);
                cmd.Parameters.AddWithValue("id",  id);
                cmd.Parameters.AddWithValue("d",   codDane);

                var filas = await cmd.ExecuteNonQueryAsync(ct);
                return filas > 0
                    ? new DtoApiKeyResult { success = true,  message = "Llave regenerada." }
                    : new DtoApiKeyResult { success = false, message = "La llave no existe o está revocada." };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error regenerando llave {Id}", id);
                return new DtoApiKeyResult { success = false, message = $"Error: {ex.Message}" };
            }
        }

        public async Task<DtoApiKeyResult> CambiarEstadoAsync(long id, string codDane, bool activa, string? usuario, CancellationToken ct)
        {
            try
            {
                await using var conn = await _masterDb.OpenConnectionAsync(ct);
                await using var cmd = conn.CreateCommand();
                // Al revocar se corta también la gracia: revocar tiene que
                // significar «ya no entra nada», sin excepciones pendientes.
                cmd.CommandText = @"
UPDATE secad_api_keys
   SET activa             = @a,
       fecha_revocacion   = CASE WHEN @a THEN NULL ELSE NOW() END,
       huella_anterior    = CASE WHEN @a THEN huella_anterior ELSE NULL END,
       anterior_expira    = CASE WHEN @a THEN anterior_expira ELSE NULL END,
       fecha_modificacion = NOW(),
       usuario_modifica   = @usr
 WHERE id = @id AND cod_dane = @d";
                cmd.Parameters.AddWithValue("a",   activa);
                cmd.Parameters.AddWithValue("usr", (object?)usuario ?? DBNull.Value);
                cmd.Parameters.AddWithValue("id",  id);
                cmd.Parameters.AddWithValue("d",   codDane);

                var filas = await cmd.ExecuteNonQueryAsync(ct);
                return filas > 0
                    ? new DtoApiKeyResult { success = true, message = activa ? "Llave reactivada." : "Llave revocada." }
                    : new DtoApiKeyResult { success = false, message = "La llave no existe." };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error cambiando estado de la llave {Id}", id);
                return new DtoApiKeyResult { success = false, message = $"Error: {ex.Message}" };
            }
        }

        public async Task<DtoApiKeyResult> ActualizarAsync(long id, string codDane, DtoApiKeyRequest request, string? usuario, CancellationToken ct)
        {
            try
            {
                await using var conn = await _masterDb.OpenConnectionAsync(ct);
                await using var cmd = conn.CreateCommand();
                // El alcance NO se edita: cambiarlo en caliente ampliaría lo que
                // puede hacer un secreto que ya está en manos de un tercero.
                cmd.CommandText = @"
UPDATE secad_api_keys
   SET nombre              = @nom,
       sitio_graba_defecto = @sitio,
       notas               = @notas,
       fecha_modificacion  = NOW(),
       usuario_modifica    = @usr
 WHERE id = @id AND cod_dane = @d";
                cmd.Parameters.AddWithValue("nom",   request.Nombre.Trim());
                cmd.Parameters.AddWithValue("sitio", request.SitioGrabaDefecto);
                cmd.Parameters.AddWithValue("notas", (object?)request.Notas ?? DBNull.Value);
                cmd.Parameters.AddWithValue("usr",   (object?)usuario ?? DBNull.Value);
                cmd.Parameters.AddWithValue("id",    id);
                cmd.Parameters.AddWithValue("d",     codDane);

                var filas = await cmd.ExecuteNonQueryAsync(ct);
                return filas > 0
                    ? new DtoApiKeyResult { success = true,  message = "Llave actualizada." }
                    : new DtoApiKeyResult { success = false, message = "La llave no existe." };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error actualizando llave {Id}", id);
                return new DtoApiKeyResult { success = false, message = $"Error: {ex.Message}" };
            }
        }

        // ── Bitácora ─────────────────────────────────────────────────────────

        public async Task AuditarAsync(long apiKeyId, string codDane, string accion, string? usuario, string? ip, string? detalle, CancellationToken ct)
        {
            try
            {
                await using var conn = await _masterDb.OpenConnectionAsync(ct);
                await using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
INSERT INTO secad_api_keys_auditoria (id, api_key_id, cod_dane, accion, usuario, ip, detalle)
VALUES (@id, @llave, @dane, @acc, @usr, @ip, @det)";
                cmd.Parameters.AddWithValue("id",    _snowflake.NextId());
                cmd.Parameters.AddWithValue("llave", apiKeyId);
                cmd.Parameters.AddWithValue("dane",  codDane);
                cmd.Parameters.AddWithValue("acc",   accion);
                cmd.Parameters.AddWithValue("usr",   (object?)usuario ?? DBNull.Value);
                cmd.Parameters.AddWithValue("ip",    (object?)ip ?? DBNull.Value);
                cmd.Parameters.AddWithValue("det",   (object?)detalle ?? DBNull.Value);
                await cmd.ExecuteNonQueryAsync(ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "No se pudo auditar la acción {Accion} sobre la llave {Id}", accion, apiKeyId);
            }
        }

        public async Task<List<DtoApiKeyAuditoria>> ListarAuditoriaAsync(string codDane, int limite, CancellationToken ct)
        {
            var lista = new List<DtoApiKeyAuditoria>();
            try
            {
                await using var conn = await _masterDb.OpenConnectionAsync(ct);
                await using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
SELECT id, api_key_id, accion, usuario, ip, detalle, fecha
FROM   secad_api_keys_auditoria
WHERE  cod_dane = @d
ORDER  BY fecha DESC
LIMIT  @lim";
                cmd.Parameters.AddWithValue("d",   codDane);
                cmd.Parameters.AddWithValue("lim", limite);
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                    lista.Add(new DtoApiKeyAuditoria
                    {
                        Id       = r.GetInt64(0),
                        ApiKeyId = r.GetInt64(1),
                        Accion   = r.GetString(2),
                        Usuario  = r.IsDBNull(3) ? null : r.GetString(3),
                        Ip       = r.IsDBNull(4) ? null : r.GetString(4),
                        Detalle  = r.IsDBNull(5) ? null : r.GetString(5),
                        Fecha    = r.GetDateTime(6),
                    });
            }
            catch (PostgresException ex) when (ex.SqlState == TablaInexistente) { }
            return lista;
        }
    }
}
