using Comun.Dtos.Eventos;
using Comun.Dtos.Recepcion;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Negocio.Interfaz;
using System.Security.Claims;

namespace Api.Controllers.Operacion
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class RecepcionController : ControllerBase
    {
        private readonly IDbRecepcionService            _svc;
        private readonly ILogger<RecepcionController>   _logger;

        public RecepcionController(IDbRecepcionService svc, ILogger<RecepcionController> logger)
        {
            _svc    = svc;
            _logger = logger;
        }

        // ── Claims helpers ───────────────────────────────────────────────────────
        private int    SitioGraba   => int.TryParse(User.FindFirstValue("sitio_graba"),  out var v) ? v : 0;
        private int    AcdClaim     => int.TryParse(User.FindFirstValue("acd"),           out var v) ? v : 0;
        private int    FuerzaId     => int.TryParse(User.FindFirstValue("fuerza_id"),    out var v) ? v : 0;
        private string UsuarioClaim => User.FindFirstValue(ClaimTypes.Name)
                                    ?? User.FindFirstValue("unique_name") ?? "";
        // Cédula del empleado: viene del claim "identificacion" que JwtService emite
        // desde ctr_usuarios.identificacion — es la cédula real, NO el Snowflake id_usuario.
        private long   EmpleadoId   => long.TryParse(User.FindFirstValue("identificacion"), out var v) ? v : 0;
        // ID numérico de usuario (para columnas usuario_modifica BIGINT, p.ej. cad_pedidos).
        // Mismo criterio que EventoController.ObtenerAuditoria().
        private long   UsuarioIdClaim =>
            long.TryParse(
                User.FindFirstValue("id_usuario")
                    ?? User.FindFirstValue(ClaimTypes.NameIdentifier)
                    ?? User.FindFirstValue("nameid"),
                out var uid) && uid > 0 ? uid : 1;
        private string MaquinaClaim =>
            HttpContext.Connection.RemoteIpAddress?.ToString() ?? Environment.MachineName ?? "N/A";

        // ════════════════════════════════════════════════════════════════════════
        // PLANTATEL / INCOMING CALL
        // GET api/Recepcion/llamada
        // ════════════════════════════════════════════════════════════════════════
        [HttpGet("llamada")]
        public async Task<IActionResult> GetLlamada(CancellationToken ct)
        {
            try
            {
                var data = await _svc.F_GetLlamadasAsync(SitioGraba, AcdClaim, ct);
                if (data is null)
                    return Ok(new { success = false, data = (object?)null, message = "Sin llamadas entrantes" });
                return Ok(new { success = true, data, message = "Llamada encontrada" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetLlamada error");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // SNOWFLAKE ID (antes era nextval de secuencia)
        // POST api/Recepcion/consecutivo
        // ════════════════════════════════════════════════════════════════════════
        [HttpPost("consecutivo")]
        public async Task<IActionResult> GetConsecutivo(CancellationToken ct)
        {
            try
            {
                var seq = await _svc.F_ConsultarSeqPedidoAsync(ct);
                return Ok(new { success = true, data = seq, message = "" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetConsecutivo error");
                return StatusCode(500, new { success = false, data = 0L, message = ex.Message });
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // CATALOG
        // GET api/Recepcion/canales
        // GET api/Recepcion/referencias?nombre=TIPO_PEDIDO
        // POST api/Recepcion/casos-intel        body: { busqueda }
        // POST api/Recepcion/caso-por-codigo    body: { codigo }
        // POST api/Recepcion/buscar-asociar     body: DtoBusquedaAsociarLlamada
        // ════════════════════════════════════════════════════════════════════════

        [HttpGet("canales")]
        public async Task<IActionResult> GetCanales([FromQuery] int? sitioGraba, CancellationToken ct)
        {
            try
            {
                return Ok(await _svc.F_GetCanalesAsync(sitioGraba ?? SitioGraba, ct));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al listar canales sitioGraba={Sg}", sitioGraba ?? SitioGraba);
                return StatusCode(500, new List<object>());
            }
        }

        [HttpGet("referencias")]
        public async Task<IActionResult> GetReferencias([FromQuery] string nombre, CancellationToken ct)
        {
            try
            {
                return Ok(await _svc.F_GetReferenciasAsync(nombre, ct));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al listar referencias nombre={Nombre}", nombre);
                return StatusCode(500, new List<object>());
            }
        }

        [HttpPost("casos-intel")]
        public async Task<IActionResult> BuscarCasos(
            [FromBody] BusquedaCasoRequest req, CancellationToken ct)
        {
            try
            {
                var data = await _svc.F_GetCasosIntelAsync(req.Busqueda ?? "", ct);
                return Ok(new { success = true, data, message = "" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "BuscarCasos error");
                return StatusCode(500, new { success = false, data = new List<object>(), message = ex.Message });
            }
        }

        [HttpPost("caso-por-codigo")]
        public async Task<IActionResult> GetCasoPorCodigo(
            [FromBody] CodigoCasoRequest req, CancellationToken ct)
        {
            try
            {
                var data = await _svc.F_GetCasoPorCodigoAsync(req.Codigo ?? "", ct);
                if (data is null)
                    return Ok(new { success = false, data = (object?)null, message = "Código no encontrado" });
                return Ok(new { success = true, data, message = "" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetCasoPorCodigo error");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPost("buscar-asociar")]
        public async Task<IActionResult> BuscarLlamadasAsociar(
            [FromBody] DtoBusquedaAsociarLlamada dto, CancellationToken ct)
        {
            if (dto is null)
                return BadRequest(new { success = false, data = new List<object>(), message = "Datos requeridos" });
            try
            {
                // Ignorar dto.SitioGraba (controlado por el cliente) — usar siempre el
                // sitio del operador autenticado, igual que ya se hace con FuerzaId.
                var data = await _svc.F_BuscarLlamadasAsociarAsync(
                    SitioGraba, dto.HoraCaso, dto.NumeLlamada, ct);
                return Ok(new { success = true, data, message = "" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "BuscarLlamadasAsociar error");
                return StatusCode(500, new { success = false, data = new List<object>(), message = ex.Message });
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // SAVE / QUICK-CLOSE
        // POST api/Recepcion/guardar        body: DtoRecepcion
        // POST api/Recepcion/cerrar-rapido  body: DtoRecepcion
        // ════════════════════════════════════════════════════════════════════════

        [HttpPost("guardar")]
        public async Task<IActionResult> GuardarLlamada(
            [FromBody] DtoRecepcion datos, CancellationToken ct)
        {
            if (datos is null)
                return BadRequest(new { success = false, message = "Datos requeridos" });
            // El frontend ya valida esto, pero sin la misma regla en el servidor un
            // caso puede quedar "enviado" sin ningún canal notificado — invisible para
            // cualquier despachador, sin ningún error visible para el operador.
            if (datos.CANALES_SELECCIONADOS is null || datos.CANALES_SELECCIONADOS.Count == 0)
                return BadRequest(new { success = false, message = "Debe seleccionar al menos un canal de despacho." });
            // Ignorar datos.SITIO_GRABA del body — usar siempre el sitio del operador
            // autenticado, para que un operador no pueda escribir en un sitio ajeno
            // con solo alterar el payload.
            datos.SITIO_GRABA = SitioGraba;
            try
            {
                var result = await _svc.P_GuardarLlamadaAsync(datos, FuerzaId, UsuarioClaim, EmpleadoId, ct);
                // Devolver pedidoId (cad_pedidos.id real) para que el frontend
                // pueda despachar a agencias externas con el ID correcto.
                return Ok(new
                {
                    success  = result.Success,
                    message  = result.Message,
                    pedidoId = result.PedidoId?.ToString()   // string para preservar precisión Snowflake en JS
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GuardarLlamada error");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPost("cerrar-rapido")]
        public async Task<IActionResult> CerrarRapido(
            [FromBody] DtoRecepcion datos, CancellationToken ct)
        {
            if (datos is null)
                return BadRequest(new { success = false, message = "Datos requeridos" });
            datos.SITIO_GRABA = SitioGraba;
            try
            {
                var result = await _svc.P_CerrarLlamadaRapidaAsync(datos, UsuarioClaim, ct);
                return Ok(new { success = result.Success, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "CerrarRapido error");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // EVENT LIFECYCLE  (usados desde el módulo de Eventos — despachador)
        // GET  api/Recepcion/evento/{id}
        // GET  api/Recepcion/evento/pedido/{pedidoId}
        // PUT  api/Recepcion/evento/{id}/estado       body: { estado }
        // POST api/Recepcion/evento/cerrar            body: DtoCierreEventoRequest
        // ════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// Detalle completo de un evento, incluyendo todos sus códigos de cierre.
        /// </summary>
        [HttpGet("evento/{id:long}")]
        public async Task<IActionResult> GetEvento(long id, CancellationToken ct)
        {
            try
            {
                var data = await _svc.G_GetEventoAsync(id, ct);
                if (data is null)
                    return NotFound(new { success = false, message = $"Evento {id} no encontrado." });
                return Ok(new { success = true, data });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetEvento error id={Id}", id);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        /// <summary>
        /// Eventos asociados a un pedido (llamada). Útil para mostrar el historial
        /// de despacho en el detalle del pedido.
        /// </summary>
        [HttpGet("evento/pedido/{pedidoId:long}")]
        public async Task<IActionResult> GetEventosPorPedido(long pedidoId, CancellationToken ct)
        {
            try
            {
                var data = await _svc.G_GetEventosPorPedidoAsync(pedidoId, ct);
                return Ok(new { success = true, data });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetEventosPorPedido error pedidoId={Id}", pedidoId);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        /// <summary>
        /// Marca un evento como Despachado (D) o Atendido (A).
        /// Registra el timestamp de despacho o llegada según corresponda.
        /// </summary>
        [HttpPut("evento/{id:long}/estado")]
        public async Task<IActionResult> ActualizarEstadoEvento(
            long id, [FromBody] ActualizarEstadoRequest req, CancellationToken ct)
        {
            if (req is null || string.IsNullOrWhiteSpace(req.Estado))
                return BadRequest(new { success = false, message = "Estado requerido." });
            try
            {
                var result = await _svc.P_ActualizarEstadoEventoAsync(id, req.Estado, UsuarioClaim, ct);
                return Ok(new { success = result.Success, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ActualizarEstadoEvento error id={Id}", id);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        /// <summary>
        /// Cierra un evento con uno o más códigos de cierre.
        /// El primer código de la lista se usa como código primario.
        /// </summary>
        [HttpPost("evento/cerrar")]
        public async Task<IActionResult> CerrarEvento(
            [FromBody] DtoCierreEventoRequest req, CancellationToken ct)
        {
            if (req is null || req.EventoId <= 0)
                return BadRequest(new { success = false, message = "EventoId requerido." });
            if (req.CodigosCierre is null || req.CodigosCierre.Count == 0)
                return BadRequest(new { success = false, message = "Debe proporcionar al menos un código de cierre." });
            try
            {
                var result = await _svc.P_CerrarEventoAsync(req, UsuarioClaim, UsuarioIdClaim, MaquinaClaim, ct);
                return Ok(new { success = result.Success, message = result.Message, eventoId = result.EventoId });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "CerrarEvento error eventoId={Id}", req.EventoId);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // EXTERNAL INTEGRATION
        // POST api/Recepcion/integracion/evento
        // Usado por apps móviles, sistemas externos, SIEDCO, etc.
        // ════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// Crea un evento directamente desde un sistema externo (app móvil, API).
        /// El evento queda en estado Pendiente para que el despachador lo atienda.
        /// </summary>
        [HttpPost("integracion/evento")]
        public async Task<IActionResult> CrearEventoIntegracion(
            [FromBody] DtoEventoIntegracionRequest req, CancellationToken ct)
        {
            if (req is null)
                return BadRequest(new { success = false, message = "Datos requeridos." });
            try
            {
                var result = await _svc.P_CrearEventoIntegracionAsync(req, UsuarioClaim, ct);
                if (!result.Success)
                    return BadRequest(new { success = false, message = result.Message });
                return Ok(new
                {
                    success  = true,
                    message  = result.Message,
                    eventoId = result.EventoId,
                    pedidoId = result.PedidoId
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "CrearEventoIntegracion error");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    

        // ════════════════════════════════════════════════════════════════════════
        // REMISIÓN A CANAL SECAD  §6.11 / §6.1
        // POST api/Recepcion/remitir-canal
        // ════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// Remite un pedido/evento a uno o más canales SECAD adicionales.
        /// Inserta filas en cad_pedidos_canales → los operadores de esos canales
        /// ven el evento en su cola del módulo Eventos.
        /// </summary>
        [HttpPost("remitir-canal")]
        public async Task<IActionResult> RemitirCanal(
            [FromBody] DtoRemitirCanalRequest req, CancellationToken ct)
        {
            if (req is null || req.Canales is null || req.Canales.Count == 0)
                return BadRequest(new { success = false, message = "Debe seleccionar al menos un canal." });

            try
            {
                var (success, message, agregados) =
                    await _svc.RemitirCanalAsync(req, UsuarioClaim, ct);

                return Ok(new { success, message, canalesAgregados = agregados });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "RemitirCanal error");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // DUPLICATE / NEARBY-CALL DETECTION  §6.8
        // GET api/Recepcion/pedidos-cercanos
        //   ?lat=4.7110&lng=-74.0721&radioMetros=300&minutosAtras=20&codCaso=120
        //
        // Consulta cad_pedidos (no cad_eventos) porque es donde se almacena la
        // georreferenciación y los códigos de caso del formulario de recepción.
        // ════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// Busca en cad_pedidos llamadas activas cerca de las coordenadas dadas,
        /// creadas en los últimos N minutos.
        /// Usado en Recepción para alertar al operador sobre posibles duplicados.
        /// </summary>
        [HttpGet("pedidos-cercanos")]
        public async Task<IActionResult> GetPedidosCercanos(
            [FromQuery] double  lat,
            [FromQuery] double  lng,
            [FromQuery] int     radioMetros  = 300,
            [FromQuery] int     minutosAtras = 20,
            [FromQuery] string? codCaso      = null,
            CancellationToken ct             = default)
        {
            try
            {
                if (lat == 0 && lng == 0)
                    return Ok(new { success = true, data = Array.Empty<object>() });

                var items = await _svc.G_GetPedidosCercanosAsync(
                    lat, lng, radioMetros, minutosAtras, codCaso, ct);

                return Ok(new { success = true, data = items });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetPedidosCercanos error");
                return StatusCode(500, new { success = false, data = Array.Empty<object>(), message = ex.Message });
            }
        }
    }

    // ── Lightweight request bodies ────────────────────────────────────────────
    public record BusquedaCasoRequest(string? Busqueda);
    public record CodigoCasoRequest(string? Codigo);
    public record ActualizarEstadoRequest(string? Estado);
}
