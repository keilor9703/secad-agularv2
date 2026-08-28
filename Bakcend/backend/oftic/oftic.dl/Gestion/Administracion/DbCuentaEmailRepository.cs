using Comun.Dtos.Administracion;
using Datos.Interfaz;
using Datos.Tenant;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace Datos.Gestion
{
    public class DbCuentaEmailRepository : IDbCuentaEmailRepository
    {
        private readonly TenantContext _tenant;
        private readonly ILogger<DbCuentaEmailRepository> _logger;

        public DbCuentaEmailRepository(TenantContext tenant, ILogger<DbCuentaEmailRepository> logger)
        {
            _tenant = tenant;
            _logger = logger;
        }

        public List<DtoCuentaEmail> ConsultarCuentas(int idCuenta)
        {
            var lista = new List<DtoCuentaEmail>();
            try
            {
                using var conn = _tenant.DataSource.OpenConnection();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
SELECT ce.id_cuenta, ce.id_dominio_grupo, ce.nombre_cuenta, ce.email,
       ce.servidor_smtp, ce.puerto, ce.usuario_smtp, ce.clave_smtp,
       ce.usar_ssl, ce.vigente, d.descripcion AS nombre_grupo,
       ce.firma_html, ce.imagen_encabezado
FROM ctr_cuenta_email ce
LEFT JOIN ctr_dominio d ON d.id_dominio = ce.id_dominio_grupo
WHERE (@idCuenta = 0 OR ce.id_cuenta = @idCuenta)
ORDER BY ce.nombre_cuenta";
                cmd.Parameters.AddWithValue("idCuenta", idCuenta);

                using var reader = cmd.ExecuteReader();
                while (reader.Read())
                {
                    lista.Add(new DtoCuentaEmail
                    {
                        IdCuenta       = reader.GetInt32(reader.GetOrdinal("id_cuenta")),
                        IdDominioGrupo = reader.GetInt32(reader.GetOrdinal("id_dominio_grupo")),
                        NombreCuenta   = reader.IsDBNull(reader.GetOrdinal("nombre_cuenta"))  ? "" : reader.GetString(reader.GetOrdinal("nombre_cuenta")),
                        Email          = reader.IsDBNull(reader.GetOrdinal("email"))           ? "" : reader.GetString(reader.GetOrdinal("email")),
                        ServidorSmtp   = reader.IsDBNull(reader.GetOrdinal("servidor_smtp"))   ? "smtp.office365.com" : reader.GetString(reader.GetOrdinal("servidor_smtp")),
                        Puerto         = reader.IsDBNull(reader.GetOrdinal("puerto"))          ? 587 : reader.GetInt32(reader.GetOrdinal("puerto")),
                        UsuarioSmtp    = reader.IsDBNull(reader.GetOrdinal("usuario_smtp"))    ? "" : reader.GetString(reader.GetOrdinal("usuario_smtp")),
                        ClaveSmtp      = reader.IsDBNull(reader.GetOrdinal("clave_smtp"))      ? "" : reader.GetString(reader.GetOrdinal("clave_smtp")),
                        UsarSsl        = reader.IsDBNull(reader.GetOrdinal("usar_ssl"))        ? 1 : reader.GetInt32(reader.GetOrdinal("usar_ssl")),
                        Vigente        = reader.IsDBNull(reader.GetOrdinal("vigente"))         ? 1 : reader.GetInt32(reader.GetOrdinal("vigente")),
                        NombreGrupo    = reader.IsDBNull(reader.GetOrdinal("nombre_grupo"))    ? null : reader.GetString(reader.GetOrdinal("nombre_grupo")),
                        FirmaHtml      = reader.IsDBNull(reader.GetOrdinal("firma_html"))      ? null : reader.GetString(reader.GetOrdinal("firma_html")),
                        ImagenEncabezado = reader.IsDBNull(reader.GetOrdinal("imagen_encabezado")) ? null : reader.GetString(reader.GetOrdinal("imagen_encabezado"))
                    });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al consultar cuentas de email");
                throw;
            }
            return lista;
        }

        public bool GestionarCuenta(DtoCuentaEmailRequest request)
        {
            try
            {
                using var conn = _tenant.DataSource.OpenConnection();
                using var cmd = conn.CreateCommand();

                if (request.IdCuenta == 0)
                {
                    cmd.CommandText = @"
INSERT INTO ctr_cuenta_email
    (id_dominio_grupo, nombre_cuenta, email, servidor_smtp, puerto,
     usuario_smtp, clave_smtp, usar_ssl, vigente, firma_html, imagen_encabezado,
     usuario_creacion, fecha_creacion)
VALUES
    (@idDomGrupo, @nombre, @email, @servidor, @puerto,
     @usuSmtp, @claveSmtp, @usarSsl, @vigente, @firma, @imagen,
     @usuario, NOW())";
                }
                else
                {
                    cmd.CommandText = @"
UPDATE ctr_cuenta_email SET
    id_dominio_grupo = @idDomGrupo,
    nombre_cuenta    = @nombre,
    email            = @email,
    servidor_smtp    = @servidor,
    puerto           = @puerto,
    usuario_smtp     = @usuSmtp,
    clave_smtp       = @claveSmtp,
    usar_ssl         = @usarSsl,
    vigente          = @vigente,
    firma_html       = @firma,
    imagen_encabezado = @imagen,
    usuario_modificacion = @usuario,
    fecha_modificacion   = NOW()
WHERE id_cuenta = @idCuenta";
                    cmd.Parameters.AddWithValue("idCuenta", request.IdCuenta);
                }

                cmd.Parameters.AddWithValue("idDomGrupo", request.IdDominioGrupo);
                cmd.Parameters.AddWithValue("nombre",    request.NombreCuenta);
                cmd.Parameters.AddWithValue("email",     request.Email);
                cmd.Parameters.AddWithValue("servidor",  request.ServidorSmtp);
                cmd.Parameters.AddWithValue("puerto",    request.Puerto);
                cmd.Parameters.AddWithValue("usuSmtp",   request.UsuarioSmtp);
                cmd.Parameters.AddWithValue("claveSmtp", request.ClaveSmtp);
                cmd.Parameters.AddWithValue("usarSsl",   request.UsarSsl);
                cmd.Parameters.AddWithValue("vigente",   request.Vigente);
                cmd.Parameters.AddWithValue("firma",     (object?)request.FirmaHtml ?? DBNull.Value);
                cmd.Parameters.AddWithValue("imagen",    (object?)request.ImagenEncabezado ?? DBNull.Value);
                cmd.Parameters.AddWithValue("usuario",   (object?)request.UsuarioAuditoria ?? DBNull.Value);

                cmd.ExecuteNonQuery();
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al gestionar cuenta de email");
                throw;
            }
        }

        public bool EliminarCuenta(int idCuenta)
        {
            try
            {
                using var conn = _tenant.DataSource.OpenConnection();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = "DELETE FROM ctr_cuenta_email WHERE id_cuenta = @id";
                cmd.Parameters.AddWithValue("id", idCuenta);
                cmd.ExecuteNonQuery();
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al eliminar cuenta de email {Id}", idCuenta);
                throw;
            }
        }

        public List<DtoCuentaEmail> ConsultarCuentasPorUsuario(int idUsuario)
        {
            var lista = new List<DtoCuentaEmail>();
            try
            {
                using var conn = _tenant.DataSource.OpenConnection();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
SELECT ce.id_cuenta, ce.nombre_cuenta, ce.email
FROM ctr_cuenta_email ce
INNER JOIN ctr_cuenta_email_usuario ceu ON ceu.id_cuenta = ce.id_cuenta
WHERE ceu.id_usuario = @idUsuario
  AND ceu.vigente = 1
  AND ce.vigente = 1
ORDER BY ce.nombre_cuenta";
                cmd.Parameters.AddWithValue("idUsuario", idUsuario);

                using var reader = cmd.ExecuteReader();
                while (reader.Read())
                {
                    lista.Add(new DtoCuentaEmail
                    {
                        IdCuenta     = reader.GetInt32(reader.GetOrdinal("id_cuenta")),
                        NombreCuenta = reader.IsDBNull(reader.GetOrdinal("nombre_cuenta")) ? "" : reader.GetString(reader.GetOrdinal("nombre_cuenta")),
                        Email        = reader.IsDBNull(reader.GetOrdinal("email")) ? "" : reader.GetString(reader.GetOrdinal("email")),
                        Vigente      = 1
                    });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al consultar cuentas por usuario {Id}", idUsuario);
                throw;
            }
            return lista;
        }

        public List<DtoCuentaEmailUsuario> ConsultarAutorizaciones(int? idCuenta, int? idUsuario, int? vigente)
        {
            var lista = new List<DtoCuentaEmailUsuario>();
            try
            {
                using var conn = _tenant.DataSource.OpenConnection();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
SELECT ceu.id_cuenta_usuario, ceu.id_cuenta, ce.nombre_cuenta, ce.email,
       ceu.id_usuario, u.usuario_login, u.nombre_completo, u.identificacion,
       ceu.vigente, ceu.usuario_crea, ceu.fecha_crea,
       ceu.usuario_modifica, ceu.fecha_modifica, ceu.ip_registro
FROM ctr_cuenta_email_usuario ceu
INNER JOIN ctr_cuenta_email ce ON ce.id_cuenta = ceu.id_cuenta
LEFT JOIN ctr_usuarios u ON u.id_usuario = ceu.id_usuario
WHERE (@idCuenta IS NULL OR ceu.id_cuenta = @idCuenta)
  AND (@idUsuario IS NULL OR ceu.id_usuario = @idUsuario)
  AND (@vigente IS NULL OR ceu.vigente = @vigente)
ORDER BY u.nombre_completo";
                cmd.Parameters.AddWithValue("idCuenta",  (object?)idCuenta  ?? DBNull.Value);
                cmd.Parameters.AddWithValue("idUsuario", (object?)idUsuario ?? DBNull.Value);
                cmd.Parameters.AddWithValue("vigente",   (object?)vigente   ?? DBNull.Value);

                using var reader = cmd.ExecuteReader();
                while (reader.Read())
                {
                    lista.Add(new DtoCuentaEmailUsuario
                    {
                        IdCuentaUsuario = reader.GetInt32(reader.GetOrdinal("id_cuenta_usuario")),
                        IdCuenta        = reader.GetInt32(reader.GetOrdinal("id_cuenta")),
                        NombreCuenta    = reader.IsDBNull(reader.GetOrdinal("nombre_cuenta"))  ? "" : reader.GetString(reader.GetOrdinal("nombre_cuenta")),
                        Email           = reader.IsDBNull(reader.GetOrdinal("email"))           ? "" : reader.GetString(reader.GetOrdinal("email")),
                        IdUsuario       = reader.GetInt32(reader.GetOrdinal("id_usuario")),
                        UsuarioLogin    = reader.IsDBNull(reader.GetOrdinal("usuario_login"))   ? "" : reader.GetString(reader.GetOrdinal("usuario_login")),
                        NombreCompleto  = reader.IsDBNull(reader.GetOrdinal("nombre_completo")) ? "" : reader.GetString(reader.GetOrdinal("nombre_completo")),
                        Identificacion  = reader.IsDBNull(reader.GetOrdinal("identificacion"))  ? "" : reader.GetString(reader.GetOrdinal("identificacion")),
                        Vigente         = reader.IsDBNull(reader.GetOrdinal("vigente"))         ? 0  : reader.GetInt32(reader.GetOrdinal("vigente")),
                        UsuarioCrea     = reader.IsDBNull(reader.GetOrdinal("usuario_crea"))    ? null : reader.GetString(reader.GetOrdinal("usuario_crea")),
                        FechaCrea       = reader.IsDBNull(reader.GetOrdinal("fecha_crea"))      ? null : reader.GetDateTime(reader.GetOrdinal("fecha_crea")),
                        UsuarioModifica = reader.IsDBNull(reader.GetOrdinal("usuario_modifica"))? null : reader.GetString(reader.GetOrdinal("usuario_modifica")),
                        FechaModifica   = reader.IsDBNull(reader.GetOrdinal("fecha_modifica"))  ? null : reader.GetDateTime(reader.GetOrdinal("fecha_modifica")),
                        IpRegistro      = reader.IsDBNull(reader.GetOrdinal("ip_registro"))     ? null : reader.GetString(reader.GetOrdinal("ip_registro"))
                    });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al consultar autorizaciones de cuenta-email");
                throw;
            }
            return lista;
        }

        public bool GuardarAutorizacion(DtoCuentaEmailUsuarioRequest request)
        {
            try
            {
                using var conn = _tenant.DataSource.OpenConnection();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
INSERT INTO ctr_cuenta_email_usuario
    (id_cuenta, id_usuario, vigente, usuario_crea, fecha_crea, ip_registro)
VALUES
    (@idCuenta, @idUsuario, 1, @usuCrea, NOW(), @ip)
ON CONFLICT (id_cuenta, id_usuario) DO UPDATE
    SET vigente = 1,
        usuario_modifica = @usuCrea,
        fecha_modifica = NOW(),
        ip_registro = @ip";
                cmd.Parameters.AddWithValue("idCuenta",  request.IdCuenta);
                cmd.Parameters.AddWithValue("idUsuario", request.IdUsuario);
                cmd.Parameters.AddWithValue("usuCrea",   (object?)request.UsuarioAuditoria ?? "SISTEMA");
                cmd.Parameters.AddWithValue("ip",        (object?)request.IpAuditoria ?? "127.0.0.1");
                return cmd.ExecuteNonQuery() > 0;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al guardar autorización cuenta-email");
                throw;
            }
        }

        public bool ActualizarAutorizacion(DtoCuentaEmailUsuarioEstadoRequest request)
        {
            try
            {
                using var conn = _tenant.DataSource.OpenConnection();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
UPDATE ctr_cuenta_email_usuario SET
    vigente = @vigente,
    usuario_modifica = @usuario,
    fecha_modifica = NOW(),
    ip_registro = @ip
WHERE id_cuenta_usuario = @id";
                cmd.Parameters.AddWithValue("id",      request.IdCuentaUsuario);
                cmd.Parameters.AddWithValue("vigente", request.Vigente);
                cmd.Parameters.AddWithValue("usuario", (object?)request.UsuarioAuditoria ?? "SISTEMA");
                cmd.Parameters.AddWithValue("ip",      (object?)request.IpAuditoria ?? "127.0.0.1");
                return cmd.ExecuteNonQuery() > 0;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al actualizar autorización {Id}", request.IdCuentaUsuario);
                throw;
            }
        }

        public bool EliminarAutorizacion(DtoCuentaEmailUsuarioEstadoRequest request)
        {
            try
            {
                using var conn = _tenant.DataSource.OpenConnection();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = "DELETE FROM ctr_cuenta_email_usuario WHERE id_cuenta_usuario = @id";
                cmd.Parameters.AddWithValue("id", request.IdCuentaUsuario);
                return cmd.ExecuteNonQuery() > 0;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al eliminar autorización {Id}", request.IdCuentaUsuario);
                throw;
            }
        }

        public bool ValidarAutorizacionEnvio(int idCuenta, int idUsuario)
        {
            try
            {
                using var conn = _tenant.DataSource.OpenConnection();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
SELECT COUNT(1)
FROM ctr_cuenta_email_usuario
WHERE id_cuenta = @idCuenta AND id_usuario = @idUsuario AND vigente = 1";
                cmd.Parameters.AddWithValue("idCuenta",  idCuenta);
                cmd.Parameters.AddWithValue("idUsuario", idUsuario);
                var result = cmd.ExecuteScalar();
                return Convert.ToInt64(result) > 0;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error validando autorización cuenta {IdCuenta} usuario {IdUsuario}", idCuenta, idUsuario);
                throw;
            }
        }

        public string GetNextRadicado(int idCuentaEmail)
        {
            try
            {
                using var conn = _tenant.DataSource.OpenConnection();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
INSERT INTO ctr_cuenta_email_radicado (id_cuenta, ultimo_numero)
VALUES (@idCuenta, 1)
ON CONFLICT (id_cuenta) DO UPDATE
    SET ultimo_numero = ctr_cuenta_email_radicado.ultimo_numero + 1
RETURNING ultimo_numero";
                cmd.Parameters.AddWithValue("idCuenta", idCuentaEmail);
                var numero = Convert.ToInt32(cmd.ExecuteScalar());
                return $"COR-{DateTime.Now:yyyy}-{DateTime.Now:MM}-{numero:D4}";
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al generar radicado para cuenta {Id}", idCuentaEmail);
                return $"COR-{DateTime.Now:yyyyMMddHHmmss}";
            }
        }

        public string GetSiglaSistema()
        {
            try
            {
                using var conn = _tenant.DataSource.OpenConnection();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = "SELECT sigla FROM ctr_branding LIMIT 1";
                var result = cmd.ExecuteScalar();
                return result?.ToString() ?? "SECAD";
            }
            catch
            {
                return "SECAD";
            }
        }
    }
}
