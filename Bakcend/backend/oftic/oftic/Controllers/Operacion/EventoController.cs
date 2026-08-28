using Comun.Dtos.Incidentes;
using Ev = Comun.Dtos.Eventos;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Mvc;
using Negocio.Interfaz;
using System.Security.Claims;

namespace Api.Controllers.Operacion
{
    /// <summary>
    /// Dispatcher queue module (Módulo de Eventos).
    /// Events are incidents that have been validated and sent from Recepción
    /// (enviar='S'). The dispatcher sees only those assigned to their canal.
    /// This controller does NOT expose Create/Update — those are created via
    /// RecepcionController (P_GuardarLlamadaAsync) and, separately, via
    /// PedidoController (api/Pedido), which also has its own Create/Update/
    /// SetEstado over the same cad_pedidos table for the Jefe de Turno dashboard.
    /// Both write paths must be considered when auditing cad_pedidos writers.
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    [EnableCors("PublicCors")]
    [Authorize]
    public class EventoController : ControllerBase
    {
        private readonly IDbPedidoService     _service;
        private readonly IDbRecepcionService  _recepcionService;
        private readonly ILogger<EventoController> _logger;

        public EventoController(
            IDbPedidoService service, IDbRecepcionService recepcionService,
            ILogger<EventoController> logger)
        {
            _service          = service;
            _recepcionService = recepcionService;
            _logger           = logger;
        }

