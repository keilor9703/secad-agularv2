using Comun.Dtos.Operacion;

namespace Datos.Interfaz
{
    public interface IDbVideoLlamadaRepository
    {
        /// <summary>Inserta la sesión en estado PENDIENTE. Retorna el id generado (Snowflake).</summary>
        Task<long> CrearSesionAsync(
            long pedidoId, int sitioGraba, string usuarioDespachador,
            DateTime fechaExpira, string? numeroTelefono, CancellationToken ct);

        /// <summary>Lee el estado de una sesión por id. Null si no existe.</summary>
        Task<DtoVideoSesionEstado?> GetPorIdAsync(long sesionId, CancellationToken ct);

        /// <summary>Marca CONECTADA la primera vez que el ciudadano entra. No-op si ya estaba conectada.</summary>
        Task MarcarConectadaAsync(long sesionId, string? ipCiudadano, CancellationToken ct);

        /// <summary>Marca FINALIZADA (cierre normal, por cualquiera de los dos extremos).</summary>
        Task MarcarFinalizadaAsync(long sesionId, CancellationToken ct);

        /// <summary>Vincula el adjunto de la grabación subida al cerrar la sesión.</summary>
        Task VincularGrabacionAsync(long sesionId, long adjuntoId, CancellationToken ct);

        /// <summary>Sobrescribe la última ubicación GPS conocida del ciudadano (no es histórico, solo la más reciente).</summary>
        Task ActualizarUbicacionAsync(long sesionId, double lat, double lng, double? precision, CancellationToken ct);

        /// <summary>Barrido de sesiones PENDIENTE cuya fecha_expira ya pasó → EXPIRADA. Llamado bajo demanda, no hay job de fondo.</summary>
        Task ExpirarVencidasAsync(CancellationToken ct);

        // ── Reconexión ────────────────────────────────────────────────────────

        /// <summary>
        /// Videollamada vigente (PENDIENTE|CONECTADA) del caso, si la hay. Permite
        /// reconectarse a la llamada en curso en vez de generar otro enlace.
        /// </summary>
        Task<DtoVideoSesionEstado?> GetActivaPorPedidoAsync(long pedidoId, CancellationToken ct);

        // ── Grabación resiliente (por trozos, ver V54) ─────────────────────────

        /// <summary>Marca la sesión como GRABANDO y fija el archivo temporal. No-op si ya está FINALIZADA.</summary>
        Task IniciarGrabacionAsync(long sesionId, string archivoTemp, string usuario, CancellationToken ct);

        /// <summary>Suma los bytes de un trozo recibido y refresca la marca de tiempo (la usa el sweeper).</summary>
        Task RegistrarChunkAsync(long sesionId, long bytes, CancellationToken ct);

        /// <summary>Estado de la grabación tal como lo conoce el servidor. Null si la sesión no existe.</summary>
        Task<DtoVideoGrabacion?> GetGrabacionAsync(long sesionId, CancellationToken ct);

        /// <summary>Cierra la grabación: la marca FINALIZADA y la vincula al adjunto ya registrado.</summary>
        Task FinalizarGrabacionAsync(long sesionId, long adjuntoId, CancellationToken ct);

        /// <summary>
        /// Cierra una grabación que no dejó archivo con contenido (se inició y se
        /// cortó sin recibir nada). Sin esto el sweeper la reintentaría para siempre.
        /// </summary>
        Task CerrarGrabacionSinAdjuntoAsync(long sesionId, CancellationToken ct);

        /// <summary>
        /// Grabaciones que quedaron abiertas y sin recibir trozos hace más de N minutos:
        /// el puesto del despachador murió sin cerrarlas. Las finaliza el sweeper.
        /// </summary>
        Task<List<DtoVideoGrabacion>> GetGrabacionesHuerfanasAsync(int minutosInactividad, CancellationToken ct);

        // ── Chat persistido y trazabilidad del caso (ver V55) ──────────────────

        /// <summary>
        /// Guarda un mensaje del chat de la videollamada. El pedido_id se resuelve
        /// desde la propia sesión, así que el Hub solo necesita el sesionId.
        /// Retorna el mensaje ya persistido (con id y fecha del servidor) para
        /// reenviarlo al otro extremo; null si la sesión no existe.
        /// </summary>
        Task<DtoVideoChatMensaje?> GuardarMensajeChatAsync(
            long sesionId, string emisor, string texto, string? usuario, CancellationToken ct);

        /// <summary>
        /// Todas las videollamadas de un caso con su trazabilidad completa —
        /// quién atendió, duración, grabación asociada y transcripción del chat —
        /// para la revisión del incidente en el módulo de Pedido.
        /// </summary>
        Task<List<DtoVideoSesionResumen>> GetSesionesPorPedidoAsync(long pedidoId, CancellationToken ct);
    }
}
