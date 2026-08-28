using Comun.Dtos.Integraciones;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Negocio.Interfaz;
using System.Security.Claims;

namespace Api.Controllers.Administracion
{
    /// <summary>
    /// Hub de Integraciones — gestión unificada de integraciones entrantes y auditoría completa.
    /// Las integraciones salientes (agencias externas) se gestionan en AgenciaExternaController.
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class IntegracionesController : ControllerBase
    {
        private readonly IDbIntegracionService          _svc;
        private readonly ILogger<IntegracionesController> _logger;

        private string UsuarioClaim => User.FindFirstValue(ClaimTypes.Name)
                                    ?? User.FindFirstValue("unique_name") ?? "sistema";

        public IntegracionesController(
            IDbIntegracionService svc,
            ILogger<IntegracionesController> logger)
        {
            _svc    = svc;
            _logger = logger;
        }

        // ════════════════════════════════════════════════════════════════════════
        // INTEGRACIONES ENTRANTES — CRUD
        // GET    api/Integraciones/entrantes
        // POST   api/Integraciones/entrantes
        // PUT    api/Integraciones/entrantes/{id}
        // PATCH  api/Integraciones/entrantes/{id}/toggle
        // ════════════════════════════════════════════════════════════════════════

        [HttpGet("entrantes")]
        public async Task<IActionResult> GetEntrantes(CancellationToken ct)
        {
            try
            {
                var data = await _svc.GetEntrantesAsync(ct);
                return Ok(new { success = true, data });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetEntrantes error");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPost("entrantes")]
        [Authorize(Policy = "Administrador")]
        public async Task<IActionResult> CreateEntrante(
            [FromBody] DtoIntegracionEntranteRequest req, CancellationToken ct)
        {
            if (req is null) return BadRequest(new { success = false, message = "Datos requeridos." });
            try
            {
                var (ok, msg, id) = await _svc.CreateEntranteAsync(req, UsuarioClaim, ct);
                if (!ok) return BadRequest(new { success = false, message = msg });
                return Ok(new { success = true, message = msg, id = id.ToString() });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "CreateEntrante error");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPut("entrantes/{id:long}")]
        [Authorize(Policy = "Administrador")]
        public async Task<IActionResult> UpdateEntrante(
            long id, [FromBody] DtoIntegracionEntranteRequest req, CancellationToken ct)
        {
            if (req is null) return BadRequest(new { success = false, message = "Datos requeridos." });
            try
            {
                var (ok, msg) = await _svc.UpdateEntranteAsync(id, req, UsuarioClaim, ct);
                if (!ok) return NotFound(new { success = false, message = msg });
                return Ok(new { success = true, message = msg });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "UpdateEntrante error id={Id}", id);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPatch("entrantes/{id:long}/toggle")]
        [Authorize(Policy = "Administrador")]
        public async Task<IActionResult> ToggleEntrante(long id, CancellationToken ct)
        {
            try
            {
                var (ok, msg) = await _svc.ToggleEntranteAsync(id, ct);
                if (!ok) return NotFound(new { success = false, message = msg });
                return Ok(new { success = true, message = msg });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ToggleEntrante error id={Id}", id);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // AUDITORÍA SALIENTES — cad_despachos_externos
        // GET api/Integraciones/auditoria/salientes?limit=100&agenciaId=xxx
        // ════════════════════════════════════════════════════════════════════════

        [HttpGet("auditoria/salientes")]
        public async Task<IActionResult> GetAuditoriaSalientes(
            [FromQuery] int     limit     = 100,
            [FromQuery] string? agenciaId = null,
            CancellationToken ct          = default)
        {
            try
            {
                var data = await _svc.GetDespachoAuditoriaAsync(limit, agenciaId, ct);
                return Ok(new { success = true, data });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetAuditoriaSalientes error");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // AUDITORÍA ENTRANTES — cad_recepciones_externas
        // GET api/Integraciones/auditoria/entrantes?limit=100&canal=CHAT
        // ════════════════════════════════════════════════════════════════════════

        [HttpGet("auditoria/entrantes")]
        public async Task<IActionResult> GetAuditoriaEntrantes(
            [FromQuery] int     limit  = 100,
            [FromQuery] string? canal  = null,
            CancellationToken ct       = default)
        {
            try
            {
                var data = await _svc.GetRecepcionAuditoriaAsync(limit, canal, ct);
                return Ok(new { success = true, data });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetAuditoriaEntrantes error");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }
}
