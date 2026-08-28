using Comun.Dtos.Menu;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Datos.Interfaz;
using Negocio.Interfaz;
using System.Security.Claims;
using System.Globalization;

namespace Api.Controllers.Administracion
{
    [ApiController]
    [Route("api/menu")]
    public class MenuController : ControllerBase
    {
        private readonly IDbMenuService _service;
        private readonly IDbUsuarioRepository _dbUsuarioRepository;
        private readonly ILogger<MenuController> _logger;
        private readonly HashSet<long> _superUserIds;

        public MenuController(
            IDbMenuService service,
            IDbUsuarioRepository dbUsuarioRepository,
            IConfiguration configuration,
            ILogger<MenuController> logger)
        {
            _service = service;
            _dbUsuarioRepository = dbUsuarioRepository;
            _logger = logger;
            _superUserIds = ResolveSuperUserIds(configuration);
        }

        [HttpGet("by-user/{idUsuario:long}")]
        [Authorize]
        public async Task<ActionResult<List<DtoMenuItem>>> GetByUser(long idUsuario, CancellationToken ct)
        {
            var menu = await GetMenuForUserAsync(idUsuario, ct);
            return Ok(menu);
        }

        [HttpGet("me")]
        [Authorize]
        public async Task<ActionResult<List<DtoMenuItem>>> GetMyMenu(CancellationToken ct)
        {
            var rawId = User.FindFirstValue("id_usuario")
                ?? User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? User.FindFirstValue("nameid");

            if (!long.TryParse(rawId, out var idUsuario) || idUsuario <= 0)
            {
                _logger.LogWarning("No se pudo resolver id_usuario desde JWT.");
                return Unauthorized();
            }

            var menu = await GetMenuForUserAsync(idUsuario, ct);
            _logger.LogInformation("Menu por claim para idUsuario {IdUsuario}: {Count} items", idUsuario, menu.Count);
            return Ok(menu);
        }

        [HttpGet("admin")]
        [Authorize]
        public async Task<ActionResult<List<DtoMenuItem>>> GetAdminMenu(CancellationToken ct)
        {
            var menu = await _service.GetAdminMenuAsync(ct);
            return Ok(menu);
        }

