using Comun.Dtos.Incidentes;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Mvc;
using Negocio.Interfaz;
using System.Security.Claims;

namespace Api.Controllers.Operacion
{
    [ApiController]
    [Route("api/[controller]")]
    [EnableCors("PublicCors")]
    [Authorize]
    public class PedidoController : ControllerBase
    {
        private readonly IDbPedidoService _service;
        private readonly ILogger<PedidoController> _logger;

        public PedidoController(IDbPedidoService service, ILogger<PedidoController> logger)
        {
            _service = service;
            _logger = logger;
        }

        private static readonly HashSet<string> EstadosValidos = new(StringComparer.Ordinal)
            { "A", "P", "E", "T", "R", "C" };

        /// <summary>
        /// Lista paginada de casos con filtros opcionales: estado (A/C/P), sitio_graba
        /// y rango de fechas (fechaDesde/fechaHasta, fecha local de Colombia).
        /// page es 1-based; pageSize se acota a 200 en el servidor.
        /// </summary>
        [HttpGet]
        public async Task<ActionResult> GetList(
            [FromQuery] string? estado,
            [FromQuery] int? sitioGraba,
            [FromQuery] DateTime? fechaDesde,
            [FromQuery] DateTime? fechaHasta,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 100,
            CancellationToken ct = default)
        {
            try
            {
                var result = await _service.GetListAsync(estado, sitioGraba, fechaDesde, fechaHasta, page, pageSize, ct);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al listar pedidos");
                return StatusCode(500, new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        /// <summary>
        /// Obtiene el detalle completo de un caso incluidas sus anotaciones.
        /// </summary>
        [HttpGet("{id:long}")]
        public async Task<ActionResult> GetById(long id, CancellationToken ct)
        {
            try
            {
                var (ok, error, pedido) = await ValidarPropietarioAsync(id, ct);
                if (!ok) return error!;
                return Ok(pedido);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener pedido id={Id}", id);
                return StatusCode(500, new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        /// <summary>
        /// Registra un nuevo caso.
        /// </summary>
        [HttpPost]
        public async Task<ActionResult> Create([FromBody] DtoPedidoRequest request, CancellationToken ct)
        {
            if (!string.IsNullOrWhiteSpace(request.Estado) && !EstadosValidos.Contains(request.Estado))
                return BadRequest(new { success = false, message = $"Estado inválido: '{request.Estado}'. Valores permitidos: A, P, E, T, R, C." });

            try
            {
                var (usuario, username, maquina) = ObtenerAuditoria();
                var result = await _service.CreateAsync(request, usuario, username, maquina, ct);
                if (!result.Success)
                    return BadRequest(new { success = false, message = result.Message });
                return Ok(new { success = true, id = result.Id, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al crear pedido");
                return StatusCode(500, new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        /// <summary>
        /// Actualiza un caso existente.
        /// </summary>
        [HttpPut("{id:long}")]
        public async Task<ActionResult> Update(long id, [FromBody] DtoPedidoRequest request, CancellationToken ct)
        {
            if (!string.IsNullOrWhiteSpace(request.Estado) && !EstadosValidos.Contains(request.Estado))
                return BadRequest(new { success = false, message = $"Estado inválido: '{request.Estado}'. Valores permitidos: A, P, E, T, R, C." });

            try
            {
                var (ok, error, _) = await ValidarPropietarioAsync(id, ct);
                if (!ok) return error!;

                var (usuario, username, maquina) = ObtenerAuditoria();
                var result = await _service.UpdateAsync(id, request, usuario, username, maquina, ct);
                if (!result.Success)
                    return BadRequest(new { success = false, message = result.Message });
                return Ok(new { success = true, id = result.Id, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al actualizar pedido id={Id}", id);
                return StatusCode(500, new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        /// <summary>
        /// Cierre rapido de un caso (solo actualiza estado, comentario y codigo).
        /// </summary>
        [HttpPost("{id:long}/cerrar-rapido")]
        public async Task<ActionResult> CerrarRapido(long id, [FromBody] DtoCerrarRapidoRequest request, CancellationToken ct)
        {
            try
            {
                var (ok, error, _) = await ValidarPropietarioAsync(id, ct);
                if (!ok) return error!;

                var (usuario, _, maquina) = ObtenerAuditoria();
                var result = await _service.CerrarRapidoAsync(id, request, usuario, maquina, ct);
                if (!result.Success)
                    return BadRequest(new { success = false, message = result.Message });
                return Ok(new { success = true, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al cerrar rápido pedido id={Id}", id);
                return StatusCode(500, new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        /// <summary>
        /// Cambia el estado de un caso.
        /// Valores permitidos: A=Activo, P=Pendiente, E=En proceso, T=Seguimiento, R=Revisión, C=Cerrado
        /// (mismo dominio que PUT api/Evento/{id}/estado).
        /// </summary>
        [HttpPut("{id:long}/estado")]
        public async Task<ActionResult> SetEstado(long id, [FromBody] DtoEstadoPedidoRequest request, CancellationToken ct)
        {
            if (!EstadosValidos.Contains(request.Estado))
                return BadRequest(new { success = false, message = $"Estado inválido: '{request.Estado}'. Valores permitidos: A, P, E, T, R, C." });

            try
            {
                var (ok, error, _) = await ValidarPropietarioAsync(id, ct);
                if (!ok) return error!;

                var (usuario, username, maquina) = ObtenerAuditoria();
                var result = await _service.SetEstadoAsync(id, request.Estado, usuario, username, maquina, request.Motivo, ct);
                if (!result.Success)
                    return BadRequest(new { success = false, message = result.Message });
                return Ok(new { success = true, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al cambiar estado pedido id={Id}", id);
                return StatusCode(500, new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        /// <summary>
        /// Devuelve las anotaciones de un caso.
        /// </summary>
        [HttpGet("{id:long}/anotaciones")]
        public async Task<ActionResult> GetAnotaciones(long id, CancellationToken ct)
        {
            try
            {
                var result = await _service.GetAnotacionesAsync(id, ct);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al listar anotaciones pedido id={Id}", id);
                return StatusCode(500, new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        /// <summary>
        /// Agrega una anotacion a un caso.
        /// </summary>
        [HttpPost("{id:long}/anotaciones")]
        public async Task<ActionResult> CreateAnotacion(long id, [FromBody] DtoAnotacionRequest request, CancellationToken ct)
        {
            try
            {
                var (ok, error, _) = await ValidarPropietarioAsync(id, ct);
                if (!ok) return error!;

                var (usuario, username, maquina) = ObtenerAuditoria();
                var result = await _service.CreateAnotacionAsync(id, request, usuario, username, maquina, ct);
                if (!result.Success)
                    return BadRequest(new { success = false, message = result.Message });
                return Ok(new { success = true, id = result.Id, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al crear anotación pedido id={Id}", id);
                return StatusCode(500, new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        /// <summary>
        /// Busca casos activos del mismo sitio para asociar.
        /// </summary>
        [HttpGet("buscar-asociar")]
        public async Task<ActionResult> BuscarAsociar([FromQuery] int sitioGraba, CancellationToken ct)
        {
            try
            {
                var result = await _service.BuscarParaAsociarAsync(sitioGraba, ct);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al buscar pedidos para asociar sitioGraba={Sg}", sitioGraba);
                return StatusCode(500, new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        // ─── Helpers ──────────────────────────────────────────────────────────

        /// <summary>
        /// Verifica que el pedido pertenezca al sitio_graba del operador autenticado
        /// (los super-admin pueden operar sobre cualquier sitio del tenant). Evita que
        /// un operador de un sitio lea/edite/cierre casos de otro sitio (IDOR), igual
        /// que ya se controla en RecepcionController y MapaController.
        /// </summary>
        private async Task<(bool ok, ActionResult? error, DtoPedidoDetalle? pedido)> ValidarPropietarioAsync(long id, CancellationToken ct)
        {
            var pedido = await _service.GetByIdAsync(id, ct);
            if (pedido == null)
                return (false, NotFound(new { success = false, message = "Caso no encontrado." }), null);

            if (!IsAdmin() && pedido.SitioGraba != GetIntClaim("sitio_graba"))
                return (false, Forbid(), null);

            return (true, null, pedido);
        }

        private int GetIntClaim(string claimType)
        {
            var val = User.FindFirst(claimType)?.Value;
            return int.TryParse(val, out var n) ? n : 0;
        }

        private bool IsAdmin() =>
            string.Equals(User.FindFirstValue("es_admin"), "true", StringComparison.OrdinalIgnoreCase);

        private (long usuario, string username, string maquina) ObtenerAuditoria()
        {
            var rawId = User.FindFirstValue("id_usuario")
                ?? User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? User.FindFirstValue("nameid");
            long.TryParse(rawId, out var usuario);
            if (usuario == 0) usuario = 1;

            var username = User.FindFirstValue("username")
                ?? User.FindFirstValue(ClaimTypes.Name)
                ?? "sistema";

            var maquina = HttpContext.Connection.RemoteIpAddress?.ToString()
                ?? Environment.MachineName
                ?? "N/A";

            return (usuario, username, maquina);
        }
    }
}
