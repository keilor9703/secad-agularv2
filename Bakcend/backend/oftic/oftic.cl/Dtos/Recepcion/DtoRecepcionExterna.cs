using System.Text.Json.Serialization;

namespace Comun.Dtos.Recepcion
{
    // ── Payload de recepción por Chat (REST API externa) ─────────────────────
    public class DtoChatRecepcionRequest
    {
        /// <summary>Código DANE del CAD destino.</summary>
        public string CodDane          { get; set; } = "";
        public int    SitioGraba       { get; set; }
        public string NombreReportante { get; set; } = "";
        /// <summary>ID de contacto en la plataforma de chat (e.g. número WhatsApp).</summary>
        public string ContactoId       { get; set; } = "";
        public string Mensaje          { get; set; } = "";
        public string DireccionCaso    { get; set; } = "";
        public string Ciudad           { get; set; } = "";
        public string Barrio           { get; set; } = "";
        public string? LatitudCaso     { get; set; }
        public string? LongitudCaso    { get; set; }
        public string CodigoCaso       { get; set; } = "";
        /// <summary>Código de calidad / urgencia (01 = urgente por defecto).</summary>
        public string CaliPedido       { get; set; } = "01";
        public string? Comentario      { get; set; }
        public List<DtoCanalSeleccionado> Canales { get; set; } = new();
    }

    // ── Payload de recepción por SMS (REST API externa) ──────────────────────
    public class DtoSmsRecepcionRequest
    {
        /// <summary>Código DANE del CAD destino.</summary>
        public string CodDane          { get; set; } = "";
        public int    SitioGraba       { get; set; }
        public string NumeroCelular    { get; set; } = "";
        public string NombreReportante { get; set; } = "CIUDADANO";
        public string MensajeSms       { get; set; } = "";
        public string DireccionCaso    { get; set; } = "";
        public string Ciudad           { get; set; } = "";
        public string Barrio           { get; set; } = "";
        public string? LatitudCaso     { get; set; }
        public string? LongitudCaso    { get; set; }
        public string CodigoCaso       { get; set; } = "";
        public string CaliPedido       { get; set; } = "01";
        public List<DtoCanalSeleccionado> Canales { get; set; } = new();
    }

    // ── Resultado devuelto a sistemas externos ────────────────────────────────
    public class DtoRecepcionExternaResult
    {
        public bool   Success    { get; set; }
        public string Message    { get; set; } = "";
        /// <summary>ID Snowflake del pedido creado (string para precisión JS).</summary>
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long   PedidoId   { get; set; }
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long   EventoId   { get; set; }
        public string Canal      { get; set; } = "";
    }

    // ── Fila de auditoría (para insertar en cad_recepciones_externas) ─────────
    public class DtoAuditoriaRecepcionExterna
    {
        public long   Id              { get; set; }
        public string Canal           { get; set; } = "";
        public string PayloadCrudo    { get; set; } = "";
        public long?  PedidoId        { get; set; }
        public bool   Procesado       { get; set; }
        public string? Error          { get; set; }
        public string? IpOrigen       { get; set; }
    }
}
