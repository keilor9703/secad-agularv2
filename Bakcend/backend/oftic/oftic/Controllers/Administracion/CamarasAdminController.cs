using System.Security.Claims;
using Comun.Dtos.Camaras;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Negocio.Interfaz;

namespace Api.Controllers.Administracion
{
    /// <summary>
    /// Administración del catálogo de cámaras: sincronizar con el VMS y
    /// emparejar lo que reporta con el censo institucional.
    ///
    /// El emparejamiento no se automatiza del todo a propósito. El censo no
    /// trae el identificador del VMS, así que la única pista es el nombre, y un
    /// nombre parecido no basta para mostrarle a un despachador el video de una
    /// cámara que no es la que cree estar viendo.
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Policy = "Administrador")]
    public class CamarasAdminController : ControllerBase
    {
        private readonly IDbCamaraService _svc;
        private readonly ILogger<CamarasAdminController> _logger;

        public CamarasAdminController(IDbCamaraService svc, ILogger<CamarasAdminController> logger)
        {
            _svc = svc; _logger = logger;
        }

        private string Usuario => User.FindFirstValue(ClaimTypes.Name)
                               ?? User.FindFirstValue("unique_name") ?? "desconocido";

        /// <summary>Trae el catálogo del VMS y lo guarda.</summary>
        [HttpPost("sync/{integracionId}")]
        public async Task<IActionResult> Sincronizar(string integracionId, CancellationToken ct)
        {
            if (!long.TryParse(integracionId, out var id))
                return BadRequest(new { ok = false, mensaje = "ID inválido." });
            try
            {
                var r = await _svc.SincronizarAsync(id, Usuario, ct);
                return Ok(r);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Sincronizar cámaras error");
                return Ok(new DtoSyncResult { Ok = false, Mensaje = "Error interno al sincronizar: " + ex.Message });
            }
        }

        /// <summary>Emparejamientos propuestos, para que alguien los confirme.</summary>
        [HttpGet("emparejamientos/{integracionId}")]
        public async Task<IActionResult> Emparejamientos(string integracionId, CancellationToken ct)
        {
            if (!long.TryParse(integracionId, out var id))
                return BadRequest(new { success = false, message = "ID inválido." });
            var data = await _svc.ProponerEmparejamientosAsync(id, ct);
            return Ok(new { success = true, data });
        }

        [HttpPost("emparejar")]
        public async Task<IActionResult> Emparejar([FromBody] DtoEmparejarRequest req, CancellationToken ct)
        {
            if (req is null || req.CensoId <= 0 || req.VmsId <= 0)
                return BadRequest(new { success = false, message = "Faltan las dos cámaras a emparejar." });
            var (ok, mensaje) = await _svc.EmparejarAsync(req.CensoId, req.VmsId, Usuario, ct);
            return Ok(new { success = ok, message = mensaje });
        }

        [HttpPost("desemparejar/{censoId}")]
        public async Task<IActionResult> Desemparejar(string censoId, CancellationToken ct)
        {
            if (!long.TryParse(censoId, out var id))
                return BadRequest(new { success = false, message = "ID inválido." });
            var (ok, mensaje) = await _svc.DesemparejarAsync(id, ct);
            return Ok(new { success = ok, message = mensaje });
        }
    }
}
