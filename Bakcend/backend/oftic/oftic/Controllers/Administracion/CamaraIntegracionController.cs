using Comun.Dtos.Camaras;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Negocio.Interfaz;
using System.Security.Claims;

namespace Api.Controllers.Administracion
{
    /// <summary>
    /// Administración de integraciones VMS (cámaras) — tab "Cámaras" del Hub de
    /// Integraciones. Permite registrar/configurar la conexión a cualquier VMS
    /// soportado (driver) sin intervención en el código fuente.
    ///
    /// Todos los endpoints requieren rol Administrador.
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Policy = "Administrador")]
    public class CamaraIntegracionController : ControllerBase
    {
        private readonly IDbCamaraIntegracionService            _svc;
        private readonly ILogger<CamaraIntegracionController>   _logger;

        public CamaraIntegracionController(
            IDbCamaraIntegracionService svc,
            ILogger<CamaraIntegracionController> logger)
        {
            _svc    = svc;
            _logger = logger;
        }

        private string UsuarioClaim =>
            User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue("unique_name") ?? "";

        /// <summary>Drivers de VMS soportados, con su metadata para el formulario dinámico.</summary>
        [HttpGet("drivers")]
        public IActionResult GetDrivers() => Ok(_svc.GetDrivers());

        /// <summary>Lista de integraciones VMS configuradas (sin secretos).</summary>
        [HttpGet]
        public async Task<IActionResult> GetAll(CancellationToken ct)
        {
            try   { return Ok(await _svc.GetAllAsync(ct)); }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetAll CamaraIntegracion error");
                return StatusCode(500, new List<object>());
            }
        }

        /// <summary>Crea una integración VMS.</summary>
        [HttpPost]
        public async Task<IActionResult> Create(
            [FromBody] DtoCamaraIntegracionRequest req, CancellationToken ct)
        {
            if (req is null) return BadRequest(new { success = false, message = "Datos requeridos." });
            try
            {
                var (success, message, id) = await _svc.CreateAsync(req, UsuarioClaim, ct);
                if (!success) return BadRequest(new { success, message });
                _logger.LogInformation("[CamaraIntegracion] {User} creó '{Nombre}' ({Driver})",
                    UsuarioClaim, req.Nombre, req.Driver);
                return Ok(new { success, message, id });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Create CamaraIntegracion error");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        /// <summary>Actualiza una integración VMS.</summary>
        [HttpPut("{id}")]
        public async Task<IActionResult> Update(
            string id, [FromBody] DtoCamaraIntegracionRequest req, CancellationToken ct)
        {
            if (!long.TryParse(id, out var idLong))
                return BadRequest(new { success = false, message = "ID inválido." });
            if (req is null) return BadRequest(new { success = false, message = "Datos requeridos." });
            try
            {
                var (success, message) = await _svc.UpdateAsync(idLong, req, UsuarioClaim, ct);
                if (!success) return BadRequest(new { success, message });
                return Ok(new { success, message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Update CamaraIntegracion error");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        /// <summary>Activa o desactiva una integración.</summary>
        [HttpPatch("{id}/toggle")]
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
                _logger.LogError(ex, "Toggle CamaraIntegracion error");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        /// <summary>Elimina una integración (y su catálogo de cámaras en cascada).</summary>
        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(string id, CancellationToken ct)
        {
            if (!long.TryParse(id, out var idLong))
                return BadRequest(new { success = false, message = "ID inválido." });
            try
            {
                var (success, message) = await _svc.DeleteAsync(idLong, ct);
                if (!success) return NotFound(new { success, message });
                _logger.LogInformation("[CamaraIntegracion] {User} eliminó id={Id}", UsuarioClaim, id);
                return Ok(new { success, message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Delete CamaraIntegracion error");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        /// <summary>
        /// Valida que la configuración esté completa según el driver. La prueba
        /// real de conectividad al VMS se habilita con el runtime del driver.
        /// </summary>
        [HttpPost("validar")]
        public IActionResult Validar([FromBody] DtoCamaraIntegracionRequest req)
        {
            if (req is null) return BadRequest(new { ok = false, mensaje = "Datos requeridos." });
            return Ok(_svc.ValidarConfiguracion(req));
        }
    }
}
