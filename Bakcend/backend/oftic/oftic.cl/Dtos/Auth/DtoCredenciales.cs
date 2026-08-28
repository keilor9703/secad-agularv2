using System.Text.Json.Serialization;

namespace Comun.Dtos.Auth
{
    public class DtoCredenciales
    {
        [JsonPropertyName("usuario")]
        public string UsuarioEmpresarial { get; set; } = string.Empty;

        [JsonPropertyName("contrasena")]
        public string ClaveEmpresarial { get; set; } = string.Empty;
    }
}
