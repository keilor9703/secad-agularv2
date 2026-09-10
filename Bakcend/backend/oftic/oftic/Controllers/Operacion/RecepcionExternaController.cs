using Comun.Dtos.Recepcion;
using Comun.Snowflake;
using Datos.Interfaz;
using Comun.Dtos.Integraciones;
using Datos.Tenant;
using Microsoft.AspNetCore.Mvc;
using Negocio.Interfaz;
using System.Text.Json;
using System.Linq;

namespace Api.Controllers.Operacion
{
    /// <summary>
    /// API REST para sistemas externos: chat, SMS y planta telefónica.
    ///
    /// Autenticación: cabecera <c>X-Api-Key</c> con una llave emitida en
    /// Administración → Hub de Integraciones. La llave pertenece a UN CAD, así
    /// que además de autenticar resuelve el tenant: por eso ya no hace falta
    /// —ni se acepta— que el llamante diga a qué CAD escribe.
    ///
    /// Hasta V73 la clave era una sola para todo el país y el CAD lo decidía la
    /// cabecera X-Cod-Dane: quien tuviera esa clave escribía en el CAD que
    /// quisiera cambiando una cabecera. La clave global sigue admitiéndose
    /// mientras queden integraciones sin migrar, pero deja aviso en el log.
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    public class RecepcionExternaController : ControllerBase
    {
        private readonly IDbRecepcionService           _recepcionSvc;
        private readonly IDbAdjuntoRepository          _adjuntoRepo;
        private readonly ISnowflakeGenerator           _snowflake;
        private readonly ILogger<RecepcionExternaController> _logger;
        private readonly ApiKeyContext                 _llave;
        private readonly TenantContext                 _tenant;
        private readonly IDbApiKeyRepository           _apiKeyRepo;
        private readonly IDbIntegracionRepository      _integracionRepo;
        private readonly string                        _apiKeyGlobal;

        public RecepcionExternaController(
            IDbRecepcionService           recepcionSvc,
            IDbAdjuntoRepository          adjuntoRepo,
            ISnowflakeGenerator           snowflake,
            ApiKeyContext                 llave,
            TenantContext                 tenant,
            IDbApiKeyRepository           apiKeyRepo,
            IDbIntegracionRepository      integracionRepo,
            ILogger<RecepcionExternaController> logger,
            IConfiguration                configuration)
        {
            _recepcionSvc    = recepcionSvc;
            _adjuntoRepo     = adjuntoRepo;
            _snowflake       = snowflake;
            _llave           = llave;
            _tenant          = tenant;
            _apiKeyRepo      = apiKeyRepo;
            _integracionRepo = integracionRepo;
            _logger          = logger;
            _apiKeyGlobal    = configuration["RecepcionExterna:ApiKey"] ?? "";
        }

        // ── Helpers ──────────────────────────────────────────────────────────────

        /// <summary>
        /// Comprueba que la petición trae una llave válida y que esa llave
        /// alcanza para este endpoint. El tenant ya lo resolvió TenantMiddleware
        /// a partir de la propia llave.
        /// </summary>
        private IActionResult? ValidarLlave(string alcanceExigido)
        {
            if (_llave.Resuelta)
            {
                if (!_llave.Cubre(alcanceExigido))
                    return StatusCode(403, new
                    {
                        success = false,
                        message = $"Esta llave tiene alcance {_llave.Llave!.Alcance} y este endpoint exige {alcanceExigido}."
                    });

                // Anotar el uso es contabilidad, no autorización: se lanza sin
                // esperar para no sumarle latencia a la planta telefónica.
                _ = _apiKeyRepo.RegistrarUsoAsync(_llave.Llave!.Id, IpCliente, CancellationToken.None);
                return null;
            }

            // ── Respaldo: la clave global de appsettings ──────────────────────
            // Sigue aquí para no dejar tiradas las integraciones que se
            // configuraron antes de que existieran las llaves por CAD. Es el
            // camino que hay que apagar: no distingue tenants.
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
                "Integración entrante autenticada con la clave GLOBAL de appsettings (cod_dane={Dane}, ip={Ip}). " +
                "Emita una llave propia del CAD en Hub de Integraciones: la global no distingue tenants.",
                _tenant.CodDane, IpCliente);
            return null;
        }

