using Microsoft.AspNetCore.Http;

namespace Comun.Dtos.GestionDocumental
{
    public class DtoEnvioCorreoRequest
    {
        public int IdCuentaEmail { get; set; }
        public int? IdClasificacion { get; set; }
        public string? NombreClasificacion { get; set; }
        public string? Para { get; set; }
        public string? Cc { get; set; }
        public string Asunto { get; set; } = string.Empty;
        public string Cuerpo { get; set; } = string.Empty;
        public List<IFormFile>? Adjuntos { get; set; }
        public bool PrioridadAlta { get; set; } = false;
        public bool AcuseRecibido { get; set; } = false;
    }

    public class DtoEnvioCorreoResult
    {
        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
        public string? Radicado { get; set; }
    }
}
