using Datos.Interfaz;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ofic.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class HomeController : ControllerBase
    {
        private readonly IDbHomeRepository _dbHomeRepository;
        private readonly ILogger<HomeController> _logger;

        public HomeController(IDbHomeRepository dbHomeRepository, ILogger<HomeController> logger)
        {
            _dbHomeRepository = dbHomeRepository;
            _logger = logger;
        }

        [HttpGet("stats")]
        public async Task<IActionResult> GetStats()
        {
            try
            {
                var stats = await _dbHomeRepository.GetStatsAsync(HttpContext.RequestAborted);
                return Ok(stats);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error consultando métricas del Home");
                return StatusCode(500, new { message = "Error consultando métricas del Home" });
            }
        }
    }
}
