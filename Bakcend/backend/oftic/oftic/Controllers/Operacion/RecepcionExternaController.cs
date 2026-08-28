using Comun.Dtos.Recepcion;
using Comun.Snowflake;
using Datos.Interfaz;
using Datos.Tenant;
using Microsoft.AspNetCore.Mvc;
using Negocio.Interfaz;
using System.Text.Json;
using System.Linq;

namespace Api.Controllers.Operacion
{
    /// <summary>
    /// API REST para sistemas externos que envían recepciones por Chat o SMS.
    /// Autenticación: cabecera X-Api-Key (configurada en RecepcionExterna:ApiKey).
    /// Tenant: cabecera X-Cod-Dane (código DANE del CAD destino).
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    public class RecepcionExternaController : ControllerBase
    {
        private readonly IDbRecepcionService           _recepcionSvc;
        private readonly IDbAdjuntoRepository          _adjuntoRepo;
        private readonly ISnowflakeGenerator           _snowflake;
        private readonly ILogger<RecepcionExternaController> _logger;
        private readonly string                        _apiKey;

        public RecepcionExternaController(
            IDbRecepcionService           recepcionSvc,
            IDbAdjuntoRepository          adjuntoRepo,
            ISnowflakeGenerator           snowflake,
            ILogger<RecepcionExternaController> logger,
            IConfiguration                configuration)
        {
            _recepcionSvc = recepcionSvc;
            _adjuntoRepo  = adjuntoRepo;
            _snowflake    = snowflake;
            _logger       = logger;
            _apiKey       = configuration["RecepcionExterna:ApiKey"] ?? "";
        }

        // ── Helpers ──────────────────────────────────────────────────────────────

        private IActionResult? ValidarApiKey()
        {
            if (string.IsNullOrWhiteSpace(_apiKey))
                return StatusCode(503, new { success = false, message = "Integración externa no configurada." });

            var headerKey = Request.Headers["X-Api-Key"].FirstOrDefault() ?? "";
            if (!string.Equals(headerKey, _apiKey, StringComparison.Ordinal))
                return Unauthorized(new { success = false, message = "API key inválida." });

            return null;
        }

        private string IpCliente =>
            HttpContext.Connection.RemoteIpAddress?.ToString() ?? "desconocido";

        // ── POST api/RecepcionExterna/chat ────────────────────────────────────────
        /// <summary>
        /// Recibe un mensaje de chat (WhatsApp, Telegram, etc.) y crea un pedido.
        /// El sistema externo debe enviar la cabecera X-Cod-Dane con el código DANE del CAD.
        /// </summary>
        [HttpPost("chat")]
        public async Task<IActionResult> RecibirChat(
    [FromBody] DtoChatRecepcionRequest req,
    CancellationToken ct)
        {
            var keyError = ValidarApiKey();
            if (keyError is not null) return keyError;

            if (req is null || req.SitioGraba <= 0)                       // ✅ validación correcta
                return BadRequest(new { success = false, message = "SitioGraba requerido." });

            var auditoriaId = _snowflake.NextId();
            var payloadJson = JsonSerializer.Serialize(req);

            await _adjuntoRepo.SaveAuditoriaAsync(new DtoAuditoriaRecepcionExterna
            {
                Id = auditoriaId,
                Canal = "CHAT",
                PayloadCrudo = payloadJson,
                Procesado = false,
                IpOrigen = IpCliente
            }, ct);

            try
            {
                var pedidoId = _snowflake.NextId();
                var ahora = DateTime.Now.ToString("dd/MM/yyyy HH:mm:ss");

                var dto = new DtoRecepcion
                {
                    SITIO_GRABA = req.SitioGraba,
                    NUME_LLAMADA = pedidoId,
                    HORA_CASO = ahora,
                    NUME_TELEFONO = long.TryParse(
                                              req.ContactoId.Replace("+", "").Replace(" ", ""),
                                              out var tel) ? tel : 0,
                    PROP_TELEFONO = "",
                    NOMB_LLAMANTE = req.NombreReportante,
                    DIRE_LLAMANTE = "",
                    TIPO_PEDIDO = "",
                    CALI_PEDIDO = req.CaliPedido,
                    BARRIO = req.Barrio,
                    CIUDAD = req.Ciudad,
                    DIRE_CASO = req.DireccionCaso,
                    LATITUD_CASO = req.LatitudCaso ?? "",
                    LONGITUD_CASO = req.LongitudCaso ?? "",
                    COMENTARIO = $"[CHAT] {req.Mensaje}\n{req.Comentario}".Trim(),
                    CODI_PEDIDO = req.CodigoCaso,
                    IMPORTANCIA = "01",
                    PRIORIDAD = "01",
                    ESTADO = "A",
                    ENVIAR = req.Canales.Count > 0 ? "S" : "N",
                    Origen = "CHAT",
                    CANALES_SELECCIONADOS = req.Canales,    // ✅ ya es List<DtoCanalSeleccionado>
                    CANAL_FUERZA = null
                };

                var result = await _recepcionSvc.P_GuardarLlamadaAsync(
                    dto, canalFuerza: 0, usuario: "API_CHAT", idEmpleado: 0, ct);

                if (result.Success)
                {
                    await _adjuntoRepo.UpdateAuditoriaProcesadaAsync(auditoriaId, pedidoId, ct);
                    return Ok(new DtoRecepcionExternaResult
                    {
                        Success = true,
                        Message = "Recepción de chat procesada correctamente.",
                        PedidoId = pedidoId,
                        EventoId = result.EventoId ?? 0,
                        Canal = "CHAT"
                    });
                }

                await _adjuntoRepo.UpdateAuditoriaErrorAsync(auditoriaId, result.Message, ct);
                return UnprocessableEntity(new DtoRecepcionExternaResult
                {
                    Success = false,
                    Message = result.Message,
                    Canal = "CHAT"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "RecibirChat error sitioGraba={Sg}", req.SitioGraba);
                await _adjuntoRepo.UpdateAuditoriaErrorAsync(auditoriaId, ex.Message, ct);
                return StatusCode(500, new { success = false, message = "Error interno procesando el chat." });
            }
        }

        // ── POST api/RecepcionExterna/sms ─────────────────────────────────────────
        /// <summary>
        /// Recibe un SMS y crea un pedido de recepción.
        /// </summary>
        [HttpPost("sms")]
        public async Task<IActionResult> RecibirSms(
            [FromBody] DtoSmsRecepcionRequest req,
            CancellationToken ct)
        {
            var keyError = ValidarApiKey();
            if (keyError is not null) return keyError;

            if (req is null)
                return BadRequest(new { success = false, message = "Payload requerido." });

            var auditoriaId = _snowflake.NextId();
            var payloadJson = JsonSerializer.Serialize(req);

            await _adjuntoRepo.SaveAuditoriaAsync(new DtoAuditoriaRecepcionExterna
            {
                Id           = auditoriaId,
                Canal        = "SMS",
                PayloadCrudo = payloadJson,
                Procesado    = false,
                IpOrigen     = IpCliente
            }, ct);

            try
            {
                var pedidoId = _snowflake.NextId();
                var ahora    = DateTime.Now.ToString("dd/MM/yyyy HH:mm:ss");

                var dto = new DtoRecepcion
                {
                    SITIO_GRABA     = req.SitioGraba,
                    NUME_LLAMADA    = pedidoId,
                    HORA_CASO       = ahora,
                    NUME_TELEFONO   = long.TryParse(req.NumeroCelular.Replace("+","").Replace(" ",""), out var cel) ? cel : 0,
                    PROP_TELEFONO   = "",
                    NOMB_LLAMANTE   = req.NombreReportante,
                    DIRE_LLAMANTE   = "",
                    TIPO_PEDIDO     = "",
                    CALI_PEDIDO     = req.CaliPedido,
                    BARRIO          = req.Barrio,
                    CIUDAD          = req.Ciudad,
                    DIRE_CASO       = req.DireccionCaso,
                    LATITUD_CASO    = req.LatitudCaso ?? "",
                    LONGITUD_CASO   = req.LongitudCaso ?? "",
                    COMENTARIO      = $"[SMS] {req.MensajeSms}".Trim(),
                    CODI_PEDIDO     = req.CodigoCaso,
                    IMPORTANCIA     = "01",
                    PRIORIDAD       = "01",
                    ESTADO          = "A",
                    ENVIAR          = (req.Canales?.Count ?? 0) > 0 ? "S" : "N",
                    Origen          = "SMS",
                    CANALES_SELECCIONADOS = req.Canales,    // ✅ ya es List<DtoCanalSeleccionado>
                    CANAL_FUERZA    = null
                };

                var result = await _recepcionSvc.P_GuardarLlamadaAsync(
                    dto, canalFuerza: 0, usuario: "API_SMS", idEmpleado: 0, ct);

                if (result.Success)
                {
                    await _adjuntoRepo.UpdateAuditoriaProcesadaAsync(auditoriaId, pedidoId, ct);
                    return Ok(new DtoRecepcionExternaResult
                    {
                        Success  = true,
                        Message  = "Recepción de SMS procesada correctamente.",
                        PedidoId = pedidoId,
                        EventoId = result.EventoId ?? 0,
                        Canal    = "SMS"
                    });
                }

                await _adjuntoRepo.UpdateAuditoriaErrorAsync(auditoriaId, result.Message, ct);
                return UnprocessableEntity(new DtoRecepcionExternaResult
                {
                    Success = false,
                    Message = result.Message,
                    Canal   = "SMS"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "RecibirSms error sitioGraba={Sg}", req.SitioGraba);
                await _adjuntoRepo.UpdateAuditoriaErrorAsync(auditoriaId, ex.Message, ct);
                return StatusCode(500, new { success = false, message = "Error interno procesando el SMS." });
            }
        }

        // ── POST api/RecepcionExterna/plantatel ───────────────────────────────────
        /// <summary>
        /// Recibe el evento de una llamada entrante desde la centralita telefónica (PBX)
        /// y lo registra en cad_plantatel. El operador ya lo recibe vía el polling
        /// existente (GET api/Recepcion/llamada), sin cambios en ese flujo.
        /// </summary>
        [HttpPost("plantatel")]
        public async Task<IActionResult> RecibirLlamadaPlantaTel(
            [FromBody] DtoPlantaTelEntrada dto,
            CancellationToken ct)
        {
            var keyError = ValidarApiKey();
            if (keyError is not null) return keyError;

            if (dto is null || dto.SitioGraba <= 0)
                return BadRequest(new { success = false, message = "SitioGraba requerido." });

            if (!int.TryParse(dto.Acd, out var acd) || acd <= 0)
                return BadRequest(new { success = false, message = "Acd inválido." });

            var telefonoLimpio = (dto.NumTelefono ?? "").Replace("+", "").Replace(" ", "");
            if (!long.TryParse(telefonoLimpio, out var numeTelefono) || numeTelefono <= 0)
                return BadRequest(new { success = false, message = "NumTelefono inválido." });

            try
            {
                var result = await _recepcionSvc.P_RegistrarLlamadaPlantaTelAsync(
                    dto.SitioGraba, acd, numeTelefono, ct);

                if (!result.Success)
                    return UnprocessableEntity(new { success = false, message = result.Message });

                return Ok(new { success = true, message = result.Message, id = result.Id.ToString() });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "RecibirLlamadaPlantaTel error sitioGraba={Sg} acd={Acd}", dto.SitioGraba, dto.Acd);
                return StatusCode(500, new { success = false, message = "Error interno registrando la llamada PlantaTel." });
            }
        }
    }
}
