using Comun.Dtos.Entidades;
using Datos.Interfaz;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ofic.Controllers.Administracion
{
    /// <summary>
    /// Sitios de grabación del CAD: las unidades policiales que operan en él.
    ///
    /// Leer el catálogo lo puede cualquier usuario autenticado —las pantallas
    /// de operación necesitan saber a qué unidad pertenece cada registro—,
    /// pero darlos de alta, editarlos o retirarlos es del administrador.
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class SitioGrabacionController : ControllerBase
    {
        private readonly IDbSitioGrabacionRepository _repo;
        private readonly ILogger<SitioGrabacionController> _logger;

        public SitioGrabacionController(IDbSitioGrabacionRepository repo, ILogger<SitioGrabacionController> logger)
        {
            _repo   = repo;
            _logger = logger;
        }

        // ── GET /api/SitioGrabacion ──────────────────────────────────────────
        /// <param name="soloVigentes">true = solo los que operan hoy (para los selectores).</param>
        [HttpGet]
        public async Task<IActionResult> GetSitios([FromQuery] bool soloVigentes = false, CancellationToken ct = default)
        {
            try
            {
                var sitios = await _repo.GetSitiosAsync(soloVigentes, ct);
                return Ok(new { success = true, data = sitios });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error listando sitios de grabación");
                return StatusCode(500, new { success = false, message = "Error al listar los sitios de grabación." });
            }
        }

        // ── GET /api/SitioGrabacion/{consecutivo} ────────────────────────────
        [HttpGet("{consecutivo:int}")]
        public async Task<IActionResult> GetSitio(int consecutivo, CancellationToken ct)
        {
            var sitio = await _repo.GetSitioAsync(consecutivo, ct);
            if (sitio is null) return NotFound(new { success = false, message = "Sitio de grabación no encontrado." });
            return Ok(new { success = true, data = sitio });
        }

        // ── POST /api/SitioGrabacion ─────────────────────────────────────────
        [HttpPost]
        [Authorize(Policy = "Administrador")]
        public async Task<IActionResult> CreateSitio([FromBody] DtoSitioGrabacionRequest request, CancellationToken ct)
        {
            var result = await _repo.SaveSitioAsync(null, request, ct);
            return result.success ? Ok(result) : BadRequest(result);
        }

        // ── PUT /api/SitioGrabacion/{consecutivo} ────────────────────────────
        [HttpPut("{consecutivo:int}")]
        [Authorize(Policy = "Administrador")]
        public async Task<IActionResult> UpdateSitio(int consecutivo, [FromBody] DtoSitioGrabacionRequest request, CancellationToken ct)
        {
            var result = await _repo.SaveSitioAsync(consecutivo, request, ct);
            return result.success ? Ok(result) : BadRequest(result);
        }

        // ── PUT /api/SitioGrabacion/{consecutivo}/estado ─────────────────────
        [HttpPut("{consecutivo:int}/estado")]
        [Authorize(Policy = "Administrador")]
        public async Task<IActionResult> ToggleSitio(int consecutivo, CancellationToken ct)
        {
            var result = await _repo.ToggleSitioAsync(consecutivo, ct);
            return result.success ? Ok(result) : BadRequest(result);
        }

        // ── DELETE /api/SitioGrabacion/{consecutivo} ─────────────────────────
        [HttpDelete("{consecutivo:int}")]
        [Authorize(Policy = "Administrador")]
        public async Task<IActionResult> DeleteSitio(int consecutivo, CancellationToken ct)
        {
            var result = await _repo.DeleteSitioAsync(consecutivo, ct);
            return result.success ? Ok(result) : BadRequest(result);
        }
    }
}
