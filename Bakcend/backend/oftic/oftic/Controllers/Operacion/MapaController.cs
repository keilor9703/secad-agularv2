using Comun.Dtos.Entidades;
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
        private readonly IDbSitioGrabacionRepository  _sitios;
        private readonly IDbMasterRepository          _master;
        private readonly ILogger<MapaController>      _logger;

        public MapaController(
            IDbMapaRepository           repo,
            IDbSitioGrabacionRepository sitios,
            IDbMasterRepository         master,
            ILogger<MapaController>     logger)
        {
            _repo   = repo;
            _sitios = sitios;
            _master = master;
            _logger = logger;
        }

        // ── GET /api/Mapa/centro ──────────────────────────────────────────────
        /// <summary>
        /// Dónde debe abrir el mapa para quien pregunta.
        ///
        /// En cascada, de lo más específico a lo más general:
        ///   1. la unidad policial del usuario (cad_sitios_grabacion),
        ///   2. cualquier otra unidad vigente del CAD que tenga coordenadas,
        ///   3. el CAD (secad_tenants, en la maestra),
        ///   4. Bogotá, marcado como `porDefecto` para que la pantalla lo diga.
        ///
        /// Antes no existía nada de esto: los tres mapas del sistema abrían con
        /// Bogotá escrita en el código, así que el operador de Cali empezaba
        /// cada llamada a 400 km de su ciudad.
        /// </summary>
        [HttpGet("centro")]
        public async Task<ActionResult> GetCentro(CancellationToken ct)
        {
            var sitio   = int.TryParse(User.FindFirstValue("sitio_graba"), out var s) ? s : 0;
            var codDane = User.FindFirstValue("cod_dane") ?? string.Empty;

            try
            {
                var centro = await _sitios.GetCentroMapaAsync(sitio, ct);

                if (centro is null && !string.IsNullOrWhiteSpace(codDane))
                    centro = await _master.GetCentroMapaTenantAsync(codDane, ct);

                return Ok(new { success = true, data = centro ?? DtoCentroMapa.Defecto() });
            }
            catch (Exception ex)
            {
                // Un mapa en Bogotá es peor que uno centrado, pero mucho mejor
                // que una pantalla que no carga: nunca se propaga el error.
                _logger.LogError(ex, "Error resolviendo el centro del mapa sitio={Sitio} codDane={CodDane}",
                                 sitio, codDane);
                return Ok(new { success = true, data = DtoCentroMapa.Defecto() });
            }
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
