using Comun.Dtos.GestionDocumental;

namespace Datos.Interfaz.GestionDocumental
{
    public interface IDbGestionCorreosRepository
    {
        bool RegistrarEnvio(DtoEnvioCorreoRequest request, string radicado, string usuario, string maquina);
        List<DtoHistoricoCorreo> ConsultarHistorico();
    }

    public class DtoHistoricoCorreo
    {
        public long IdEnvio { get; set; }
        public string Radicado { get; set; } = string.Empty;
        public string Destinatario { get; set; } = string.Empty;
        public string Asunto { get; set; } = string.Empty;
        public string Cuerpo { get; set; } = string.Empty;
        public DateTime Fecha { get; set; }
        public string DeEmail { get; set; } = string.Empty;
        public string NombreCuenta { get; set; } = string.Empty;
        public string Clasificacion { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string NombreCompleto { get; set; } = string.Empty;
    }
}
