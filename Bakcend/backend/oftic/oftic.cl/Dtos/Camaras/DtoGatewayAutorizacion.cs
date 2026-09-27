namespace Comun.Dtos.Camaras
{
    /// <summary>
    /// Lo que manda el gateway de medios (MediaMTX) cuando pregunta si puede
    /// servir un stream.
    ///
    /// Los nombres son los que usa MediaMTX, no los nuestros: este DTO es un
    /// contrato ajeno. Está OBSERVADO contra MediaMTX v1.21.1 —se montó el
    /// gateway de verdad y se registró lo que envía—, no deducido de la
    /// documentación:
    ///
    ///   {"ip":"127.0.0.1","user":"","password":"","token":"","action":"read",
    ///    "path":"cam-1002","protocol":"webrtc","id":"&lt;uuid&gt;","query":"",
    ///    "userAgent":"..."}
    ///
    /// MediaMTX interpreta 20x como «permitido» y cualquier otra respuesta como
    /// «denegado».
    /// </summary>
    public class DtoGatewayAutorizacion
    {
        /// <summary>IP del que quiere ver el video.</summary>
        public string? Ip        { get; set; }
        public string? User      { get; set; }
        /// <summary>Alguna versión del reproductor manda el token aquí.</summary>
        public string? Password  { get; set; }
        /// <summary>Token, cuando llega por la cabecera Authorization.</summary>
        public string? Token     { get; set; }
        /// <summary>read · publish · api · metrics · pprof. Solo se autoriza «read».</summary>
        public string? Action    { get; set; }
        /// <summary>Ruta dentro del gateway, que en SECAD es «cam-{código}».</summary>
        public string? Path      { get; set; }
        /// <summary>webrtc · rtsp · hls · …</summary>
        public string? Protocol  { get; set; }
        public string? Id        { get; set; }
        /// <summary>Query de la URL; otra vía por la que puede venir el token.</summary>
        public string? Query     { get; set; }
        public string? UserAgent { get; set; }
    }
}