        [HttpPost("admin")]
        [Authorize]
        public async Task<IActionResult> SaveMenu([FromBody] DtoMenuSaveRequest request, CancellationToken ct)
        {
            try
            {
                if (request is null)
                {
                    return BadRequest(new { success = false, message = "Payload requerido." });
                }

                if (string.IsNullOrWhiteSpace(request.Descripcion))
                {
                    return BadRequest(new { success = false, message = "Descripción requerida." });
                }

                if (request.Posicion < 0)
                {
                    return BadRequest(new { success = false, message = "Posición invalida" });
                }

                if (string.IsNullOrWhiteSpace(request.Tipo))
                {
                    return BadRequest(new { success = false, message = "Tipo requerido." });
                }

                if (request.Vigente is not 0 and not 1)
                {
                    return BadRequest(new { success = false, message = "Vigente debe ser 0 o 1." });
                }

                var userId = await ResolveUsuarioAuditoriaAsync(ct);
                var machine = ResolveMachine();
                var result = await _service.SaveMenuAsync(request, userId, machine, ct);

                if (result.Id <= 0)
                {
                    return BadRequest(new { success = false, id = result.Id, message = result.Message });
                }

                return Ok(new { success = true, id = result.Id, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error guardando menÃº.");
                return StatusCode(500, new { success = false, message = "Error guardando menÃº" });
            }
        }

        [HttpGet("admin/roles")]
        [Authorize]
        public async Task<IActionResult> GetRolesCatalog(CancellationToken ct)
        {
            try
            {
                var roles = await _service.GetRolesCatalogAsync(ct);
                return Ok(roles);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error consultando catÃ¡logo de roles para menÃº.");
                return StatusCode(500, new { success = false, message = "Error consultando catÃ¡logo de roles." });
            }
        }

        [HttpGet("admin/{idMenu:long}/roles")]
        [Authorize]
        public async Task<IActionResult> GetRolesByMenu(long idMenu, CancellationToken ct)
        {
            try
            {
                if (idMenu <= 0)
                {
                    return BadRequest(new { success = false, message = "Id de menÃº invÃ¡lido." });
                }

                var roles = await _service.GetRolesByMenuAsync(idMenu, ct);
                return Ok(roles);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error consultando roles por menÃº. idMenu={IdMenu}", idMenu);
                return StatusCode(500, new { success = false, message = "Error consultando roles por menÃº." });
            }
        }

        [HttpPost("admin/{idMenu:long}/roles")]
        [Authorize]
        public async Task<IActionResult> AssignRolToMenu(long idMenu, [FromBody] DtoAssignMenuRolRequest request, CancellationToken ct)
        {
            try
            {
                if (idMenu <= 0)
                {
                    return BadRequest(new { success = false, message = "Id de menÃº invÃ¡lido." });
                }

                if (request is null || request.IdRol <= 0)
                {
                    return BadRequest(new { success = false, message = "Id de rol invÃ¡lido." });
                }

                var userId = await ResolveUsuarioAuditoriaAsync(ct);
                var machine = ResolveMachine();
                var result = await _service.AssignRolToMenuAsync(idMenu, request.IdRol, userId, machine, ct);

                if (result.Id <= 0)
                {
                    return BadRequest(new { success = false, id = result.Id, message = result.Message });
                }

                return Ok(new { success = true, id = result.Id, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error asignando rol a menÃº. idMenu={IdMenu}", idMenu);
                return StatusCode(500, new { success = false, message = "Error asignando rol a menÃº." });
            }
        }

        [HttpDelete("admin/{idMenu:long}/roles/{idRol:int}")]
        [Authorize]
        public async Task<IActionResult> RemoveRolFromMenu(long idMenu, int idRol, CancellationToken ct)
        {
            try
            {
                if (idMenu <= 0 || idRol <= 0)
                {
                    return BadRequest(new { success = false, message = "ParÃ¡metros invÃ¡lidos." });
                }

                var userId = await ResolveUsuarioAuditoriaAsync(ct);
                var machine = ResolveMachine();
                var result = await _service.RemoveRolFromMenuAsync(idMenu, idRol, userId, machine, ct);

                if (result.Id <= 0)
                {
                    return BadRequest(new { success = false, id = result.Id, message = result.Message });
                }

                return Ok(new { success = true, id = result.Id, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error eliminando asignaciÃ³n menÃº-rol. idMenu={IdMenu}, idRol={IdRol}", idMenu, idRol);
                return StatusCode(500, new { success = false, message = "Error eliminando asignaciÃ³n menÃº-rol." });
            }
        }

        [HttpGet("admin/roles/{idRol:int}/menus")]
        [Authorize]
        public async Task<IActionResult> GetMenusByRol(int idRol, CancellationToken ct)
        {
            try
            {
                if (idRol <= 0)
                {
                    return BadRequest(new { success = false, message = "Id de rol invÃ¡lido." });
                }

                var menus = await _service.GetMenusByRolAsync(idRol, ct);
                return Ok(menus);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error consultando menÃºs por rol. idRol={IdRol}", idRol);
                return StatusCode(500, new { success = false, message = "Error consultando menÃºs por rol." });
            }
        }

        [HttpPost("admin/roles/{idRol:int}/menus")]
        [Authorize]
        public async Task<IActionResult> AssignMenuToRol(int idRol, [FromBody] DtoAssignRoleMenuRequest request, CancellationToken ct)
        {
            try
            {
                if (idRol <= 0)
                {
                    return BadRequest(new { success = false, message = "Id de rol invÃ¡lido." });
                }

                if (request is null || request.IdMenu <= 0)
                {
                    return BadRequest(new { success = false, message = "Id de menÃº invÃ¡lido." });
                }

                var userId = await ResolveUsuarioAuditoriaAsync(ct);
                var machine = ResolveMachine();
                var result = await _service.AssignMenuToRolAsync(idRol, request.IdMenu, userId, machine, ct);

                if (result.Id <= 0)
                {
                    return BadRequest(new { success = false, id = result.Id, message = result.Message });
                }

                return Ok(new { success = true, id = result.Id, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error asignando menÃº a rol. idRol={IdRol}", idRol);
                return StatusCode(500, new { success = false, message = "Error asignando menÃº a rol." });
            }
        }

        [HttpDelete("admin/roles/{idRol:int}/menus/{idMenu:long}")]
        [Authorize]
        public async Task<IActionResult> RemoveMenuFromRol(int idRol, long idMenu, CancellationToken ct)
        {
            try
            {
                if (idRol <= 0 || idMenu <= 0)
                {
                    return BadRequest(new { success = false, message = "ParÃ¡metros invÃ¡lidos." });
                }

                var userId = await ResolveUsuarioAuditoriaAsync(ct);
                var machine = ResolveMachine();
                var result = await _service.RemoveMenuFromRolAsync(idRol, idMenu, userId, machine, ct);

                if (result.Id <= 0)
                {
                    return BadRequest(new { success = false, id = result.Id, message = result.Message });
                }

                return Ok(new { success = true, id = result.Id, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error eliminando asignaciÃ³n rol-menÃº. idRol={IdRol}, idMenu={IdMenu}", idRol, idMenu);
                return StatusCode(500, new { success = false, message = "Error eliminando asignaciÃ³n rol-menÃº." });
            }
        }

        [HttpPatch("admin/{idMenu:long}/estado")]
        [Authorize]
        public async Task<IActionResult> SetEstado(long idMenu, [FromBody] DtoMenuEstadoRequest request, CancellationToken ct)
        {
            try
            {
                if (idMenu <= 0)
                {
                    return BadRequest(new { success = false, message = "Id de menÃº invÃ¡lido." });
                }

                if (request is null || request.Vigente is not 0 and not 1)
                {
                    return BadRequest(new { success = false, message = "Vigente debe ser 0 o 1." });
                }

                var userId = await ResolveUsuarioAuditoriaAsync(ct);
                var machine = ResolveMachine();
                var result = await _service.SetEstadoMenuAsync(idMenu, request.Vigente, userId, machine, ct);

                if (result.Id <= 0)
                {
                    return BadRequest(new { success = false, id = result.Id, message = result.Message });
                }

                return Ok(new { success = true, id = result.Id, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error actualizando estado de menÃº.");
                return StatusCode(500, new { success = false, message = "Error actualizando estado" });
            }
        }

        private async Task<long> ResolveUsuarioAuditoriaAsync(CancellationToken ct)
        {
            var rawCedula = User.FindFirstValue("identificacion")
                ?? User.FindFirstValue("cedula")
                ?? User.FindFirstValue("numeroDocumento")
                ?? User.FindFirstValue("documento");
            if (long.TryParse(rawCedula, out var cedulaClaim) && cedulaClaim > 0)
            {
                return cedulaClaim;
            }

            var username =
                User?.Identity?.Name
                ?? User?.FindFirstValue(ClaimTypes.Name)
                ?? User?.FindFirstValue("http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name");

            if (!string.IsNullOrWhiteSpace(username))
            {
                var cedulaDb = await _dbUsuarioRepository.GetIdentificacionByUsernameAsync(username.Trim(), ct);
                if (long.TryParse(cedulaDb, out var cedula) && cedula > 0)
                {
                    return cedula;
                }
            }

            return 0;
        }

        private string ResolveMachine()
        {
            return HttpContext.Connection.RemoteIpAddress?.ToString()
                ?? Environment.MachineName
                ?? "N/A";
        }

        private async Task<List<DtoMenuItem>> GetMenuForUserAsync(long idUsuario, CancellationToken ct)
        {
            // Superusuarios configurados explícitamente en appsettings reciben todo el menú admin.
            // Usuarios con id_rol=1 (Administrador) o id_rol=2 (SuperAdministrador) son
            // identificados por el JWT claim es_admin=true emitido en JwtService.
            if (IsSuperUser(idUsuario) || IsAdmin())
            {
                var adminMenu = await _service.GetAdminMenuAsync(ct);
                var filtered  = adminMenu.Where(x => x.Vigente == 1).ToList();
                _logger.LogInformation("[Menu] Admin {Id}: {N} ítems.", idUsuario, filtered.Count);
                return filtered;
            }

            var menu = await _service.GetMyMenuAsync(idUsuario, ct);
            _logger.LogInformation("[Menu] Usuario {Id}: {N} ítems por roles.", idUsuario, menu.Count);
            return menu;
        }

        /// <summary>
        /// Verifica el claim es_admin del JWT.
        /// JwtService lo emite como "true" cuando el usuario tiene id_rol=1 o id_rol=2.
        /// </summary>
        private bool IsAdmin()
            => string.Equals(User.FindFirstValue("es_admin"), "true", StringComparison.OrdinalIgnoreCase);

        private bool IsSuperUser(long idUsuario)
            => _superUserIds.Contains(idUsuario);

        private static HashSet<long> ResolveSuperUserIds(IConfiguration configuration)
        {
            var ids = new HashSet<long>();

            var configured = configuration["Menu:SuperUserIds"];
            if (string.IsNullOrWhiteSpace(configured))
            {
                return ids;
            }

            var values = configured
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

            foreach (var value in values)
            {
                if (long.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var id) && id > 0)
                {
                    ids.Add(id);
                }
            }

            return ids;
        }
    }
}


