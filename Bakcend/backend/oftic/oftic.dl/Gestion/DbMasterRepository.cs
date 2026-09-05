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

        /// <summary>
        /// Resuelve el nombre de cada CAD a partir de su código DANE.
        ///
        /// El catálogo de códigos de caso vive en la base del TENANT y guarda
        /// solo el cod_dane del ámbito; el nombre del CAD está en la maestra,
        /// que es otra base y a menudo otro servidor, así que no hay JOIN
        /// posible. Se resuelve aquí, con una sola consulta para toda la lista
        /// en vez de una por fila.
        /// </summary>
        public async Task<Dictionary<string, string>> GetNombresCadAsync(
            IReadOnlyCollection<string> codDanes, CancellationToken ct)
        {
            var resultado = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            var codigos = codDanes
                .Where(c => !string.IsNullOrWhiteSpace(c))
                .Select(c => c.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();

            if (codigos.Length == 0) return resultado;

            await using var conn = await _masterDb.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
                SELECT cod_dane, nombre
                FROM   secad_tenants
                WHERE  cod_dane = ANY(@codigos)";
            cmd.Parameters.AddWithValue("codigos", codigos);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
                resultado[reader.GetString(0)] = reader.GetString(1);

            return resultado;
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

        // ── SuperAdmin: Unidades y Municipios Institucionales ────────────────

        public async Task<List<DtoDepartamentoItem>> GetDepartamentosAsync(CancellationToken ct)
        {
            await using var conn = await _masterDb.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                SELECT departamento, MIN(codigo_departamento) AS codigo_departamento, COUNT(DISTINCT municipio) AS total_municipios
                FROM secad_unidades
                WHERE departamento IS NOT NULL AND TRIM(departamento) <> ''
                GROUP BY departamento
                ORDER BY departamento ASC";

            var list = new List<DtoDepartamentoItem>();
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                list.Add(new DtoDepartamentoItem
                {
                    Departamento = reader.GetString(0),
                    CodigoDepartamento = reader.IsDBNull(1) ? null : reader.GetDecimal(1),
                    TotalMunicipios = Convert.ToInt32(reader.GetInt64(2))
                });
            }
            return list;
        }

        public async Task<List<DtoMunicipioItem>> GetMunicipiosByDepartamentoAsync(string departamento, CancellationToken ct)
        {
            await using var conn = await _masterDb.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                SELECT consecutivo, municipio, departamento, COALESCE(codigo_dane, '') AS codigo_dane,
                       sigla_fisica, descripcion_dependencia, desc_regional
                FROM secad_unidades
                WHERE UPPER(TRIM(departamento)) = UPPER(TRIM(@dep))
                  AND municipio IS NOT NULL AND TRIM(municipio) <> ''
                ORDER BY municipio ASC, consecutivo ASC";
            cmd.Parameters.AddWithValue("dep", departamento);

            var list = new List<DtoMunicipioItem>();
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                list.Add(new DtoMunicipioItem
                {
                    Consecutivo = reader.GetDecimal(0),
                    Municipio = reader.GetString(1),
                    Departamento = reader.GetString(2),
                    CodigoDane = reader.GetString(3),
                    SiglaFisica = reader.IsDBNull(4) ? null : reader.GetString(4),
                    DescripcionDependencia = reader.IsDBNull(5) ? null : reader.GetString(5),
                    DescRegional = reader.IsDBNull(6) ? null : reader.GetString(6)
                });
            }
            return list;
        }

        public async Task<DtoUnidadesPaginadas> GetUnidadesAsync(string? filtro, string? departamento, int page, int pageSize, CancellationToken ct)
        {
            page = page < 1 ? 1 : page;
            pageSize = pageSize < 1 ? 20 : (pageSize > 200 ? 200 : pageSize);
            int offset = (page - 1) * pageSize;

            await using var conn = await _masterDb.OpenConnectionAsync(ct);
            
            var whereClauses = new List<string>();
            await using var cmdCount = conn.CreateCommand();
            
            if (!string.IsNullOrWhiteSpace(departamento))
            {
                whereClauses.Add("UPPER(TRIM(departamento)) = UPPER(TRIM(@dep))");
                cmdCount.Parameters.AddWithValue("dep", departamento);
            }
            if (!string.IsNullOrWhiteSpace(filtro))
            {
                whereClauses.Add("(descripcion_dependencia ILIKE @filtro OR sigla_fisica ILIKE @filtro OR municipio ILIKE @filtro OR codigo_dane ILIKE @filtro OR CAST(consecutivo AS TEXT) ILIKE @filtro)");
                cmdCount.Parameters.AddWithValue("filtro", $"%{filtro.Trim()}%");
            }

            string whereSql = whereClauses.Count > 0 ? "WHERE " + string.Join(" AND ", whereClauses) : "";

            cmdCount.CommandText = $"SELECT COUNT(*) FROM secad_unidades {whereSql}";
            var totalCountObj = await cmdCount.ExecuteScalarAsync(ct);
            int totalCount = Convert.ToInt32(totalCountObj);

            await using var cmdList = conn.CreateCommand();
            foreach (NpgsqlParameter p in cmdCount.Parameters)
            {
                cmdList.Parameters.AddWithValue(p.ParameterName, p.Value!);
            }
            cmdList.CommandText = $@"
                SELECT consecutivo, fuerza, descripcion_dependencia, vigente, sigla_fisica, sigla_papa,
                       sigla_depende, departamento, codigo_departamento, municipio, codigo_dane, desc_regional,
                       cod_regional, direccion, telefono, telefono_ip, email, zona, tipo, tipo_descripcion,
                       fecha_creacion, fecha_actualiza
                FROM secad_unidades
                {whereSql}
                ORDER BY departamento ASC, municipio ASC, consecutivo ASC
                LIMIT @limit OFFSET @offset";
            cmdList.Parameters.AddWithValue("limit", pageSize);
            cmdList.Parameters.AddWithValue("offset", offset);

            var items = new List<DtoUnidadItem>();
            await using var reader = await cmdList.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                items.Add(new DtoUnidadItem
                {
                    Consecutivo = reader.GetDecimal(0),
                    Fuerza = reader.IsDBNull(1) ? null : reader.GetDecimal(1),
                    DescripcionDependencia = reader.GetString(2),
                    Vigente = reader.IsDBNull(3) ? "SI" : reader.GetString(3),
                    SiglaFisica = reader.IsDBNull(4) ? null : reader.GetString(4),
                    SiglaPapa = reader.IsDBNull(5) ? null : reader.GetString(5),
                    SiglaDepende = reader.IsDBNull(6) ? null : reader.GetString(6),
                    Departamento = reader.IsDBNull(7) ? null : reader.GetString(7),
                    CodigoDepartamento = reader.IsDBNull(8) ? null : reader.GetDecimal(8),
                    Municipio = reader.IsDBNull(9) ? null : reader.GetString(9),
                    CodigoDane = reader.IsDBNull(10) ? null : reader.GetString(10),
                    DescRegional = reader.IsDBNull(11) ? null : reader.GetString(11),
                    CodRegional = reader.IsDBNull(12) ? null : reader.GetDecimal(12),
                    Direccion = reader.IsDBNull(13) ? null : reader.GetString(13),
                    Telefono = reader.IsDBNull(14) ? null : reader.GetString(14),
                    TelefonoIp = reader.IsDBNull(15) ? null : reader.GetString(15),
                    Email = reader.IsDBNull(16) ? null : reader.GetString(16),
                    Zona = reader.IsDBNull(17) ? null : reader.GetString(17),
                    Tipo = reader.IsDBNull(18) ? null : reader.GetString(18),
                    TipoDescripcion = reader.IsDBNull(19) ? null : reader.GetString(19),
                    FechaCreacion = reader.IsDBNull(20) ? null : reader.GetDateTime(20),
                    FechaActualiza = reader.IsDBNull(21) ? null : reader.GetDateTime(21)
                });
            }

            return new DtoUnidadesPaginadas
            {
                Items = items,
                TotalCount = totalCount,
                Page = page,
                PageSize = pageSize
            };
        }

        public async Task<(bool success, string message, decimal consecutivo)> SaveUnidadAsync(DtoUnidadSaveRequest request, string usuarioAuditoria, CancellationToken ct)
        {
            await using var conn = await _masterDb.OpenConnectionAsync(ct);
            decimal consecutivo = request.Consecutivo ?? 0;

            if (consecutivo <= 0)
            {
                await using var cmdNext = conn.CreateCommand();
                cmdNext.CommandText = "SELECT COALESCE(MAX(consecutivo), 0) + 1 FROM secad_unidades";
                var res = await cmdNext.ExecuteScalarAsync(ct);
                consecutivo = Convert.ToDecimal(res);
            }

            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                INSERT INTO secad_unidades (
                    consecutivo, fuerza, descripcion_dependencia, vigente, sigla_fisica, sigla_papa,
                    departamento, codigo_departamento, municipio, codigo_dane, desc_regional, cod_regional,
                    direccion, telefono, telefono_ip, email, zona, tipo, tipo_descripcion,
                    creado_por, fecha_creacion, actualizado_por, fecha_actualiza
                ) VALUES (
                    @consecutivo, @fuerza, @descripcion, @vigente, @siglaFisica, @siglaPapa,
                    @departamento, @codDepartamento, @municipio, @codigoDane, @descRegional, @codRegional,
                    @direccion, @telefono, @telefonoIp, @email, @zona, @tipo, @tipoDescripcion,
                    @usuario, NOW(), @usuario, NOW()
                )
                ON CONFLICT (consecutivo) DO UPDATE SET
                    fuerza = EXCLUDED.fuerza,
                    descripcion_dependencia = EXCLUDED.descripcion_dependencia,
                    vigente = EXCLUDED.vigente,
                    sigla_fisica = EXCLUDED.sigla_fisica,
                    sigla_papa = EXCLUDED.sigla_papa,
                    departamento = EXCLUDED.departamento,
                    codigo_departamento = EXCLUDED.codigo_departamento,
                    municipio = EXCLUDED.municipio,
                    codigo_dane = EXCLUDED.codigo_dane,
                    desc_regional = EXCLUDED.desc_regional,
                    cod_regional = EXCLUDED.cod_regional,
                    direccion = EXCLUDED.direccion,
                    telefono = EXCLUDED.telefono,
                    telefono_ip = EXCLUDED.telefono_ip,
                    email = EXCLUDED.email,
                    zona = EXCLUDED.zona,
                    tipo = EXCLUDED.tipo,
                    tipo_descripcion = EXCLUDED.tipo_descripcion,
                    actualizado_por = EXCLUDED.actualizado_por,
                    fecha_actualiza = NOW()";

            cmd.Parameters.AddWithValue("consecutivo", consecutivo);
            cmd.Parameters.AddWithValue("fuerza", (object?)request.Fuerza ?? DBNull.Value);
            cmd.Parameters.AddWithValue("descripcion", request.DescripcionDependencia.Trim());
            cmd.Parameters.AddWithValue("vigente", string.IsNullOrWhiteSpace(request.Vigente) ? "SI" : request.Vigente.Trim().ToUpper());
            cmd.Parameters.AddWithValue("siglaFisica", (object?)request.SiglaFisica?.Trim() ?? DBNull.Value);
            cmd.Parameters.AddWithValue("siglaPapa", (object?)request.SiglaPapa?.Trim() ?? DBNull.Value);
            cmd.Parameters.AddWithValue("departamento", request.Departamento.Trim());
            cmd.Parameters.AddWithValue("codDepartamento", (object?)request.CodigoDepartamento ?? DBNull.Value);
            cmd.Parameters.AddWithValue("municipio", request.Municipio.Trim());
            cmd.Parameters.AddWithValue("codigoDane", request.CodigoDane.Trim());
            cmd.Parameters.AddWithValue("descRegional", (object?)request.DescRegional?.Trim() ?? DBNull.Value);
            cmd.Parameters.AddWithValue("codRegional", (object?)request.CodRegional ?? DBNull.Value);
            cmd.Parameters.AddWithValue("direccion", (object?)request.Direccion?.Trim() ?? DBNull.Value);
            cmd.Parameters.AddWithValue("telefono", (object?)request.Telefono?.Trim() ?? DBNull.Value);
            cmd.Parameters.AddWithValue("telefonoIp", (object?)request.TelefonoIp?.Trim() ?? DBNull.Value);
            cmd.Parameters.AddWithValue("email", (object?)request.Email?.Trim() ?? DBNull.Value);
            cmd.Parameters.AddWithValue("zona", (object?)request.Zona?.Trim() ?? "UR");
            cmd.Parameters.AddWithValue("tipo", (object?)request.Tipo?.Trim() ?? "DE");
            cmd.Parameters.AddWithValue("tipoDescripcion", (object?)request.TipoDescripcion?.Trim() ?? "CM");
            cmd.Parameters.AddWithValue("usuario", string.IsNullOrWhiteSpace(usuarioAuditoria) ? "SISTEMA" : usuarioAuditoria);

            await cmd.ExecuteNonQueryAsync(ct);
            return (true, "Unidad institucional guardada correctamente.", consecutivo);
        }

        /// <summary>
        /// Importación masiva de unidades desde el Excel de la pantalla de
        /// Super Admin. Todo el archivo va en UNA transacción: si algo revienta
        /// a mitad, no queda medio catálogo cargado.
        ///
        /// Cómo decide si una fila es alta o actualización:
        ///   · Si el archivo trae `consecutivo`, manda ese —es lo que permite
        ///     exportar, editar en Excel y volver a importar sin duplicar—.
        ///   · Si no lo trae, busca por (código DANE + descripción de la
        ///     dependencia), que es lo que identifica una fila en la práctica:
        ///     el DANE solo no basta, porque un mismo municipio tiene varias
        ///     dependencias.
        ///   · Si tampoco aparece así, es nueva y se le asigna el siguiente
        ///     consecutivo.
        ///
        /// Una fila inválida no aborta el archivo: se anota con su número de
        /// fila y se sigue con las demás.
        /// </summary>
        public async Task<DtoImportarUnidadesResult> ImportarUnidadesAsync(
            List<DtoUnidadImportItem> items, string usuarioAuditoria, CancellationToken ct)
        {
            var resultado = new DtoImportarUnidadesResult();
            if (items is null || items.Count == 0)
            {
                resultado.Success = false;
                resultado.Message = "El archivo no trae filas para importar.";
                return resultado;
            }

            var usuario = string.IsNullOrWhiteSpace(usuarioAuditoria) ? "SISTEMA" : usuarioAuditoria;

            await using var conn = await _masterDb.OpenConnectionAsync(ct);
            await using var tx = await conn.BeginTransactionAsync(ct);

            try
            {
                foreach (var item in items)
                {
                    if (string.IsNullOrWhiteSpace(item.DescripcionDependencia) ||
                        string.IsNullOrWhiteSpace(item.Departamento) ||
                        string.IsNullOrWhiteSpace(item.Municipio) ||
                        string.IsNullOrWhiteSpace(item.CodigoDane))
                    {
                        resultado.Errores.Add(new DtoImportarUnidadesError
                        {
                            Fila = item.Fila,
                            Descripcion = item.DescripcionDependencia ?? string.Empty,
                            Motivo = "Faltan campos obligatorios (dependencia, departamento, municipio o código DANE).",
                        });
                        continue;
                    }

                    decimal consecutivo = item.Consecutivo ?? 0;

                    // Sin consecutivo en el archivo: buscar la fila equivalente.
                    if (consecutivo <= 0)
                    {
                        await using var buscar = conn.CreateCommand();
                        buscar.Transaction = tx;
                        buscar.CommandText = @"
                            SELECT consecutivo FROM secad_unidades
                            WHERE  UPPER(TRIM(codigo_dane))              = UPPER(TRIM(@dane))
                              AND  UPPER(TRIM(descripcion_dependencia))  = UPPER(TRIM(@desc))
                            ORDER  BY consecutivo
                            LIMIT  1";
                        buscar.Parameters.AddWithValue("dane", item.CodigoDane.Trim());
                        buscar.Parameters.AddWithValue("desc", item.DescripcionDependencia.Trim());
                        var hallado = await buscar.ExecuteScalarAsync(ct);
                        if (hallado is not null && hallado != DBNull.Value)
                        {
                            consecutivo = Convert.ToDecimal(hallado);
                        }
                    }

                    // ¿Existe ya esa fila? Decide si cuenta como alta o como cambio.
                    bool existia = false;
                    if (consecutivo > 0)
                    {
                        await using var comprobar = conn.CreateCommand();
                        comprobar.Transaction = tx;
                        comprobar.CommandText = "SELECT 1 FROM secad_unidades WHERE consecutivo = @c";
                        comprobar.Parameters.AddWithValue("c", consecutivo);
                        existia = await comprobar.ExecuteScalarAsync(ct) is not null;
                    }

                    if (consecutivo <= 0)
                    {
                        await using var siguiente = conn.CreateCommand();
                        siguiente.Transaction = tx;
                        siguiente.CommandText = "SELECT COALESCE(MAX(consecutivo), 0) + 1 FROM secad_unidades";
                        consecutivo = Convert.ToDecimal(await siguiente.ExecuteScalarAsync(ct));
                    }

                    await using var guardar = conn.CreateCommand();
                    guardar.Transaction = tx;
                    guardar.CommandText = @"
                        INSERT INTO secad_unidades (
                            consecutivo, fuerza, descripcion_dependencia, vigente, sigla_fisica, sigla_papa,
                            departamento, codigo_departamento, municipio, codigo_dane, desc_regional, cod_regional,
                            direccion, telefono, telefono_ip, email, zona, tipo, tipo_descripcion,
                            creado_por, fecha_creacion, actualizado_por, fecha_actualiza
                        ) VALUES (
                            @consecutivo, @fuerza, @descripcion, @vigente, @siglaFisica, @siglaPapa,
                            @departamento, @codDepartamento, @municipio, @codigoDane, @descRegional, @codRegional,
                            @direccion, @telefono, @telefonoIp, @email, @zona, @tipo, @tipoDescripcion,
                            @usuario, NOW(), @usuario, NOW()
                        )
                        ON CONFLICT (consecutivo) DO UPDATE SET
                            fuerza = EXCLUDED.fuerza,
                            descripcion_dependencia = EXCLUDED.descripcion_dependencia,
                            vigente = EXCLUDED.vigente,
                            sigla_fisica = EXCLUDED.sigla_fisica,
                            sigla_papa = EXCLUDED.sigla_papa,
                            departamento = EXCLUDED.departamento,
                            codigo_departamento = EXCLUDED.codigo_departamento,
                            municipio = EXCLUDED.municipio,
                            codigo_dane = EXCLUDED.codigo_dane,
                            desc_regional = EXCLUDED.desc_regional,
                            cod_regional = EXCLUDED.cod_regional,
                            direccion = EXCLUDED.direccion,
                            telefono = EXCLUDED.telefono,
                            telefono_ip = EXCLUDED.telefono_ip,
                            email = EXCLUDED.email,
                            zona = EXCLUDED.zona,
                            tipo = EXCLUDED.tipo,
                            tipo_descripcion = EXCLUDED.tipo_descripcion,
                            actualizado_por = EXCLUDED.actualizado_por,
                            fecha_actualiza = NOW()";

                    guardar.Parameters.AddWithValue("consecutivo", consecutivo);
                    guardar.Parameters.AddWithValue("fuerza", (object?)item.Fuerza ?? 6m);
                    guardar.Parameters.AddWithValue("descripcion", item.DescripcionDependencia.Trim());
                    guardar.Parameters.AddWithValue("vigente", string.IsNullOrWhiteSpace(item.Vigente) ? "SI" : item.Vigente.Trim().ToUpper());
                    guardar.Parameters.AddWithValue("siglaFisica", (object?)item.SiglaFisica?.Trim() ?? DBNull.Value);
                    guardar.Parameters.AddWithValue("siglaPapa", (object?)item.SiglaPapa?.Trim() ?? DBNull.Value);
                    guardar.Parameters.AddWithValue("departamento", item.Departamento.Trim());
                    guardar.Parameters.AddWithValue("codDepartamento", (object?)item.CodigoDepartamento ?? DBNull.Value);
                    guardar.Parameters.AddWithValue("municipio", item.Municipio.Trim());
                    guardar.Parameters.AddWithValue("codigoDane", item.CodigoDane.Trim());
                    guardar.Parameters.AddWithValue("descRegional", (object?)item.DescRegional?.Trim() ?? DBNull.Value);
                    guardar.Parameters.AddWithValue("codRegional", (object?)item.CodRegional ?? DBNull.Value);
                    guardar.Parameters.AddWithValue("direccion", (object?)item.Direccion?.Trim() ?? DBNull.Value);
                    guardar.Parameters.AddWithValue("telefono", (object?)item.Telefono?.Trim() ?? DBNull.Value);
                    guardar.Parameters.AddWithValue("telefonoIp", (object?)item.TelefonoIp?.Trim() ?? DBNull.Value);
                    guardar.Parameters.AddWithValue("email", (object?)item.Email?.Trim() ?? DBNull.Value);
                    guardar.Parameters.AddWithValue("zona", (object?)item.Zona?.Trim() ?? "UR");
                    guardar.Parameters.AddWithValue("tipo", (object?)item.Tipo?.Trim() ?? "DE");
                    guardar.Parameters.AddWithValue("tipoDescripcion", (object?)item.TipoDescripcion?.Trim() ?? "CM");
                    guardar.Parameters.AddWithValue("usuario", usuario);

                    await guardar.ExecuteNonQueryAsync(ct);

                    if (existia) resultado.Actualizadas++;
                    else resultado.Creadas++;
                }

                await tx.CommitAsync(ct);

                resultado.Success = resultado.Errores.Count == 0;
                resultado.Message = resultado.Errores.Count == 0
                    ? $"Importación completa: {resultado.Creadas} creada(s) y {resultado.Actualizadas} actualizada(s)."
                    : $"{resultado.Creadas} creada(s), {resultado.Actualizadas} actualizada(s) y {resultado.Errores.Count} fila(s) sin importar.";
                return resultado;
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync(ct);
                _logger.LogError(ex, "ImportarUnidades error");
                resultado.Success = false;
                resultado.Creadas = 0;
                resultado.Actualizadas = 0;
                resultado.Message = "No se importó nada: " + ex.Message;
                return resultado;
            }
        }

        public async Task<(bool success, string message)> ToggleUnidadVigenteAsync(decimal consecutivo, CancellationToken ct)
        {
            await using var conn = await _masterDb.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                UPDATE secad_unidades
                SET vigente = CASE WHEN UPPER(vigente) = 'SI' THEN 'NO' ELSE 'SI' END,
                    fecha_actualiza = NOW()
                WHERE consecutivo = @consecutivo
                RETURNING vigente";
            cmd.Parameters.AddWithValue("consecutivo", consecutivo);

            var res = await cmd.ExecuteScalarAsync(ct);
            if (res == null)
                return (false, "Unidad no encontrada.");

            return (true, $"Vigencia actualizada a '{res}'.");
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
