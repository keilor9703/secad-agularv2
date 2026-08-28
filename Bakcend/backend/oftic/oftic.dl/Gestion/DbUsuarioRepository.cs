using Comun.Dtos;
using Comun.Snowflake;
using Datos.Interfaz;
using Datos.Tenant;
using Microsoft.Extensions.Logging;
using Npgsql;
using System.Globalization;

namespace Datos.Gestion
{
    public class DbUsuarioRepository : IDbUsuarioRepository
    {
        private readonly TenantContext _tenant;
        private readonly ILogger<DbUsuarioRepository> _logger;
        private readonly ISnowflakeGenerator _snowflake;

        public DbUsuarioRepository(TenantContext tenant, ILogger<DbUsuarioRepository> logger, ISnowflakeGenerator snowflake)
        {
            _tenant    = tenant;
            _logger    = logger;
            _snowflake = snowflake;
        }

        public async Task<long?> GetUsuarioIdByUsernameAsync(string username, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(username)) return null;
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT id_usuario FROM ctr_usuarios WHERE UPPER(username) = UPPER(@u)";
            cmd.Parameters.AddWithValue("u", username);
            var obj = await cmd.ExecuteScalarAsync(ct);
            return obj is null || obj == DBNull.Value ? null : Convert.ToInt64(obj);
        }

