using Comun.Dtos.Operacion;

namespace Negocio.Interfaz
{
    public interface IDbVideoLlamadaService
    {
        /// <summary>Crea la sesión en estado PENDIENTE. La firma del token JWT la hace el controlador (VideoSessionTokenService).</summary>
        Task<long> CrearSesionAsync(
            long pedidoId, int sitioGraba, string usuarioDespachador,
            DateTime fechaExpira, string? numeroTelefono, CancellationToken ct);

        /// <summary>Envía el link por SMS (best-effort, ver IProveedorSms). No lanza si falla — el llamador decide qué mostrar.</summary>
        Task<bool> EnviarLinkAsync(string numeroTelefono, string link, CancellationToken ct);

        Task<DtoVideoSesionEstado?> GetEstadoAsync(long sesionId, CancellationToken ct);
        Task MarcarConectadaAsync(long sesionId, string? ipCiudadano, CancellationToken ct);
        Task MarcarFinalizadaAsync(long sesionId, CancellationToken ct);
        Task VincularGrabacionAsync(long sesionId, long adjuntoId, CancellationToken ct);

        /// <summary>Persiste la última posición GPS reportada por el ciudadano. Ignora coordenadas fuera de rango.</summary>
        Task ActualizarUbicacionAsync(long sesionId, double lat, double lng, double? precision, CancellationToken ct);

        /// <summary>Videollamada vigente del caso, si la hay — para reconectarse en vez de generar otro enlace.</summary>
        Task<DtoVideoSesionEstado?> GetActivaPorPedidoAsync(long pedidoId, CancellationToken ct);

        // ── Grabación resiliente (por trozos) ──────────────────────────────────
        Task IniciarGrabacionAsync(long sesionId, string archivoTemp, string usuario, CancellationToken ct);
        Task RegistrarChunkAsync(long sesionId, long bytes, CancellationToken ct);
        Task<DtoVideoGrabacion?> GetGrabacionAsync(long sesionId, CancellationToken ct);
        Task FinalizarGrabacionAsync(long sesionId, long adjuntoId, CancellationToken ct);
        Task CerrarGrabacionSinAdjuntoAsync(long sesionId, CancellationToken ct);
        Task<List<DtoVideoGrabacion>> GetGrabacionesHuerfanasAsync(int minutosInactividad, CancellationToken ct);

        // ── Chat persistido y trazabilidad del caso ────────────────────────────

        /// <summary>Guarda un mensaje del chat y lo devuelve ya persistido (id + fecha del servidor).</summary>
        Task<DtoVideoChatMensaje?> GuardarMensajeChatAsync(
            long sesionId, string emisor, string texto, string? usuario, CancellationToken ct);

        /// <summary>Trazabilidad de todas las videollamadas de un caso, para la revisión del incidente.</summary>
        Task<List<DtoVideoSesionResumen>> GetSesionesPorPedidoAsync(long pedidoId, CancellationToken ct);
    }
}
