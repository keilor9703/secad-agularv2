using Comun.Dtos.Actuaciones;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Negocio.Interfaz;
using System.Security.Claims;

namespace Api.Controllers.Operacion
{
    /// <summary>
    /// Gestión del ciclo de vida de actuaciones por agencia/canal dentro de un evento.
    ///
    /// Un evento puede tener N actuaciones (una por agencia despachada):
    ///   Policía, Salud, Bomberos, Ejército, etc.
    /// Cada actuación tiene su propio estado (P/D/A/C/V), sus propios timestamps
    /// y sus propios códigos de cierre, independiente de las demás del mismo evento.
    ///
    /// Base URL: api/Actuaciones
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class ActuacionesController : ControllerBase
    {
        private readonly IDbActuacionService             _svc;
        private readonly ILogger<ActuacionesController>  _logger;

        public ActuacionesController(
            IDbActuacionService svc,
            ILogger<ActuacionesController> logger)
        {
            _svc    = svc;
            _logger = logger;
        }

        // ── Claims helpers ───────────────────────────────────────────────────────
        private string UsuarioClaim => User.FindFirstValue(ClaimTypes.Name)
                                    ?? User.FindFirstValue("unique_name") ?? "sistema";

        // Canal/fuerza de la sesión (JWT) — identifica QUÉ canal está gestionando.
        // En un evento multi-canal, cada canal solo puede tocar los recursos que
        // él mismo despachó; ver VerificarCanalPropietarioAsync en el repositorio.
        private int CanalIdClaim  => GetIntClaim("canal_id");
        private int FuerzaIdClaim => GetIntClaim("fuerza_id");

        private int GetIntClaim(string claimType)
        {
            var raw = User.FindFirstValue(claimType);
            return int.TryParse(raw, out var val) ? val : 0;
        }

        // ════════════════════════════════════════════════════════════════════════
        // CONSULTAS
        // ════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// Lista todas las actuaciones de un evento (una fila por agencia).
        /// Incluye estado, unidad principal y conteos de notas/unidades.
        /// Útil para el panel de despacho multi-agencia.
        /// </summary>
        /// <remarks>
        /// GET api/Actuaciones/evento/{eventoId}
        /// </remarks>
        [HttpGet("evento/{eventoId:long}")]
        public async Task<IActionResult> GetActuacionesEvento(
            long eventoId, CancellationToken ct)
        {
            try
            {
                var data = await _svc.G_GetActuacionesEventoAsync(eventoId, ct);
                return Ok(new { success = true, data });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetActuacionesEvento error eventoId={Id}", eventoId);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        /// <summary>
        /// Detalle completo de una actuación: datos base, códigos de cierre,
        /// unidades despachadas y notas de campo.
        /// </summary>
        /// <remarks>
        /// GET api/Actuaciones/{id}
        /// </remarks>
        [HttpGet("{id:long}")]
        public async Task<IActionResult> GetActuacion(long id, CancellationToken ct)
        {
            try
            {
                var data = await _svc.G_GetActuacionAsync(id, ct);
                if (data is null)
                    return NotFound(new { success = false, message = $"Actuación {id} no encontrada." });
                return Ok(new { success = true, data });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetActuacion error id={Id}", id);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // CREACIÓN
        // ════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// Crea una actuación en estado P (Pendiente/Asignado) — primer paso del
        /// flujo de despacho.  Si se proporciona MedioId, el medio queda vinculado
        /// al evento con evento_id y actuacion_id.
        /// </summary>
        /// <remarks>
        /// POST api/Actuaciones
        /// Body: { "eventoId": 123, "fuerzaId": 1, "canalCodigo": 5,
        ///         "unidadAsignada": "PAT-01", "medioId": 1234567890 }
        /// </remarks>
        [HttpPost]
        public async Task<IActionResult> CrearActuacion(
            [FromBody] DtoCrearActuacionRequest req,
            CancellationToken ct)
        {
            if (req is null || req.EventoId <= 0)
                return BadRequest(new { success = false, message = "EventoId es obligatorio." });
            try
            {
                var result = await _svc.P_CrearActuacionAsync(req, UsuarioClaim, ct);
                return result.Success
                    ? Ok(new { success = true, message = result.Message,
                               actuacionId = result.ActuacionId.ToString() })
                    : BadRequest(new { success = false, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "CrearActuacion error eventoId={Id}", req?.EventoId);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // CICLO OPERATIVO
        // ════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// Avanza el estado operativo de la actuación:
        ///   D = Despachada (unidad en camino) — registra fecha_despacho
        ///   A = Atendida   (unidad en sitio)  — registra fecha_llegada
        ///
        /// Opcionalmente actualiza la unidad/placa si se envían en el body.
        /// No cierra la actuación; para cerrar usar POST /{id}/cerrar.
        /// </summary>
        /// <remarks>
        /// PUT api/Actuaciones/{id}/estado
        /// Body: { "estado": "D", "unidadAsignada": "PAT-01", "placaUnidad": "ABC123" }
        /// </remarks>
        [HttpPut("{id:long}/estado")]
        public async Task<IActionResult> ActualizarEstado(
            long id,
            [FromBody] DtoActualizarEstadoActuacionRequest req,
            CancellationToken ct)
        {
            if (req is null || string.IsNullOrWhiteSpace(req.Estado))
                return BadRequest(new { success = false, message = "Estado requerido (D o A)." });
            try
            {
                var result = await _svc.P_ActualizarEstadoActuacionAsync(id, req, CanalIdClaim, FuerzaIdClaim, UsuarioClaim, ct);
                return result.Success
                    ? Ok(new { success = true, message = result.Message })
                    : BadRequest(new { success = false, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ActualizarEstado error id={Id}", id);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        /// <summary>
        /// Cierra la actuación de esta agencia con uno o más códigos de cierre.
        ///   C = Cerrada (finalizada correctamente)
        ///   V = Anulada (no fue necesaria, duplicada, error)
        ///
        /// Tras el cierre, el sistema recalcula automáticamente el estado global
        /// del evento usando fn_recalcular_estado_evento.
        /// </summary>
        /// <remarks>
        /// POST api/Actuaciones/{id}/cerrar
        /// Body: { "estado": "C", "codigosCierre": [{ "orden": 1, "codigoCierre": "333" }] }
        /// </remarks>
        [HttpPost("{id:long}/cerrar")]
        public async Task<IActionResult> CerrarActuacion(
            long id,
            [FromBody] DtoCierreActuacionRequest req,
            CancellationToken ct)
        {
            if (req is null)
                return BadRequest(new { success = false, message = "Datos requeridos." });
            if (req.CodigosCierre is null || req.CodigosCierre.Count == 0)
                return BadRequest(new { success = false, message = "Debe proporcionar al menos un código de cierre." });

            req.ActuacionId = id;  // asegurar que el id del route prevalece
            try
            {
                var result = await _svc.P_CerrarActuacionAsync(req, CanalIdClaim, FuerzaIdClaim, UsuarioClaim, ct);
                return result.Success
                    ? Ok(new { success = true, message = result.Message, actuacionId = id })
                    : BadRequest(new { success = false, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "CerrarActuacion error id={Id}", id);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // SUB-REGISTROS
        // ════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// Agrega una nota de campo a la actuación.
        /// Usar para registrar novedades, alertas o información relevante
        /// durante la atención del incidente por esta agencia.
        /// </summary>
        /// <remarks>
        /// POST api/Actuaciones/{id}/notas
        /// Body: { "nota": "Texto", "tipoNota": "NOVEDAD" }
        /// tipoNota: GENERAL | NOVEDAD | ALERTA | CIERRE
        /// </remarks>
        [HttpPost("{id:long}/notas")]
        public async Task<IActionResult> AgregarNota(
            long id,
            [FromBody] DtoAgregarNotaActuacionRequest req,
            CancellationToken ct)
        {
            if (req is null || string.IsNullOrWhiteSpace(req.Nota))
                return BadRequest(new { success = false, message = "El texto de la nota es obligatorio." });
            try
            {
                var result = await _svc.P_AgregarNotaActuacionAsync(id, req, CanalIdClaim, FuerzaIdClaim, UsuarioClaim, ct);
                return result.Success
                    ? Ok(new { success = true, message = result.Message, id = result.SubId })
                    : BadRequest(new { success = false, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "AgregarNota error id={Id}", id);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        /// <summary>
        /// Cancela/desasigna el recurso de una actuación. En estado P (aún no salió
        /// en ruta) el motivo es opcional. En D (en ruta) o A (en sitio) el motivo
        /// es OBLIGATORIO — el repositorio lo valida y rechaza la solicitud si viene
        /// vacío. Siempre anula la actuación (estado → V), libera el medio
        /// (estado → 27 Libre) y recalcula el estado global del evento.
        /// </summary>
        /// <remarks>
        /// POST api/Actuaciones/{id}/desasignar
        /// Body: { "motivo": "Unidad redirigida a caso de mayor prioridad" }
        /// </remarks>
        [HttpPost("{id:long}/desasignar")]
        public async Task<IActionResult> DesasignarActuacion(
            long id,
            [FromBody] DtoDesasignarActuacionRequest? req,
            CancellationToken ct)
        {
            try
            {
                var result = await _svc.P_DesasignarActuacionAsync(id, req?.Motivo?.Trim(), CanalIdClaim, FuerzaIdClaim, UsuarioClaim, ct);
                return result.Success
                    ? Ok(new { success = true, message = result.Message, actuacionId = id })
                    : BadRequest(new { success = false, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "DesasignarActuacion error id={Id}", id);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // SOLICITUD DE APOYO URGENTE (seguridad del funcionario)
        // ════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// Marca una solicitud de apoyo urgente activa sobre el recurso de esta
        /// actuación (código de auxilio). Queda visible en el timeline de despacho
        /// con prioridad sobre cualquier otra actuación del evento hasta que se
        /// marque como atendida.
        /// </summary>
        /// <remarks>POST api/Actuaciones/{id}/apoyo/solicitar</remarks>
        [HttpPost("{id:long}/apoyo/solicitar")]
        public async Task<IActionResult> SolicitarApoyo(long id, CancellationToken ct)
        {
            try
            {
                var result = await _svc.P_SolicitarApoyoActuacionAsync(id, CanalIdClaim, FuerzaIdClaim, UsuarioClaim, ct);
                return result.Success
                    ? Ok(new { success = true, message = result.Message })
                    : BadRequest(new { success = false, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "SolicitarApoyo error id={Id}", id);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        /// <summary>Marca como atendida una solicitud de apoyo urgente activa.</summary>
        /// <remarks>POST api/Actuaciones/{id}/apoyo/atender</remarks>
        [HttpPost("{id:long}/apoyo/atender")]
        public async Task<IActionResult> AtenderApoyo(long id, CancellationToken ct)
        {
            try
            {
                var result = await _svc.P_AtenderApoyoActuacionAsync(id, CanalIdClaim, FuerzaIdClaim, UsuarioClaim, ct);
                return result.Success
                    ? Ok(new { success = true, message = result.Message })
                    : BadRequest(new { success = false, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "AtenderApoyo error id={Id}", id);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // CATÁLOGOS
        // ════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// Retorna el catálogo de actividades policiales.
        /// Usar al abrir el modal de cierre para mostrar la clasificación de la actuación.
        /// </summary>
        /// <remarks>
        /// GET api/Actuaciones/actividades-policiales?tipo=O
        /// tipo: O=Operativa, P=Preventiva, omitir para todas.
        /// </remarks>
        [HttpGet("actividades-policiales")]
        public async Task<IActionResult> GetActividadesPoliciales(
            [FromQuery] string? tipo, CancellationToken ct)
        {
            try
            {
                var data = await _svc.G_GetActividadesPolicialesAsync(tipo, ct);
                return Ok(new { success = true, data });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetActividadesPoliciales error tipo={Tipo}", tipo);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        /// <summary>
        /// Búsqueda de delitos del Código Penal Colombiano (Ley 599/2000).
        /// Retorna hasta 10 coincidencias por artículo, descripción o bien jurídico.
        /// </summary>
        /// <remarks>
        /// GET api/Actuaciones/delitos?q=hurto
        /// </remarks>
        [HttpGet("delitos")]
        public async Task<IActionResult> BuscarDelitos(
            [FromQuery] string? q, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(q))
                return Ok(new { success = true, data = Array.Empty<object>() });
            try
            {
                var data = await _svc.G_BuscarDelitosAsync(q, 10, ct);
                return Ok(new { success = true, data });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "BuscarDelitos error q={Q}", q);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        /// <summary>
        /// Búsqueda de códigos de tipificación/cierre en cad_casos.
        /// Misma tabla que el módulo de Recepción; retorna hasta 10 coincidencias.
        /// Usar para el autocomplete de códigos en los modales de cierre.
        /// </summary>
        /// <remarks>
        /// GET api/Actuaciones/codigos-cierre?q=333
        /// </remarks>
        [HttpGet("codigos-cierre")]
        public async Task<IActionResult> BuscarCodigosCierre(
            [FromQuery] string? q, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(q))
                return Ok(new { success = true, data = Array.Empty<object>() });
            try
            {
                var data = await _svc.G_BuscarCodigosCierreAsync(q, 10, ct);
                return Ok(new { success = true, data });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "BuscarCodigosCierre error q={Q}", q);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        /// <summary>
        /// Registra una unidad adicional en la actuación.
        /// Usar cuando la agencia despacha más de un recurso al mismo incidente
        /// (ej: 2 patrullas + 1 moto de la misma jurisdicción).
        /// </summary>
        /// <remarks>
        /// POST api/Actuaciones/{id}/unidades
        /// Body: { "unidadCodigo": "PAT-02", "placa": "XYZ456", "tipoUnidad": "PATRULLA" }
        /// </remarks>
        [HttpPost("{id:long}/unidades")]
        public async Task<IActionResult> AgregarUnidad(
            long id,
            [FromBody] DtoAgregarUnidadActuacionRequest req,
            CancellationToken ct)
        {
            if (req is null || string.IsNullOrWhiteSpace(req.UnidadCodigo))
                return BadRequest(new { success = false, message = "El código de unidad es obligatorio." });
            try
            {
                var result = await _svc.P_AgregarUnidadActuacionAsync(id, req, CanalIdClaim, FuerzaIdClaim, UsuarioClaim, ct);
                return result.Success
                    ? Ok(new { success = true, message = result.Message, id = result.SubId })
                    : BadRequest(new { success = false, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "AgregarUnidad error id={Id}", id);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }
}
