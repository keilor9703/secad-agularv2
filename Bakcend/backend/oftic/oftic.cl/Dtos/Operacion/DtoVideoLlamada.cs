using System.Text.Json.Serialization;

namespace Comun.Dtos.Operacion
{
    // ── Estados posibles de cad_video_sesiones.estado ─────────────────────────
    public static class EstadoVideoSesion
    {
        public const string Pendiente  = "PENDIENTE";
        public const string Conectada  = "CONECTADA";
        public const string Finalizada = "FINALIZADA";
        public const string Expirada   = "EXPIRADA";
        public const string Cancelada  = "CANCELADA";
    }

    /// <summary>POST api/VideoLlamada — el despachador solicita crear una sesión para un caso.</summary>
    public class DtoCrearVideoSesionRequest
    {
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long   PedidoId       { get; set; }
        /// <summary>Número del ciudadano a quien enviar el link — el despachador lo confirma/edita en el panel.</summary>
        public string NumeroTelefono { get; set; } = "";
    }

    /// <summary>Respuesta al despachador tras crear la sesión: el link listo para enviar.</summary>
    public class DtoCrearVideoSesionResult
    {
        public bool    Success       { get; set; }
        public string  Message       { get; set; } = "";
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long    SesionId      { get; set; }
        /// <summary>Token firmado de corta vida (JWT) — el frontend arma la URL pública con esto: /video/{token}.</summary>
        public string  SessionToken  { get; set; } = "";
        public DateTime FechaExpira  { get; set; }
        /// <summary>true si IProveedorSms confirmó el envío; false si solo quedó disponible para copiar/enviar manualmente.</summary>
        public bool    SmsEnviado    { get; set; }
    }

    /// <summary>Estado de una sesión, expuesto al despachador para refrescar el panel.</summary>
    public class DtoVideoSesionEstado
    {
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long    SesionId          { get; set; }
        public int     SitioGraba        { get; set; }
        public string  Estado            { get; set; } = "";
        public DateTime FechaCreacion    { get; set; }
        public DateTime FechaExpira      { get; set; }
        public DateTime? FechaConectado  { get; set; }
        public DateTime? FechaFinalizado { get; set; }
        /// <summary>Última posición GPS reportada por el ciudadano (video-ciudadano.ts), si compartió ubicación.</summary>
        public double?   UltimaLat              { get; set; }
        public double?   UltimaLng              { get; set; }
        public double?   UltimaPrecision        { get; set; }
        public DateTime? UltimaUbicacionFecha    { get; set; }
    }

    /// <summary>
    /// Videollamada vigente de un caso (PENDIENTE o CONECTADA). Permite que el
    /// despachador se RECONECTE a la llamada en curso — tras un F5, un cambio de
    /// pestaña o una caída de red — en vez de generar un enlace nuevo y obligar
    /// al ciudadano a volver a entrar.
    /// </summary>
    public class DtoVideoSesionActiva
    {
        public bool     Hay            { get; set; }
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long     SesionId       { get; set; }
        public string   Estado         { get; set; } = "";
        /// <summary>Token re-firmado con la vigencia restante de la sesión, para rearmar el link.</summary>
        public string   SessionToken   { get; set; } = "";
        public DateTime FechaExpira    { get; set; }
        public string?  NumeroTelefono { get; set; }
        /// <summary>true si quedó una grabación abierta en el servidor (se sigue anexando a ella).</summary>
        public bool     Grabando       { get; set; }
    }

    /// <summary>Un mensaje del chat de la videollamada, tal como quedó registrado.</summary>
    public class DtoVideoChatMensaje
    {
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long     Id      { get; set; }
        /// <summary>DESPACHADOR | CIUDADANO</summary>
        public string   Emisor  { get; set; } = "";
        public string   Texto   { get; set; } = "";
        /// <summary>Usuario del CAD; null cuando escribió el ciudadano (anónimo por diseño).</summary>
        public string?  Usuario { get; set; }
        public DateTime Fecha   { get; set; }
    }

    /// <summary>
    /// Trazabilidad completa de una videollamada, para la revisión del caso en el
    /// módulo de Pedido: quién la atendió, cuándo, cuánto duró, si dejó grabación
    /// y cuál, la última ubicación reportada y la transcripción del chat.
    /// </summary>
    public class DtoVideoSesionResumen
    {
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long      SesionId           { get; set; }
        public string    Estado             { get; set; } = "";
        public string    UsuarioDespachador { get; set; } = "";
        public string?   NumeroTelefono     { get; set; }
        public DateTime  FechaCreacion      { get; set; }
        public DateTime? FechaConectado     { get; set; }
        public DateTime? FechaFinalizado    { get; set; }
        /// <summary>Segundos entre conexión y cierre. Null si nunca llegó a conectar.</summary>
        public int?      DuracionSegundos   { get; set; }
        public string?   IpCiudadano        { get; set; }

        // ── Grabación asociada ─────────────────────────────────────────────
        public bool      TieneGrabacion     { get; set; }
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long?     AdjuntoGrabacionId { get; set; }
        public string?   GrabacionUrl       { get; set; }
        public string?   GrabacionNombre    { get; set; }
        /// <summary>null | GRABANDO | FINALIZADA — GRABANDO en revisión significa que quedó abierta.</summary>
        public string?   GrabacionEstado    { get; set; }

        // ── Última ubicación reportada por el ciudadano ────────────────────
        public double?   UltimaLat          { get; set; }
        public double?   UltimaLng          { get; set; }

        public List<DtoVideoChatMensaje> Chat { get; set; } = new();
    }

    /// <summary>Body de POST api/Adjunto/grabacion/iniciar y .../finalizar.</summary>
    public class DtoIniciarGrabacionRequest
    {
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long SesionId { get; set; }
    }

    /// <summary>
    /// Estado de la grabación de una sesión, tal como lo conoce el SERVIDOR (no el
    /// navegador). El archivo temporal existe en disco desde el primer trozo, así
    /// que la evidencia sobrevive aunque el puesto del despachador muera.
    /// </summary>
    public class DtoVideoGrabacion
    {
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long      SesionId    { get; set; }
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long      PedidoId    { get; set; }
        public int       SitioGraba  { get; set; }
        /// <summary>null | GRABANDO | FINALIZADA</summary>
        public string?   Estado      { get; set; }
        public string?   ArchivoTemp { get; set; }
        public long      Bytes       { get; set; }
        public DateTime? Inicio      { get; set; }
        public DateTime? UltimoChunk { get; set; }
        public string?   Usuario     { get; set; }
    }

    /// <summary>
    /// Lo mínimo que la página pública del ciudadano necesita saber al validar su
    /// token — nunca expone el pedidoId real ni datos internos del caso.
    /// </summary>
    public class DtoVideoSesionPublica
    {
        public bool   Valido  { get; set; }
        public string Estado  { get; set; } = "";
        public string Mensaje { get; set; } = "";
        /// <summary>Necesario en el cliente para relayar señalización (SendAnswer/SendIceCandidate) tras unirse al Hub.</summary>
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long   SesionId { get; set; }
    }
}