        /// <summary>
        /// Unidad policial destino: la que mande el sistema externo y, si no
        /// manda ninguna, la de la llave. Un CAD de una sola unidad no debería
        /// tener que enviarla nunca.
        /// </summary>
        private int ResolverSitio(int sitioEnviado)
        {
            if (sitioEnviado > 0) return sitioEnviado;
            if (_llave.Resuelta && _llave.Llave!.SitioGrabaDefecto > 0) return _llave.Llave!.SitioGrabaDefecto;
            return _tenant.SitioGraba ?? 0;
        }

        private string IpCliente =>
            HttpContext.Connection.RemoteIpAddress?.ToString() ?? "desconocido";

        /// <summary>
        /// Los canales de despacho del caso, sacados de la ficha de integración
        /// configurada en SECAD.
        ///
        /// Hasta V74 venían en el cuerpo de la petición: el proveedor externo
        /// elegía la fuerza y el canal. Eso significaba que una llave de alcance
        /// CHAT servía para meter casos en cualquier canal del CAD, incluido el
        /// de otra unidad, y además obligaba al proveedor a conocer un catálogo
        /// que ni conoce ni tiene por qué seguir cuando cambia.
        ///
        /// Un fallo resolviendo esto no puede tumbar la recepción: si algo va
        /// mal el caso entra sin despachar —visible en la bandeja— en lugar de
        /// perderse.
        /// </summary>
        private async Task<List<DtoCanalSeleccionado>> CanalesDeLaFichaAsync(
            string tipoCanal, int sitioGraba, CancellationToken ct)
        {
            try
            {
                var destino = await _integracionRepo.ResolverDestinoAsync(
                    tipoCanal, _llave.Resuelta ? _llave.Llave!.Id : null, ct);

                if (destino.Ambiguo)
                {
                    _logger.LogWarning(
                        "Canal {Tipo} del CAD {Dane}: hay varias integraciones activas y la llave usada no está " +
                        "asociada a ninguna. El caso entra sin despachar. Asocie cada ficha a su llave en " +
                        "Hub de Integraciones → Entrantes.",
                        tipoCanal, _tenant.CodDane);
                    return new List<DtoCanalSeleccionado>();
                }

                if (destino.IntegracionId is null)
                {
                    _logger.LogInformation(
                        "Canal {Tipo} del CAD {Dane}: no hay ficha de integración activa; el caso entra sin despachar.",
                        tipoCanal, _tenant.CodDane);
                    return new List<DtoCanalSeleccionado>();
                }

                if (destino.Canales.Count == 0)
                    _logger.LogInformation(
                        "La integración «{Nombre}» no tiene canales configurados; el caso entra sin despachar.",
                        destino.Nombre);

                // Recepción filtra estrictamente por sitio_graba: un canal de una
                // fuerza de OTRA unidad recibe la fila y no se la muestra a
                // nadie. Se despacha igual —quitarlo por nuestra cuenta sería
                // otra desaparición silenciosa— pero queda dicho en el log.
                foreach (var c in destino.Canales.Where(c => c.SitioGraba > 0 && c.SitioGraba != sitioGraba))
                    _logger.LogWarning(
                        "Integración «{Nombre}»: el canal {Canal} pertenece a la fuerza {Fuerza} de la unidad " +
                        "{SitioCanal}, pero el caso se graba en la unidad {SitioCaso}. Nadie lo verá en ese canal.",
                        destino.Nombre, c.CanalDescripcion ?? c.Codigo.ToString(),
                        c.FuerzaDescripcion ?? c.FuerzaId.ToString(), c.SitioGraba, sitioGraba);

                return destino.Canales
                    .Select(c => new DtoCanalSeleccionado { Codigo = c.Codigo, FuerzaId = c.FuerzaId })
                    .ToList();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex,
                    "No se pudieron resolver los canales destino del canal {Tipo}; el caso entra sin despachar.",
                    tipoCanal);
                return new List<DtoCanalSeleccionado>();
            }
        }

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
            var keyError = ValidarLlave(AlcanceApiKey.Chat);
            if (keyError is not null) return keyError;

            if (req is null)
                return BadRequest(new { success = false, message = "Cuerpo vacío." });

            // Si el canal no manda la unidad, se hereda de la llave: un CAD de
            // una sola unidad no debería tener que conocer ese número.
            req.SitioGraba = ResolverSitio(req.SitioGraba);
            if (req.SitioGraba <= 0)
                return BadRequest(new { success = false, message = "SitioGraba requerido: la llave no tiene unidad por defecto." });

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
                var canales = await CanalesDeLaFichaAsync("CHAT", req.SitioGraba, ct);

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
                    ENVIAR = canales.Count > 0 ? "S" : "N",
                    Origen = "CHAT",
                    // Los pone SECAD desde la ficha de integración, no el llamante.
                    CANALES_SELECCIONADOS = canales,
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
            var keyError = ValidarLlave(AlcanceApiKey.Sms);
            if (keyError is not null) return keyError;

            if (req is null)
                return BadRequest(new { success = false, message = "Payload requerido." });

            // Igual que en chat: si el proveedor de SMS no manda la unidad, sale
            // de la llave con la que se autenticó.
            req.SitioGraba = ResolverSitio(req.SitioGraba);
            if (req.SitioGraba <= 0)
                return BadRequest(new { success = false, message = "SitioGraba requerido: la llave no tiene unidad por defecto." });

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
                var canales  = await CanalesDeLaFichaAsync("SMS", req.SitioGraba, ct);

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
                    ENVIAR          = canales.Count > 0 ? "S" : "N",
                    Origen          = "SMS",
                    CANALES_SELECCIONADOS = canales,
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

        // ── POST api/RecepcionExterna/verificar ───────────────────────────────────
        /// <summary>
        /// Prueba de credenciales: dice qué llave se reconoció, a qué CAD apunta
        /// y qué unidad usaría por defecto. No escribe absolutamente nada.
        ///
        /// Existe para que el proveedor externo pueda comprobar su configuración
        /// —y el botón «Probar» de la pantalla de integraciones pueda validar la
        /// cadena completa— sin meter una llamada o un caso falso en la operación.
        /// </summary>
        [HttpPost("verificar")]
        [HttpGet("verificar")]
        public IActionResult Verificar()
        {
            // Cualquier alcance sirve: lo que se comprueba es la credencial.
            var keyError = ValidarLlave(AlcanceApiKey.Cualquiera);
            if (keyError is not null && !_llave.Resuelta) return keyError;

            return Ok(new
            {
                success  = true,
                message  = "Credenciales correctas. No se registró ningún dato.",
                data = new
                {
                    codDane       = _tenant.CodDane,
                    nombreCad     = _tenant.NombreCad,
                    llave         = _llave.Resuelta ? _llave.Llave!.Nombre  : "clave global de appsettings",
                    alcance       = _llave.Resuelta ? _llave.Llave!.Alcance : "TODO (heredado)",
                    sitioGraba    = ResolverSitio(0),
                    enPeriodoGracia = _llave.Resuelta && _llave.Llave!.EnGracia,
                }
            });
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
            var keyError = ValidarLlave(AlcanceApiKey.Pbx);
            if (keyError is not null) return keyError;

            if (dto is null)
                return BadRequest(new { success = false, message = "Cuerpo vacío." });

            // La planta no tiene por qué saber el número de la unidad: si no lo
            // manda, sale de la llave con la que se autenticó.
            dto.SitioGraba = ResolverSitio(dto.SitioGraba);
            if (dto.SitioGraba <= 0)
                return BadRequest(new { success = false, message = "SitioGraba requerido: la llave no tiene unidad por defecto." });

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
