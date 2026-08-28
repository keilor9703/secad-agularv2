using Comun.Dtos.Tenant;
using Datos.Interfaz;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace Datos.Gestion
{
    public class DbMasterRepository : IDbMasterRepository
    {
        private readonly NpgsqlDataSource _masterDb;
        private readonly ILogger<DbMasterRepository> _logger;

        public DbMasterRepository(NpgsqlDataSource masterDb, ILogger<DbMasterRepository> logger)
        {
            _masterDb = masterDb;
            _logger = logger;
        }

        public async Task<DtoTenant?> GetTenantByCodDaneAsync(string codDane, CancellationToken ct)
        {
            await using var conn = await _masterDb.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                                SELECT id, cod_dane, cod_unidad, nombre, departamento, municipio,
                                       db_host, db_port, db_name, db_username, db_password, sitio_graba,
                                       gespo_sigla_unidad
                                FROM secad_tenants
                                WHERE cod_dane = @codDane AND activo = true
                                LIMIT 1";
            cmd.Parameters.AddWithValue("codDane", codDane);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            if (await reader.ReadAsync(ct))
                return MapTenant(reader);

            _logger.LogWarning("Tenant no encontrado para cod_dane={CodDane}", codDane);
            return null;
        }

        public async Task<DtoTenant?> GetTenantByCodUnidadAsync(string codUnidad, CancellationToken ct)
        {
            await using var conn = await _masterDb.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                                SELECT id, cod_dane, cod_unidad, nombre, departamento, municipio,
                                       db_host, db_port, db_name, db_username, db_password, sitio_graba,
                                       gespo_sigla_unidad
                                FROM secad_tenants
                                WHERE UPPER(cod_unidad) = UPPER(@codUnidad) AND activo = true
                                LIMIT 1";
            cmd.Parameters.AddWithValue("codUnidad", codUnidad);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            if (await reader.ReadAsync(ct))
                return MapTenant(reader);

            _logger.LogWarning("Tenant no encontrado para cod_unidad={CodUnidad}", codUnidad);
            return null;
        }

        public async Task<(string? codDane, string? passwordHash)> GetFallbackUserAsync(string username, CancellationToken ct)
        {
            await using var conn = await _masterDb.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                                SELECT cod_dane, password_hash
                                FROM secad_users_fallback
                                WHERE UPPER(username) = UPPER(@username) AND activo = true
                                LIMIT 1";
            cmd.Parameters.AddWithValue("username", username);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            if (await reader.ReadAsync(ct))
            {
                var codDane = reader.IsDBNull(0) ? null : reader.GetString(0);
                var hash = reader.IsDBNull(1) ? null : reader.GetString(1);
                return (codDane, hash);
            }

            return (null, null);
        }

        public async Task AuditFallbackLoginAsync(string username, string codDane, string? ipOrigen, bool modoFallback, CancellationToken ct)
        {
            try
            {
                await using var conn = await _masterDb.OpenConnectionAsync(ct);
                await using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                                INSERT INTO secad_audit_fallback (username, cod_dane, ip_origen, modo_fallback)
                                VALUES (@username, @codDane, @ipOrigen, @modoFallback)";
                cmd.Parameters.AddWithValue("username", username);
                cmd.Parameters.AddWithValue("codDane", codDane);
                cmd.Parameters.AddWithValue("ipOrigen", (object?)ipOrigen ?? DBNull.Value);
                cmd.Parameters.AddWithValue("modoFallback", modoFallback);
                await cmd.ExecuteNonQueryAsync(ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error registrando auditoría de login para {Username}", username);
            }
        }

        public async Task<(bool success, string message)> SaveCivilUserAsync(
            string username, string passwordHash, string codDane, bool activo, CancellationToken ct)
        {
            try
            {
                await using var conn = await _masterDb.OpenConnectionAsync(ct);

                // Si viene sin hash (edición sin cambio de contraseña) y el usuario ya existe → solo actualizar activo/codDane
                if (string.IsNullOrWhiteSpace(passwordHash))
                {
                    await using var cmdUpd = conn.CreateCommand();
                    cmdUpd.CommandText = @"
UPDATE secad_users_fallback
   SET cod_dane = @codDane, activo = @activo
 WHERE UPPER(username) = UPPER(@username)";
                    cmdUpd.Parameters.AddWithValue("codDane", codDane);
                    cmdUpd.Parameters.AddWithValue("activo", activo);
                    cmdUpd.Parameters.AddWithValue("username", username);
                    await cmdUpd.ExecuteNonQueryAsync(ct);
                    return (true, "Datos del usuario civil actualizados (sin cambio de contraseña).");
                }

                await using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
INSERT INTO secad_users_fallback (username, cod_dane, password_hash, activo)
VALUES (@username, @codDane, @hash, @activo)
ON CONFLICT (username) DO UPDATE SET
    cod_dane      = EXCLUDED.cod_dane,
    password_hash = EXCLUDED.password_hash,
    activo        = EXCLUDED.activo";
                cmd.Parameters.AddWithValue("username", username);
                cmd.Parameters.AddWithValue("codDane", codDane);
                cmd.Parameters.AddWithValue("hash", passwordHash);
                cmd.Parameters.AddWithValue("activo", activo);
                await cmd.ExecuteNonQueryAsync(ct);
                return (true, "Usuario civil registrado en autenticación local.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error guardando usuario civil en fallback. username={Username}", username);
                return (false, $"Error registrando autenticación local: {ex.Message}");
            }
        }

        // ── SuperAdmin: tenant management ─────────────────────────────────────

        public async Task<List<DtoTenantPublico>> GetAllTenantsAsync(CancellationToken ct)
        {
            await using var conn = await _masterDb.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
                SELECT id, cod_dane, cod_unidad, nombre, departamento, municipio, categoria,
                       activo, suspendido, fecha_creacion, fecha_modificacion,
                       COALESCE(nivel_operacion, 1), latencia_ms, ultima_sincro,
                       COALESCE(incidentes_activos, 0), observaciones,
                       sitio_graba
                FROM secad_tenants
                ORDER BY nombre";

            var list = new List<DtoTenantPublico>();
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
                list.Add(MapTenantPublico(reader));
            return list;
        }

        public async Task<(bool success, string message, string? codDane)> CreateTenantAsync(
            DtoTenantRequest req, CancellationToken ct)
        {
            try
            {
                await using var conn = await _masterDb.OpenConnectionAsync(ct);
                await using var cmd  = conn.CreateCommand();
                cmd.CommandText = @"
                    INSERT INTO secad_tenants
                        (cod_dane, cod_unidad, nombre, departamento, municipio, categoria,
                         sitio_graba,
                         db_host, db_port, db_name, db_username, db_password, activo)
                    VALUES
                        (@codDane, @codUnidad, @nombre, @departamento, @municipio, @categoria,
                         @sitioGraba,
                         @dbHost, @dbPort, @dbName, @dbUser, @dbPass, @activo)
                    ON CONFLICT (cod_dane) DO NOTHING
                    RETURNING cod_dane";

                cmd.Parameters.AddWithValue("codDane",     req.CodDane.Trim());
                cmd.Parameters.AddWithValue("codUnidad",   (object?)req.CodUnidad    ?? DBNull.Value);
                cmd.Parameters.AddWithValue("nombre",      req.Nombre.Trim());
                cmd.Parameters.AddWithValue("departamento",(object?)req.Departamento ?? DBNull.Value);
                cmd.Parameters.AddWithValue("municipio",   (object?)req.Municipio    ?? DBNull.Value);
                cmd.Parameters.AddWithValue("categoria",   req.Categoria.Trim());
                cmd.Parameters.AddWithValue("sitioGraba",  (object?)req.SitioGraba   ?? DBNull.Value);
                cmd.Parameters.AddWithValue("dbHost",      req.DbHost.Trim());
                cmd.Parameters.AddWithValue("dbPort",      req.DbPort);
                cmd.Parameters.AddWithValue("dbName",      req.DbName.Trim());
                cmd.Parameters.AddWithValue("dbUser",      req.DbUsername.Trim());
                cmd.Parameters.AddWithValue("dbPass",      req.DbPassword?.Trim() ?? string.Empty);
                cmd.Parameters.AddWithValue("activo",      req.Activo);

                var returned = await cmd.ExecuteScalarAsync(ct);
                if (returned is null)
                    return (false, $"Ya existe un tenant con cod_dane={req.CodDane}.", null);

                return (true, "Tenant creado correctamente.", req.CodDane);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creando tenant {CodDane}", req.CodDane);
                return (false, $"Error al crear tenant: {ex.Message}", null);
            }
        }

        public async Task<(bool success, string message)> UpdateTenantAsync(
            int id, DtoTenantRequest req, CancellationToken ct)
        {
            try
            {
                await using var conn = await _masterDb.OpenConnectionAsync(ct);
                await using var cmd  = conn.CreateCommand();

                // Build SET clauses conditionally — skip DB credentials when not provided
                // (UI doesn't expose credentials in the edit form for security)
                var setClauses = new System.Text.StringBuilder(@"
                    cod_unidad         = @codUnidad,
                    nombre             = @nombre,
                    departamento       = @departamento,
                    municipio          = @municipio,
                    categoria          = @categoria,
                    sitio_graba        = @sitioGraba,
                    activo             = @activo,
                    fecha_modificacion = NOW()");

                bool updateHost = !string.IsNullOrWhiteSpace(req.DbHost);
                bool updateName = !string.IsNullOrWhiteSpace(req.DbName);
                bool updateUser = !string.IsNullOrWhiteSpace(req.DbUsername);
                bool updatePass = !string.IsNullOrWhiteSpace(req.DbPassword);

                if (updateHost) setClauses.Append(", db_host     = @dbHost");
                if (req.DbPort > 0) setClauses.Append(", db_port  = @dbPort");
                if (updateName) setClauses.Append(", db_name     = @dbName");
                if (updateUser) setClauses.Append(", db_username = @dbUser");
                if (updatePass) setClauses.Append(", db_password = @dbPass");

                cmd.CommandText = $"UPDATE secad_tenants SET {setClauses} WHERE id = @id";

                cmd.Parameters.AddWithValue("id",           id);
                cmd.Parameters.AddWithValue("codUnidad",    (object?)req.CodUnidad    ?? DBNull.Value);
                cmd.Parameters.AddWithValue("nombre",       req.Nombre.Trim());
                cmd.Parameters.AddWithValue("departamento", (object?)req.Departamento ?? DBNull.Value);
                cmd.Parameters.AddWithValue("municipio",    (object?)req.Municipio    ?? DBNull.Value);
                cmd.Parameters.AddWithValue("categoria",    req.Categoria.Trim());
                cmd.Parameters.AddWithValue("sitioGraba",   (object?)req.SitioGraba   ?? DBNull.Value);
                cmd.Parameters.AddWithValue("activo",       req.Activo);

                if (updateHost) cmd.Parameters.AddWithValue("dbHost", req.DbHost.Trim());
                if (req.DbPort > 0) cmd.Parameters.AddWithValue("dbPort", req.DbPort);
                if (updateName) cmd.Parameters.AddWithValue("dbName", req.DbName.Trim());
                if (updateUser) cmd.Parameters.AddWithValue("dbUser", req.DbUsername.Trim());
                if (updatePass) cmd.Parameters.AddWithValue("dbPass", req.DbPassword!.Trim());

                var rows = await cmd.ExecuteNonQueryAsync(ct);
                return rows > 0
                    ? (true, "Tenant actualizado correctamente.")
                    : (false, "Tenant no encontrado.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error actualizando tenant id={Id}", id);
                return (false, $"Error al actualizar: {ex.Message}");
            }
        }

        public async Task<(bool success, string message)> ToggleTenantAsync(int id, CancellationToken ct)
        {
            await using var conn = await _masterDb.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
                UPDATE secad_tenants
                   SET activo = NOT activo, fecha_modificacion = NOW()
                 WHERE id = @id
                RETURNING activo";
            cmd.Parameters.AddWithValue("id", id);
            var result = await cmd.ExecuteScalarAsync(ct);
            if (result is null) return (false, "Tenant no encontrado.");
            var newState = (bool)result;
            return (true, newState ? "Tenant activado." : "Tenant desactivado.");
        }

        // ── SuperAdmin: Salud CADs ─────────────────────────────────────────────

        /// <inheritdoc/>
        public async Task<List<DtoTenant>> GetActiveTenantsForMonitorAsync(CancellationToken ct)
        {
            await using var conn = await _masterDb.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
                SELECT id, cod_dane, cod_unidad, nombre, departamento, municipio,
                       db_host, db_port, db_name, db_username, db_password, sitio_graba,
                       gespo_sigla_unidad
                FROM secad_tenants
                WHERE activo = true
                ORDER BY cod_dane";

            var list = new List<DtoTenant>();
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
                list.Add(MapTenant(reader));
            return list;
        }

        public async Task<List<DtoTenantPublico>> GetSaludCadsAsync(CancellationToken ct)
        {
            // Reuse GetAllTenantsAsync — same query with health columns
            return await GetAllTenantsAsync(ct);
        }

        public async Task UpdateSaludCadAsync(DtoSaludCadRequest req, CancellationToken ct)
        {
            try
            {
                await using var conn = await _masterDb.OpenConnectionAsync(ct);

                // Update current metrics on the tenant row
                await using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
                        UPDATE secad_tenants
                           SET nivel_operacion    = @nivel,
                               latencia_ms        = @latencia,
                               ultima_sincro      = NOW(),
                               observaciones      = @obs
                         WHERE cod_dane = @codDane";
                    cmd.Parameters.AddWithValue("codDane", req.CodDane);
                    cmd.Parameters.AddWithValue("nivel",   req.NivelOperacion);
                    cmd.Parameters.AddWithValue("latencia",(object?)req.LatenciaMs ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("obs",     (object?)req.Observaciones ?? DBNull.Value);
                    await cmd.ExecuteNonQueryAsync(ct);
                }

                // Append history snapshot
                await using (var cmd2 = conn.CreateCommand())
                {
                    cmd2.CommandText = @"
                        INSERT INTO secad_salud_historial
                            (cod_dane, nivel_operacion, latencia_ms, observacion)
                        VALUES (@codDane, @nivel, @latencia, @obs)";
                    cmd2.Parameters.AddWithValue("codDane", req.CodDane);
                    cmd2.Parameters.AddWithValue("nivel",   req.NivelOperacion);
                    cmd2.Parameters.AddWithValue("latencia",(object?)req.LatenciaMs ?? DBNull.Value);
                    cmd2.Parameters.AddWithValue("obs",     (object?)req.Observaciones ?? DBNull.Value);
                    await cmd2.ExecuteNonQueryAsync(ct);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error actualizando salud CAD {CodDane}", req.CodDane);
            }
        }

        public async Task<List<DtoSaludHistorial>> GetSaludHistorialAsync(
            string codDane, int limit, CancellationToken ct)
        {
            await using var conn = await _masterDb.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
                SELECT id, cod_dane, nivel_operacion, latencia_ms, observacion, registrado_en
                FROM secad_salud_historial
                WHERE cod_dane = @codDane
                ORDER BY registrado_en DESC
                LIMIT @lim";
            cmd.Parameters.AddWithValue("codDane", codDane);
            cmd.Parameters.AddWithValue("lim",     limit > 0 ? limit : 100);

            var list = new List<DtoSaludHistorial>();
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                list.Add(new DtoSaludHistorial
                {
                    Id              = reader.GetInt64(0),
                    CodDane         = reader.GetString(1),
                    NivelOperacion  = reader.GetInt16(2),
                    LatenciaMs      = reader.IsDBNull(3) ? null : reader.GetInt32(3),
                    Observacion     = reader.IsDBNull(4) ? null : reader.GetString(4),
                    RegistradoEn    = reader.GetDateTime(5)
                });
            }
            return list;
        }

        // ── Mappers ────────────────────────────────────────────────────────────

        // Columnas (0-11): id, cod_dane, cod_unidad, nombre, departamento, municipio,
        //                  db_host, db_port, db_name, db_username, db_password, sitio_graba
        private static DtoTenant MapTenant(NpgsqlDataReader r) => new()
        {
            Id               = r.GetInt32(0),
            CodDane          = r.GetString(1),
            CodUnidad        = r.IsDBNull(2)  ? null : r.GetString(2),
            Nombre           = r.GetString(3),
            Departamento     = r.IsDBNull(4)  ? null : r.GetString(4),
            Municipio        = r.IsDBNull(5)  ? null : r.GetString(5),
            DbHost           = r.GetString(6),
            DbPort           = r.GetInt32(7),
            DbName           = r.GetString(8),
            DbUsername       = r.GetString(9),
            DbPassword       = r.GetString(10),
            SitioGraba       = r.IsDBNull(11) ? null : r.GetInt32(11),
            GespoSiglaUnidad = r.IsDBNull(12) ? null : r.GetString(12)
        };

        // Columnas (0-16): id, cod_dane, cod_unidad, nombre, departamento, municipio, categoria,
        //                  activo, suspendido, fecha_creacion, fecha_modificacion,
        //                  nivel_operacion, latencia_ms, ultima_sincro, incidentes_activos,
        //                  observaciones, sitio_graba
        private static DtoTenantPublico MapTenantPublico(NpgsqlDataReader r) => new()
        {
            Id                = r.GetInt32(0),
            CodDane           = r.GetString(1),
            CodUnidad         = r.IsDBNull(2)  ? null : r.GetString(2),
            Nombre            = r.GetString(3),
            Departamento      = r.IsDBNull(4)  ? null : r.GetString(4),
            Municipio         = r.IsDBNull(5)  ? null : r.GetString(5),
            Categoria         = r.IsDBNull(6)  ? null : r.GetString(6),
            Activo            = r.GetBoolean(7),
            Suspendido        = r.GetBoolean(8),
            FechaCreacion     = r.IsDBNull(9)  ? null : r.GetDateTime(9),
            FechaModificacion = r.IsDBNull(10) ? null : r.GetDateTime(10),
            NivelOperacion    = r.IsDBNull(11) ? 1    : r.GetInt16(11),
            LatenciaMs        = r.IsDBNull(12) ? null : r.GetInt32(12),
            UltimaSincro      = r.IsDBNull(13) ? null : r.GetDateTime(13),
            IncidentesActivos = r.IsDBNull(14) ? 0    : r.GetInt32(14),
            Observaciones     = r.IsDBNull(15) ? null : r.GetString(15),
            SitioGraba        = r.IsDBNull(16) ? null : r.GetInt32(16)
        };
    }
}
