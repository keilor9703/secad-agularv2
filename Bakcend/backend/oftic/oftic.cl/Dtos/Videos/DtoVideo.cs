using System.Text.Json.Serialization;

namespace Comun.Dtos.Videos;

public class DtoVideo
{
    [JsonPropertyName("idVideo")]
    public long IdVideo { get; set; }

    [JsonPropertyName("descripcion")]
    public string Descripcion { get; set; } = string.Empty;

    [JsonPropertyName("observaciones")]
    public string? Observaciones { get; set; }

    [JsonPropertyName("rutaVideo")]
    public string? RutaVideo { get; set; }

    [JsonPropertyName("fechaCreacion")]
    public DateTime FechaCreacion { get; set; }

    [JsonPropertyName("usuarioCreacion")]
    public string UsuarioCreacion { get; set; } = string.Empty;

    [JsonPropertyName("vigente")]
    public long Vigente { get; set; }

    [JsonPropertyName("fechaModifica")]
    public DateTime? FechaModifica { get; set; }

    [JsonPropertyName("usuarioModifica")]
    public string? UsuarioModifica { get; set; }

    [JsonPropertyName("maquinaModifica")]
    public string? MaquinaModifica { get; set; }
}

public class DtoVideoRequest
{
    [JsonPropertyName("descripcion")]
    public string Descripcion { get; set; } = string.Empty;

    [JsonPropertyName("observaciones")]
    public string? Observaciones { get; set; }

    [JsonPropertyName("rutaVideo")]
    public string? RutaVideo { get; set; }

    [JsonPropertyName("vigente")]
    public long Vigente { get; set; } = 1;
}

public class DtoVideoResult
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public DtoVideo? Data { get; set; }
}