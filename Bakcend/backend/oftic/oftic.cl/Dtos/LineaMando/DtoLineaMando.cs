using System.Text.Json.Serialization;

namespace Comun.Dtos.LineasMando
{
    public class DtoLineaMando
    {
        public long IdLineaMando { get; set; }
        public string Identificacion { get; set; } = string.Empty;
        public string Nombre { get; set; } = string.Empty;
        public string Apellidos { get; set; } = string.Empty;
        public string Grado { get; set; } = string.Empty;
        public string Cargo { get; set; } = string.Empty;
        public string Peso { get; set; } = string.Empty;
        public string Unidad { get; set; } = string.Empty;
        public string? FotoBase64 { get; set; }
        public int Orden { get; set; } = 1;
        public int Vigente { get; set; } = 1;
    }

    public class DtoLineaMandoRequest
    {
        [JsonPropertyName("identificacion")]
        public string Identificacion { get; set; } = string.Empty;
        [JsonPropertyName("nombre")]
        public string Nombre { get; set; } = string.Empty;
        [JsonPropertyName("apellidos")]
        public string Apellidos { get; set; } = string.Empty;
        [JsonPropertyName("grado")]
        public string Grado { get; set; } = string.Empty;
        [JsonPropertyName("cargo")]
        public string Cargo { get; set; } = string.Empty;
        [JsonPropertyName("peso")]
        public string Peso { get; set; } = string.Empty;
        [JsonPropertyName("unidad")]
        public string Unidad { get; set; } = string.Empty;
        [JsonPropertyName("fotoBase64")]
        public string? FotoBase64 { get; set; }
        [JsonPropertyName("orden")]
        public int Orden { get; set; } = 1;
    }

    public class DtoLineaMandoResult
    {
        public long Id { get; set; }
        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
    }

    public class DtoVigenteRequest
    {
        [JsonPropertyName("vigente")]
        public int Vigente { get; set; }
    }
}
