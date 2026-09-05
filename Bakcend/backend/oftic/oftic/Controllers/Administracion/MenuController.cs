using Comun.Dtos.Menu;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Datos.Interfaz;
using Negocio.Interfaz;
using System.Security.Claims;
using System.Globalization;

using Comun.Security;

namespace Api.Controllers.Administracion
{
    [ApiController]
    [Route("api/menu")]
    public class MenuController : ControllerBase
    {
        private readonly IDbMenuService _service;
        private readonly IDbUsuarioRepository _dbUsuarioRepository;
        private readonly ILogger<MenuController> _logger;

        public MenuController(
            IDbMenuService service,
            IDbUsuarioRepository dbUsuarioRepository,
            IConfiguration configuration,
            ILogger<MenuController> logger)
        {
            _service = service;
            _dbUsuarioRepository = dbUsuarioRepository;
            _logger = logger;
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

        // ══ Frontera del área de Super Admin ══════════════════════════════
        //
        // TODO lo que enseña un menú sale de aquí: el lateral del usuario, el
        // módulo Administración → Menú y el panel de permisos de Roles. Por eso
        // el filtro vive en este punto y no en cada pantalla: parchear una
        // dejaba las otras dos abiertas, que es exactamente lo que pasó.
        //
        // Para quien no es superadministrador, el área /super no existe: ni sus
        // pantallas ni el grupo que las contiene.

        private bool LlamanteEsSuperAdmin() =>
            User.FindFirst("es_super_admin")?.Value == "true";

        /// <summary>
        /// Quita las pantallas de /super y, detrás de ellas, el grupo que se
        /// queda sin nada dentro. Un grupo vacío no solo sobra: delata el área
        /// que se está ocultando.
        /// </summary>
        private List<DtoMenuItem> SinAreaSuper(List<DtoMenuItem> menu)
        {
            if (LlamanteEsSuperAdmin()) return menu;

            var visibles = menu
                .Where(m => !(m.Detalle ?? "").Trim().StartsWith("/super/", StringComparison.OrdinalIgnoreCase))
                .ToList();

            // Un contenedor es el que no lleva ruta propia: se queda solo si
            // aún le cuelga algo. Se repite hasta que no cambie nada, por si
            // hubiera grupos dentro de grupos.
            bool huboCambios;
            do
            {
                var padresConHijos = visibles
                    .Where(m => m.IdPadre != m.IdMenu)   // una raíz no es hija de sí misma
                    .Select(m => m.IdPadre)
                    .ToHashSet();

                var antes = visibles.Count;
                visibles = visibles
                    .Where(m => !string.IsNullOrWhiteSpace(m.Detalle)
                             || padresConHijos.Contains(m.IdMenu))
                    .ToList();

                huboCambios = visibles.Count != antes;
            } while (huboCambios);

            return visibles;
        }

        [HttpGet("admin")]
        [Authorize]
        public async Task<ActionResult<List<DtoMenuItem>>> GetAdminMenu(CancellationToken ct)
        {
            var menu = await _service.GetAdminMenuAsync(ct);
            return Ok(SinAreaSuper(menu));
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

        /// <summary>
        /// Guarda de una vez TODAS las pantallas que el rol podrá ver. Lo que
        /// no venga en la lista se retira.
        ///
        /// Existe porque conceder de una en una obligaba a una llamada por
        /// pantalla, y a media tanda un fallo dejaba al rol con permisos a
        /// medias sin que nadie supiera cuáles. Aquí es una transacción: o se
        /// guarda la decisión completa, o no se guarda nada.
        /// </summary>
        [HttpPut("admin/roles/{idRol:int}/menus")]
        [Authorize]
        public async Task<IActionResult> ReemplazarMenusDeRol(
            int idRol, [FromBody] DtoReemplazarMenusRolRequest? request, CancellationToken ct)
        {
            try
            {

                if (idRol <= 0)
                {
                    return BadRequest(new { success = false, message = "Id de rol inválido." });
                }

                var userId  = await ResolveUsuarioAuditoriaAsync(ct);
                var machine = ResolveMachine();
                // Solo un superadministrador gestiona las pantallas de /super.
                var puedeSuper = User.FindFirst("es_super_admin")?.Value == "true";

                var result = await _service.ReemplazarMenusDeRolAsync(
                    idRol, request?.IdMenus ?? new List<long>(), puedeSuper, userId, machine, ct);

                return Ok(new { success = true, id = result.Id, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error guardando los permisos del rol {IdRol}", idRol);
                return StatusCode(500, new { success = false, message = "Error guardando los permisos del rol." });
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
            // El administrador del CAD recibe el menú completo. Se reconoce por el
            // claim es_admin del JWT.
            //
            // Aquí había además una lista de «superusuarios» leída de
            // Menu:SuperUserIds del appsettings, que comparaba contra
            // ctr_usuarios.id_usuario. Ese id es LOCAL a cada tenant y es
            // BIGSERIAL, así que el usuario «admin» que siembra V2 se lleva el 1
            // en cada CAD nuevo: la lista «1,2» convertía en superusuario al
            // admin sembrado de cualquier tenant. Se eliminó junto con V66.
            if (IsAdmin())
            {
                var adminMenu = await _service.GetAdminMenuAsync(ct);
                var filtered  = SinAreaSuper(adminMenu.Where(x => x.Vigente == 1).ToList());
                _logger.LogInformation("[Menu] Admin {Id}: {N} ítems.", idUsuario, filtered.Count);
                return filtered;
            }

            var menu = await _service.GetMyMenuAsync(idUsuario, ct);
            _logger.LogInformation("[Menu] Usuario {Id}: {N} ítems por roles.", idUsuario, menu.Count);
            return menu;
        }

        /// <summary>
        /// Verifica el claim es_admin del JWT.
        /// JwtService lo emite como "true" para el Administrador del CAD (rol 1) y
        /// para el superadministrador del sistema, que se resuelve en la maestra.
        /// </summary>
        private bool IsAdmin()
            => string.Equals(User.FindFirstValue("es_admin"), "true", StringComparison.OrdinalIgnoreCase);


    }
}


