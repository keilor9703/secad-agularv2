using Comun.Dtos.Reportes;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Negocio.Interfaz;
using System.Security.Claims;

namespace Api.Controllers.Operacion
{
    /// <summary>
    /// Módulo de Reportes y Estadísticas (§6.16).
    /// Retorna métricas operativas calculadas sobre cad_pedidos, cad_eventos y cad_actuaciones.
    /// Todos los endpoints requieren autenticación; no requieren rol especial.
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class ReportesController : ControllerBase
    {
        private readonly IDbReporteService            _svc;
        private readonly ILogger<ReportesController>  _logger;

        private int FuerzaId => int.TryParse(User.FindFirstValue("fuerza_id"), out var v) ? v : 0;

        private bool IsAdmin() =>
            string.Equals(User.FindFirstValue("es_admin"), "true", StringComparison.OrdinalIgnoreCase);

        /// <summary>
        /// Resuelve la fuerza a consultar: un super-admin puede pedir cualquier fuerza
        /// (o 0 = todas) vía query string; un operador normal SIEMPRE consulta su
        /// propia fuerza (claim del JWT), sin importar lo que envíe el cliente.
        /// Antes el parámetro del query string se usaba tal cual para cualquier
        /// usuario — cualquier operador podía pedir fuerzaId=0 (o el de otra fuerza)
        /// y ver datos operativos de todo el tenant, incluyendo PII (teléfonos de
        /// llamantes) de fuerzas ajenas.
        /// </summary>
        private int ResolveFuerza(int fuerzaId) => IsAdmin() ? fuerzaId : FuerzaId;

        public ReportesController(IDbReporteService svc, ILogger<ReportesController> logger)
        {
            _svc    = svc;
            _logger = logger;
        }

        // ── Helper parámetros base ────────────────────────────────────────────
        private DtoReporteParams BaseParams(string? desde, string? hasta, int fuerzaId,
            int turnoVigilancia = 0) => new()
        {
            Desde            = desde,
            Hasta            = hasta,
            FuerzaId         = fuerzaId,
            TurnoVigilancia  = turnoVigilancia
        };

        private DtoReporteParamsEx ExtParams(string? desde, string? hasta, int fuerzaId,
            int page = 1, int limit = 100, string? calidad = null, int top = 50,
            int turnoVigilancia = 0) => new()
        {
            Desde            = desde,
            Hasta            = hasta,
            FuerzaId         = fuerzaId,
            Page             = page,
            Limit            = limit,
            Calidad          = calidad,
            Top              = top,
            TurnoVigilancia  = turnoVigilancia
        };

        // ════════════════════════════════════════════════════════════════════════
        // Dashboard existente
        // ════════════════════════════════════════════════════════════════════════

        /// <summary>Dashboard: resumen, por origen, por fuerza, top casos, tiempos, SLA y distribución horaria.</summary>
        [HttpGet]
        public async Task<IActionResult> GetReporte(
            [FromQuery] string? desde           = null,
            [FromQuery] string? hasta           = null,
            [FromQuery] int     fuerzaId        = 0,
            [FromQuery] int     turnoVigilancia = 0,
            CancellationToken   ct              = default)
        {
            try
            {
                var data = await _svc.GetReporteCompletoAsync(BaseParams(desde, hasta, ResolveFuerza(fuerzaId), turnoVigilancia), ct);
                return Ok(new { success = true, data });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetReporte error {D}/{H}", desde, hasta);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // R1 — Llamadas por calidad (cali_pedido)
        // GET /api/Reportes/calidad?desde=&hasta=
        // ════════════════════════════════════════════════════════════════════════

        [HttpGet("calidad")]
        public async Task<IActionResult> GetPorCalidad(
            [FromQuery] string? desde           = null,
            [FromQuery] string? hasta           = null,
            [FromQuery] int     fuerzaId        = 0,
            [FromQuery] int     turnoVigilancia = 0,
            CancellationToken   ct              = default)
        {
            try
            {
                var data = await _svc.GetPorCalidadAsync(BaseParams(desde, hasta, ResolveFuerza(fuerzaId), turnoVigilancia), ct);
                return Ok(new { success = true, data });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetPorCalidad error");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // R2 — Pedidos con detalle (filtro de calidad, paginado)
        // GET /api/Reportes/efectivos?desde=&hasta=&calidad=REAL&page=1&limit=100
        // ════════════════════════════════════════════════════════════════════════

        [HttpGet("efectivos")]
        public async Task<IActionResult> GetEfectivos(
            [FromQuery] string? desde    = null,
            [FromQuery] string? hasta    = null,
            [FromQuery] int     fuerzaId = 0,
            [FromQuery] string? calidad          = null,
            [FromQuery] int     page             = 1,
            [FromQuery] int     limit            = 100,
            [FromQuery] int     turnoVigilancia  = 0,
            CancellationToken   ct               = default)
        {
            try
            {
                var data = await _svc.GetEfectivosAsync(ExtParams(desde, hasta, ResolveFuerza(fuerzaId), page, limit, calidad, turnoVigilancia: turnoVigilancia), ct);
                return Ok(new { success = true, data });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetEfectivos error");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // R3 — Tiempos de atención detalle por unidad (paginado)
        // GET /api/Reportes/tiempos-detalle?desde=&hasta=&fuerzaId=&page=1&limit=100
        // ════════════════════════════════════════════════════════════════════════

        [HttpGet("tiempos-detalle")]
        public async Task<IActionResult> GetTiemposDetalle(
            [FromQuery] string? desde    = null,
            [FromQuery] string? hasta    = null,
            [FromQuery] int     fuerzaId = 0,
            [FromQuery] int     page             = 1,
            [FromQuery] int     limit            = 100,
            [FromQuery] int     turnoVigilancia  = 0,
            CancellationToken   ct               = default)
        {
            try
            {
                var data = await _svc.GetTiemposDetalleAsync(ExtParams(desde, hasta, ResolveFuerza(fuerzaId), page, limit, turnoVigilancia: turnoVigilancia), ct);
                return Ok(new { success = true, data });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetTiemposDetalle error");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // R4 — Trabajo de operadores y despachadores
        // GET /api/Reportes/operadores?desde=&hasta=
        // ════════════════════════════════════════════════════════════════════════

        [HttpGet("operadores")]
        public async Task<IActionResult> GetTrabajoOperadores(
            [FromQuery] string? desde    = null,
            [FromQuery] string? hasta    = null,
            [FromQuery] int     fuerzaId        = 0,
            [FromQuery] int     turnoVigilancia = 0,
            CancellationToken   ct              = default)
        {
            try
            {
                var data = await _svc.GetTrabajoOperadoresAsync(BaseParams(desde, hasta, ResolveFuerza(fuerzaId), turnoVigilancia), ct);
                return Ok(new { success = true, data });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetTrabajoOperadores error");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // R5 — Llamadas por código (top configurable)
        // GET /api/Reportes/codigos?desde=&hasta=&fuerzaId=&top=50
        // ════════════════════════════════════════════════════════════════════════

        [HttpGet("codigos")]
        public async Task<IActionResult> GetPorCodigo(
            [FromQuery] string? desde    = null,
            [FromQuery] string? hasta    = null,
            [FromQuery] int     fuerzaId = 0,
            [FromQuery] int     top             = 50,
            [FromQuery] int     turnoVigilancia = 0,
            CancellationToken   ct              = default)
        {
            try
            {
                var data = await _svc.GetPorCodigoAsync(ExtParams(desde, hasta, ResolveFuerza(fuerzaId), top: top, turnoVigilancia: turnoVigilancia), ct);
                return Ok(new { success = true, data });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetPorCodigo error");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }
}
