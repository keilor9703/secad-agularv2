using Comun.Dtos.Operacion;
using Datos.Interfaz;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Api.Controllers.Operacion
{
    /// <summary>
    /// Asistente Inteligente — §6.17.
    /// Catálogo de preguntas orientadoras por tipo de incidente,
    /// mostradas al despachador al tipificar. Sin IA — solo catálogo
    /// configurable por el administrador.
    ///
    /// Endpoints públicos (solo requieren JWT válido):
    ///   GET /api/Asistente/categorias
    ///   GET /api/Asistente/preguntas?categoriaId=&lt;id&gt;
    ///
    /// Endpoints de administración (misma ruta — la autorización por rol
    /// se delega al guard del frontend; el backend acepta cualquier JWT válido):
    ///   POST   /api/Asistente/categorias
    ///   PUT    /api/Asistente/categorias/{id}
    ///   DELETE /api/Asistente/categorias/{id}
    ///   POST   /api/Asistente/preguntas
    ///   PUT    /api/Asistente/preguntas/{id}
    ///   DELETE /api/Asistente/preguntas/{id}
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    [EnableCors("PublicCors")]
    [Authorize]
    public class AsistenteController : ControllerBase
    {
        private readonly IDbAsistenteRepository        _repo;
        private readonly ILogger<AsistenteController>  _logger;

        public AsistenteController(
            IDbAsistenteRepository repo,
            ILogger<AsistenteController> logger)
        {
            _repo   = repo;
            _logger = logger;
        }

        // ════════════════════════════════════════════════════════════════════
        //  CATEGORÍAS
        // ════════════════════════════════════════════════════════════════════

        // GET /api/Asistente/categorias?soloActivas=true
        [HttpGet("categorias")]
        public async Task<IActionResult> GetCategorias(
            [FromQuery] bool soloActivas = true,
            CancellationToken ct = default)
        {
            var data = await _repo.GetCategoriasAsync(soloActivas, ct);
            return Ok(new { success = true, data });
        }

        // GET /api/Asistente/categorias/{id}
        [HttpGet("categorias/{id:long}")]
        public async Task<IActionResult> GetCategoriaById(long id, CancellationToken ct)
        {
            var item = await _repo.GetCategoriaByIdAsync(id, ct);
            if (item is null)
                return NotFound(new { success = false, message = "Categoría no encontrada." });
            return Ok(new { success = true, data = item });
        }

        // POST /api/Asistente/categorias
        [HttpPost("categorias")]
        public async Task<IActionResult> CreateCategoria(
            [FromBody] DtoAsistenteCategoriaRequest req,
            CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(req.Codigo))
                return BadRequest(new { success = false, message = "El código es requerido." });
            if (string.IsNullOrWhiteSpace(req.Descripcion))
                return BadRequest(new { success = false, message = "La descripción es requerida." });

            var username = GetUsername();
            var created  = await _repo.CreateCategoriaAsync(req, username, ct);
            return Ok(new { success = true, data = created, message = "Categoría creada correctamente." });
        }

        // PUT /api/Asistente/categorias/{id}
        [HttpPut("categorias/{id:long}")]
        public async Task<IActionResult> UpdateCategoria(
            long id,
            [FromBody] DtoAsistenteCategoriaRequest req,
            CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(req.Descripcion))
                return BadRequest(new { success = false, message = "La descripción es requerida." });

            var ok = await _repo.UpdateCategoriaAsync(id, req, ct);
            return ok
                ? Ok(new { success = true, message = "Categoría actualizada." })
                : NotFound(new { success = false, message = "Categoría no encontrada." });
        }

        // DELETE /api/Asistente/categorias/{id}
        [HttpDelete("categorias/{id:long}")]
        public async Task<IActionResult> DeleteCategoria(long id, CancellationToken ct)
        {
            var ok = await _repo.DeleteCategoriaAsync(id, ct);
            return ok
                ? Ok(new { success = true, message = "Categoría eliminada." })
                : NotFound(new { success = false, message = "Categoría no encontrada." });
        }

        // ════════════════════════════════════════════════════════════════════
        //  PREGUNTAS
        // ════════════════════════════════════════════════════════════════════

        // GET /api/Asistente/preguntas?categoriaId=<id>&soloActivas=true
        [HttpGet("preguntas")]
        public async Task<IActionResult> GetPreguntas(
            [FromQuery] long? categoriaId  = null,
            [FromQuery] bool  soloActivas  = true,
            CancellationToken ct = default)
        {
            var data = await _repo.GetPreguntasAsync(categoriaId, soloActivas, ct);
            return Ok(new { success = true, data });
        }

        // GET /api/Asistente/preguntas/{id}
        [HttpGet("preguntas/{id:long}")]
        public async Task<IActionResult> GetPreguntaById(long id, CancellationToken ct)
        {
            var item = await _repo.GetPreguntaByIdAsync(id, ct);
            if (item is null)
                return NotFound(new { success = false, message = "Pregunta no encontrada." });
            return Ok(new { success = true, data = item });
        }

        // POST /api/Asistente/preguntas
        [HttpPost("preguntas")]
        public async Task<IActionResult> CreatePregunta(
            [FromBody] DtoAsistentePreguntaRequest req,
            CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(req.Pregunta))
                return BadRequest(new { success = false, message = "El texto de la pregunta es requerido." });

            var username = GetUsername();
            var created  = await _repo.CreatePreguntaAsync(req, username, ct);
            return Ok(new { success = true, data = created, message = "Pregunta creada correctamente." });
        }

        // PUT /api/Asistente/preguntas/{id}
        [HttpPut("preguntas/{id:long}")]
        public async Task<IActionResult> UpdatePregunta(
            long id,
            [FromBody] DtoAsistentePreguntaRequest req,
            CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(req.Pregunta))
                return BadRequest(new { success = false, message = "El texto de la pregunta es requerido." });

            var username = GetUsername();
            var ok = await _repo.UpdatePreguntaAsync(id, req, username, ct);
            return ok
                ? Ok(new { success = true, message = "Pregunta actualizada." })
                : NotFound(new { success = false, message = "Pregunta no encontrada." });
        }

        // DELETE /api/Asistente/preguntas/{id}
        [HttpDelete("preguntas/{id:long}")]
        public async Task<IActionResult> DeletePregunta(long id, CancellationToken ct)
        {
            var ok = await _repo.DeletePreguntaAsync(id, ct);
            return ok
                ? Ok(new { success = true, message = "Pregunta eliminada." })
                : NotFound(new { success = false, message = "Pregunta no encontrada." });
        }

        // ─── Helper ──────────────────────────────────────────────────────────

        private string GetUsername() =>
            User.Claims.FirstOrDefault(c =>
                c.Type == ClaimTypes.Name || c.Type == "unique_name")?.Value
            ?? "sistema";
    }
}
