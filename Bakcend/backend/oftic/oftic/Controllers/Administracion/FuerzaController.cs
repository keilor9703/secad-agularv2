using Comun.Dtos.Entidades;
using Datos.Interfaz;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace ofic.Controllers.Administracion
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class FuerzaController : ControllerBase
    {
        private readonly IDbFuerzaRepository _repo;
        private readonly ILogger<FuerzaController> _logger;

        public FuerzaController(IDbFuerzaRepository repo, ILogger<FuerzaController> logger)
        {
            _repo   = repo;
            _logger = logger;
        }

        /// <summary>Sitio de grabación del admin autenticado (claim sitio_graba del JWT).</summary>
        private int SitioGraba =>
            int.TryParse(User.FindFirstValue("sitio_graba"), out var v) ? v : 0;

        // ── GET /api/Fuerza ───────────────────────────────────────────────────
        [HttpGet]
        public async Task<IActionResult> GetFuerzas(CancellationToken ct)
        {
            try
            {
                var fuerzas = await _repo.GetFuerzasAsync(SitioGraba, ct);
                return Ok(new { success = true, data = fuerzas });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error listando fuerzas sitioGraba={Sitio}", SitioGraba);
                return StatusCode(500, new { success = false, message = "Error al listar fuerzas." });
            }
        }

        // ── GET /api/Fuerza/{id} ──────────────────────────────────────────────
        [HttpGet("{id:int}")]
        public async Task<IActionResult> GetFuerza(int id, CancellationToken ct)
        {
            var fuerza = await _repo.GetFuerzaAsync(id, ct);
            if (fuerza is null) return NotFound(new { success = false, message = "Fuerza no encontrada." });
            return Ok(new { success = true, data = fuerza });
        }

        // ── POST /api/Fuerza ──────────────────────────────────────────────────
        [HttpPost]
        public async Task<IActionResult> CreateFuerza([FromBody] DtoFuerzaRequest request, CancellationToken ct)
        {
            if (request.id <= 0)
                return BadRequest(new { success = false, message = "El código (id) de la fuerza es requerido y debe ser mayor que 0." });
            if (string.IsNullOrWhiteSpace(request.descripcion))
                return BadRequest(new { success = false, message = "La descripción es requerida." });

            var result = await _repo.SaveFuerzaAsync(null, request, SitioGraba, ct);
            return result.success ? Ok(result) : BadRequest(result);
        }

        // ── PUT /api/Fuerza/{id} ──────────────────────────────────────────────
        [HttpPut("{id:int}")]
        public async Task<IActionResult> UpdateFuerza(int id, [FromBody] DtoFuerzaRequest request, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(request.descripcion))
                return BadRequest(new { success = false, message = "La descripción es requerida." });

            var result = await _repo.SaveFuerzaAsync(id, request, SitioGraba, ct);
            return result.success ? Ok(result) : BadRequest(result);
        }

        // ── PUT /api/Fuerza/{id}/estado ───────────────────────────────────────
        [HttpPut("{id:int}/estado")]
        public async Task<IActionResult> ToggleFuerza(int id, CancellationToken ct)
        {
            var result = await _repo.ToggleFuerzaAsync(id, ct);
            return result.success ? Ok(result) : BadRequest(result);
        }

        // ── GET /api/Fuerza/{id}/canales ──────────────────────────────────────
        [HttpGet("{id:int}/canales")]
        public async Task<IActionResult> GetCanales(int id, CancellationToken ct)
        {
            var canales = await _repo.GetCanalesAsync(id, ct);
            return Ok(new { success = true, data = canales });
        }

        // ── POST /api/Fuerza/{id}/canales ─────────────────────────────────────
        [HttpPost("{id:int}/canales")]
        public async Task<IActionResult> CreateCanal(int id, [FromBody] DtoCanalRequest request, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(request.descripcion))
                return BadRequest(new { success = false, message = "La descripción del canal es requerida." });

            var result = await _repo.SaveCanalAsync(id, null, request, ct);
            return result.success ? Ok(result) : BadRequest(result);
        }

        // ── PUT /api/Fuerza/{id}/canales/{codigo} ─────────────────────────────
        [HttpPut("{id:int}/canales/{codigo:int}")]
        public async Task<IActionResult> UpdateCanal(int id, int codigo, [FromBody] DtoCanalRequest request, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(request.descripcion))
                return BadRequest(new { success = false, message = "La descripción del canal es requerida." });

            var result = await _repo.SaveCanalAsync(id, codigo, request, ct);
            return result.success ? Ok(result) : BadRequest(result);
        }

        // ── PUT /api/Fuerza/{id}/canales/{codigo}/estado ──────────────────────
        [HttpPut("{id:int}/canales/{codigo:int}/estado")]
        public async Task<IActionResult> ToggleCanal(int id, int codigo, CancellationToken ct)
        {
            var result = await _repo.ToggleCanalAsync(id, codigo, ct);
            return result.success ? Ok(result) : BadRequest(result);
        }

        // ── GET /api/Fuerza/{id}/usuarios ─────────────────────────────────────
        [HttpGet("{id:int}/usuarios")]
        public async Task<IActionResult> GetUsuarios(int id, CancellationToken ct)
        {
            var usuarios = await _repo.GetUsuariosByFuerzaAsync(id, ct);
            return Ok(new { success = true, data = usuarios });
        }

        // ── GET /api/Fuerza/usuario/{idUsuario}/operacion ─────────────────────
        [HttpGet("usuario/{idUsuario:long}/operacion")]
        public async Task<IActionResult> GetUsuarioOperacion(long idUsuario, CancellationToken ct)
        {
            try
            {
                var op = await _repo.GetUsuarioOperacionAsync(idUsuario, ct);
                return Ok(new { success = true, data = op ?? new DtoUsuarioOperacion() });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error leyendo operación de usuario id={Id}", idUsuario);
                return StatusCode(500, new { success = false, message = "Error al leer datos operacionales." });
            }
        }

        // ── PUT /api/Fuerza/usuario/{idUsuario}/operacion ─────────────────────
        [HttpPut("usuario/{idUsuario:long}/operacion")]
        public async Task<IActionResult> SaveUsuarioOperacion(long idUsuario, [FromBody] DtoUsuarioOperacionRequest request, CancellationToken ct)
        {
            try
            {
                var result = await _repo.SaveUsuarioOperacionAsync(idUsuario, request, ct);
                return result.success ? Ok(result) : BadRequest(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error guardando operación de usuario id={Id}", idUsuario);
                return StatusCode(500, new { success = false, message = "Error al guardar datos operacionales." });
            }
        }
    }
}
