using Microsoft.AspNetCore.Mvc;
using Comun.Dtos;
using Negocio.Interfaz;
using Datos.Interfaz;
using Datos.Tenant;
using Servicios.ApiInterfaz;
using Microsoft.Extensions.Configuration;
using BCrypt.Net;
using Api.Services;
using System.Text.Json;

namespace Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class CuentaController : ControllerBase
    {
        private readonly IApiWebOud           _apiWebOud;
        private readonly IJwtService          _jwtService;
        private readonly IDbAuthRepository    _dbAuthRepository;
        private readonly IDbMasterRepository  _masterRepository;
        private readonly ConnectionPoolManager _poolManager;
        private readonly TenantContext        _tenantContext;
        private readonly ILogger<CuentaController> _logger;
        private readonly IWebHostEnvironment  _env;
        private readonly IConfiguration       _configuration;
        private readonly IMfaCentralService   _mfa;
        private readonly MfaSessionTokenService _mfaSession;

        // Cookie de dispositivo confiable — misma cookie en todo el sistema
        private const string CookieTrustedDevice = "SECAD_MFA_DEVICE";

        public CuentaController(
            IApiWebOud apiWebOud,
            IJwtService jwtService,
            IDbAuthRepository dbAuthRepository,
            IDbMasterRepository masterRepository,
            ConnectionPoolManager poolManager,
            TenantContext tenantContext,
            ILogger<CuentaController> logger,
            IWebHostEnvironment env,
            IConfiguration configuration,
            IMfaCentralService mfa,
            MfaSessionTokenService mfaSession)
        {
            _apiWebOud        = apiWebOud;
            _jwtService       = jwtService;
            _dbAuthRepository = dbAuthRepository;
            _masterRepository = masterRepository;
            _poolManager      = poolManager;
            _tenantContext    = tenantContext;
            _logger           = logger;
            _env              = env;
            _configuration    = configuration;
            _mfa              = mfa;
            _mfaSession       = mfaSession;
        }

        // ── Helpers internos ──────────────────────────────────────────────────

        private string ClientIp() =>
            HttpContext.Connection.RemoteIpAddress?.ToString() ?? "0.0.0.0";

        private bool MfaEnabled() =>
            _configuration.GetValue<bool>("Mfa:Enabled");

        /// <summary>
        /// Construye el MfaSessionToken y retorna la respuesta parcial de login
        /// que el frontend usará para mostrar el modal de 2FA correcto.
        /// </summary>
        private DtoMfaLoginResponse BuildMfaChallenge(
            long   idUsuario,
            string usuario,
            string codDane,
            string homeCodDane,
            string nombreCad,
            long   identificacion,
            int    sitioGraba,
            int    acd,
            int    fuerzaId,
            int    canalCodigo,
            List<long> roles,
            string ip,
            string mfaMode,
            string? qrBase64         = null,
            string? manualKey        = null,
            string? enrollToken      = null,
            string? bloqueoHasta     = null,
            string? identificacionStr = null)   // cédula real (VARCHAR de ctr_usuarios)
        {
            var sessionData = new MfaSessionTokenService.MfaSessionData(
                IdUsuario         : idUsuario,
                Usuario           : usuario,
                CodDane           : codDane,
                HomeCodDane       : homeCodDane,
                NombreCad         : nombreCad,
                Identificacion    : identificacion,
                SitioGraba        : sitioGraba,
                Acd               : acd,
                FuerzaId          : fuerzaId,
                CanalCodigo       : canalCodigo,
                RolesJson         : JsonSerializer.Serialize(roles),
                Ip                : ip,
                IdentificacionStr : identificacionStr ?? ""
            );

            return new DtoMfaLoginResponse
            {
                success         = false,   // aún no hay JWT real
                RequiresMfa     = true,
                MfaMode         = mfaMode,
                MfaSessionToken = _mfaSession.CreateToken(sessionData),
                MfaQrBase64     = qrBase64,
                MfaManualKey    = manualKey,
                MfaEnrollToken  = enrollToken,
                BloqueoHasta    = bloqueoHasta,
                message         = "Se requiere segundo factor de autenticación."
            };
        }

        /// <summary>Construye el JWT definitivo una vez pasado el 2FA (o si no aplica).</summary>
        private string BuildFinalJwt(
            long   idUsuario,
            string usuario,
            List<long> roles,
            string codDane,
            string nombreCad,
            int    sitioGraba,
            int    acd,
            int    fuerzaId,
            int    canalCodigo,
            string homeCodDane,
            string? identificacion = null)
            => _jwtService.CreateToken(
                idUsuario, usuario, roles, codDane, nombreCad,
                sitioGraba, acd, fuerzaId, canalCodigo,
                homeCodDane:    homeCodDane,
                identificacion: identificacion);

        [HttpPost("Token")]
        public async Task<IActionResult> GetToken([FromBody] DtoTokenRequest request)
        {
            try
            {
                _logger.LogInformation("Login attempt for user: {Usuario}", request.Usuario);

                if (string.IsNullOrWhiteSpace(request.Usuario) || string.IsNullOrWhiteSpace(request.Contrasena))
                {
                    return BadRequest(new DtoTokenResponse { success = false, message = "Usuario y contraseña requeridos" });
                }

                var validateOudInDev = _configuration.GetValue<bool>("Auth:ValidateOudInDevelopment");
                var shouldValidateOud = !_env.IsDevelopment() || validateOudInDev;

                string? codDane = null;
                string? nombreCad = null;

                bool isCivilUser = false;

                if (shouldValidateOud)
                {
                    // Intento 1: Autenticación OUD (funcionarios Policía Nacional)
                    var oudResult = await _apiWebOud.ValidarYObtenerDatosAsync(
                        request.Usuario, request.Contrasena, CancellationToken.None);

                    if (oudResult.Success)
                    {
                        // Resolve tenant from OUD attributes
                        var tenant = await ResolveTenantAsync(oudResult.UndeLaborandoCodigo, oudResult.SiglaLaborando);

                        if (tenant is null)
                        {
                            _logger.LogWarning("Tenant no resuelto. UndeLaborandoCodigo={Cod}, SiglaLaborando={Sigla}",
                                oudResult.UndeLaborandoCodigo, oudResult.SiglaLaborando);
                            return Unauthorized(new DtoTokenResponse
                            {
                                success = false,
                                message = "No se pudo determinar el CAD asignado al funcionario."
                            });
                        }

                        codDane = tenant.CodDane;
                        nombreCad = tenant.Nombre;
                        _tenantContext.Set(_poolManager.GetOrCreate(tenant), codDane, nombreCad);

                        await _masterRepository.AuditFallbackLoginAsync(
                            request.Usuario, codDane,
                            HttpContext.Connection.RemoteIpAddress?.ToString(),
                            modoFallback: false,
                            CancellationToken.None);
                    }
                    else
                    {
                        // Intento 2: Autenticación local (usuarios civiles / otras entidades)
                        _logger.LogInformation("OUD falló para {Usuario}; intentando autenticación local civil.", request.Usuario);

                        var (fallbackCodDane, fallbackHash) = await _masterRepository.GetFallbackUserAsync(
                            request.Usuario, CancellationToken.None);

                        if (string.IsNullOrWhiteSpace(fallbackCodDane) || string.IsNullOrWhiteSpace(fallbackHash))
                        {
                            return Unauthorized(new DtoTokenResponse
                            {
                                success = false,
                                message = "Credenciales incorrectas"
                            });
                        }

                        if (!BCrypt.Net.BCrypt.Verify(request.Contrasena, fallbackHash))
                        {
                            return Unauthorized(new DtoTokenResponse
                            {
                                success = false,
                                message = "Credenciales incorrectas"
                            });
                        }

                        // Credenciales locales válidas — resolver tenant
                        var civilTenant = await _masterRepository.GetTenantByCodDaneAsync(fallbackCodDane, CancellationToken.None);

                        if (civilTenant is null)
                        {
                            _logger.LogWarning("Tenant no resuelto para usuario civil. codDane={CodDane}, usuario={Usuario}",
                                fallbackCodDane, request.Usuario);
                            return Unauthorized(new DtoTokenResponse
                            {
                                success = false,
                                message = "No se pudo determinar el CAD asignado al usuario."
                            });
                        }

                        codDane = civilTenant.CodDane;
                        nombreCad = civilTenant.Nombre;
                        isCivilUser = true;
                        _tenantContext.Set(_poolManager.GetOrCreate(civilTenant), codDane, nombreCad);

                        await _masterRepository.AuditFallbackLoginAsync(
                            request.Usuario, codDane,
                            HttpContext.Connection.RemoteIpAddress?.ToString(),
                            modoFallback: true,
                            CancellationToken.None);

                        _logger.LogInformation("Usuario civil autenticado localmente. usuario={Usuario}, codDane={CodDane}",
                            request.Usuario, codDane);
                    }
                }
                else
                {
                    // Modo desarrollo: intentar primero autenticación local civil, luego tenant por defecto
                    _logger.LogWarning("MODO DESARROLLO: Validación OUD deshabilitada.");

                    var (fallbackCodDane, fallbackHash) = await _masterRepository.GetFallbackUserAsync(
                        request.Usuario, CancellationToken.None);

                    if (!string.IsNullOrWhiteSpace(fallbackCodDane) && !string.IsNullOrWhiteSpace(fallbackHash)
                        && BCrypt.Net.BCrypt.Verify(request.Contrasena, fallbackHash))
                    {
                        // Usuario civil en modo desarrollo
                        var civilTenant = await _masterRepository.GetTenantByCodDaneAsync(fallbackCodDane, CancellationToken.None);
                        if (civilTenant is not null)
                        {
                            codDane = civilTenant.CodDane;
                            nombreCad = civilTenant.Nombre;
                            isCivilUser = true;
                            _tenantContext.Set(_poolManager.GetOrCreate(civilTenant), codDane, nombreCad);
                        }
                    }

                    if (codDane is null)
                    {
                        // Fallback: tenant de desarrollo configurado
                        var devCodDane = _configuration["Auth:DevTenantCodDane"] ?? "11001";
                        var devTenant = await _masterRepository.GetTenantByCodDaneAsync(devCodDane, CancellationToken.None);

                        if (devTenant is null)
                        {
                            return StatusCode(503, new DtoTokenResponse
                            {
                                success = false,
                                message = $"Tenant de desarrollo '{devCodDane}' no encontrado en la base de datos maestra."
                            });
                        }

                        codDane = devTenant.CodDane;
                        nombreCad = devTenant.Nombre;
                        _tenantContext.Set(_poolManager.GetOrCreate(devTenant), codDane, nombreCad);
                    }
                }

                _ = isCivilUser; // usado para logging; JWT ya lleva tipo_usuario via roles

                // ── Consultar usuario, identificación y roles en el tenant ─────────
                var (idUsuario, identificacionDb, roles, sitioGraba, acd, fuerzaId, canalCodigo) = await _dbAuthRepository.GetUsuarioYRolesAsync(
                    request.Usuario, CancellationToken.None);

                _logger.LogInformation("User {Usuario} — idUsuario: {Id}, roles: {Count}, tenant: {Tenant}, sitio: {Sitio}, acd: {Acd}, canal: {Canal}",
                    request.Usuario, idUsuario, roles?.Count, codDane, sitioGraba, acd, canalCodigo);

                if (idUsuario is null)
                {
                    return Unauthorized(new DtoTokenResponse
                    {
                        success = false,
                        message = "Usuario no encontrado o inactivo en el sistema"
                    });
                }

                var ip          = ClientIp();
                var homeCodDane = codDane!;

                // Cédula final del empleado: prioridad OUD > ctr_usuarios.identificacion
                // Se calcula aquí para que esté disponible tanto en el JWT directo
                // como en los tokens MFA intermedios.
                string? identificacionFinal = null;
                if (HttpContext.Items.TryGetValue("OudIdentificacion", out var oudIdObj)
                    && oudIdObj is long oudIdVal && oudIdVal > 0)
                {
                    identificacionFinal = oudIdVal.ToString();
                }
                else if (!string.IsNullOrWhiteSpace(identificacionDb))
                {
                    identificacionFinal = identificacionDb;
                }

                // ════════════════════════════════════════════════════════════════
                // DOBLE FACTOR DE AUTENTICACIÓN (MFA)
                // Solo para usuarios OUD (funcionarios con cédula).
                // Usuarios civiles (fallback local) no requieren 2FA institucional.
                // ════════════════════════════════════════════════════════════════

                bool skipMfa = !MfaEnabled() || isCivilUser;

                if (!skipMfa)
                {
                    // Cédula del funcionario (viene del OUD, guardada en Items por ApiWebOud si aplica)
                    long identificacion = idUsuario.Value;
                    if (HttpContext.Items.TryGetValue("OudIdentificacion", out var oudId)
                        && oudId is long oudIdLong && oudIdLong > 0)
                        identificacion = oudIdLong;

                    var mfaState = await _mfa.GetStateAsync(identificacion, request.Usuario!, CancellationToken.None);

                    if (mfaState.ServiceDown)
                    {
                        if (_configuration.GetValue<bool>("Mfa:AllowLoginOnServiceDown"))
                        {
                            _logger.LogWarning("[MFA] Servicio caído — login permitido por configuración. User={U}", request.Usuario);
                            skipMfa = true;   // continuar sin 2FA
                        }
                        else
                        {
                            return Ok(new DtoMfaLoginResponse
                            {
                                success     = false,
                                RequiresMfa = true,
                                MfaMode     = "svcdown",
                                message     = "El servicio de doble autenticación no está disponible. Por seguridad no es posible iniciar sesión en este momento."
                            });
                        }
                    }

                    if (!skipMfa)
                    {
                        // ── Bloqueado ────────────────────────────────────────────
                        if (mfaState.BloqueoHasta.HasValue && mfaState.BloqueoHasta.Value > DateTime.Now)
                            return Ok(BuildMfaChallenge(
                                idUsuario.Value, request.Usuario!, codDane!, homeCodDane, nombreCad!,
                                identificacion, sitioGraba, acd, fuerzaId, canalCodigo, roles!, ip,
                                mfaMode: "blocked",
                                bloqueoHasta: mfaState.BloqueoHasta.Value.ToString("yyyy-MM-dd HH:mm:ss"),
                                identificacionStr: identificacionFinal));

                        // ── Dispositivo confiable ─────────────────────────────────
                        var cookieDeviceId = Request.Cookies[CookieTrustedDevice];
                        if (!string.IsNullOrWhiteSpace(cookieDeviceId))
                        {
                            var trusted = await _mfa.IsTrustedAsync(identificacion, request.Usuario!, cookieDeviceId, CancellationToken.None);
                            if (trusted)
                            {
                                _logger.LogInformation("[MFA] Dispositivo confiable — omitiendo 2FA. User={U}", request.Usuario);
                                skipMfa = true;
                            }
                        }

                        if (!skipMfa)
                        {
                            // ── No enrolado o debe re-enrolar ────────────────────
                            bool debeEnrolar = mfaState.MfaHabilitado != 1 || mfaState.RequireReenroll == 1;
                            if (debeEnrolar)
                            {
                                var enroll = await _mfa.EnrollStartAsync(identificacion, request.Usuario!, CancellationToken.None);
                                if (enroll.ServiceDown)
                                    return Ok(new DtoMfaLoginResponse { success = false, RequiresMfa = true, MfaMode = "svcdown", message = "Servicio 2FA no disponible." });
                                if (!enroll.Ok)
                                    return Unauthorized(new DtoTokenResponse { success = false, message = $"No fue posible iniciar el enrolamiento MFA: {enroll.Mensaje}" });

                                return Ok(BuildMfaChallenge(
                                    idUsuario.Value, request.Usuario!, codDane!, homeCodDane, nombreCad!,
                                    identificacion, sitioGraba, acd, fuerzaId, canalCodigo, roles!, ip,
                                    mfaMode: "enroll", qrBase64: enroll.QrBase64,
                                    manualKey: enroll.ManualKey, enrollToken: enroll.EnrollToken,
                                    identificacionStr: identificacionFinal));
                            }

                            // ── Enrolado → pedir código ───────────────────────────
                            return Ok(BuildMfaChallenge(
                                idUsuario.Value, request.Usuario!, codDane!, homeCodDane, nombreCad!,
                                identificacion, sitioGraba, acd, fuerzaId, canalCodigo, roles!, ip,
                                mfaMode: "verify", identificacionStr: identificacionFinal));
                        }
                    }
                }

                // ── Emitir JWT final (credenciales OK + MFA no requerido/pasado) ─
                var jwtToken = BuildFinalJwt(
                    idUsuario.Value, request.Usuario!, roles!,
                    codDane!, nombreCad!, sitioGraba, acd, fuerzaId, canalCodigo, homeCodDane,
                    identificacion: identificacionFinal);

                return Ok(new DtoTokenResponse
                {
                    token   = jwtToken,
                    usuario = request.Usuario,
                    success = true,
                    message = "Login exitoso"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error en login para {Usuario}", request.Usuario);
                return StatusCode(500, new DtoTokenResponse { success = false, message = "Error al iniciar sesión" });
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // ENDPOINTS MFA — todos requieren un MfaSessionToken válido
        // ════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// POST /api/Cuenta/MfaVerify
        /// Verifica el código TOTP. Si es correcto, emite el JWT definitivo.
        /// </summary>
        [HttpPost("MfaVerify")]
        public async Task<IActionResult> MfaVerify([FromBody] DtoMfaVerifyRequest req, CancellationToken ct)
        {
            var d = _mfaSession.ValidateToken(req.MfaSessionToken);
            if (d is null)
                return Unauthorized(new DtoMfaStepResponse { Success = false, Message = "Sesión MFA expirada o inválida. Inicie sesión nuevamente." });

            if (string.IsNullOrWhiteSpace(req.Code))
                return Ok(new DtoMfaStepResponse { Success = false, Message = "Ingrese el código de 6 dígitos." });

            var ip = ClientIp();
            var result = await _mfa.VerifyAsync(d.Identificacion, d.Usuario, req.Code, req.RememberDevice, req.DeviceId, ip, ct);

            if (result.ServiceDown)
                return Ok(new DtoMfaStepResponse { Success = false, Message = "Servicio 2FA no disponible." });

            if (result.Blocked)
                return Ok(new DtoMfaStepResponse
                {
                    Success      = false,
                    Message      = $"Cuenta bloqueada temporalmente hasta {result.BloqueoHasta?.ToString("yyyy-MM-dd HH:mm:ss") ?? "próximamente"}.",
                    BloqueoHasta = result.BloqueoHasta?.ToString("yyyy-MM-dd HH:mm:ss")
                });

            if (!result.Ok)
                return Ok(new DtoMfaStepResponse { Success = false, Message = result.Mensaje.Length > 0 ? result.Mensaje : "Código inválido. Verifique su app de autenticación." });

            // ── MFA OK → guardar cookie de dispositivo confiable ───────────────
            if (req.RememberDevice && !string.IsNullOrWhiteSpace(req.DeviceId))
            {
                Response.Cookies.Append(CookieTrustedDevice, req.DeviceId, new CookieOptions
                {
                    HttpOnly = true,
                    Secure   = Request.IsHttps,
                    SameSite = SameSiteMode.Lax,
                    Expires  = DateTimeOffset.UtcNow.AddDays(30)
                });
            }

            var roles = ParseRoles(d.RolesJson);
            var jwt   = BuildFinalJwt(d.IdUsuario, d.Usuario, roles, d.CodDane, d.NombreCad,
                                       d.SitioGraba, d.Acd, d.FuerzaId, d.CanalCodigo, d.HomeCodDane,
                                       identificacion: string.IsNullOrEmpty(d.IdentificacionStr) ? null : d.IdentificacionStr);

            return Ok(new DtoMfaStepResponse { Success = true, Token = jwt, Message = "Autenticación completada." });
        }

        /// <summary>
        /// POST /api/Cuenta/MfaEnrollConfirm
        /// Confirma el primer enrolamiento con el código TOTP escaneado del QR.
        /// </summary>
        [HttpPost("MfaEnrollConfirm")]
        public async Task<IActionResult> MfaEnrollConfirm([FromBody] DtoMfaEnrollConfirmRequest req, CancellationToken ct)
        {
            var d = _mfaSession.ValidateToken(req.MfaSessionToken);
            if (d is null)
                return Unauthorized(new DtoMfaStepResponse { Success = false, Message = "Sesión MFA expirada. Inicie sesión nuevamente." });

            if (string.IsNullOrWhiteSpace(req.Code))
                return Ok(new DtoMfaStepResponse { Success = false, Message = "Ingrese el código de 6 dígitos." });

            var ip     = ClientIp();
            var result = await _mfa.EnrollConfirmAsync(d.Identificacion, d.Usuario, req.EnrollToken, req.Code, ip, ct);

            if (result.ServiceDown)
                return Ok(new DtoMfaStepResponse { Success = false, Message = "Servicio 2FA no disponible." });

            if (result.Blocked)
                return Ok(new DtoMfaStepResponse
                {
                    Success      = false,
                    Message      = $"Cuenta bloqueada hasta {result.BloqueoHasta?.ToString("yyyy-MM-dd HH:mm:ss") ?? "próximamente"}.",
                    BloqueoHasta = result.BloqueoHasta?.ToString("yyyy-MM-dd HH:mm:ss")
                });

            if (!result.Ok)
                return Ok(new DtoMfaStepResponse { Success = false, Message = result.Mensaje.Length > 0 ? result.Mensaje : "Código inválido. Intente de nuevo." });

            var roles = ParseRoles(d.RolesJson);
            var jwt   = BuildFinalJwt(d.IdUsuario, d.Usuario, roles, d.CodDane, d.NombreCad,
                                       d.SitioGraba, d.Acd, d.FuerzaId, d.CanalCodigo, d.HomeCodDane,
                                       identificacion: string.IsNullOrEmpty(d.IdentificacionStr) ? null : d.IdentificacionStr);

            return Ok(new DtoMfaStepResponse { Success = true, Token = jwt, Message = "MFA activado y sesión iniciada correctamente." });
        }

        /// <summary>
        /// POST /api/Cuenta/MfaResetRequest
        /// Envía un código de recuperación al correo institucional del usuario.
        /// </summary>
        [HttpPost("MfaResetRequest")]
        public async Task<IActionResult> MfaResetRequest([FromBody] DtoMfaResetRequest req, CancellationToken ct)
        {
            var d = _mfaSession.ValidateToken(req.MfaSessionToken);
            if (d is null)
                return Unauthorized(new DtoMfaStepResponse { Success = false, Message = "Sesión expirada. Inicie sesión nuevamente." });

            var result = await _mfa.ResetRequestAsync(d.Identificacion, d.Usuario, ClientIp(), ct);

            if (result.ServiceDown)
                return Ok(new DtoMfaStepResponse { Success = false, Message = "Servicio 2FA no disponible." });

            // IsInfo=true → el frontend muestra el mensaje informativo sin redirigir
            return Ok(new DtoMfaStepResponse { Success = result.Ok, IsInfo = result.Ok, Message = result.Mensaje });
        }

        /// <summary>
        /// POST /api/Cuenta/MfaResetConfirm
        /// Confirma el código de correo, resetea el secreto TOTP e inicia un nuevo enrolamiento.
        /// Retorna QR + manualKey + enrollToken para que el frontend abra el modal de enrolamiento.
        /// </summary>
        [HttpPost("MfaResetConfirm")]
        public async Task<IActionResult> MfaResetConfirm([FromBody] DtoMfaResetConfirmRequest req, CancellationToken ct)
        {
            var d = _mfaSession.ValidateToken(req.MfaSessionToken);
            if (d is null)
                return Unauthorized(new DtoMfaStepResponse { Success = false, Message = "Sesión expirada. Inicie sesión nuevamente." });

            if (string.IsNullOrWhiteSpace(req.Code))
                return Ok(new DtoMfaStepResponse { Success = false, Message = "Ingrese el código enviado al correo." });

            var ip = ClientIp();

            // 1. Confirmar el código enviado al correo
            var confirm = await _mfa.ResetConfirmAsync(d.Identificacion, d.Usuario, req.Code, ip, ct);
            if (confirm.ServiceDown)
                return Ok(new DtoMfaStepResponse { Success = false, Message = "Servicio 2FA no disponible." });

            if (!confirm.Ok)
                return Ok(new DtoMfaStepResponse
                {
                    Success = false,
                    Message = confirm.AvailableAt.HasValue
                        ? $"Aún no disponible. Podrá reenrolar desde las {confirm.AvailableAt.Value:HH:mm:ss}."
                        : confirm.Mensaje
                });

            // 2. Ejecutar el reset (limpia el secreto TOTP anterior)
            var exec = await _mfa.ResetExecuteAsync(d.Identificacion, d.Usuario, ip, ct);
            if (!exec.Ok)
                return Ok(new DtoMfaStepResponse { Success = false, Message = exec.Mensaje });

            // 3. Iniciar nuevo enrolamiento → devolver QR para el modal de enrolamiento
            var enroll = await _mfa.EnrollStartAsync(d.Identificacion, d.Usuario, ct);
            if (!enroll.Ok)
                return Ok(new DtoMfaStepResponse { Success = false, Message = "Se restableció el MFA pero no fue posible generar el nuevo QR. Inicie sesión." });

            return Ok(new DtoMfaStepResponse
            {
                Success     = true,
                Message     = "MFA restablecido. Escanee el nuevo código QR para activar su autenticador.",
                QrBase64    = enroll.QrBase64,
                ManualKey   = enroll.ManualKey,
                EnrollToken = enroll.EnrollToken
            });
        }

        // ── Helpers privados ──────────────────────────────────────────────────

        private static List<long> ParseRoles(string rolesJson)
        {
            try { return System.Text.Json.JsonSerializer.Deserialize<List<long>>(rolesJson) ?? new(); }
            catch { return new(); }
        }

        private async Task<Comun.Dtos.Tenant.DtoTenant?> ResolveTenantAsync(string? undeLaborandoCodigo, string? siglaLaborando)
        {
            if (!string.IsNullOrWhiteSpace(undeLaborandoCodigo))
            {
                var t = await _masterRepository.GetTenantByCodDaneAsync(undeLaborandoCodigo, CancellationToken.None);
                if (t is not null) return t;
            }

            if (!string.IsNullOrWhiteSpace(siglaLaborando))
            {
                var t = await _masterRepository.GetTenantByCodUnidadAsync(siglaLaborando, CancellationToken.None);
                if (t is not null) return t;
            }

            return null;
        }
    }
}
