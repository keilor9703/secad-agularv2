using Comun.Dtos.Mapa;
using Datos.Interfaz;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Api.Controllers.Operacion
{
    /// <summary>
    /// Módulo GIS Estadístico Delincuencial.
    /// Provee análisis histórico de incidentes con métricas agregadas para
    /// visualización en mapa de calor, clusters y gráficas estadísticas.
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    [EnableCors("PublicCors")]
    [Authorize]
    public class MapaEstadisticoController : ControllerBase
    {
        private readonly IDbMapaEstadisticoRepository _repo;
        private readonly ILogger<MapaEstadisticoController> _logger;

        public MapaEstadisticoController(
            IDbMapaEstadisticoRepository repo,
            ILogger<MapaEstadisticoController> logger)
        {
            _repo   = repo;
            _logger = logger;
        }

        /// <summary>
        /// Análisis estadístico GIS: puntos geoposicionados + métricas agregadas.
        /// Acepta filtros por rango de fechas, tipo de caso, prioridad, ciudad y canal.
        /// </summary>
        [HttpGet("analisis")]
        public async Task<ActionResult> GetAnalisis(
            [FromQuery] string? desde,
            [FromQuery] string? hasta,
            [FromQuery] string? codiPedido,
            [FromQuery] string? prioridad,
            [FromQuery] string? ciudad,
            [FromQuery] string? barrio,
            [FromQuery] int?    canalCodigo,
            [FromQuery] int?    canalFuerzaId,
            [FromQuery] int?    sitioGraba,
            [FromQuery] bool    soloCerrados     = true,
            [FromQuery] int     turnoVigilancia  = 0,
            CancellationToken ct = default)
        {
            // Superadmins pueden ver el sitio que pidan (o todos con sitioGraba=0);
            // un operador SIEMPRE consulta su propio sitioGraba del JWT, sin importar
            // lo que envíe el cliente (antes se asignaba primero el valor del cliente
            // y solo se corregía si era admin, así que un operador normal nunca veía
            // su propio valor sobrescrito — IDOR entre sitios/CADs del tenant).
            var resolvedSitio = IsAdmin()
                ? (sitioGraba ?? GetIntClaim("sitio_graba"))
                : GetIntClaim("sitio_graba");

            var filtro = new DtoFiltroEstadistico
            {
                Desde           = desde         ?? "",
                Hasta           = hasta         ?? "",
                CodiPedido      = codiPedido    ?? "",
                Prioridad       = prioridad     ?? "",
                Ciudad          = ciudad        ?? "",
                Barrio          = barrio        ?? "",
                CanalCodigo     = canalCodigo   ?? 0,
                CanalFuerzaId   = canalFuerzaId ?? 0,
                SitioGraba      = resolvedSitio,
                SoloCerrados    = soloCerrados,
                TurnoVigilancia = turnoVigilancia
            };

            _logger.LogInformation(
                "[GIS Estadístico] Análisis {D}→{H} | codi={C} prio={P} ciudad={Ci} solo_cerrados={S}",
                filtro.Desde, filtro.Hasta, filtro.CodiPedido, filtro.Prioridad,
                filtro.Ciudad, filtro.SoloCerrados);

            var data = await _repo.GetAnalisisAsync(filtro, ct);
            return Ok(data);
        }

        /// <summary>
        /// Ciudades/municipios disponibles en los datos del tenant.
        /// Para super-admin muestra todas; para operadores solo las del tenant actual.
        /// </summary>
        [HttpGet("ciudades")]
        public async Task<ActionResult<List<string>>> GetCiudades(
            [FromQuery] int? sitioGraba, CancellationToken ct)
        {
            var resolvedSitio = IsAdmin()
                ? (sitioGraba ?? GetIntClaim("sitio_graba"))
                : GetIntClaim("sitio_graba");
            var list = await _repo.GetCiudadesAsync(resolvedSitio, ct);
            return Ok(list);
        }

        /// <summary>
        /// Barrios del tenant filtrados por ciudad (o todos si ciudad está vacía).
        /// </summary>
        [HttpGet("barrios")]
        public async Task<ActionResult<List<string>>> GetBarrios(
            [FromQuery] string? ciudad, [FromQuery] int? sitioGraba, CancellationToken ct)
        {
            var resolvedSitio = IsAdmin()
                ? (sitioGraba ?? GetIntClaim("sitio_graba"))
                : GetIntClaim("sitio_graba");
            var list = await _repo.GetBarriosAsync(ciudad, resolvedSitio, ct);
            return Ok(list);
        }

        private int    GetIntClaim(string name) =>
            int.TryParse(User.FindFirstValue(name), out var v) ? v : 0;

        private bool IsAdmin() =>
            string.Equals(User.FindFirstValue("es_admin"), "true",
                StringComparison.OrdinalIgnoreCase);
    }
}
