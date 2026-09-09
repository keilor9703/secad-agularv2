using Comun.Dtos.Agencias;
using Comun.Dtos.Integraciones;
using Datos.Interfaz;
using Datos.Tenant;
using Comun.Snowflake;
using Negocio.Interfaz;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

namespace Api.Controllers.Operacion
{
    /// <summary>
    /// Recibe actualizaciones de estado de casos desde agencias externas vía PIP.
    ///
    /// Flujo:
    ///   Agencia externa → PIP → POST /api/ActualizacionExterna/{casoId}
    ///
    /// Autenticación: X-Api-Key — misma clave de RecepcionExterna:ApiKey.
    ///   El equipo de PIP configura esta clave en su portal de integración.
    /// Tenant:        X-Cod-Dane — código DANE del CAD SECAD destino.
    ///
    /// La URL completa es la callbackUrl enviada en el payload de despacho saliente:
    ///   "_secad.callbackUrl": "https://secad.../api/ActualizacionExterna/{casoId}"
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    public class ActualizacionExternaController : ControllerBase
    {
        private readonly IDbActuacionService                     _svc;
        private readonly ISnowflakeGenerator                     _snowflake;
        private readonly ILogger<ActualizacionExternaController> _logger;
        private readonly ApiKeyContext                           _llave;
        private readonly TenantContext                           _tenant;
        private readonly IDbApiKeyRepository                     _apiKeyRepo;
        private readonly string                                  _apiKeyGlobal;

        public ActualizacionExternaController(
            IDbActuacionService                     svc,
            ISnowflakeGenerator                     snowflake,
            ApiKeyContext                           llave,
            TenantContext                           tenant,
            IDbApiKeyRepository                     apiKeyRepo,
            ILogger<ActualizacionExternaController> logger,
            IConfiguration                          configuration)
        {
            _svc         = svc;
            _snowflake   = snowflake;
            _llave       = llave;
            _tenant      = tenant;
            _apiKeyRepo  = apiKeyRepo;
            _logger      = logger;
            // Respaldo mientras queden integraciones con la clave global.
            _apiKeyGlobal = configuration["RecepcionExterna:ApiKey"] ?? "";
        }

        /// <summary>
        /// La llave de la petición debe existir y alcanzar para actualizar casos.
        /// Con una llave propia del CAD, el tenant ya lo resolvió el middleware a
        /// partir de ella y no del ?codDane= de la URL.
        /// </summary>
        private IActionResult? ValidarLlave()
        {
            if (_llave.Resuelta)
            {
                if (!_llave.Cubre(AlcanceApiKey.Actualizacion))
                    return StatusCode(403, new
                    {
                        success = false,
                        message = $"Esta llave tiene alcance {_llave.Llave!.Alcance} y este endpoint exige {AlcanceApiKey.Actualizacion}."
                    });

                _ = _apiKeyRepo.RegistrarUsoAsync(
                    _llave.Llave!.Id,
                    HttpContext.Connection.RemoteIpAddress?.ToString(),
                    CancellationToken.None);
                return null;
            }

            if (string.IsNullOrWhiteSpace(_apiKeyGlobal))
                return Unauthorized(new { success = false, message = "API key inválida." });

            var presentada = Request.Headers["X-Api-Key"].FirstOrDefault() ?? "";
            if (!string.Equals(presentada, _apiKeyGlobal, StringComparison.Ordinal))
                return Unauthorized(new { success = false, message = "API key inválida." });

            if (!_tenant.IsInitialized)
                return StatusCode(403, new
                {
                    success = false,
                    message = "No se pudo determinar el CAD destino. Use una llave emitida en Hub de Integraciones."
                });

            _logger.LogWarning(
                "Actualización externa autenticada con la clave GLOBAL de appsettings (cod_dane={Dane}). " +
                "Emita una llave propia del CAD con alcance ACTUALIZACION.", _tenant.CodDane);
            return null;
        }

        private string IpCliente =>
            HttpContext.Connection.RemoteIpAddress?.ToString() ?? "desconocido";

        // ── POST /api/ActualizacionExterna/{casoId} ───────────────────────────────
        /// <summary>
        /// La agencia externa (vía PIP) reporta un cambio de estado en su intervención.
        ///
        /// Headers:
        ///   X-Api-Key  — clave compartida con PIP
        ///   X-Cod-Dane — código DANE del CAD SECAD
        ///
        /// Body de ejemplo:
        /// {
        ///   "actuacionId":           "9876543210987654321",
        ///   "fuerzaId":              65920007,
        ///   "agenciaNombre":         "Bomberos Bogotá",
        ///   "referenciaCasoExterno": "BMB-2025-00456",
        ///   "estado":                "A",
        ///   "fechaDespacho":         "2025-11-15T14:35:00-05:00",
        ///   "fechaLlegada":          "2025-11-15T14:42:00-05:00",
        ///   "unidad":                "C-12",
        ///   "placa":                 "ABC123",
        ///   "nota":                  "Unidad en sitio, incendio controlado al 60%"
        /// }
        /// </summary>
        [HttpPost("{casoId}")]
        public async Task<IActionResult> RecibirActualizacion(
            [FromRoute] string casoId,
            [FromBody]  DtoActualizacionExternaRequest req,
            CancellationToken ct)
        {
            // ── 1. Autenticación (igual que RecepcionExternaController) ──────────
            var keyError = ValidarLlave();
            if (keyError is not null) return keyError;

            // ── 2. Validaciones básicas ──────────────────────────────────────────
            if (!long.TryParse(casoId, out var casoIdLong))
                return BadRequest(new { success = false,
                    message = "casoId debe ser el ID numérico Snowflake del caso SECAD." });

            if (req is null)
                return BadRequest(new { success = false, message = "Payload requerido." });

            if (string.IsNullOrWhiteSpace(req.ActuacionId) && !req.FuerzaId.HasValue)
                return BadRequest(new { success = false,
                    message = "Proporcione ActuacionId o FuerzaId para identificar la actuación." });

            var estadosValidos = new[] { "D", "A", "C", "V" };
            if (!string.IsNullOrWhiteSpace(req.Estado) &&
                !estadosValidos.Contains(req.Estado.ToUpperInvariant()))
                return BadRequest(new { success = false,
                    message = "Estado inválido. Valores: D=Despachada A=Atendida C=Cerrada V=Anulada." });

            // ── 3. Auditoría previa (antes de procesar, igual que RecepcionExterna) ─
            var auditoriaId = _snowflake.NextId();
            await _svc.SaveAuditoriaActualizacionAsync(new DtoAuditoriaActualizacionExterna
            {
                Id              = auditoriaId,
                CasoId          = casoIdLong,
                AgenciaNombre   = req.AgenciaNombre,
                EstadoReportado = req.Estado?.ToUpperInvariant(),
                PayloadCrudo    = JsonSerializer.Serialize(req),
                IpOrigen        = IpCliente
            }, ct);

            // ── 4. Procesar actualización ────────────────────────────────────────
            try
            {
                var resultado = await _svc.P_ActualizarDesdeExternoAsync(
                    casoIdLong, req, auditoriaId, IpCliente, ct);

                if (!resultado.Success)
                {
                    await _svc.UpdateAuditoriaActualizacionErrorAsync(
                        auditoriaId, resultado.Message, ct);
                    return UnprocessableEntity(new
                    {
                        success = false, message = resultado.Message, casoId
                    });
                }

                await _svc.UpdateAuditoriaActualizacionOkAsync(
                    auditoriaId,
                    long.Parse(resultado.ActuacionId!),
                    resultado.Estado ?? "",
                    ct);

                return Ok(new
                {
                    success     = true,
                    message     = resultado.Message,
                    casoId      = resultado.CasoId,
                    actuacionId = resultado.ActuacionId,
                    estado      = resultado.Estado
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex,
                    "[ActualizacionExterna] Error caso={Caso} agencia={Agencia}",
                    casoId, req.AgenciaNombre);
                await _svc.UpdateAuditoriaActualizacionErrorAsync(
                    auditoriaId, ex.Message, ct);
                return StatusCode(500, new { success = false,
                    message = "Error interno al procesar la actualización." });
            }
        }
    }
}
