using System.Text.Json.Serialization;

namespace Comun.Dtos.Integraciones
{
    // ── Integración entrante (canal que RECIBE casos) ─────────────────────────

    public class DtoIntegracionEntrante
    {
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long    Id                 { get; set; }
        public string  Nombre             { get; set; } = "";
        public string? Descripcion        { get; set; }
        /// <summary>CHAT | SMS | API_FOTO | OTRA</summary>
        public string  TipoCanal          { get; set; } = "";
        public string  EndpointRelativo   { get; set; } = "";
        public string? HeadersRequeridos  { get; set; }  // JSON string
        public string? EjemploPayload     { get; set; }  // JSON string
        public int     SitioGrabaDefecto  { get; set; }
        public bool    Activa             { get; set; }
        public string? Notas              { get; set; }
        public string? FechaCreacion      { get; set; }
        public string? FechaModificacion  { get; set; }
    }

    public class DtoIntegracionEntranteRequest
    {
        public string  Nombre            { get; set; } = "";
        public string? Descripcion       { get; set; }
        public string  TipoCanal         { get; set; } = "OTRA";
        public string  EndpointRelativo  { get; set; } = "";
        public string? HeadersRequeridos { get; set; }
        public string? EjemploPayload    { get; set; }
        public int     SitioGrabaDefecto { get; set; }
        public bool    Activa            { get; set; } = true;
        public string? Notas             { get; set; }
    }

    // ── Auditoría: despacho saliente (cad_despachos_externos) ─────────────────

    public class DtoDespachoAuditoria
    {
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long    Id             { get; set; }
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long    PedidoId       { get; set; }
        public int     SitioGraba     { get; set; }
        public string  AgenciaNombre  { get; set; } = "";
        public string  AgenciaTipo    { get; set; } = "";
        public string? PayloadEnviado { get; set; }
        public int?    HttpStatus     { get; set; }
        public string? RespuestaApi   { get; set; }
        public string  EnviadoPor     { get; set; } = "";
        public string  FechaEnvio     { get; set; } = "";
        public bool    Exitoso        { get; set; }
    }

    // ── Auditoría: recepción entrante (cad_recepciones_externas) ─────────────

    public class DtoRecepcionAuditoria
    {
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long    Id              { get; set; }
        public string  Canal           { get; set; } = "";   // CHAT | SMS
        public string  PayloadCrudo    { get; set; } = "";
        public long?   PedidoId        { get; set; }
        public bool    Procesado       { get; set; }
        public string? Error           { get; set; }
        public string? IpOrigen        { get; set; }
        public string  FechaRecepcion  { get; set; } = "";
    }
}
