using Datos.Interfaz;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Api.Controllers.Operacion
{
    /// <summary>
    /// Módulo GIS 2D — Mapa de Incidentes.
    /// Proporciona los datos necesarios para pintar marcadores en el mapa Leaflet del frontend.
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    [EnableCors("PublicCors")]
    [Authorize]
    public class MapaController : ControllerBase
    {
        private readonly IDbMapaRepository            _repo;
        private readonly ILogger<MapaController>      _logger;

        public MapaController(IDbMapaRepository repo, ILogger<MapaController> logger)
        {
            _repo   = repo;
            _logger = logger;
        }

        /// <summary>
        /// Retorna los incidentes activos con coordenadas válidas para el módulo GIS 2D.
        /// El filtro por sitioGraba proviene del JWT del operador.
        /// Los super-admin pueden pasar sitioGraba distinto de cero para ver otro CAD del
        /// tenant; un operador normal SIEMPRE consulta su propio sitioGraba, sin importar
        /// lo que envíe el cliente (evita IDOR entre CADs/sitios del mismo tenant).
        /// </summary>
        [HttpGet("incidentes")]
        public async Task<ActionResult> GetIncidentesActivos(
            [FromQuery] int? sitioGraba,
            [FromQuery] int? canalCodigo,
            [FromQuery] int? canalFuerzaId,
            CancellationToken ct)
        {
            var resolvedSitio = IsAdmin()
                ? (sitioGraba ?? GetIntClaim("sitio_graba"))
                : GetIntClaim("sitio_graba");
            var resolvedCanal = canalCodigo ?? 0;   // 0 = todos los canales

            var (items, truncated) = await _repo.GetIncidentesActivosAsync(
                resolvedSitio, resolvedCanal, canalFuerzaId ?? 0, ct);

            Response.Headers["X-Mapa-Truncated"] = truncated ? "true" : "false";
            return Ok(items);
        }

        // ── Helpers ───────────────────────────────────────────────────────────

        private int GetIntClaim(string claimType)
        {
            var val = User.FindFirst(claimType)?.Value;
            return int.TryParse(val, out var n) ? n : 0;
        }

        private bool IsAdmin() =>
            string.Equals(User.FindFirstValue("es_admin"), "true",
                StringComparison.OrdinalIgnoreCase);
    }
}
