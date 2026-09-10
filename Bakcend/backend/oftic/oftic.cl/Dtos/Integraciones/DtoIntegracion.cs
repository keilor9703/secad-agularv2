using System.Text.Json.Serialization;

namespace Comun.Dtos.Integraciones
{
    /// <summary>
    /// Un canal de despacho destino de una integración entrante.
    ///
    /// La llave es COMPUESTA (Codigo + FuerzaId): el código de canal no es
    /// único, dos fuerzas distintas pueden tener el canal 1. Por eso se elige
    /// primero la fuerza y después su canal, y nunca se guarda el código solo.
    /// </summary>
    public class DtoCanalIntegracion
    {
        public int     FuerzaId          { get; set; }
        public int     Codigo            { get; set; }
        // Solo de lectura: los rellena el repositorio para que la pantalla no
        // tenga que cruzar catálogos para pintar un nombre.
        public string? FuerzaDescripcion { get; set; }
        public string? CanalDescripcion  { get; set; }
        /// <summary>Unidad policial de la fuerza. Sirve para avisar de un destino que nadie vería.</summary>
        public int     SitioGraba        { get; set; }
    }

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

        /// <summary>
        /// Llave (secad_api_keys, base maestra) con la que autentica este
        /// proveedor. Es lo que empareja una petición entrante con su ficha, y
        /// por tanto lo que dice qué canales aplicarle.
        /// </summary>
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long?   ApiKeyId           { get; set; }

        /// <summary>Canales de despacho destino. Los fija el CAD, no el sistema externo.</summary>
        public List<DtoCanalIntegracion> Canales { get; set; } = new();
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

        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long?   ApiKeyId          { get; set; }

        /// <summary>Solo se leen FuerzaId y Codigo; las descripciones son de salida.</summary>
        public List<DtoCanalIntegracion> Canales { get; set; } = new();
    }

    /// <summary>
    /// A qué ficha de integración se atribuyó una petición entrante y, por
    /// tanto, a qué canales va el caso.
    /// </summary>
    public class DtoDestinoIntegracion
    {
        public long?  IntegracionId { get; set; }
        public string Nombre        { get; set; } = string.Empty;
        /// <summary>
        /// true = había varias fichas activas de ese canal y ninguna llave que
        /// desempatara. No se adivina: el caso entra sin despachar y queda el
        /// aviso en el log para que el CAD ate cada ficha a su llave.
        /// </summary>
        public bool   Ambiguo       { get; set; }
        public List<DtoCanalIntegracion> Canales { get; set; } = new();
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
