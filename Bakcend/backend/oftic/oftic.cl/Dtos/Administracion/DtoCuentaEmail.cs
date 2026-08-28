using System.Text.Json.Serialization;

namespace Comun.Dtos.Administracion
{
    public class DtoCuentaEmail
    {
        public int IdCuenta { get; set; }
        public int IdDominioGrupo { get; set; }
        public string NombreCuenta { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;

        [JsonIgnore]
        public string ServidorSmtp { get; set; } = "smtp.office365.com";

        [JsonIgnore]
        public int Puerto { get; set; } = 587;

        [JsonIgnore]
        public string UsuarioSmtp { get; set; } = string.Empty;

        [JsonIgnore]
        public string ClaveSmtp { get; set; } = string.Empty;

        [JsonIgnore]
        public int UsarSsl { get; set; } = 1;
        public int Vigente { get; set; } = 1;

        public string? NombreGrupo { get; set; }
        public string? UsuarioCrea { get; set; }
        public DateTime? FechaCrea { get; set; }
        public string? FirmaHtml { get; set; }
        public string? ImagenEncabezado { get; set; }
    }

    public class DtoCuentaEmailRequest
    {
        public int IdCuenta { get; set; }
        public int IdDominioGrupo { get; set; }
        public string NombreCuenta { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string ServidorSmtp { get; set; } = "smtp.office365.com";
        public int Puerto { get; set; } = 587;
        public string UsuarioSmtp { get; set; } = string.Empty;
        public string ClaveSmtp { get; set; } = string.Empty;
        public int UsarSsl { get; set; } = 1;
        public int Vigente { get; set; } = 1;
        public string? UsuarioAuditoria { get; set; }
        public string? IpAuditoria { get; set; }
        public string? FirmaHtml { get; set; }
        public string? ImagenEncabezado { get; set; }
    }
}
