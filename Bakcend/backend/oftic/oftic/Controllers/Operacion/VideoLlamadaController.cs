using Api.Services;
using Comun.Dtos.Operacion;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Negocio.Interfaz;
using System.Security.Claims;

namespace Api.Controllers.Operacion
{
    /// <summary>
    /// Videollamada en vivo con el ciudadano (WebRTC punto-a-punto, señalizado por
    /// VideoSignalingHub). El despachador crea la sesión desde el detalle del caso;
    /// el ciudadano solo necesita el link — nunca llama nada de este controller
    /// autenticado, la validación de su lado la hace el propio token contra
    /// VideoSessionTokenService (ver GetEstadoPublico, la única acción anónima aquí).
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class VideoLlamadaController : ControllerBase
    {
        private readonly IDbVideoLlamadaService   _videoService;
        private readonly IDbPedidoService         _pedidoService;
        private readonly VideoSessionTokenService _sessionToken;
        private readonly IConfiguration           _configuration;
        private readonly ILogger<VideoLlamadaController> _logger;

        public VideoLlamadaController(
            IDbVideoLlamadaService videoService,
            IDbPedidoService pedidoService,
            VideoSessionTokenService sessionToken,
            IConfiguration configuration,
            ILogger<VideoLlamadaController> logger)
        {
            _videoService  = videoService;
            _pedidoService = pedidoService;
            _sessionToken  = sessionToken;
            _configuration = configuration;
            _logger        = logger;
        }

        /// <summary>
        /// Crea una sesión de videollamada para un caso e intenta enviar el link
        /// por SMS. El despachador recibe el link en la respuesta siempre, sin
        /// importar si el envío por SMS funcionó (ver IProveedorSms).
        /// </summary>
        [HttpPost]
        public async Task<ActionResult> Crear([FromBody] DtoCrearVideoSesionRequest req, CancellationToken ct)
        {
            try
            {
                // Mismo chequeo de propiedad que ya existe en PedidoController — un
                // despachador no puede abrir videollamada sobre un caso de otro sitio.
                var pedido = await _pedidoService.GetByIdAsync(req.PedidoId, ct);
                if (pedido is null)
                    return NotFound(new { success = false, message = "Caso no encontrado." });

                if (!IsAdmin() && pedido.SitioGraba != GetIntClaim("sitio_graba"))
                    return Forbid();

                var minutos     = _sessionToken.DefaultMinutes;
                var fechaExpira = DateTime.UtcNow.AddMinutes(minutos);
                var usuario     = User.FindFirstValue("username") ?? User.FindFirstValue(ClaimTypes.Name) ?? "sistema";
                var codDane     = User.FindFirstValue("cod_dane") ?? "";

                // Idempotencia: si el caso YA tiene una videollamada vigente, se
                // devuelve esa misma en vez de crear otra. Sin esto, un despachador
                // que refresca o vuelve al caso generaba un enlace nuevo y dejaba
                // al ciudadano conectado a una sesión que ya nadie atiende.
                var vigente = await _videoService.GetActivaPorPedidoAsync(req.PedidoId, ct);
                if (vigente is not null)
                {
                    var tokenVigente = _sessionToken.CreateToken(
                        new VideoSessionTokenService.VideoSessionData(
                            vigente.SesionId, req.PedidoId, pedido.SitioGraba, codDane, usuario),
                        vigente.FechaExpira);

                    return Ok(new DtoCrearVideoSesionResult
                    {
                        Success      = true,
                        Message      = "Ya había una videollamada en curso para este caso — se reutiliza el mismo enlace.",
                        SesionId     = vigente.SesionId,
                        SessionToken = tokenVigente,
                        FechaExpira  = vigente.FechaExpira,
                        SmsEnviado   = false
                    });
                }

                var sesionId = await _videoService.CrearSesionAsync(
                    req.PedidoId, pedido.SitioGraba, usuario, fechaExpira, req.NumeroTelefono, ct);

                var token = _sessionToken.CreateToken(
                    new VideoSessionTokenService.VideoSessionData(
                        sesionId, req.PedidoId, pedido.SitioGraba, codDane, usuario),
                    fechaExpira);

                var baseUrl = (_configuration["ApiSettings:SecadBaseUrl"] ?? "").TrimEnd('/');
                var link    = $"{baseUrl}/video/{token}";

                var smsEnviado = await _videoService.EnviarLinkAsync(req.NumeroTelefono, link, ct);

                return Ok(new DtoCrearVideoSesionResult
                {
                    Success      = true,
                    Message      = smsEnviado
                        ? "Enlace enviado por SMS."
                        : "No se pudo enviar el SMS — copie el enlace y envíelo manualmente.",
                    SesionId     = sesionId,
                    SessionToken = token,
                    FechaExpira  = fechaExpira,
                    SmsEnviado   = smsEnviado
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al crear sesión de videollamada, pedidoId={Id}", req.PedidoId);
                return StatusCode(500, new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        /// <summary>Estado de la sesión para refrescar el panel del despachador.</summary>
        [HttpGet("{sesionId:long}")]
        public async Task<ActionResult> GetEstado(long sesionId, CancellationToken ct)
        {
            var estado = await _videoService.GetEstadoAsync(sesionId, ct);
            if (estado is null)
                return NotFound(new { success = false, message = "Sesión no encontrada." });

            if (!IsAdmin() && estado.SitioGraba != GetIntClaim("sitio_graba"))
                return Forbid();

            return Ok(estado);
        }

        /// <summary>
        /// ¿Este caso tiene una videollamada en curso? Lo consulta el panel del
        /// despachador al abrir el caso, para ofrecer <b>reconectarse</b> a la
        /// llamada existente en lugar de generar otro enlace.
        ///
        /// Es lo que permite recuperar la llamada tras un F5, un cambio de pestaña,
        /// una caída de red o incluso un relevo de turno: el ciudadano sigue en la
        /// misma sesión y no tiene que volver a entrar por un enlace nuevo.
        /// </summary>
        [HttpGet("activa/{pedidoId:long}")]
        public async Task<ActionResult> GetActiva(long pedidoId, CancellationToken ct)
        {
            try
            {
                var pedido = await _pedidoService.GetByIdAsync(pedidoId, ct);
                if (pedido is null)
                    return NotFound(new { success = false, message = "Caso no encontrado." });

                if (!IsAdmin() && pedido.SitioGraba != GetIntClaim("sitio_graba"))
                    return Forbid();

                var activa = await _videoService.GetActivaPorPedidoAsync(pedidoId, ct);
                if (activa is null)
                    return Ok(new DtoVideoSesionActiva { Hay = false });

                var usuario = User.FindFirstValue("username") ?? User.FindFirstValue(ClaimTypes.Name) ?? "sistema";
                var codDane = User.FindFirstValue("cod_dane") ?? "";

                // Se re-firma el token con la vigencia que le queda a la sesión, para
                // que el despachador pueda rearmar el link sin haberlo guardado.
                var token = _sessionToken.CreateToken(
                    new VideoSessionTokenService.VideoSessionData(
                        activa.SesionId, pedidoId, pedido.SitioGraba, codDane, usuario),
                    activa.FechaExpira);

                var grabacion = await _videoService.GetGrabacionAsync(activa.SesionId, ct);

                return Ok(new DtoVideoSesionActiva
                {
                    Hay          = true,
                    SesionId     = activa.SesionId,
                    Estado       = activa.Estado,
                    SessionToken = token,
                    FechaExpira  = activa.FechaExpira,
                    Grabando     = grabacion?.Estado == "GRABANDO"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetActiva error pedidoId={Id}", pedidoId);
                return StatusCode(500, new { success = false, message = "Error consultando la videollamada en curso." });
            }
        }

        /// <summary>
        /// Trazabilidad de las videollamadas de un caso — quién la atendió, cuándo
        /// empezó, cuánto duró, si dejó grabación y cuál, y la transcripción del
        /// chat. La consume la revisión del incidente en el módulo de Pedido, donde
        /// el caso ya está cerrado y esto es todo lo que queda de la llamada.
        /// </summary>
        [HttpGet("pedido/{pedidoId:long}")]
        public async Task<ActionResult> GetPorPedido(long pedidoId, CancellationToken ct)
        {
            try
            {
                var pedido = await _pedidoService.GetByIdAsync(pedidoId, ct);
                if (pedido is null)
                    return NotFound(new { success = false, message = "Caso no encontrado." });

                if (!IsAdmin() && pedido.SitioGraba != GetIntClaim("sitio_graba"))
                    return Forbid();

                var sesiones = await _videoService.GetSesionesPorPedidoAsync(pedidoId, ct);
                // Siempre un array: la mayoría de casos no tuvo videollamada y el
                // frontend no debe tener que distinguir "vacío" de "otra forma".
                return Ok(sesiones);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetPorPedido error pedidoId={Id}", pedidoId);
                return StatusCode(500, new { success = false, message = "Error consultando la trazabilidad de videollamadas." });
            }
        }

        /// <summary>
        /// Único endpoint anónimo: la página pública del ciudadano lo llama para
        /// saber si su enlace todavía es válido antes de pedir cámara/micrófono.
        /// </summary>
        [HttpGet("publico/{token}")]
        [AllowAnonymous]
        public ActionResult ValidarPublico(string token)
        {
            var data = _sessionToken.ValidateToken(token);
            if (data is null)
                return Ok(new DtoVideoSesionPublica { Valido = false, Mensaje = "Este enlace ya no es válido o expiró." });

            return Ok(new DtoVideoSesionPublica { Valido = true, Estado = "PENDIENTE", SesionId = data.SesionId });
        }

        // ─── Helpers ──────────────────────────────────────────────────────────

        private int GetIntClaim(string claimType)
        {
            var val = User.FindFirst(claimType)?.Value;
            return int.TryParse(val, out var n) ? n : 0;
        }

        private bool IsAdmin() =>
            string.Equals(User.FindFirstValue("es_admin"), "true", StringComparison.OrdinalIgnoreCase);
    }
}