        /// <summary>
        /// Returns the events (dispatched incidents) for the given canal.
        /// canalId and fuerzaId default to the values embedded in the dispatcher's JWT.
        /// The frontend may pass explicit values to allow canal selection UI.
        /// </summary>
        [HttpGet]
        public async Task<ActionResult> GetEventos(
            [FromQuery] int?    canalId,
            [FromQuery] int?    fuerzaId,
            [FromQuery] string? estado,
            CancellationToken ct)
        {
            // Resolve canal from query-param, then JWT claim
            var resolvedCanal  = canalId  ?? GetIntClaim("canal_id");
            var resolvedFuerza = fuerzaId ?? GetIntClaim("fuerza_id");

            if (resolvedCanal <= 0)
            {
                // Sin canal configurado (típico del jefe de turno, que supervisa varios
                // canales) no hay eventos que listar.
                //
                // OJO: este endpoint DEBE devolver siempre un array. Antes esta rama
                // devolvía un objeto { items, warning } mientras la ruta de éxito
                // devolvía un array pelado. El frontend lo tipa como arreglo y lo
                // recorre con for..of, así que al jefe de turno le explotaba con
                // "is not iterable" y el módulo de Pedido se quedaba cargando para
                // siempre. Nadie consumía "warning".
                return Ok(Array.Empty<object>());
            }

            try
            {
                var result = await _service.GetEventosByCanalAsync(resolvedCanal, resolvedFuerza, estado, ct);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al listar eventos canal={Canal} fuerza={Fuerza}", resolvedCanal, resolvedFuerza);
                return StatusCode(500, new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        /// <summary>
        /// Returns the full detail of a specific event (incident), including annotations.
        /// Logs the access for audit compliance (Ley 1581/2012) and marks primer acceso for SLA.
        /// </summary>
        [HttpGet("{id:long}")]
        public async Task<ActionResult> GetById(long id, CancellationToken ct)
        {
            try
            {
                var result = await _service.GetByIdAsync(id, ct);
                if (result == null)
                    return NotFound(new { success = false, message = "Evento no encontrado." });

                // ── Épica 1 & 5: Auditoría + primer acceso + promoción a "En proceso" ──
                // Se espera (no fire-and-forget) porque puede cambiar result.Estado y la
                // respuesta debe reflejarlo de inmediato, sin esperar el próximo poll.
                var (usuario, username, ip) = ObtenerAuditoria();
                var estadoPromovido = await _service.RegistrarAccesoAsync(id, usuario, username, ip, "VIEW", ct);
                if (estadoPromovido is not null)
                    result.Estado = estadoPromovido;

                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener evento id={Id}", id);
                return StatusCode(500, new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        /// <summary>
        /// Returns per-state event counts for the dispatcher's filter badges.
        /// Closed events only count those within the current shift.
        /// This endpoint is lightweight (single COUNT aggregate query).
        /// </summary>
        [HttpGet("conteos")]
        public async Task<ActionResult> GetConteos(
            [FromQuery] int? canalId,
            [FromQuery] int? fuerzaId,
            CancellationToken ct)
        {
            var resolvedCanal  = canalId  ?? GetIntClaim("canal_id");
            var resolvedFuerza = fuerzaId ?? GetIntClaim("fuerza_id");

            if (resolvedCanal <= 0)
                return Ok(new DtoEventoConteos());

            try
            {
                var result = await _service.GetConteosByCanalAsync(resolvedCanal, resolvedFuerza, ct);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener conteos canal={Canal} fuerza={Fuerza}", resolvedCanal, resolvedFuerza);
                return StatusCode(500, new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        /// <summary>
        /// Returns active SLA thresholds from cad_config_sla.
        /// The frontend uses these to color-code events in the dispatcher queue.
        /// Thresholds are configurable from the admin panel — never hardcoded.
        /// </summary>
        [HttpGet("sla-config")]
        public async Task<ActionResult> GetSlaConfig(CancellationToken ct)
        {
            try
            {
                var result = await _service.GetSlaConfigAsync(ct);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener configuración SLA");
                return StatusCode(500, new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        private static readonly HashSet<string> EstadosValidos = new(StringComparer.Ordinal)
            { "A", "P", "E", "T", "R", "C" };

        /// <summary>
        /// Changes the management state of an event.
        /// Valid states: A=Activo, P=Pendiente, E=En proceso, T=Seguimiento, R=Revisión, C=Cerrado
        /// A motivo is REQUIRED here (unlike PedidoController's own SetEstado) — every
        /// manual state change from the dispatcher queue must leave an auditable reason,
        /// recorded in cad_pedidos_estado_historial alongside the previous state.
        /// </summary>
        [HttpPut("{id:long}/estado")]
        public async Task<ActionResult> SetEstado(long id, [FromBody] DtoEstadoPedidoRequest request, CancellationToken ct)
        {
            if (!EstadosValidos.Contains(request.Estado))
                return BadRequest(new { success = false, message = $"Estado inválido: '{request.Estado}'. Valores permitidos: A, P, E, T, R, C." });
            if (string.IsNullOrWhiteSpace(request.Motivo))
                return BadRequest(new { success = false, message = "Debe indicar el motivo del cambio de estado." });

            try
            {
                var (usuario, username, maquina) = ObtenerAuditoria();
                var result = await _service.SetEstadoAsync(id, request.Estado, usuario, username, maquina, request.Motivo, ct);
                if (!result.Success)
                    return BadRequest(new { success = false, message = result.Message });
                return Ok(new { success = true, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al cambiar estado evento id={Id}", id);
                return StatusCode(500, new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        /// <summary>
        /// Historial de cambios de estado del caso — quién, cuándo, desde/hacia
        /// qué estado y por qué. Más reciente primero.
        /// </summary>
        [HttpGet("{id:long}/estado-historial")]
        public async Task<ActionResult> GetEstadoHistorial(long id, CancellationToken ct)
        {
            try
            {
                var result = await _service.GetEstadoHistorialAsync(id, ct);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener historial de estado evento id={Id}", id);
                return StatusCode(500, new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        /// <summary>
        /// Adds an annotation (note) to an event.
        /// </summary>
        [HttpPost("{id:long}/anotaciones")]
        public async Task<ActionResult> CreateAnotacion(long id, [FromBody] DtoAnotacionRequest request, CancellationToken ct)
        {
            try
            {
                var (usuario, username, maquina) = ObtenerAuditoria();
                var result = await _service.CreateAnotacionAsync(id, request, usuario, username, maquina, ct);
                if (!result.Success)
                    return BadRequest(new { success = false, message = result.Message });
                return Ok(new { success = true, id = result.Id, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al crear anotación evento id={Id}", id);
                return StatusCode(500, new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        /// <summary>
        /// Retrieves all annotations for an event.
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
                _logger.LogError(ex, "Error al listar anotaciones evento id={Id}", id);
                return StatusCode(500, new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        /// <summary>
        /// Closes an event from the dispatcher module.
        /// Persists closure codes and observation to cad_eventos only.
        /// cad_pedidos.comentario is IMMUTABLE and is never touched here —
        /// only cad_pedidos.estado is updated to 'C'.
        /// </summary>
        [HttpPost("{id:long}/cerrar")]
        public async Task<ActionResult> Cerrar(
            long id, [FromBody] Ev.DtoCerrarEventoDespachoRequest request,
            [FromQuery] int? canalId, [FromQuery] int? fuerzaId, CancellationToken ct)
        {
            try
            {
                var resolvedCanal  = canalId  ?? GetIntClaim("canal_id");
                var resolvedFuerza = fuerzaId ?? GetIntClaim("fuerza_id");
                var (usuarioId, username, maquina) = ObtenerAuditoria();
                var result = await _service.CerrarEventoDesdeDespachoAsync(
                    id, request, resolvedCanal, resolvedFuerza, usuarioId, username, maquina, ct);
                if (!result.Success)
                    return BadRequest(new { success = false, message = result.Message });
                return Ok(new { success = true, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al cerrar evento id={Id}", id);
                return StatusCode(500, new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        /// <summary>
        /// Returns the dispatch channels available for a given recording site.
        /// Used by the canal selector in the Eventos UI.
        /// </summary>
        [HttpGet("canales")]
        public async Task<ActionResult> GetCanales([FromQuery] int? sitioGraba, CancellationToken ct)
        {
            var sitio = sitioGraba ?? GetIntClaim("sitio_graba");
            try
            {
                var result = await _service.GetCanalesPorSitioAsync(sitio, ct);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al listar canales sitioGraba={Sg}", sitio);
                return StatusCode(500, new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        /// <summary>
        /// Canales SECAD y agencias externas que tienen (o tuvieron) conocimiento
        /// de este evento — visibilidad multi-canal para cualquier funcionario.
        /// </summary>
        [HttpGet("{id:long}/canales-asignados")]
        public async Task<ActionResult> GetCanalesAsignados(long id, CancellationToken ct)
        {
            try
            {
                var result = await _service.G_GetCanalesAsignadosAsync(id, ct);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener canales asignados evento id={Id}", id);
                return StatusCode(500, new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        /// <summary>
        /// Quién más ha visto este caso recientemente — reutiliza el mismo registro
        /// de auditoría que ya se escribe en cada apertura (cad_auditoria_acceso_evento,
        /// existente desde V14 para cumplimiento Ley 1581/2012), en vez de agregar
        /// infraestructura de push (WebSocket/SignalR) nueva solo para esto. Es una
        /// señal de "visto recientemente" (ventana de 5 min), no de presencia en vivo
        /// segundo a segundo — suficiente para que un despachador sepa que otro
        /// operador ya está mirando el mismo caso, sin construir un canal bidireccional
        /// para un caso de uso tan puntual.
        /// </summary>
        /// <remarks>GET api/Evento/{id}/presencia</remarks>
        [HttpGet("{id:long}/presencia")]
        public async Task<ActionResult> GetPresencia(long id, CancellationToken ct)
        {
            try
            {
                var (usuario, _, _) = ObtenerAuditoria();
                var result = await _service.G_GetPresenciaAsync(id, usuario, ct);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener presencia evento id={Id}", id);
                return StatusCode(500, new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        /// <summary>
        /// Búsqueda server-side de eventos por dirección, código, llamante, teléfono
        /// o número de evento/llamada — sin el LIMIT 300 de la cola en vivo, e
        /// incluyendo casos ya cerrados o remitidos a otro canal. Requiere al menos
        /// 3 caracteres. Scoped por la fuerza del operador (JWT), no por canal.
        /// </summary>
        /// <remarks>GET api/Evento/buscar?texto=carrera+87&amp;fuerzaId=1&amp;sitioGraba=1</remarks>
        [HttpGet("buscar")]
        public async Task<ActionResult> Buscar(
            [FromQuery] string texto,
            [FromQuery] int?   fuerzaId,
            [FromQuery] int?   sitioGraba,
            CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(texto) || texto.Trim().Length < 3)
                return Ok(Array.Empty<object>());

            var resolvedFuerza = fuerzaId  ?? GetIntClaim("fuerza_id");
            var resolvedSitio  = sitioGraba ?? GetIntClaim("sitio_graba");

            try
            {
                var result = await _service.G_BuscarEventosAsync(texto, resolvedFuerza, resolvedSitio, ct);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al buscar eventos texto={Texto}", texto);
                return StatusCode(500, new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        /// <summary>
        /// Casos posiblemente duplicados o con contexto histórico relevante —
        /// mismo radio geográfico dentro de una ventana de tiempo. Reutiliza la
        /// misma búsqueda geoespacial que ya usa Recepción para detectar llamadas
        /// duplicadas en el momento del ingreso (G_GetPedidosCercanosAsync); acá se
        /// aplica con una ventana más amplia para dar contexto histórico de la zona
        /// (ej. "3 llamados en esta dirección esta semana"), no solo duplicados
        /// literales de los últimos minutos.
        /// lat/lng vienen del propio detalle ya cargado por el frontend — no hace
        /// falta una consulta adicional a cad_pedidos solo para las coordenadas.
        /// </summary>
        /// <remarks>
        /// GET api/Evento/{id}/duplicados?lat=4.65&amp;lng=-74.1&amp;radioMetros=300&amp;diasAtras=7
        /// </remarks>
        [HttpGet("{id:long}/duplicados")]
        public async Task<ActionResult> GetDuplicados(
            long id,
            [FromQuery] double lat, [FromQuery] double lng,
            [FromQuery] int radioMetros = 300, [FromQuery] int diasAtras = 7,
            CancellationToken ct = default)
        {
            if (lat == 0 || lng == 0)
                return Ok(Array.Empty<object>());

            radioMetros = Math.Clamp(radioMetros, 50, 2000);
            diasAtras   = Math.Clamp(diasAtras, 1, 30);

            try
            {
                var cercanos = await _recepcionService.G_GetPedidosCercanosAsync(
                    lat, lng, radioMetros, diasAtras * 24 * 60, null, ct);
                var idStr = id.ToString();
                var data  = cercanos.Where(x => x.Id != idStr).ToList();
                return Ok(data);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al buscar duplicados evento id={Id}", id);
                return StatusCode(500, new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        /// <summary>
        /// Vincula este caso a otro (padre) — para cuando dos llamadas distintas
        /// resultan ser el mismo incidente real, evitando despachar dos veces.
        /// Reutiliza cad_pedidos.pedido_padre_sitio/pedido_padre_num, columnas que
        /// existían desde V3 sin ninguna acción de UI que las usara.
        /// </summary>
        /// <remarks>
        /// PUT api/Evento/{id}/vincular
        /// Body: { "sitioGraba": 1, "numeLlamada": 123456 }
        /// </remarks>
        [HttpPut("{id:long}/vincular")]
        public async Task<ActionResult> Vincular(long id, [FromBody] Ev.DtoVincularPedidoRequest request, CancellationToken ct)
        {
            try
            {
                var (usuario, _, maquina) = ObtenerAuditoria();
                var result = await _service.VincularPedidoAsync(id, request.SitioGraba, request.NumeLlamada, usuario, maquina, ct);
                if (!result.Success)
                    return BadRequest(new { success = false, message = result.Message });
                return Ok(new { success = true, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al vincular evento id={Id}", id);
                return StatusCode(500, new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        /// <summary>Quita el vínculo de este caso con su caso padre.</summary>
        /// <remarks>PUT api/Evento/{id}/desvincular</remarks>
        [HttpPut("{id:long}/desvincular")]
        public async Task<ActionResult> Desvincular(long id, CancellationToken ct)
        {
            try
            {
                var (usuario, _, maquina) = ObtenerAuditoria();
                var result = await _service.VincularPedidoAsync(id, null, null, usuario, maquina, ct);
                if (!result.Success)
                    return BadRequest(new { success = false, message = result.Message });
                return Ok(new { success = true, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al desvincular evento id={Id}", id);
                return StatusCode(500, new { success = false, message = $"Error: {ex.Message}" });
            }
        }

        // ─── Helpers ──────────────────────────────────────────────────────────

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

        private int GetIntClaim(string claimType)
        {
            var raw = User.FindFirstValue(claimType);
            return int.TryParse(raw, out var val) ? val : 0;
        }
    }
}
