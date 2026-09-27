namespace Comun.Dtos.Camaras
{
    /// <summary>
    /// Los protocolos de streaming que declara la OpenAPI de HikCentral
    /// (§5.4.12, §5.4.13 y la tabla de enumeraciones del anexo) y qué hace falta
    /// para reproducir cada uno en un navegador.
    ///
    /// Está en Comun y no en el driver porque la respuesta viaja al frontend: el
    /// navegador necesita saber con qué reproductor abrir la URL, y deducirlo
    /// mirando la URL es exactamente el tipo de adivinanza que ya rompió el
    /// video una vez.
    /// </summary>
    public static class VmsProtocolos
    {
        // Reproducibles en el navegador con software libre.
        public const string Hls      = "hls";
        public const string HlsS     = "hls_s";
        // Requieren el jsDecoder SDK de Hikvision (solo Windows).
        public const string WebSocket       = "websocket";
        public const string WebSocketSeguro = "websocket_s";
        // No reproducibles en un navegador: quedan para un gateway de medios o
        // para clientes de escritorio.
        public const string Rtsp   = "rtsp";
        public const string RtspS  = "rtsp_s";
        public const string Rtmp   = "rtmp";

        /// <summary>Con qué reproductor abre el navegador este stream.</summary>
        public const string ReproductorHls       = "hls";
        public const string ReproductorJsDecoder = "jsdecoder";
        public const string ReproductorWebrtc    = "webrtc";
        public const string ReproductorNinguno   = "ninguno";

        /// <summary>
        /// true cuando el video no lo sirve el VMS sino el gateway de medios del
        /// nodo edge: SECAD le pide a HikCentral el RTSP y el navegador recibe
        /// una URL WHEP. Es la vía de baja latencia que no exige instalar nada en
        /// el puesto (ver CCTV_LATENCIA.md).
        /// </summary>
        public static bool EsPorGateway(string? protocolo) =>
            Igual(protocolo, Rtsp) || Igual(protocolo, RtspS);

        public static bool EsWebsocket(string? protocolo) =>
            Igual(protocolo, WebSocket) || Igual(protocolo, WebSocketSeguro);

        /// <summary>
        /// true cuando el propio nombre del protocolo ya dice que va cifrado
        /// («websocket_s»). Importa porque «requestWebsocketProtocol» solo tiene
        /// sentido con «websocket» a secas.
        /// </summary>
        public static bool EsSeguroPorNombre(string? protocolo) =>
            Igual(protocolo, WebSocketSeguro);

        /// <summary>
        /// Con qué reproductor abre el navegador. RTSP depende de si hay gateway:
        /// con él el navegador recibe WebRTC; sin él, RTSP no lo reproduce nadie.
        /// </summary>
        public static string Reproductor(string? protocolo, bool hayGateway = false) =>
            protocolo?.Trim().ToLowerInvariant() switch
            {
                Hls or HlsS                  => ReproductorHls,
                WebSocket or WebSocketSeguro => ReproductorJsDecoder,
                Rtsp or RtspS when hayGateway => ReproductorWebrtc,
                _                            => ReproductorNinguno,
            };

        /// <summary>
        /// Opciones que se le ofrecen al administrador en la ficha de la
        /// integración. RTSP y RTMP se dejan FUERA a propósito: ningún navegador
        /// los reproduce, y ofrecerlos solo produce integraciones que pasan la
        /// prueba de conexión y luego no dan imagen.
        /// </summary>
        public static readonly (string Valor, string Etiqueta)[] Opciones =
        {
            (HlsS, "HLS sobre TLS (hls_s) — compatible con todo, ~7 s de retraso"),
            (Hls,  "HLS sin TLS (hls) — solo para HikCentral 3.1.0"),
            (RtspS, "RTSP seguro por gateway (rtsp_s) — latencia mínima, exige gateway en el nodo edge"),
            (Rtsp,  "RTSP por gateway (rtsp) — latencia mínima, exige gateway en el nodo edge"),
            (WebSocketSeguro, "WebSocket seguro (websocket_s) — baja latencia, exige jsDecoder en cada puesto"),
            (WebSocket,       "WebSocket (websocket) — baja latencia, exige jsDecoder en cada puesto"),
        };

        private static bool Igual(string? a, string b) =>
            !string.IsNullOrWhiteSpace(a) && a.Trim().Equals(b, System.StringComparison.OrdinalIgnoreCase);
    }
}
