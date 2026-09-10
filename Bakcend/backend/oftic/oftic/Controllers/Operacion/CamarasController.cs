using System.Security.Claims;
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
        private readonly ILogger<CamarasController> _logger;

        public CamarasController(IDbCamaraService svc, ILogger<CamarasController> logger)
        {
            _svc = svc; _logger = logger;
        }

        private int SitioGraba => int.TryParse(User.FindFirstValue("sitio_graba"), out var v) ? v : 0;
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
        /// URL para reproducir una cámara en vivo. La URL es de corta vida y no
        /// se guarda; cada consulta queda auditada.
        /// </summary>
        [HttpGet("{codigo}/stream")]
        public async Task<IActionResult> Stream(
            string codigo,
            [FromQuery] long? pedidoId, [FromQuery] long? eventoId,
            CancellationToken ct = default)
        {
            var (ok, mensaje, datos) = await _svc.ObtenerStreamAsync(
                codigo, SitioGraba, pedidoId, eventoId, Usuario, Ip, ct);

            // 422 y no 500: la petición era válida, lo que falla es que esa
            // cámara no se puede ver ahora. El operador necesita el motivo.
            return ok
                ? Ok(new { success = true, message = mensaje, data = datos })
                : UnprocessableEntity(new { success = false, message = mensaje });
        }
    }
}
