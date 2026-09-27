using System.Security.Claims;
using Api.Services;
using Comun.Dtos.Camaras;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Negocio.Interfaz;

namespace Api.Controllers.Operacion
{
    /// <summary>
    /// Cámaras CCTV para la operación: buscar las cercanas a un punto y pedir
    /// el video de una.
    ///
    /// Todo pasa por el sitio de grabación del JWT. No es un adorno: es lo que
    /// impide que un operador vea cámaras de otra unidad del país aunque
    /// conozca el código.
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class CamarasController : ControllerBase
    {
        private readonly IDbCamaraService _svc;
        private readonly GatewayVideoTokenService _tokenGateway;
        private readonly ResolutorTenant _tenant;
        private readonly ILogger<CamarasController> _logger;

        public CamarasController(
            IDbCamaraService svc,
            GatewayVideoTokenService tokenGateway,
            ResolutorTenant tenant,
            ILogger<CamarasController> logger)
        {
            _svc = svc; _tokenGateway = tokenGateway; _tenant = tenant; _logger = logger;
        }

        private int SitioGraba => int.TryParse(User.FindFirstValue("sitio_graba"), out var v) ? v : 0;
        private string CodDane => User.FindFirstValue("cod_dane") ?? "";
        private string Usuario => User.FindFirstValue(ClaimTypes.Name)
                               ?? User.FindFirstValue("unique_name") ?? "desconocido";
        private string? Ip     => HttpContext.Connection.RemoteIpAddress?.ToString();

        /// <summary>Cámaras cercanas a un punto cualquiera del mapa.</summary>
        [HttpGet("cercanas")]
        public async Task<IActionResult> Cercanas(
            [FromQuery] double lat, [FromQuery] double lng,
            [FromQuery] int radioMetros = 1000, [FromQuery] int limite = 10,
            CancellationToken ct = default)
        {
            if (lat is 0 && lng is 0)
                return BadRequest(new { success = false, message = "Faltan las coordenadas." });

            var data = await _svc.CercanasAsync(SitioGraba, lat, lng, radioMetros, limite, ct);
            return Ok(new { success = true, data });
        }

        /// <summary>
        /// URL para reproducir una cámara en vivo.
        ///
        /// Ojo con la caducidad: el manual la describe como «permanently valid»,
        /// así que NO caduca sola. No se guarda en ninguna parte, se pide de
        /// nuevo en cada apertura y cada consulta queda auditada.
        /// </summary>
        [HttpGet("{codigo}/stream")]
        public async Task<IActionResult> Stream(
            string codigo,
            [FromQuery] long? pedidoId, [FromQuery] long? eventoId,
            CancellationToken ct = default)
        {
            var (ok, mensaje, datos) = await _svc.ObtenerStreamAsync(
                codigo, SitioGraba, pedidoId, eventoId, Usuario, Ip, ct);

            // Si el video lo sirve el gateway del nodo edge, el navegador
            // necesita un token: el gateway se lo va a preguntar a SECAD antes
            // de dejarle ver. Lo emite el controlador y no el driver porque es
            // aquí donde se sabe QUIÉN está pidiendo la cámara.
            if (ok && datos is not null
                   && datos.Reproductor == VmsProtocolos.ReproductorWebrtc
                   && !string.IsNullOrWhiteSpace(datos.RutaGateway))
            {
                datos.Autenticacion = _tokenGateway.Crear(new GatewayVideoTokenService.Datos(
                    datos.RutaGateway!, codigo, Usuario, SitioGraba, CodDane));
                // La ruta no le sirve de nada al navegador y solo diría dónde
                // vive la cámara dentro del gateway: no se manda.
                datos.RutaGateway = null;
            }

            // 422 y no 500: la petición era válida, lo que falla es que esa
            // cámara no se puede ver ahora. El operador necesita el motivo.
            return ok
                ? Ok(new { success = true, message = mensaje, data = datos })
                : UnprocessableEntity(new { success = false, message = mensaje });
        }

        /// <summary>
        /// Lo que pregunta el gateway de medios del nodo edge antes de servir
        /// video: ¿este token autoriza a leer esta ruta?
        ///
        /// Es [AllowAnonymous] porque quien llama es el gateway, no un
        /// navegador con sesión de SECAD; la autorización la da el token
        /// firmado que va en el cuerpo. MediaMTX espera 20x para permitir y
        /// cualquier otra cosa para denegar.
        ///
        /// El contrato del cuerpo está observado contra MediaMTX v1.21.1, no
        /// supuesto: {ip, user, password, token, action, path, protocol, id,
        /// query, userAgent}.
        /// </summary>
        [HttpPost("gateway/autorizar")]
        [AllowAnonymous]
        public async Task<IActionResult> AutorizarGateway(
            [FromBody] DtoGatewayAutorizacion peticion, CancellationToken ct = default)
        {
            if (peticion is null || string.IsNullOrWhiteSpace(peticion.Path))
                return Unauthorized();

            // Solo lectura. Publicar, o usar la API del gateway, no se autoriza
            // por aquí en ningún caso.
            if (!string.Equals(peticion.Action, "read", StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogWarning(
                    "El gateway pidió autorización para la acción «{Accion}» sobre {Ruta}; solo se permite «read».",
                    peticion.Action, peticion.Path);
                return Unauthorized();
            }

            // El token puede llegar en «token» (cabecera Authorization del
            // navegador), en «password» o en la query. Se prueban los tres
            // porque depende de por dónde lo mande el reproductor.
            var datos = _tokenGateway.Validar(peticion.Token)
                     ?? _tokenGateway.Validar(peticion.Password)
                     ?? _tokenGateway.Validar(TokenDeQuery(peticion.Query));
            if (datos is null) return Unauthorized();

            // El token vale para UNA ruta. Sin esto, un token de cualquier
            // cámara serviría para ver todas las del gateway.
            if (!string.Equals(datos.Ruta, peticion.Path, StringComparison.Ordinal))
            {
                _logger.LogWarning(
                    "Token del gateway emitido para «{Suya}» presentado sobre «{Pedida}».",
                    datos.Ruta, peticion.Path);
                return Unauthorized();
            }

            // El tenant hay que resolverlo A MANO: esta petición no trae JWT
            // —la hace el gateway— así que TenantMiddleware no lo pudo hacer, y
            // sin él la consulta a la base del CAD revienta. El CAD sale del
            // token firmado, no de una cabecera.
            if (!await _tenant.EstablecerAsync(datos.CodDane, ct))
            {
                _logger.LogWarning(
                    "Token del gateway con un CAD que no se pudo resolver: «{Dane}».", datos.CodDane);
                return Unauthorized();
            }

            var ok = await _svc.AutorizarLecturaGatewayAsync(
                datos.CamaraCodigo, datos.SitioGraba, datos.Usuario, peticion.Ip, ct);

            return ok ? Ok() : Unauthorized();
        }

        /// <summary>Saca el token de una query tipo «token=...» o «jwt=...».</summary>
        private static string? TokenDeQuery(string? query)
        {
            if (string.IsNullOrWhiteSpace(query)) return null;
            foreach (var par in query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
            {
                var i = par.IndexOf('=');
                if (i <= 0) continue;
                var clave = par[..i];
                if (clave is "token" or "jwt" or "secad")
                    return Uri.UnescapeDataString(par[(i + 1)..]);
            }
            return null;
        }

        /// <summary>
        /// Mueve una cámara PTZ un paso acotado: el backend arranca el
        /// movimiento y lo para él mismo antes de responder. No hay endpoint de
        /// «parar» a propósito —si el navegador se cerrara entre el arranque y
        /// la parada, la cámara se quedaría girando—, así que la petición
        /// tarda lo que dura el movimiento.
        /// </summary>
        [HttpPost("{codigo}/ptz")]
        public async Task<IActionResult> Ptz(
            string codigo, [FromBody] DtoPtzPeticion peticion, CancellationToken ct = default)
        {
            if (peticion is null)
                return BadRequest(new { success = false, message = "Falta el comando PTZ." });

            var (ok, mensaje, datos) = await _svc.ControlarPtzAsync(
                codigo, SitioGraba, peticion, Usuario, Ip, ct);

            // Mismo criterio que el stream: la petición era válida, lo que no se
            // puede es mover esa cámara ahora. El operador necesita el motivo.
            return ok
                ? Ok(new { success = true, message = mensaje, data = datos })
                : UnprocessableEntity(new { success = false, message = mensaje });
        }
    }
}
