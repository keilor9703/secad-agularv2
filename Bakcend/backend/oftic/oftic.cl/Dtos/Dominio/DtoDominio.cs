using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json.Serialization;
using System.Threading.Tasks;

namespace Comun.Dtos.Dominio
{
    public class DtoDominio
    {
        public long IdDominio { get; set; }
        public string Descripcion { get; set; } = string.Empty;
        public long IdPadre { get; set; }
        public long Vigente { get; set; }
        public string Abreviatura { get; set; } = string.Empty;
        public string Observacion { get; set; } = string.Empty;
    }

    public class DtoDominioRequest
    {
        [JsonPropertyName("Descripcion")]
        public string Descripcion { get; set; } = string.Empty;
        [JsonPropertyName("IdPadre")]
        public long IdPadre { get; set; }
        [JsonPropertyName("Vigente")]
        public long Vigente { get; set; }
        [JsonPropertyName("Abreviatura")]
        public string Abreviatura { get; set; } = string.Empty;
        [JsonPropertyName("Observacion")]
        public string Observacion { get; set; } = string.Empty;
    }

    public class DtoDominioResult
    {
        public long Id { get; set; }
        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
    }
}
