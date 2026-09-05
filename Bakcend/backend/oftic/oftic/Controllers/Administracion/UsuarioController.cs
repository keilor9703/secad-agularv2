using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Comun.Dtos;
using Datos.Interfaz;
using Servicios.ApiInterfaz;
using System.Security.Claims;
using BCrypt.Net;

namespace ofic.Controllers.Administracion
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class UsuarioController : ControllerBase
    {
        private readonly IApiWebToken _apiWebToken;
        private readonly IDbUsuarioRepository _dbUsuarioRepository;
        private readonly IDbMasterRepository _masterRepository;
        private readonly ILogger<UsuarioController> _logger;
        private readonly IConfiguration _configuration;

        public UsuarioController(
            IApiWebToken apiWebToken,
            IDbUsuarioRepository dbUsuarioRepository,
            IDbMasterRepository masterRepository,
            ILogger<UsuarioController> logger,
            IConfiguration configuration)
        {
            _apiWebToken = apiWebToken;
            _dbUsuarioRepository = dbUsuarioRepository;
            _masterRepository = masterRepository;
            _logger = logger;
            _configuration = configuration;
        }

        private async Task<string> GetTechnicalTokenAsync(CancellationToken ct)
        {
            try
            {
                var tokenResp = await _apiWebToken.ObtenerTokenPipAsync(ct);
                if (tokenResp is not null && tokenResp.Estado && !string.IsNullOrWhiteSpace(tokenResp.Respuesta))
                {
                    return tokenResp.Respuesta!;
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "FallÃ³ ObtenerTokenPipAsync; se intentarÃ¡ fallback con PostPipToken.");
            }

            // Fallback robusto: usa credenciales tÃ©cnicas de appsettings contra PostPipToken.
            var usuarioPip = _configuration["ApiSettings:UsuarioPip"] ?? string.Empty;
            var clavePip = _configuration["ApiSettings:ClavePip"] ?? string.Empty;
            if (string.IsNullOrWhiteSpace(usuarioPip) || string.IsNullOrWhiteSpace(clavePip))
            {
                _logger.LogWarning("ApiSettings:UsuarioPip/ClavePip no configurados.");
                return string.Empty;
            }

            try
            {
                return await _apiWebToken.GetTokenAsync(usuarioPip, clavePip);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "FallÃ³ fallback GetTokenAsync con credenciales tÃ©cnicas.");
            }

            return string.Empty;
        }

        [HttpGet("Funcionario")]
        public async Task<IActionResult> GetFuncionario([FromQuery] string identificacion)
        {
            try
            {
                if (string.IsNullOrEmpty(identificacion))
                {
                    return BadRequest(new { message = "Identificación requerida" });
                }

                DtoFuncionario? empleado = null;

                // 1. Intento con API externa PIP (si está disponible y accesible)
                try
                {
                    var tokenPip = await GetTechnicalTokenAsync(HttpContext.RequestAborted);
                    if (!string.IsNullOrEmpty(tokenPip))
                    {
                        empleado = await _apiWebToken.GetFuncionarioAsync(tokenPip, identificacion);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "API PIP externa no disponible para identificacion={Identificacion}. Se buscará en BD local.", identificacion);
                }

                // 2. Fallback resiliente: si PIP no respondió (ej. OCI en la nube sin Polired/VPN) o falló,
                // buscar directamente en la base de datos local del tenant (ctr_usuarios).
                if (empleado is null)
                {
                    empleado = await _dbUsuarioRepository.GetFuncionarioLocalAsync(identificacion, HttpContext.RequestAborted);
                    if (empleado is not null)
                    {
                        _logger.LogInformation("Funcionario/usuario cargado desde base de datos local: identificacion={Identificacion}, usuario={Usuario}",
                            empleado.identificacion, empleado.usuario);
                    }
                }

                if (empleado is null)
                {
                    return NotFound(new { message = "No se encuentra información del usuario ni en API externa ni en la base de datos local." });
                }

                // Validar situación laboral (solo si viene de PIP externa con valor específico)
                var situacionLaboral = (empleado.situacionLaboral ?? string.Empty).Trim().ToUpperInvariant();
                if (!string.IsNullOrWhiteSpace(situacionLaboral)
                    && situacionLaboral != "LABORANDO"
                    && situacionLaboral != "COMISION DEL SERVICIO"
                    && situacionLaboral != "COMISION DE ESTUDIOS")
                {
                    return BadRequest(new
                    {
                        success = false,
                        message = $"Usuario no está en situación laboral válida. Situación actual: '{empleado.situacionLaboral ?? "No reportada"}'. Solo se permiten 'LABORANDO' o 'COMISIÓN DEL SERVICIO'."
                    });
                }

                // Persistir automáticamente en DB local si no existe; capturar idUsuario resultante.
                try
                {
                    empleado.idUsuario = await _dbUsuarioRepository.EnsureUsuarioExistsAsync(empleado, HttpContext.RequestAborted);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(
                        ex,
                        "No se pudo persistir el usuario local para identificacion={Identificacion}, usuario={Usuario}",
                        empleado.identificacion,
                        empleado.usuario);
                }

                // Si el usuario existe en BD local, reflejar estado real (bloqueado/activo).
                try
                {
                    var activoDb = await _dbUsuarioRepository.GetActivoByIdentificacionOrUsernameAsync(
                        empleado.identificacion,
                        empleado.usuario,
                        HttpContext.RequestAborted);
                    if (activoDb.HasValue)
                    {
                        empleado.activo = activoDb.Value;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "No se pudo resolver estado local de usuario. identificacion={Identificacion}, usuario={Usuario}",
                        empleado.identificacion, empleado.usuario);
                }

                return Ok(empleado);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error consultando empleado");
                return StatusCode(500, new { message = "Error al consultar empleado" });
            }
        }

        [HttpGet("Foto")]
        public async Task<IActionResult> GetFoto([FromQuery] string identificacion)
        {
            try
            {
                if (string.IsNullOrEmpty(identificacion))
                {
                    return BadRequest(new { message = "Identificación requerida" });
                }

                var tokenPip = await GetTechnicalTokenAsync(HttpContext.RequestAborted);
                if (string.IsNullOrEmpty(tokenPip))
                {
                    return Ok(string.Empty);
                }

                var fotoBase64 = await _apiWebToken.GetFotoFuncionarioAsync(tokenPip, identificacion);
                return Ok(fotoBase64 ?? string.Empty);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "No se pudo obtener foto externa para identificacion={Identificacion}", identificacion);
                return Ok(string.Empty);
            }
        }

        [HttpGet("MiFoto")]
        public async Task<IActionResult> GetMiFoto()
        {
            try
            {
                var username =
                    User?.Identity?.Name
                    ?? User?.FindFirstValue(ClaimTypes.Name)
                    ?? User?.FindFirstValue("http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name");

                if (string.IsNullOrWhiteSpace(username))
                {
                    return BadRequest(new { message = "No se pudo resolver el usuario autenticado." });
                }

                var identificacion = await _dbUsuarioRepository.GetIdentificacionByUsernameAsync(
                    username.Trim(),
                    HttpContext.RequestAborted);

                if (string.IsNullOrWhiteSpace(identificacion))
                {
                    return Ok(string.Empty);
                }

                var tokenPip = await GetTechnicalTokenAsync(HttpContext.RequestAborted);
                if (string.IsNullOrEmpty(tokenPip))
                {
                    return Ok(string.Empty);
                }

                var fotoBase64 = await _apiWebToken.GetFotoFuncionarioAsync(tokenPip, identificacion.Trim());
                return Ok(fotoBase64 ?? string.Empty);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "No se pudo obtener foto del usuario autenticado");
                return Ok(string.Empty);
            }
        }

        [HttpGet("MiPerfil")]
        public async Task<IActionResult> GetMiPerfil()
        {
            try
            {
                var username =
                    User?.Identity?.Name
                    ?? User?.FindFirstValue(ClaimTypes.Name)
                    ?? User?.FindFirstValue("http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name");

                if (string.IsNullOrWhiteSpace(username))
                {
                    return BadRequest(new { message = "No se pudo resolver el usuario autenticado." });
                }

                var identificacion = await _dbUsuarioRepository.GetIdentificacionByUsernameAsync(
                    username.Trim(),
                    HttpContext.RequestAborted);

                DtoFuncionario? empleado = null;

                try
                {
                    var tokenPip = await GetTechnicalTokenAsync(HttpContext.RequestAborted);
                    if (!string.IsNullOrEmpty(tokenPip) && !string.IsNullOrWhiteSpace(identificacion))
                    {
                        empleado = await _apiWebToken.GetFuncionarioAsync(tokenPip, identificacion.Trim());
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "No se pudo obtener perfil desde PIP para username={Username}", username);
                }

                if (empleado is null)
                {
                    empleado = await _dbUsuarioRepository.GetFuncionarioLocalAsync(username.Trim(), HttpContext.RequestAborted);
                }

                if (empleado is null)
                {
                    return NotFound(new { message = "No se encontró información de perfil." });
                }

                var nombreCompleto = $"{(empleado.nombres ?? string.Empty).Trim()} {(empleado.apellidos ?? string.Empty).Trim()}".Trim();

                return Ok(new
                {
                    identificacion = (empleado.identificacion ?? identificacion ?? string.Empty).Trim(),
                    grado = (empleado.nombreGrado ?? string.Empty).Trim(),
                    nombreCompleto,
                    cargo = (empleado.cargo ?? string.Empty).Trim(),
                    situacionLaboral = (empleado.situacionLaboral ?? string.Empty).Trim(),
                    tiempoServicio = (empleado.tiempoServicio ?? string.Empty).Trim()
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error consultando perfil del usuario autenticado");
                return StatusCode(500, new { message = "Error al consultar perfil del usuario autenticado" });
            }
        }

        [HttpGet("Roles")]
        public async Task<IActionResult> GetRoles()
        {
            try
            {
                var roles = await _dbUsuarioRepository.GetRolesAsync(HttpContext.RequestAborted);
                return Ok(roles);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error consultando catÃ¡logo de roles");
                return StatusCode(500, new { message = "Error al consultar roles" });
            }
        }

        [HttpGet("RolesAsignados")]
        public async Task<IActionResult> GetRolesAsignados([FromQuery] string usuario)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(usuario))
                {
                    return BadRequest(new { message = "Usuario requerido" });
                }

                var roles = await _dbUsuarioRepository.GetRolesAsignadosAsync(usuario.Trim(), HttpContext.RequestAborted);
                return Ok(roles);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error consultando roles asignados para usuario {Usuario}", usuario);
                return StatusCode(500, new { message = "Error al consultar roles asignados" });
            }
        }

        [HttpGet("Listado")]
        public async Task<IActionResult> GetListadoUsuarios([FromQuery] string? nombre)
        {
            try
            {
                var usuarios = await _dbUsuarioRepository.GetUsuariosListadoAsync(nombre, HttpContext.RequestAborted);
                return Ok(usuarios);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error consultando listado de usuarios");
                return StatusCode(500, new { message = "Error al consultar listado de usuarios" });
            }
        }

        [HttpPost]
        public async Task<IActionResult> SaveUsuario([FromBody] DtoUsuarioRequest request)
        {
            try
            {
                if (request is null || string.IsNullOrWhiteSpace(request.identificacion))
                {
                    return BadRequest(new { success = false, message = "IdentificaciÃ³n requerida" });
                }

                var usuarioAuditoria = await ResolveUsuarioAuditoriaAsync(
                    User,
                    request.identificacion,
                    HttpContext.RequestAborted);

                var maquinaAuditoria =
                    HttpContext.Connection.RemoteIpAddress?.ToString()
                    ?? Environment.MachineName
                    ?? "N/A";

                var result = await _dbUsuarioRepository.SaveUsuarioAsync(
                    request,
                    usuarioAuditoria,
                    maquinaAuditoria,
                    HttpContext.RequestAborted);

                if (result.idUsuario <= 0)
                {
                    return BadRequest(new
                    {
                        success = false,
                        idUsuario = result.idUsuario,
                        message = string.IsNullOrWhiteSpace(result.message)
                            ? "No fue posible guardar el usuario."
                            : result.message
                    });
                }

                return Ok(new
                {
                    success = true,
                    idUsuario = result.idUsuario,
                    message = string.IsNullOrWhiteSpace(result.message)
                        ? "Usuario guardado correctamente."
                        : result.message
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error guardando usuario");
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error al guardar usuario"
                });
            }
        }

        /// <summary>
        /// Retiro de un usuario CON motivo. Es la que usa el panel de
        /// administración: el formulario exige una observación y la manda en
        /// el cuerpo, cosa que DELETE no garantiza (hay proxies que descartan
        /// el cuerpo de un DELETE). El DELETE de abajo se conserva para
        /// clientes que ya lo usaran, y hace lo mismo sin motivo.
        /// </summary>
        [HttpPost("{idUsuario:long}/Retiro")]
        public Task<IActionResult> RetirarUsuario(
            long idUsuario, [FromBody] DtoRetirarUsuarioRequest? request)
            => EliminarUsuarioInternoAsync(idUsuario, request?.observacion);

        [HttpDelete("{idUsuario:long}")]
        public Task<IActionResult> EliminarUsuario(long idUsuario)
            => EliminarUsuarioInternoAsync(idUsuario, null);

        private async Task<IActionResult> EliminarUsuarioInternoAsync(
            long idUsuario, string? observacion)
        {
            try
            {
                if (idUsuario <= 0)
                {
                    return BadRequest(new { success = false, message = "Id de usuario inválido." });
                }

                var usuarioAuditoria = await ResolveUsuarioAuditoriaAsync(
                    User,
                    null,
                    HttpContext.RequestAborted);

                var maquinaAuditoria =
                    HttpContext.Connection.RemoteIpAddress?.ToString()
                    ?? Environment.MachineName
                    ?? "N/A";

                var result = await _dbUsuarioRepository.EliminarUsuarioAsync(
                    idUsuario,
                    observacion,
                    usuarioAuditoria,
                    maquinaAuditoria,
                    HttpContext.RequestAborted);

                if (result.idUsuario <= 0)
                {
                    return BadRequest(new { success = false, message = result.message });
                }

                return Ok(new { success = true, message = result.message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error eliminando usuario id={IdUsuario}", idUsuario);
                return StatusCode(500, new { success = false, message = "Error al eliminar usuario" });
            }
        }

        /// <summary>
        /// Devuelve los datos de un usuario directamente desde ctr_usuarios (sin pasar por PIP).
        /// Usado para editar usuarios civiles / otras entidades desde el panel de administración.
        /// </summary>
        [HttpGet("Local")]
        public async Task<IActionResult> GetLocalUser([FromQuery] string username)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(username))
                    return BadRequest(new { success = false, message = "Username requerido." });

                var usuario = await _dbUsuarioRepository.GetLocalUsuarioAsync(
                    username.Trim(), HttpContext.RequestAborted);

                if (usuario is null)
                    return NotFound(new { success = false, message = "Usuario no encontrado en la base de datos local." });

                var roles = await _dbUsuarioRepository.GetRolesAsignadosAsync(
                    username.Trim(), HttpContext.RequestAborted);

                var rolesCatalogo = await _dbUsuarioRepository.GetRolesAsync(HttpContext.RequestAborted);

                return Ok(new
                {
                    usuario,
                    rolesAsignados = roles,
                    rolesCatalogo  = rolesCatalogo.Where(r => r.id > 0).ToList()
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error consultando usuario local. username={Username}", username);
                return StatusCode(500, new { success = false, message = "Error al consultar el usuario." });
            }
        }

        /// <summary>
        /// Crea o actualiza un usuario civil / de otra entidad.
        /// Estos usuarios autentican SOLO localmente (nunca via OUD/LDAP/PIP).
        /// El codigo_dane y sitio_graba son heredados del JWT del administrador que crea el usuario,
        /// garantizando que el tenant del nuevo usuario sea el mismo que el del creador.
        /// </summary>
        [HttpPost("Civil")]
        public async Task<IActionResult> CreateCivilUsuario([FromBody] DtoCivilUsuarioRequest request)
        {
            try
            {
                if (request is null)
                    return BadRequest(new { success = false, message = "Payload inválido." });

                var username = (request.username ?? request.identificacion ?? string.Empty).Trim();
                if (string.IsNullOrWhiteSpace(username))
                    return BadRequest(new { success = false, message = "Se requiere username o identificación." });

                // Contraseña: obligatoria en creación; en actualización puede venir vacía (sin cambio)
                var passwordPlain = (request.password ?? string.Empty).Trim();
                var esActualizacion = await _dbUsuarioRepository.GetUsuarioIdByUsernameAsync(
                    username, HttpContext.RequestAborted) is not null;

                if (!esActualizacion && string.IsNullOrWhiteSpace(passwordPlain))
                    return BadRequest(new { success = false, message = "La contraseña es requerida para crear un nuevo usuario civil." });

                if (!string.IsNullOrWhiteSpace(passwordPlain) && passwordPlain.Length < 8)
                    return BadRequest(new { success = false, message = "La contraseña debe tener al menos 8 caracteres." });

                // Heredar codigo_dane del JWT del administrador creador
                var codDane = User.FindFirstValue("codigo_dane")
                    ?? User.FindFirstValue("cod_dane")
                    ?? string.Empty;

                if (string.IsNullOrWhiteSpace(codDane))
                    return BadRequest(new { success = false, message = "No se pudo determinar el CAD del administrador. Verifique la sesión." });

                var maquinaAuditoria =
                    HttpContext.Connection.RemoteIpAddress?.ToString()
                    ?? Environment.MachineName
                    ?? "N/A";

                var usuarioAuditoria = await ResolveUsuarioAuditoriaAsync(
                    User, request.identificacion, HttpContext.RequestAborted);

                // 1. Guardar en BD de tenant (ctr_usuarios)
                var tenantResult = await _dbUsuarioRepository.CreateCivilUsuarioAsync(
                    request, usuarioAuditoria, maquinaAuditoria, HttpContext.RequestAborted);

                if (tenantResult.idUsuario <= 0)
                {
                    return BadRequest(new
                    {
                        success = false,
                        message = string.IsNullOrWhiteSpace(tenantResult.message)
                            ? "No fue posible guardar el usuario en la base de datos del CAD."
                            : tenantResult.message
                    });
                }

                // 2. Guardar credenciales en master (secad_users_fallback) con hash BCrypt
                // Si passwordPlain está vacío (edición sin cambio de contraseña), pasar "" para que el
                // SQL CASE lo ignore y conserve el hash existente.
                var passwordHash = string.IsNullOrWhiteSpace(passwordPlain)
                    ? string.Empty
                    : BCrypt.Net.BCrypt.HashPassword(passwordPlain, workFactor: 12);
                var masterResult = await _masterRepository.SaveCivilUserAsync(
                    username, passwordHash, codDane, request.activo, HttpContext.RequestAborted);

                if (!masterResult.success)
                {
                    _logger.LogWarning(
                        "Usuario civil guardado en tenant pero falló en master fallback. username={Username}, codDane={CodDane}",
                        username, codDane);
                    // No revertimos el tenant — el administrador puede reintentar.
                    return StatusCode(207, new
                    {
                        success = false,
                        idUsuario = tenantResult.idUsuario,
                        message = "Usuario guardado en el CAD, pero falló el registro de credenciales locales. " + masterResult.message
                    });
                }

                _logger.LogInformation(
                    "Usuario civil creado. username={Username}, codDane={CodDane}, idUsuario={Id}",
                    username, codDane, tenantResult.idUsuario);

                return Ok(new
                {
                    success = true,
                    idUsuario = tenantResult.idUsuario,
                    message = "Usuario civil creado correctamente. Ya puede ingresar con su usuario y contraseña."
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creando usuario civil. username={Username}", request?.username);
                return StatusCode(500, new { success = false, message = "Error al crear el usuario civil." });
            }
        }

        private async Task<string> ResolveUsuarioAuditoriaAsync(
            ClaimsPrincipal? user,
            string? identificacionRequest,
            CancellationToken ct)
        {
            // Requisito funcional: auditar con cÃ©dula (no id interno).
            var cedula =
                user?.Claims?.FirstOrDefault(c =>
                    c.Type == "identificacion" ||
                    c.Type == "cedula" ||
                    c.Type == "numeroDocumento" ||
                    c.Type == "documento")?.Value;

            if (!string.IsNullOrWhiteSpace(cedula))
            {
                return cedula.Trim();
            }

            // Si no viene cÃ©dula como claim, resolver por username del JWT en CTR_USUARIOS.
            var username =
                user?.Identity?.Name
                ?? user?.Claims?.FirstOrDefault(c =>
                    c.Type == ClaimTypes.Name ||
                    c.Type == "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name")?.Value;

            if (!string.IsNullOrWhiteSpace(username))
            {
                try
                {
                    var cedulaDb = await _dbUsuarioRepository.GetIdentificacionByUsernameAsync(username.Trim(), ct);
                    if (!string.IsNullOrWhiteSpace(cedulaDb))
                    {
                        return cedulaDb.Trim();
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "No se pudo resolver cÃ©dula del usuario logueado desde DB. username={Username}", username);
                }
            }

            // Fallback final: identificaciÃ³n del usuario objetivo.
            if (!string.IsNullOrWhiteSpace(identificacionRequest))
            {
                return identificacionRequest.Trim();
            }

            return "N/A";
        }

        [HttpPost("Roles")]
        public async Task<IActionResult> AsignarRol([FromBody] DtoAsignarRolRequest request)
        {
            try
            {
                if (request is null || request.rolId <= 0)
                {
                    return BadRequest(new { success = false, message = "Rol requerido" });
                }

                if (string.IsNullOrWhiteSpace(request.justificacion))
                {
                    return BadRequest(new { success = false, message = "JustificaciÃ³n requerida" });
                }

                if (string.IsNullOrWhiteSpace(request.fechaFin))
                {
                    return BadRequest(new { success = false, message = "Fecha fin requerida" });
                }

                if (!DateTime.TryParse(request.fechaFin, out var fechaFin))
                {
                    return BadRequest(new { success = false, message = "Fecha fin invÃ¡lida" });
                }

                request.fechaFin = fechaFin.ToString("yyyy-MM-dd");

                long idUsuario = request.usuarioId;
                if (idUsuario <= 0 && !string.IsNullOrWhiteSpace(request.identificacion))
                {
                    var idByDoc = await _dbUsuarioRepository.GetUsuarioIdByIdentificacionAsync(
                        request.identificacion.Trim(),
                        HttpContext.RequestAborted);
                    if (idByDoc.HasValue)
                    {
                        idUsuario = idByDoc.Value;
                    }
                }

                if (idUsuario <= 0 && !string.IsNullOrWhiteSpace(request.usuario))
                {
                    var idByUser = await _dbUsuarioRepository.GetUsuarioIdByUsernameAsync(
                        request.usuario.Trim(),
                        HttpContext.RequestAborted);
                    if (idByUser.HasValue)
                    {
                        idUsuario = idByUser.Value;
                    }
                }

                if (idUsuario <= 0)
                {
                    return BadRequest(new { success = false, message = "No se encontrÃ³ el usuario para asignar el rol." });
                }

                var usuarioAuditoria = await ResolveUsuarioAuditoriaAsync(
                    User,
                    request.identificacion,
                    HttpContext.RequestAborted);

                var maquinaAuditoria =
                    HttpContext.Connection.RemoteIpAddress?.ToString()
                    ?? Environment.MachineName
                    ?? "N/A";

                var result = await _dbUsuarioRepository.AsignarRolAsync(
                    idUsuario,
                    request,
                    usuarioAuditoria,
                    maquinaAuditoria,
                    HttpContext.RequestAborted);

                if (result.idUsuario <= 0)
                {
                    return BadRequest(new
                    {
                        success = false,
                        message = string.IsNullOrWhiteSpace(result.message)
                            ? "No fue posible asignar el rol."
                            : result.message
                    });
                }

                return Ok(new
                {
                    success = true,
                    idRolUserAdmin = result.idUsuario,
                    message = string.IsNullOrWhiteSpace(result.message)
                        ? "Rol asignado correctamente."
                        : result.message
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error asignando rol");
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error al asignar rol"
                });
            }
        }

        /// <summary>
        /// Retiro de un rol CON motivo, que es lo que envía el panel de
        /// administración. Ver la nota de RetirarUsuario sobre por qué POST.
        /// </summary>
        [HttpPost("Roles/{rolId:int}/Retiro")]
        public Task<IActionResult> RetirarRol(
            int rolId, [FromBody] DtoRetirarRolRequest? request)
            => EliminarRolInternoAsync(
                rolId, request?.usuario, request?.identificacion, request?.observacion);

        [HttpDelete("Roles/{rolId}")]
        public Task<IActionResult> EliminarRol(
            int rolId,
            [FromQuery] string? usuario,
            [FromQuery] string? identificacion)
            => EliminarRolInternoAsync(rolId, usuario, identificacion, null);

        private async Task<IActionResult> EliminarRolInternoAsync(
            int rolId, string? usuario, string? identificacion, string? observacion)
        {
            try
            {
                if (rolId <= 0)
                {
                    return BadRequest(new { success = false, message = "Rol inválido." });
                }

                long idUsuario = 0;

                if (!string.IsNullOrWhiteSpace(identificacion))
                {
                    var idByDoc = await _dbUsuarioRepository.GetUsuarioIdByIdentificacionAsync(
                        identificacion.Trim(),
                        HttpContext.RequestAborted);
                    if (idByDoc.HasValue)
                    {
                        idUsuario = idByDoc.Value;
                    }
                }

                if (idUsuario <= 0 && !string.IsNullOrWhiteSpace(usuario))
                {
                    var idByUser = await _dbUsuarioRepository.GetUsuarioIdByUsernameAsync(
                        usuario.Trim(),
                        HttpContext.RequestAborted);
                    if (idByUser.HasValue)
                    {
                        idUsuario = idByUser.Value;
                    }
                }

                if (idUsuario <= 0)
                {
                    return BadRequest(new { success = false, message = "No se encontró el usuario para retirar el rol." });
                }

                var usuarioAuditoria = await ResolveUsuarioAuditoriaAsync(
                    User,
                    identificacion,
                    HttpContext.RequestAborted);

                var maquinaAuditoria =
                    HttpContext.Connection.RemoteIpAddress?.ToString()
                    ?? Environment.MachineName
                    ?? "N/A";

                var result = await _dbUsuarioRepository.EliminarRolAsync(
                    idUsuario,
                    rolId,
                    observacion,
                    usuarioAuditoria,
                    maquinaAuditoria,
                    HttpContext.RequestAborted);

                // Devolver siempre 200 OK; el frontend distingue success:true/false
                // para mostrar toast verde (éxito) o amarillo (advertencia), no rojo (error).
                return Ok(new { success = result.idUsuario > 0, message = result.message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error eliminando rol");
                return StatusCode(500, new { success = false, message = "Error al eliminar rol" });
            }
        }

        [HttpGet("Roles/Admin")]
        public async Task<IActionResult> GetRolesAdmin()
        {
            try
            {
                var roles = await _dbUsuarioRepository.GetRolesAdminAsync(HttpContext.RequestAborted);
                return Ok(roles);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error consultando administraciÃ³n de roles");
                return StatusCode(500, new { success = false, message = "Error al consultar roles." });
            }
        }

        [HttpPost("Roles/Admin")]
        public async Task<IActionResult> SaveRolAdmin([FromBody] DtoSaveRolRequest request)
        {
            try
            {
                if (request is null)
                {
                    return BadRequest(new { success = false, message = "Payload invÃ¡lido." });
                }

                var usuarioAuditoria = await ResolveUsuarioAuditoriaAsync(
                    User,
                    null,
                    HttpContext.RequestAborted);

                var maquinaAuditoria =
                    HttpContext.Connection.RemoteIpAddress?.ToString()
                    ?? Environment.MachineName
                    ?? "N/A";

                var result = await _dbUsuarioRepository.SaveRolAdminAsync(
                    request,
                    usuarioAuditoria,
                    maquinaAuditoria,
                    HttpContext.RequestAborted);

                if (result.idRol <= 0)
                {
                    return BadRequest(new
                    {
                        success = false,
                        message = string.IsNullOrWhiteSpace(result.message)
                            ? "No fue posible guardar el rol."
                            : result.message
                    });
                }

                return Ok(new
                {
                    success = true,
                    idRol = result.idRol,
                    message = string.IsNullOrWhiteSpace(result.message)
                        ? "Rol guardado correctamente."
                        : result.message
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error guardando rol");
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error al guardar rol"
                });
            }
        }

        [HttpPatch("Roles/Admin/{idRol:int}/Estado")]
        public async Task<IActionResult> SetRolEstado(int idRol, [FromBody] DtoSetRolEstadoRequest request)
        {
            try
            {
                if (idRol <= 0)
                {
                    return BadRequest(new { success = false, message = "Id de rol invÃ¡lido." });
                }

                var usuarioAuditoria = await ResolveUsuarioAuditoriaAsync(
                    User,
                    null,
                    HttpContext.RequestAborted);

                var maquinaAuditoria =
                    HttpContext.Connection.RemoteIpAddress?.ToString()
                    ?? Environment.MachineName
                    ?? "N/A";

                var result = await _dbUsuarioRepository.SetRolEstadoAsync(
                    idRol,
                    request?.vigente ?? 0,
                    usuarioAuditoria,
                    maquinaAuditoria,
                    HttpContext.RequestAborted);

                if (result.idRol <= 0)
                {
                    return BadRequest(new
                    {
                        success = false,
                        message = string.IsNullOrWhiteSpace(result.message)
                            ? "No fue posible actualizar el estado del rol."
                            : result.message
                    });
                }

                return Ok(new
                {
                    success = true,
                    idRol = result.idRol,
                    message = string.IsNullOrWhiteSpace(result.message)
                        ? "Estado del rol actualizado."
                        : result.message
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error actualizando estado del rol. idRol={IdRol}", idRol);
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error al actualizar estado del rol"
                });
            }
        }
    }
}


