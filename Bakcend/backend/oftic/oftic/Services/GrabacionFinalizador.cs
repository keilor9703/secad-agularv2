using Comun.Dtos.Operacion;
using Comun.Dtos.Recepcion;
using Negocio.Interfaz;

namespace Api.Services
{
    /// <summary>
    /// Cierra una grabación de videollamada: mueve el archivo temporal a su
    /// ubicación definitiva, lo registra como adjunto del caso y lo vincula a la
    /// sesión.
    ///
    /// <para>Existe como pieza aparte porque hay <b>dos caminos</b> que cierran una
    /// grabación y ambos deben dejar exactamente el mismo resultado:</para>
    /// <list type="number">
    ///   <item><b>Cierre normal</b> — el despachador detiene la grabación o cuelga
    ///         (<c>AdjuntoController.FinalizarGrabacion</c>).</item>
    ///   <item><b>Cierre automático</b> — el puesto del despachador murió sin cerrar
    ///         (<c>GrabacionesHuerfanasService</c>). Esto es lo que garantiza que
    ///         una grabación iniciada SIEMPRE termine registrada como evidencia,
    ///         incluso si se fue la luz en la estación.</item>
    /// </list>
    ///
    /// <para>Es idempotente: si la grabación ya estaba FINALIZADA o no quedó archivo,
    /// no hace nada y devuelve null.</para>
    /// </summary>
    public sealed class GrabacionFinalizador
    {
        private readonly GrabacionVideoStore    _store;
        private readonly IDbAdjuntoService      _adjuntoSvc;
        private readonly IDbVideoLlamadaService _videoSvc;
        private readonly ILogger<GrabacionFinalizador> _logger;

        public GrabacionFinalizador(
            GrabacionVideoStore    store,
            IDbAdjuntoService      adjuntoSvc,
            IDbVideoLlamadaService videoSvc,
            ILogger<GrabacionFinalizador> logger)
        {
            _store      = store;
            _adjuntoSvc = adjuntoSvc;
            _videoSvc   = videoSvc;
            _logger     = logger;
        }

        /// <summary>
        /// Cierra la grabación de la sesión. Devuelve el id del adjunto creado, o
        /// null si no había nada que registrar (ya finalizada, o sin bytes).
        /// </summary>
        public async Task<long?> FinalizarAsync(
            DtoVideoGrabacion grabacion, string usuario, string motivo, CancellationToken ct)
        {
            if (grabacion.Estado == "FINALIZADA")
                return null;   // ya cerrada por el otro camino — nada que hacer

            var movido = await _store.MoverADefinitivoAsync(
                grabacion.SesionId, grabacion.SitioGraba, grabacion.PedidoId, ct);

            if (movido is null)
            {
                _logger.LogInformation(
                    "[Grabacion] Sesión {SesionId}: no había archivo con contenido; se cierra sin adjunto ({Motivo}).",
                    grabacion.SesionId, motivo);

                // Cerrarla igual, sin adjunto. Si se dejara en GRABANDO, el sweeper
                // la volvería a tomar cada ciclo indefinidamente.
                await _videoSvc.CerrarGrabacionSinAdjuntoAsync(grabacion.SesionId, ct);
                return null;
            }

            var (nombreGuardado, rutaRelativa, bytes) = movido.Value;

            var adjunto = new DtoAdjunto
            {
                PedidoId       = grabacion.PedidoId,
                SitioGraba     = grabacion.SitioGraba,
                TipoAdjunto    = "VIDEO",
                NombreOriginal = $"videollamada_{grabacion.SesionId}.webm",
                NombreGuardado = nombreGuardado,
                RutaRelativa   = rutaRelativa,
                MimeType       = "video/webm",
                TamanioBytes   = bytes,
                Descripcion    = motivo,
                CanalOrigen    = "VIDEOLLAMADA",
                SubidoPor      = usuario,
                UrlPublica     = "/" + rutaRelativa
            };

            adjunto.Id = await _adjuntoSvc.RegistrarAdjuntoAsync(adjunto, ct);
            await _videoSvc.FinalizarGrabacionAsync(grabacion.SesionId, adjunto.Id, ct);

            _logger.LogInformation(
                "[Grabacion] Sesión {SesionId} finalizada ({Motivo}): {Bytes} bytes → adjunto {AdjuntoId}.",
                grabacion.SesionId, motivo, bytes, adjunto.Id);

            return adjunto.Id;
        }
    }
}
