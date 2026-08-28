using Comun.Dtos.Administracion;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Negocio.Interfaz;
using System.Security.Claims;

namespace Api.Controllers.Administracion
{
    /// <summary>
    /// Configuración del proveedor de SMS saliente (link de videollamada, etc.) —
    /// reemplaza el antiguo esquema de appsettings/variables de entorno estáticas
    /// por una fila editable en ctr_config_sms, sin necesidad de redeploy para
    /// cambiar de proveedor (Infobip ⇄ Inalambria Express).
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class ConfigSmsController : ControllerBase
    {
        private readonly IDbConfigSmsService _service;
        private readonly ILogger<ConfigSmsController> _logger;

        public ConfigSmsController(IDbConfigSmsService service, ILogger<ConfigSmsController> logger)
        {
            _service = service;
            _logger  = logger;
        }

        [HttpGet]
        public async Task<ActionResult> Get(CancellationToken ct)
        {
            try
            {
                var data = await _service.GetAsync(ct);
                return Ok(new { success = true, data });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al consultar configuración de SMS");
                return StatusCode(500, new { success = false, message = "Error al consultar la configuración de SMS." });
            }
        }

        [HttpPut]
        public async Task<ActionResult> Actualizar([FromBody] DtoConfigSmsRequest request, CancellationToken ct)
        {
            try
            {
                var usuario = User.FindFirstValue("username") ?? User.FindFirstValue(ClaimTypes.Name) ?? "sistema";
                var result = await _service.ActualizarAsync(request, usuario, ct);
                if (!result.Success) return BadRequest(result);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al actualizar configuración de SMS");
                return StatusCode(500, new DtoConfigSmsResult { Success = false, Message = "Error interno al guardar la configuración." });
            }
        }

        [HttpPost("probar")]
        public async Task<ActionResult> Probar([FromBody] DtoProbarSmsRequest request, CancellationToken ct)
        {
            try
            {
                var result = await _service.ProbarEnvioAsync(request.NumeroTelefono, ct);
                if (!result.Success) return BadRequest(result);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al enviar SMS de prueba");
                return StatusCode(500, new DtoConfigSmsResult { Success = false, Message = "Error interno al enviar el SMS de prueba." });
            }
        }
    }
}
