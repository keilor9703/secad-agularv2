using Comun.Dtos.Agencias;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Negocio.Interfaz;
using System.Security.Claims;

namespace Api.Controllers.Administracion
{
    /// <summary>
    /// CRUD de agencias externas (§6.1) y despacho interagencial.
    ///
    /// Endpoints públicos (operadores y admins):
    ///   GET  /api/AgenciaExterna            — lista activas para selector
    ///   POST /api/AgenciaExterna/despachar  — envía un caso a una agencia
    ///
    /// Endpoints de administración (requieren política "Administrador"):
    ///   GET    /api/AgenciaExterna/admin
    ///   POST   /api/AgenciaExterna/admin
    ///   PUT    /api/AgenciaExterna/admin/{id}
    ///   PATCH  /api/AgenciaExterna/admin/{id}/toggle
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class AgenciaExternaController : ControllerBase
    {
        private readonly IDbAgenciaExternaService            _svc;
        private readonly ILogger<AgenciaExternaController>   _logger;

        public AgenciaExternaController(
            IDbAgenciaExternaService svc,
            ILogger<AgenciaExternaController> logger)
        {
            _svc    = svc;
            _logger = logger;
        }

        private string UsuarioClaim =>
            User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue("unique_name") ?? "";

        // ── Endpoints operacionales (todos los roles autenticados) ────────────────

        /// <summary>Retorna las agencias externas activas para el selector del operador.</summary>
        [HttpGet]
        public async Task<IActionResult> GetActivas(CancellationToken ct)
        {
            try
            {
                var all    = await _svc.GetAllAsync(ct);
                var activas = all.Where(a => a.Activa).ToList();
                return Ok(activas);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetActivas error");
                return StatusCode(500, new List<object>());
            }
        }

        /// <summary>
        /// Despacha un caso a una agencia externa mediante su API REST.
        /// Registra el resultado en cad_despachos_externos (trazabilidad §6.18).
        /// </summary>
        [HttpPost("despachar")]
        public async Task<IActionResult> Despachar(
            [FromBody] DtoDespachoExternoRequest req, CancellationToken ct)
        {
            if (req is null)
                return BadRequest(new { success = false, message = "Datos requeridos." });

            try
            {
                var result = await _svc.DespacharAsync(req, UsuarioClaim, ct);
                return result.Success
                    ? Ok(result)
                    : UnprocessableEntity(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Despachar error");
                return StatusCode(500, new DtoDespachoExternoResult
                {
                    Success = false,
                    Message = $"Error interno: {ex.Message}"
                });
            }
        }

        // ── Endpoints de administración ───────────────────────────────────────────

        /// <summary>Lista completa de agencias (activas e inactivas) para el admin.</summary>
        [HttpGet("admin")]
        [Authorize(Policy = "Administrador")]
        public async Task<IActionResult> GetAll(CancellationToken ct)
        {
            try   { return Ok(await _svc.GetAllAsync(ct)); }
            catch { return StatusCode(500, new List<object>()); }
        }

        /// <summary>Crea una nueva agencia externa.</summary>
        [HttpPost("admin")]
        [Authorize(Policy = "Administrador")]
        public async Task<IActionResult> Create(
            [FromBody] DtoAgenciaExternaRequest req, CancellationToken ct)
        {
            if (req is null || string.IsNullOrWhiteSpace(req.Nombre))
                return BadRequest(new { success = false, message = "El nombre es obligatorio." });

            try
            {
                var (success, message, id) = await _svc.CreateAsync(req, ct);
                if (!success) return Conflict(new { success, message });
                _logger.LogInformation("[AgenciaExterna] {User} creó agencia '{Nombre}'",
                    UsuarioClaim, req.Nombre);
                return Ok(new { success, message, id });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Create AgenciaExterna error");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        /// <summary>Actualiza una agencia existente.</summary>
        [HttpPut("admin/{id}")]
        [Authorize(Policy = "Administrador")]
        public async Task<IActionResult> Update(
            string id, [FromBody] DtoAgenciaExternaRequest req, CancellationToken ct)
        {
            if (!long.TryParse(id, out var idLong))
                return BadRequest(new { success = false, message = "ID inválido." });

            try
            {
                var (success, message) = await _svc.UpdateAsync(idLong, req, ct);
                if (!success) return NotFound(new { success, message });
                _logger.LogInformation("[AgenciaExterna] {User} actualizó agencia id={Id}",
                    UsuarioClaim, id);
                return Ok(new { success, message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Update AgenciaExterna error");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        /// <summary>Activa o desactiva una agencia.</summary>
        [HttpPatch("admin/{id}/toggle")]
        [Authorize(Policy = "Administrador")]
        public async Task<IActionResult> Toggle(string id, CancellationToken ct)
        {
            if (!long.TryParse(id, out var idLong))
                return BadRequest(new { success = false, message = "ID inválido." });

            try
            {
                var (success, message) = await _svc.ToggleAsync(idLong, ct);
                if (!success) return NotFound(new { success, message });
                return Ok(new { success, message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Toggle AgenciaExterna error");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }
}