        public async Task<long?> GetUsuarioIdByIdentificacionAsync(string identificacion, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(identificacion)) return null;
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT id_usuario FROM ctr_usuarios WHERE identificacion = @id";
            cmd.Parameters.AddWithValue("id", identificacion.Trim());
            var obj = await cmd.ExecuteScalarAsync(ct);
            return obj is null || obj == DBNull.Value ? null : Convert.ToInt64(obj);
        }

        public async Task<string?> GetIdentificacionByUsernameAsync(string username, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(username)) return null;
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT identificacion FROM ctr_usuarios WHERE UPPER(username) = UPPER(@u)";
            cmd.Parameters.AddWithValue("u", username);
            var obj = await cmd.ExecuteScalarAsync(ct);
            return obj is null || obj == DBNull.Value ? null : obj.ToString()?.Trim();
        }

        public async Task<bool?> GetActivoByIdentificacionOrUsernameAsync(string? identificacion, string? username, CancellationToken ct)
        {
            var doc = (identificacion ?? string.Empty).Trim();
            var user = (username ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(doc) && string.IsNullOrWhiteSpace(user)) return null;

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);

            if (!string.IsNullOrWhiteSpace(doc))
            {
                var r = await GetBloqueadoAsync(conn, "WHERE identificacion = @v LIMIT 1", doc, ct);
                if (r.HasValue) return r.Value == 0;
            }

            if (!string.IsNullOrWhiteSpace(user))
            {
                var r = await GetBloqueadoAsync(conn, "WHERE UPPER(username) = UPPER(@v) LIMIT 1", user, ct);
                if (r.HasValue) return r.Value == 0;
            }

            return null;
        }

        public async Task<long> EnsureUsuarioExistsAsync(DtoFuncionario funcionario, CancellationToken ct)
        {
            var username = (funcionario.usuario ?? funcionario.identificacion ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(username)) return 0;

            var identificacion = (funcionario.identificacion ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(identificacion)) return 0;

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();

            // Upsert: insert with Snowflake id if not exists, return id
            var snowflakeId = _snowflake.NextId();
            cmd.CommandText = @"
INSERT INTO ctr_usuarios (id_usuario, username, identificacion, bloqueado)
VALUES (@idUsuario, @username, @identificacion, 0)
ON CONFLICT (username) DO NOTHING
RETURNING id_usuario";
            cmd.Parameters.AddWithValue("idUsuario", snowflakeId);
            cmd.Parameters.AddWithValue("username", username);
            cmd.Parameters.AddWithValue("identificacion", identificacion);

            var obj = await cmd.ExecuteScalarAsync(ct);
            if (obj != null && obj != DBNull.Value)
            {
                var newId = Convert.ToInt64(obj);
                _logger.LogInformation("Usuario creado. username={Username}, id={Id}", username, newId);
                return newId;
            }

            // Already existed — fetch id
            var existingId = await GetUsuarioIdByUsernameAsync(username, ct);
            return existingId ?? 0;
        }

        public async Task<List<DtoUsuarioListadoItem>> GetUsuariosListadoAsync(string? nombre, CancellationToken ct)
        {
            var result = new List<DtoUsuarioListadoItem>();
            var filtro = (nombre ?? string.Empty).Trim();

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
WITH roles_agg AS (
    SELECT
        x.id_usuario,
        STRING_AGG(x.rol_desc, ', ' ORDER BY x.rol_desc) AS roles,
        STRING_AGG(x.fecha_fin_txt, ', ' ORDER BY x.fecha_fin_txt) AS fecha_fin_rol
    FROM (
        SELECT DISTINCT
            rua.id_usuario,
            COALESCE(r.descripcion, 'Sin rol') AS rol_desc,
            CASE WHEN rua.fecha_fin IS NOT NULL THEN TO_CHAR(rua.fecha_fin, 'YYYY-MM-DD') END AS fecha_fin_txt
        FROM ctr_roles_user_admin rua
        LEFT JOIN ctr_roles r ON r.id_rol = rua.id_rol
    ) x
    GROUP BY x.id_usuario
)
SELECT
    u.id_usuario,
    u.identificacion,
    u.username,
    CASE COALESCE(u.tipo_usuario, 'POLICIA')
        WHEN 'CIVIL' THEN
            TRIM(REGEXP_REPLACE(
                COALESCE(u.nombres,'') || ' ' || COALESCE(u.apellidos,''),
                '\s+', ' ', 'g'
            ))
        ELSE
            TRIM(REGEXP_REPLACE(
                COALESCE(u.grad_alfabetico,'') || ' ' || COALESCE(u.nombres,'') || ' ' || COALESCE(u.apellidos,''),
                '\s+', ' ', 'g'
            ))
    END AS nombre_completo,
    COALESCE(ra.roles, 'Sin rol') AS rol,
    ra.fecha_fin_rol,
    COALESCE(u.tipo_usuario, 'POLICIA') AS tipo_usuario
FROM ctr_usuarios u
LEFT JOIN roles_agg ra ON ra.id_usuario = u.id_usuario
WHERE (@filtro = ''
   OR UPPER(u.username) LIKE '%' || UPPER(@filtro) || '%'
   OR UPPER(COALESCE(u.nombres,'') || ' ' || COALESCE(u.apellidos,'')) LIKE '%' || UPPER(@filtro) || '%')
ORDER BY UPPER(u.username)";
            cmd.Parameters.AddWithValue("filtro", filtro);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
                result.Add(new DtoUsuarioListadoItem
                {
                    idUsuario     = reader.IsDBNull(0) ? 0 : Convert.ToInt64(reader.GetValue(0)),
                    identificacion = reader.IsDBNull(1) ? string.Empty : reader.GetString(1),
                    username      = reader.IsDBNull(2) ? string.Empty : reader.GetString(2),
                    nombreCompleto = reader.IsDBNull(3) ? string.Empty : reader.GetString(3),
                    rol           = reader.IsDBNull(4) ? "Sin rol" : reader.GetString(4),
                    fechaFinRol   = reader.IsDBNull(5) ? null : reader.GetString(5),
                    tipoUsuario   = reader.IsDBNull(6) ? "POLICIA" : reader.GetString(6)
                });

            return result;
        }

        public async Task<List<DtoRolAsignado>> GetRolesAsignadosAsync(string username, CancellationToken ct)
        {
            var idUsuario = await GetUsuarioIdByUsernameAsync(username, ct);
            if (!idUsuario.HasValue) return new List<DtoRolAsignado>();

            var result = new List<DtoRolAsignado>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);

            // ── Query principal (ctr_roles_user_admin) ────────────────────────
            // El bloque { } garantiza que reader y cmd se disponen ANTES de intentar
            // la query de fallback en la misma conexión.
            // Sin el bloque, await using var reader vive hasta el final del método,
            // lo que provoca NpgsqlOperationInProgressException en el fallback.
            {
                await using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
SELECT DISTINCT rua.id_rol, r.descripcion, rua.justificacion, rua.fecha_fin, COALESCE(rua.vigente, 0)
FROM ctr_roles_user_admin rua
LEFT JOIN ctr_roles r ON r.id_rol = rua.id_rol
WHERE rua.id_usuario = @id
ORDER BY r.descripcion, rua.id_rol";
                cmd.Parameters.AddWithValue("id", idUsuario.Value);

                await using var reader = await cmd.ExecuteReaderAsync(ct);
                while (await reader.ReadAsync(ct))
                {
                    var idRol = Convert.ToInt32(reader.GetValue(0));
                    var desc = reader.IsDBNull(1) ? null : reader.GetString(1);
                    var just = reader.IsDBNull(2) ? null : reader.GetString(2);
                    var fechaFin = reader.IsDBNull(3) ? (DateTime?)null : reader.GetDateTime(3);
                    var vigente = Convert.ToInt32(reader.GetValue(4));
                    // Distinguir tres estados:
                    //   "Retirado" → vigente = 0 (removido explícitamente por un admin)
                    //   "Vencido"  → vigente = 1 pero la fecha ya pasó (expiración natural)
                    //   "Vigente"  → vigente = 1 y sin fecha o fecha futura
                    string estado;
                    if (vigente == 0)
                        estado = "Retirado";
                    else if (fechaFin.HasValue && fechaFin.Value.Date < DateTime.Today)
                        estado = "Vencido";
                    else
                        estado = "Vigente";

                    result.Add(new DtoRolAsignado
                    {
                        id = idRol,
                        rol = !string.IsNullOrWhiteSpace(desc) ? desc : $"Rol {idRol}",
                        estado = estado,
                        fechaFin = fechaFin?.ToString("yyyy-MM-dd"),
                        justificacion = just
                    });
                }
            } // reader y cmd dispuestos aquí — conn queda libre para el fallback

            if (result.Count > 0) return result;

            // ── Fallback: tabla simple ctr_roles_user ─────────────────────────
            {
                await using var cmdFb = conn.CreateCommand();
                cmdFb.CommandText = "SELECT DISTINCT id_rol FROM ctr_roles_user WHERE id_usuario = @id ORDER BY id_rol";
                cmdFb.Parameters.AddWithValue("id", idUsuario.Value);

                await using var readerFb = await cmdFb.ExecuteReaderAsync(ct);
                while (await readerFb.ReadAsync(ct))
                {
                    var idRol = Convert.ToInt32(readerFb.GetValue(0));
                    result.Add(new DtoRolAsignado { id = idRol, rol = $"Rol {idRol}", estado = "Vigente" });
                }
            } // readerFb y cmdFb dispuestos aquí

            return result;
        }

        public async Task<DtoGuardarUsuarioResult> EliminarRolAsync(long idUsuario, int rolId, string usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            // COALESCE(vigente, 1) <> 0: cubre vigente=1 y registros legacy con vigente=NULL
            cmd.CommandText = @"
UPDATE ctr_roles_user_admin
   SET vigente          = 0,
       fecha_fin        = COALESCE(fecha_fin, CURRENT_DATE),
       usuario_modifica = @usuarioModif,
       fecha_modifica   = NOW(),
       maquina_modifica = @maquinaModif
 WHERE id_usuario = @idUsuario AND id_rol = @idRol
   AND COALESCE(vigente, 1) <> 0";
            cmd.Parameters.AddWithValue("idUsuario",    idUsuario);
            cmd.Parameters.AddWithValue("idRol",        rolId);
            cmd.Parameters.AddWithValue("usuarioModif", AsLong(usuarioAuditoria));
            cmd.Parameters.AddWithValue("maquinaModif", Truncate(maquinaAuditoria, 100));

            var affected = await cmd.ExecuteNonQueryAsync(ct);
            return affected > 0
                ? new DtoGuardarUsuarioResult { idUsuario = idUsuario, message = "Rol retirado correctamente." }
                : new DtoGuardarUsuarioResult { idUsuario = 0,         message = "No se encontró un rol vigente para retirar." };
        }

        public async Task<List<DtoRol>> GetRolesAsync(CancellationToken ct)
        {
            var result = new List<DtoRol>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT id_rol, descripcion FROM ctr_roles WHERE COALESCE(vigente, 1) = 1 ORDER BY descripcion";

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
                result.Add(new DtoRol { id = Convert.ToInt32(reader.GetValue(0)), nombre = reader.IsDBNull(1) ? null : reader.GetString(1) });

            return result;
        }

        public async Task<DtoGuardarUsuarioResult> SaveUsuarioAsync(DtoUsuarioRequest request, string usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        {
            var username = Trim(request.username ?? request.identificacion);
            if (string.IsNullOrWhiteSpace(username))
                return new DtoGuardarUsuarioResult { idUsuario = 0, message = "Username requerido." };

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();

            var snowflakeId = _snowflake.NextId();
            cmd.CommandText = @"
INSERT INTO ctr_usuarios
    (id_usuario, username, identificacion, grad_alfabetico, apellidos, nombres,
     funcionario, unde_laborando, codigo_cargo, bloqueado,
     usuario_creacion, fecha_creacion, maquina_creacion)
VALUES
    (@idUsuario, @username, @identificacion, @grado, @apellidos, @nombres,
     @funcionario, @undeLaborando, @codigoCargo, @bloqueado,
     @usuario, NOW(), @maquina)
ON CONFLICT (username) DO UPDATE SET
    identificacion   = EXCLUDED.identificacion,
    grad_alfabetico  = EXCLUDED.grad_alfabetico,
    apellidos        = EXCLUDED.apellidos,
    nombres          = EXCLUDED.nombres,
    funcionario      = EXCLUDED.funcionario,
    unde_laborando   = EXCLUDED.unde_laborando,
    codigo_cargo     = EXCLUDED.codigo_cargo,
    bloqueado        = EXCLUDED.bloqueado,
    fecha_modifica   = NOW(),
    usuario_modifica = @usuarioModif,
    maquina_modifica = @maquinaModif
RETURNING id_usuario";

            cmd.Parameters.AddWithValue("idUsuario", snowflakeId);
            cmd.Parameters.AddWithValue("username", username);
            cmd.Parameters.AddWithValue("identificacion", AsDbVal(request.identificacion));
            cmd.Parameters.AddWithValue("grado", AsDbVal(request.gradAlfabetico, "N/A"));
            cmd.Parameters.AddWithValue("apellidos", AsDbVal(request.apellidos));
            cmd.Parameters.AddWithValue("nombres", AsDbVal(request.nombres));
            cmd.Parameters.AddWithValue("funcionario", AsInt(request.funcionario));
            cmd.Parameters.AddWithValue("undeLaborando", AsInt(request.undeLaborando));
            cmd.Parameters.AddWithValue("codigoCargo", AsInt(request.codigoCargo));
            cmd.Parameters.AddWithValue("bloqueado", request.activo ? 0 : 1);
            // usuario_creacion/usuario_modifica son BIGINT: usar AsLong() para evitar error de cast
            cmd.Parameters.AddWithValue("usuario", AsLong(usuarioAuditoria));
            cmd.Parameters.AddWithValue("maquina", Truncate(maquinaAuditoria, 100));
            cmd.Parameters.AddWithValue("usuarioModif", AsLong(usuarioAuditoria));
            cmd.Parameters.AddWithValue("maquinaModif", Truncate(maquinaAuditoria, 100));

            var idUsuario = Convert.ToInt64(await cmd.ExecuteScalarAsync(ct));
            return new DtoGuardarUsuarioResult { idUsuario = idUsuario, message = "Usuario guardado correctamente." };
        }

        public async Task<DtoGuardarUsuarioResult> EliminarUsuarioAsync(long idUsuario, string usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx = await conn.BeginTransactionAsync(ct);

            try
            {
                await using (var cmd = conn.CreateCommand())
                {
                    cmd.Transaction = tx;
                    cmd.CommandText = "UPDATE ctr_usuarios SET bloqueado = 1 WHERE id_usuario = @id";
                    cmd.Parameters.AddWithValue("id", idUsuario);
                    var rows = await cmd.ExecuteNonQueryAsync(ct);
                    if (rows <= 0)
                    {
                        await tx.RollbackAsync(ct);
                        return new DtoGuardarUsuarioResult { idUsuario = 0, message = "No se encontró el usuario." };
                    }
                }

                await using (var cmd = conn.CreateCommand())
                {
                    cmd.Transaction = tx;
                    cmd.CommandText = @"
UPDATE ctr_roles_user_admin
   SET vigente = 0, fecha_fin = COALESCE(fecha_fin, CURRENT_DATE)
 WHERE id_usuario = @id AND COALESCE(vigente, 0) = 1";
                    cmd.Parameters.AddWithValue("id", idUsuario);
                    await cmd.ExecuteNonQueryAsync(ct);
                }

                await tx.CommitAsync(ct);
                return new DtoGuardarUsuarioResult { idUsuario = idUsuario, message = "Usuario eliminado correctamente." };
            }
            catch
            {
                await tx.RollbackAsync(ct);
                throw;
            }
        }

        public async Task<DtoGuardarUsuarioResult> AsignarRolAsync(long idUsuario, DtoAsignarRolRequest request, string usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        {
            DateTime? fechaFin = null;
            if (!string.IsNullOrWhiteSpace(request.fechaFin))
                fechaFin = DateTime.Parse(request.fechaFin);

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx  = await conn.BeginTransactionAsync(ct);
            try
            {
                long newAdminId = 0;

                // ── 1. ctr_roles_user_admin (registro histórico con vigencia / justificación) ──
                await using (var cmd = conn.CreateCommand())
                {
                    cmd.Transaction = tx;
                    cmd.CommandText = @"
INSERT INTO ctr_roles_user_admin
    (id_usuario, id_rol, justificacion, fecha_fin, vigente, usuario_creacion, fecha_creacion, maquina_creacion)
VALUES
    (@idUsuario, @idRol, @just, @fechaFin, @vigente, @usuario, NOW(), @maquina)
ON CONFLICT DO NOTHING
RETURNING id";
                    cmd.Parameters.AddWithValue("idUsuario", idUsuario);
                    cmd.Parameters.AddWithValue("idRol",     request.rolId);
                    cmd.Parameters.AddWithValue("just",      AsDbVal(request.justificacion, "SIN JUSTIFICACION"));
                    cmd.Parameters.AddWithValue("fechaFin",  (object?)fechaFin ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("vigente",   request.vigente is 0 ? 0 : 1);
                    cmd.Parameters.AddWithValue("usuario",   AsLong(usuarioAuditoria));
                    cmd.Parameters.AddWithValue("maquina",   Truncate(maquinaAuditoria, 100));

                    var obj = await cmd.ExecuteScalarAsync(ct);
                    newAdminId = obj is null || obj == DBNull.Value ? 0L : Convert.ToInt64(obj);
                }

                // ── 2. ctr_roles_user (tabla de acceso rápido para autenticación / menú) ──────
                await using (var cmd2 = conn.CreateCommand())
                {
                    cmd2.Transaction = tx;
                    cmd2.CommandText = @"
INSERT INTO ctr_roles_user (id_usuario, id_rol, usuario_creacion, fecha_creacion, maquina_creacion)
VALUES (@idUsuario, @idRol, @usuario, NOW(), @maquina)
ON CONFLICT (id_usuario, id_rol) DO NOTHING";
                    cmd2.Parameters.AddWithValue("idUsuario", idUsuario);
                    cmd2.Parameters.AddWithValue("idRol",     request.rolId);
                    cmd2.Parameters.AddWithValue("usuario",   AsLong(usuarioAuditoria));
                    cmd2.Parameters.AddWithValue("maquina",   Truncate(maquinaAuditoria, 100));
                    await cmd2.ExecuteNonQueryAsync(ct);
                }

                await tx.CommitAsync(ct);
                return new DtoGuardarUsuarioResult
                {
                    idUsuario = newAdminId > 0 ? newAdminId : idUsuario,
                    message   = newAdminId > 0 ? "Rol asignado correctamente." : "Rol ya asignado."
                };
            }
            catch
            {
                await tx.RollbackAsync(ct);
                throw;
            }
        }

        public async Task<List<DtoRolAdmin>> GetRolesAdminAsync(CancellationToken ct)
        {
            var result = new List<DtoRolAdmin>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT id_rol, descripcion, COALESCE(vigente, 1) FROM ctr_roles ORDER BY descripcion";

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
                result.Add(new DtoRolAdmin
                {
                    id = Convert.ToInt32(reader.GetValue(0)),
                    nombre = reader.IsDBNull(1) ? null : reader.GetString(1),
                    vigente = Convert.ToInt32(reader.GetValue(2))
                });

            return result;
        }

        public async Task<DtoSaveRolResult> SaveRolAdminAsync(DtoSaveRolRequest request, string usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        {
            var nombre = (request.nombre ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(nombre))
                return new DtoSaveRolResult { idRol = 0, message = "La descripción del rol es obligatoria." };

            var vigente = request.vigente == 0 ? 0 : 1;
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx = await conn.BeginTransactionAsync(ct);

            try
            {
                if (request.id.GetValueOrDefault() > 0)
                {
                    await using var cmd = conn.CreateCommand();
                    cmd.Transaction = tx;
                    cmd.CommandText = @"
UPDATE ctr_roles SET descripcion=@desc, vigente=@vig, usuario_modifica=@u, fecha_modifica=NOW(), maquina_modifica=@m
WHERE id_rol=@id";
                    cmd.Parameters.AddWithValue("desc", nombre);
                    cmd.Parameters.AddWithValue("vig", vigente);
                    cmd.Parameters.AddWithValue("u", AsLong(usuarioAuditoria));
                    cmd.Parameters.AddWithValue("m", Truncate(maquinaAuditoria, 100));
                    cmd.Parameters.AddWithValue("id", request.id!.Value);
                    var rows = await cmd.ExecuteNonQueryAsync(ct);
                    if (rows <= 0) { await tx.RollbackAsync(ct); return new DtoSaveRolResult { idRol = 0, message = "Rol no encontrado." }; }
                    await tx.CommitAsync(ct);
                    return new DtoSaveRolResult { idRol = request.id.Value, message = "Rol actualizado correctamente." };
                }

                await using (var cmd = conn.CreateCommand())
                {
                    cmd.Transaction = tx;
                    cmd.CommandText = @"
INSERT INTO ctr_roles (descripcion, vigente, usuario_creacion, fecha_creacion, maquina_creacion)
VALUES (@desc, @vig, @u, NOW(), @m)
RETURNING id_rol";
                    cmd.Parameters.AddWithValue("desc", nombre);
                    cmd.Parameters.AddWithValue("vig", vigente);
                    cmd.Parameters.AddWithValue("u", usuarioAuditoria);
                    cmd.Parameters.AddWithValue("m", Truncate(maquinaAuditoria, 100));

                    var newId = Convert.ToInt64(await cmd.ExecuteScalarAsync(ct));
                    await tx.CommitAsync(ct);
                    return new DtoSaveRolResult { idRol = newId, message = "Rol creado correctamente." };
                }
            }
            catch
            {
                await tx.RollbackAsync(ct);
                throw;
            }
        }

        public async Task<DtoSaveRolResult> SetRolEstadoAsync(long idRol, int vigente, string usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
UPDATE ctr_roles SET vigente=@vig, usuario_modifica=@u, fecha_modifica=NOW(), maquina_modifica=@m
WHERE id_rol=@id";
            cmd.Parameters.AddWithValue("vig", vigente == 0 ? 0 : 1);
            cmd.Parameters.AddWithValue("u", AsLong(usuarioAuditoria));
            cmd.Parameters.AddWithValue("m", Truncate(maquinaAuditoria, 100));
            cmd.Parameters.AddWithValue("id", idRol);

            var rows = await cmd.ExecuteNonQueryAsync(ct);
            return rows > 0
                ? new DtoSaveRolResult { idRol = idRol, message = vigente == 0 ? "Rol inactivado." : "Rol activado." }
                : new DtoSaveRolResult { idRol = 0, message = "Rol no encontrado." };
        }

        public async Task<DtoUsuarioLocalDetalle?> GetLocalUsuarioAsync(string username, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(username)) return null;

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
SELECT id_usuario,
       username,
       COALESCE(identificacion, '')                       AS identificacion,
       COALESCE(nombres, '')                              AS nombres,
       COALESCE(apellidos, '')                            AS apellidos,
       COALESCE(email, '')                                AS email,
       COALESCE(entidad, '')                              AS entidad,
       COALESCE(grad_alfabetico, '')                      AS cargo,
       COALESCE(tipo_usuario, 'POLICIA')                  AS tipo_usuario,
       CASE WHEN bloqueado = 0 THEN TRUE ELSE FALSE END   AS activo,
       COALESCE(cadcana_fuerza_id, 0)                     AS cadcana_fuerza_id,
       COALESCE(cadcana_codigo, 0)                        AS cadcana_codigo,
       COALESCE(acd, 0)                                   AS acd,
       COALESCE(sitio_grabacion, 0)                       AS sitio_grabacion
FROM ctr_usuarios
WHERE UPPER(username) = UPPER(@username)
LIMIT 1";
            cmd.Parameters.AddWithValue("username", Trim(username));

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            if (!await reader.ReadAsync(ct)) return null;

            return new DtoUsuarioLocalDetalle
            {
                idUsuario       = reader.IsDBNull(0) ? 0 : Convert.ToInt64(reader.GetValue(0)),
                username        = reader.IsDBNull(1) ? string.Empty : reader.GetString(1),
                identificacion  = reader.IsDBNull(2) ? null : NullIfEmpty(reader.GetString(2)),
                nombres         = reader.IsDBNull(3) ? null : NullIfEmpty(reader.GetString(3)),
                apellidos       = reader.IsDBNull(4) ? null : NullIfEmpty(reader.GetString(4)),
                email           = reader.IsDBNull(5) ? null : NullIfEmpty(reader.GetString(5)),
                entidad         = reader.IsDBNull(6) ? null : NullIfEmpty(reader.GetString(6)),
                cargo           = reader.IsDBNull(7) ? null : NullIfEmpty(reader.GetString(7)),
                tipoUsuario     = reader.IsDBNull(8) ? "POLICIA" : reader.GetString(8),
                activo          = !reader.IsDBNull(9) && reader.GetBoolean(9),
                cadcanaFuerzaId = reader.IsDBNull(10) ? 0 : reader.GetInt32(10),
                cadcanaCodigo   = reader.IsDBNull(11) ? 0 : reader.GetInt32(11),
                acd             = reader.IsDBNull(12) ? 0 : reader.GetInt32(12),
                sitioGrabacion  = reader.IsDBNull(13) ? 0 : reader.GetInt32(13)
            };
        }

        public async Task<DtoGuardarUsuarioResult> CreateCivilUsuarioAsync(
            DtoCivilUsuarioRequest request,
            string usuarioAuditoria,
            string maquinaAuditoria,
            CancellationToken ct)
        {
            var username = Trim(request.username ?? request.identificacion);
            if (string.IsNullOrWhiteSpace(username))
                return new DtoGuardarUsuarioResult { idUsuario = 0, message = "Username requerido para el usuario civil." };

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();

            // Para usuarios civiles: no hay grado policial, funcionario ni unde_laborando.
            // grad_alfabetico se usa para almacenar el cargo/título civil.
            var snowflakeId = _snowflake.NextId();
            cmd.CommandText = @"
INSERT INTO ctr_usuarios
    (id_usuario, username, identificacion, nombres, apellidos, email, entidad,
     grad_alfabetico, tipo_usuario, bloqueado,
     usuario_creacion, fecha_creacion, maquina_creacion)
VALUES
    (@idUsuario, @username, @identificacion, @nombres, @apellidos, @email, @entidad,
     @cargo, 'CIVIL', @bloqueado,
     @usuario, NOW(), @maquina)
ON CONFLICT (username) DO UPDATE SET
    identificacion  = EXCLUDED.identificacion,
    nombres         = EXCLUDED.nombres,
    apellidos       = EXCLUDED.apellidos,
    email           = EXCLUDED.email,
    entidad         = EXCLUDED.entidad,
    grad_alfabetico = EXCLUDED.grad_alfabetico,
    tipo_usuario    = 'CIVIL',
    bloqueado       = EXCLUDED.bloqueado,
    fecha_modifica  = NOW(),
    usuario_modifica = @usuarioModif,
    maquina_modifica = @maquinaModif
RETURNING id_usuario";

            cmd.Parameters.AddWithValue("idUsuario",      snowflakeId);
            cmd.Parameters.AddWithValue("username",       username);
            cmd.Parameters.AddWithValue("identificacion", AsDbVal(request.identificacion));
            cmd.Parameters.AddWithValue("nombres",        AsDbVal(request.nombres));
            cmd.Parameters.AddWithValue("apellidos",      AsDbVal(request.apellidos));
            cmd.Parameters.AddWithValue("email",          AsDbVal(request.email));
            cmd.Parameters.AddWithValue("entidad",        AsDbVal(request.entidad));
            cmd.Parameters.AddWithValue("cargo",          AsDbVal(request.cargo, string.Empty));
            cmd.Parameters.AddWithValue("bloqueado",      request.activo ? 0 : 1);
            cmd.Parameters.AddWithValue("usuario",        AsLong(usuarioAuditoria));
            cmd.Parameters.AddWithValue("maquina",        Truncate(maquinaAuditoria, 100));
            cmd.Parameters.AddWithValue("usuarioModif",   AsLong(usuarioAuditoria));
            cmd.Parameters.AddWithValue("maquinaModif",   Truncate(maquinaAuditoria, 100));

            var idUsuario = Convert.ToInt64(await cmd.ExecuteScalarAsync(ct));
            return new DtoGuardarUsuarioResult { idUsuario = idUsuario, message = "Usuario civil guardado correctamente." };
        }

        private static async Task<int?> GetBloqueadoAsync(NpgsqlConnection conn, string where, string value, CancellationToken ct)
        {
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = $"SELECT bloqueado FROM ctr_usuarios {where}";
            cmd.Parameters.AddWithValue("v", value);
            var obj = await cmd.ExecuteScalarAsync(ct);
            return obj is null || obj == DBNull.Value ? null : Convert.ToInt32(obj);
        }

        private static string? NullIfEmpty(string? v) { var s = (v ?? string.Empty).Trim(); return string.IsNullOrEmpty(s) ? null : s; }
        private static string Trim(string? v) => (v ?? string.Empty).Trim();
        private static string Truncate(string? v, int max) { var s = Trim(v); return s.Length > max ? s[..max] : s; }
        private static object AsDbVal(string? v, string? fallback = null) { var s = Trim(v); return string.IsNullOrWhiteSpace(s) ? (fallback is null ? DBNull.Value : (object)fallback) : s; }
        private static int AsInt(string? v) => int.TryParse(Trim(v), NumberStyles.Integer, CultureInfo.InvariantCulture, out var i) ? i : 0;
        private static long AsLong(string? v) => long.TryParse(Trim(v), NumberStyles.Integer, CultureInfo.InvariantCulture, out var l) ? l : 0L;
    }
}
