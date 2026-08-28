using Comun.Dtos.Operacion;
using Datos.Interfaz;
using Microsoft.Extensions.Logging;
using Negocio.Interfaz;
using Servicios.ApiInterfaz;

namespace Negocio.Gestion
{
    public class DbVideoLlamadaService : IDbVideoLlamadaService
    {
        private readonly IDbVideoLlamadaRepository _repo;
        private readonly IProveedorSms _sms;
        private readonly ILogger<DbVideoLlamadaService> _logger;

        public DbVideoLlamadaService(
            IDbVideoLlamadaRepository repo, IProveedorSms sms, ILogger<DbVideoLlamadaService> logger)
        {
            _repo   = repo;
            _sms    = sms;
            _logger = logger;
        }

        public Task<long> CrearSesionAsync(
            long pedidoId, int sitioGraba, string usuarioDespachador,
            DateTime fechaExpira, string? numeroTelefono, CancellationToken ct)
            => _repo.CrearSesionAsync(pedidoId, sitioGraba, usuarioDespachador, fechaExpira, numeroTelefono, ct);

        public async Task<bool> EnviarLinkAsync(string numeroTelefono, string link, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(numeroTelefono)) return false;

            var mensaje = $"Policía Nacional: para que el despachador vea la situación en video, toque este enlace: {link}";
            try
            {
                return await _sms.EnviarSmsAsync(numeroTelefono, mensaje, ct);
            }
            catch (Exception ex)
            {
                // No relanzar — el despachador siempre recibe el link en la respuesta
                // del endpoint aunque el envío falle, para copiarlo manualmente.
                _logger.LogWarning(ex, "[VideoLlamada] Error enviando SMS a {Numero}", numeroTelefono);
                return false;
            }
        }

        public Task<DtoVideoSesionEstado?> GetEstadoAsync(long sesionId, CancellationToken ct)
            => _repo.GetPorIdAsync(sesionId, ct);

        public Task MarcarConectadaAsync(long sesionId, string? ipCiudadano, CancellationToken ct)
            => _repo.MarcarConectadaAsync(sesionId, ipCiudadano, ct);

        public Task MarcarFinalizadaAsync(long sesionId, CancellationToken ct)
            => _repo.MarcarFinalizadaAsync(sesionId, ct);

        public Task VincularGrabacionAsync(long sesionId, long adjuntoId, CancellationToken ct)
            => _repo.VincularGrabacionAsync(sesionId, adjuntoId, ct);

        public Task ActualizarUbicacionAsync(long sesionId, double lat, double lng, double? precision, CancellationToken ct)
        {
            // Defensa contra un cliente que envíe basura (GPS glitch, valor manipulado) —
            // coordenadas fuera de rango simplemente se descartan en vez de guardarse.
            if (lat < -90 || lat > 90 || lng < -180 || lng > 180)
            {
                _logger.LogWarning("[VideoLlamada] Ubicación fuera de rango descartada, sesión={SesionId} lat={Lat} lng={Lng}", sesionId, lat, lng);
                return Task.CompletedTask;
            }
            return _repo.ActualizarUbicacionAsync(sesionId, lat, lng, precision, ct);
        }

        public Task<DtoVideoSesionEstado?> GetActivaPorPedidoAsync(long pedidoId, CancellationToken ct)
            => _repo.GetActivaPorPedidoAsync(pedidoId, ct);

        // ── Grabación resiliente (por trozos) ──────────────────────────────────

        public Task IniciarGrabacionAsync(long sesionId, string archivoTemp, string usuario, CancellationToken ct)
            => _repo.IniciarGrabacionAsync(sesionId, archivoTemp, usuario, ct);

        public Task RegistrarChunkAsync(long sesionId, long bytes, CancellationToken ct)
            => _repo.RegistrarChunkAsync(sesionId, bytes, ct);

        public Task<DtoVideoGrabacion?> GetGrabacionAsync(long sesionId, CancellationToken ct)
            => _repo.GetGrabacionAsync(sesionId, ct);

        public Task FinalizarGrabacionAsync(long sesionId, long adjuntoId, CancellationToken ct)
            => _repo.FinalizarGrabacionAsync(sesionId, adjuntoId, ct);

        public Task CerrarGrabacionSinAdjuntoAsync(long sesionId, CancellationToken ct)
            => _repo.CerrarGrabacionSinAdjuntoAsync(sesionId, ct);

        public Task<List<DtoVideoGrabacion>> GetGrabacionesHuerfanasAsync(int minutosInactividad, CancellationToken ct)
            => _repo.GetGrabacionesHuerfanasAsync(minutosInactividad, ct);

        // ── Chat persistido y trazabilidad del caso ────────────────────────────

        /// <summary>Longitud máxima del texto — coincide con VARCHAR(2000) de la tabla.</summary>
        private const int MaxTextoChat = 2000;

        public Task<DtoVideoChatMensaje?> GuardarMensajeChatAsync(
            long sesionId, string emisor, string texto, string? usuario, CancellationToken ct)
        {
            // El texto viene del navegador: se normaliza aquí para que un cliente
            // manipulado no pueda romper el CHECK ni el VARCHAR de la tabla.
            texto = (texto ?? "").Trim();
            if (texto.Length == 0) return Task.FromResult<DtoVideoChatMensaje?>(null);
            if (texto.Length > MaxTextoChat) texto = texto[..MaxTextoChat];

            if (emisor != "DESPACHADOR" && emisor != "CIUDADANO")
            {
                _logger.LogWarning("[VideoLlamada] Emisor de chat inválido '{Emisor}', sesión={SesionId}", emisor, sesionId);
                return Task.FromResult<DtoVideoChatMensaje?>(null);
            }

            return _repo.GuardarMensajeChatAsync(sesionId, emisor, texto, usuario, ct);
        }

        public Task<List<DtoVideoSesionResumen>> GetSesionesPorPedidoAsync(long pedidoId, CancellationToken ct)
            => _repo.GetSesionesPorPedidoAsync(pedidoId, ct);
    }
}
