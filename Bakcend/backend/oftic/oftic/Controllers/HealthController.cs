using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
                        
namespace Api.Controllers
{
    [ApiController]
    [Route("api/health")]
    [AllowAnonymous]
    public class HealthController : ControllerBase
    {
        private readonly ILogger<HealthController> _logger;

        public HealthController(ILogger<HealthController> logger)
        {
            _logger = logger;
        }

        /// <summary>
        /// Verifica el estado de salud de la API
        /// </summary>
        [HttpGet]
        public IActionResult Get()
        {
            _logger.LogInformation("Health check ejecutado");

            return Ok(new
            {
                Status = "Healthy",
                Timestamp = DateTime.UtcNow,
                Service = "OFTIC API"
            });
        }
    }
}
