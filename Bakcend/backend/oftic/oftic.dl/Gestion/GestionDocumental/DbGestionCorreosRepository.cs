using Comun.Dtos.GestionDocumental;
using Datos.Interfaz.GestionDocumental;
using Datos.Tenant;
using Microsoft.Extensions.Logging;

namespace Datos.Gestion.GestionDocumental
{
    public class DbGestionCorreosRepository : IDbGestionCorreosRepository
    {
        private readonly TenantContext _tenant;
        private readonly ILogger<DbGestionCorreosRepository> _logger;

        public DbGestionCorreosRepository(TenantContext tenant, ILogger<DbGestionCorreosRepository> logger)
        {
            _tenant = tenant;
            _logger = logger;
        }

        public bool RegistrarEnvio(DtoEnvioCorreoRequest request, string radicado, string usuario, string maquina)
        {
            try
            {
                using var conn = _tenant.DataSource.OpenConnection();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
INSERT INTO ctr_correos_enviados
    (id_cuenta_email, radicado, destinatario, asunto, cuerpo,
     fecha, id_clasificacion, username, maquina)
VALUES
    (@idCuenta, @radicado, @destinatario, @asunto, @cuerpo,
     NOW(), @idClasif, @usuario, @maquina)";

                var partes = new List<string>();
                if (!string.IsNullOrWhiteSpace(request.Para)) partes.Add(request.Para.Trim());
                if (!string.IsNullOrWhiteSpace(request.Cc))   partes.Add(request.Cc.Trim());
                var destinatario = partes.Count > 0 ? string.Join("; ", partes) : "(sin destinatario)";

                cmd.Parameters.AddWithValue("idCuenta",     request.IdCuentaEmail);
                cmd.Parameters.AddWithValue("radicado",     radicado);
                cmd.Parameters.AddWithValue("destinatario", destinatario);
                cmd.Parameters.AddWithValue("asunto",       request.Asunto);
                cmd.Parameters.AddWithValue("cuerpo",       request.Cuerpo);
                cmd.Parameters.AddWithValue("idClasif",     (object?)request.IdClasificacion ?? DBNull.Value);
                cmd.Parameters.AddWithValue("usuario",      usuario);
                cmd.Parameters.AddWithValue("maquina",      maquina);

                cmd.ExecuteNonQuery();
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al registrar envío de correo en DB");
                return false;
            }
        }

        public List<DtoHistoricoCorreo> ConsultarHistorico()
        {
            var lista = new List<DtoHistoricoCorreo>();
            try
            {
                using var conn = _tenant.DataSource.OpenConnection();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
SELECT ce_env.id_envio, ce_env.radicado, ce_env.destinatario,
       ce_env.asunto, ce_env.cuerpo, ce_env.fecha,
       COALESCE(ce.email, '') AS de_email,
       COALESCE(ce.nombre_cuenta, '') AS nombre_cuenta,
       COALESCE(d.descripcion, '') AS clasificacion,
       COALESCE(ce_env.username, '') AS username,
       COALESCE(u.nombre_completo, ce_env.username, '') AS nombre_completo
FROM ctr_correos_enviados ce_env
LEFT JOIN ctr_cuenta_email ce ON ce.id_cuenta = ce_env.id_cuenta_email
LEFT JOIN ctr_dominio d ON d.id_dominio = ce_env.id_clasificacion
LEFT JOIN ctr_usuarios u ON u.usuario_login = ce_env.username
ORDER BY ce_env.fecha DESC
LIMIT 500";

                using var reader = cmd.ExecuteReader();
                while (reader.Read())
                {
                    lista.Add(new DtoHistoricoCorreo
                    {
                        IdEnvio        = reader.GetInt64(reader.GetOrdinal("id_envio")),
                        Radicado       = reader.IsDBNull(reader.GetOrdinal("radicado"))       ? "" : reader.GetString(reader.GetOrdinal("radicado")),
                        Destinatario   = reader.IsDBNull(reader.GetOrdinal("destinatario"))   ? "" : reader.GetString(reader.GetOrdinal("destinatario")),
                        Asunto         = reader.IsDBNull(reader.GetOrdinal("asunto"))         ? "" : reader.GetString(reader.GetOrdinal("asunto")),
                        Cuerpo         = reader.IsDBNull(reader.GetOrdinal("cuerpo"))         ? "" : reader.GetString(reader.GetOrdinal("cuerpo")),
                        Fecha          = reader.IsDBNull(reader.GetOrdinal("fecha"))          ? DateTime.Now : reader.GetDateTime(reader.GetOrdinal("fecha")),
                        DeEmail        = reader.IsDBNull(reader.GetOrdinal("de_email"))       ? "" : reader.GetString(reader.GetOrdinal("de_email")),
                        NombreCuenta   = reader.IsDBNull(reader.GetOrdinal("nombre_cuenta"))  ? "" : reader.GetString(reader.GetOrdinal("nombre_cuenta")),
                        Clasificacion  = reader.IsDBNull(reader.GetOrdinal("clasificacion"))  ? "" : reader.GetString(reader.GetOrdinal("clasificacion")),
                        Username       = reader.IsDBNull(reader.GetOrdinal("username"))       ? "" : reader.GetString(reader.GetOrdinal("username")),
                        NombreCompleto = reader.IsDBNull(reader.GetOrdinal("nombre_completo"))? "" : reader.GetString(reader.GetOrdinal("nombre_completo"))
                    });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al consultar histórico de correos");
            }
            return lista;
        }
    }
}
