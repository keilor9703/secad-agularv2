using Comun.Dtos.Tenant;
using Datos.Interfaz;
using Datos.Tenant;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Negocio.Interfaz;
using System.Security.Claims;

namespace Api.Controllers
{
    /// <summary>
    /// Endpoints exclusivos para el rol SuperAdministrador:
    ///   - Gestión de tenants (CRUD en la BD maestra)
    ///   - Cambio de contexto (context switching)
    ///   - Dashboard de salud de CADs
    /// </summary>
    [ApiController]
    [Route("api/super")]
    [Authorize(Policy = "SuperAdministrador")]
    public class SuperAdminController : ControllerBase
    {
        private readonly IDbMasterRepository _masterRepo;
        private readonly ConnectionPoolManager _poolManager;
        private readonly IJwtService _jwtService;
        private readonly ILogger<SuperAdminController> _logger;

        public SuperAdminController(
            IDbMasterRepository masterRepo,
            ConnectionPoolManager poolManager,
            IJwtService jwtService,
            ILogger<SuperAdminController> logger)
        {
            _masterRepo  = masterRepo;
            _poolManager = poolManager;
            _jwtService  = jwtService;
            _logger      = logger;
        }

        // ── Tenant management ─────────────────────────────────────────────────

        /// <summary>Lista todos los tenants registrados (activos e inactivos).</summary>
        [HttpGet("tenants")]
        public async Task<IActionResult> GetTenants(CancellationToken ct)
        {
            var tenants = await _masterRepo.GetAllTenantsAsync(ct);
            return Ok(tenants);
        }

        /// <summary>Crea un nuevo tenant en la BD maestra.</summary>
        [HttpPost("tenants")]
        public async Task<IActionResult> CreateTenant([FromBody] DtoTenantRequest request, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(request.CodDane) ||
                string.IsNullOrWhiteSpace(request.Nombre)  ||
                string.IsNullOrWhiteSpace(request.DbHost)  ||
                string.IsNullOrWhiteSpace(request.DbName)  ||
                string.IsNullOrWhiteSpace(request.DbUsername))
            {
                return BadRequest(new { success = false, message = "CodDane, Nombre, DbHost, DbName y DbUsername son obligatorios." });
            }

            if (string.IsNullOrWhiteSpace(request.DbPassword))
                return BadRequest(new { success = false, message = "La contraseña de BD es obligatoria al crear un tenant." });

            var (success, message, codDane) = await _masterRepo.CreateTenantAsync(request, ct);
            if (!success) return Conflict(new { success, message });

            _logger.LogInformation("SuperAdmin {User} creó tenant {CodDane}", User.Identity?.Name, codDane);
            return Ok(new { success, message, codDane });
        }

        /// <summary>Actualiza un tenant existente.</summary>
        [HttpPut("tenants/{id:int}")]
        public async Task<IActionResult> UpdateTenant(int id, [FromBody] DtoTenantRequest request, CancellationToken ct)
        {
            var (success, message) = await _masterRepo.UpdateTenantAsync(id, request, ct);
            if (!success) return NotFound(new { success, message });

            // Invalida el pool si existe, para forzar reconexión con nuevas credenciales
            if (!string.IsNullOrWhiteSpace(request.CodDane))
                _poolManager.Invalidate(request.CodDane);

            _logger.LogInformation("SuperAdmin {User} actualizó tenant id={Id}", User.Identity?.Name, id);
            return Ok(new { success, message });
        }

        /// <summary>Activa o desactiva un tenant.</summary>
        [HttpPatch("tenants/{id:int}/toggle")]
        public async Task<IActionResult> ToggleTenant(int id, CancellationToken ct)
        {
            var (success, message) = await _masterRepo.ToggleTenantAsync(id, ct);
            if (!success) return NotFound(new { success, message });
            return Ok(new { success, message });
        }

        // ── Context switching ─────────────────────────────────────────────────

        /// <summary>
        /// Emite un nuevo JWT para el SuperAdmin con el tenant objetivo como contexto activo.
        /// El claim <c>home_cod_dane</c> preserva el tenant original para volver al contexto propio.
        /// </summary>
        [HttpPost("switch-context")]
        public async Task<IActionResult> SwitchContext([FromBody] DtoContextSwitch request, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(request.CodDane))
                return BadRequest(new { success = false, message = "CodDane requerido." });

            // Validate that target tenant exists
            var targetTenant = await _masterRepo.GetTenantByCodDaneAsync(request.CodDane, ct);
            if (targetTenant is null)
                return NotFound(new { success = false, message = $"Tenant '{request.CodDane}' no encontrado o inactivo." });

            // Read current claims from the caller's JWT
            var idUsuario  = long.Parse(User.FindFirstValue("id_usuario") ?? "0");
            var usuario    = User.FindFirstValue(ClaimTypes.Name) ?? "";
            var roles      = User.FindAll(ClaimTypes.Role).Select(c => long.Parse(c.Value)).ToList();
            var sitioGraba = int.Parse(User.FindFirstValue("sitio_graba") ?? "0");
            var acd        = int.Parse(User.FindFirstValue("acd")         ?? "0");
            var fuerzaId   = int.Parse(User.FindFirstValue("fuerza_id")   ?? "0");
            var canalId    = int.Parse(User.FindFirstValue("canal_id")    ?? "0");
            // home_cod_dane is the ORIGINAL tenant — never updated during context switching
            var homeCodDane = User.FindFirstValue("home_cod_dane")
                           ?? User.FindFirstValue("cod_dane")
                           ?? "";

            var newToken = _jwtService.CreateToken(
                idUsuario, usuario, roles,
                codDane:     targetTenant.CodDane,
                nombreCad:   targetTenant.Nombre,
                sitioGraba:  0,   // reset — superadmin navigates above site level
                acd:         acd,
                fuerzaId:    0,
                canalId:     0,
                homeCodDane: homeCodDane);

            _logger.LogInformation(
                "SuperAdmin {User} switched context to tenant {Target} (home={Home})",
                usuario, request.CodDane, homeCodDane);

            return Ok(new
            {
                success     = true,
                token       = newToken,
                codDane     = targetTenant.CodDane,
                nombreCad   = targetTenant.Nombre,
                homeCodDane = homeCodDane
            });
        }

        // ── Salud CADs ────────────────────────────────────────────────────────

        /// <summary>Retorna todos los CADs con sus métricas de salud actuales.</summary>
        [HttpGet("salud")]
        public async Task<IActionResult> GetSaludCads(CancellationToken ct)
        {
            var data = await _masterRepo.GetSaludCadsAsync(ct);
            return Ok(data);
        }

        /// <summary>Actualiza las métricas de salud de un CAD (llamado por agente de monitoreo).</summary>
        [HttpPost("salud")]
        public async Task<IActionResult> UpdateSaludCad([FromBody] DtoSaludCadRequest request, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(request.CodDane))
                return BadRequest(new { success = false, message = "CodDane requerido." });

            await _masterRepo.UpdateSaludCadAsync(request, ct);
            return Ok(new { success = true, message = "Salud actualizada." });
        }

        /// <summary>Historial de salud de un CAD específico.</summary>
        [HttpGet("salud/{codDane}/historial")]
        public async Task<IActionResult> GetHistorial(string codDane, [FromQuery] int limit = 48, CancellationToken ct = default)
        {
            var data = await _masterRepo.GetSaludHistorialAsync(codDane, limit, ct);
            return Ok(data);
        }
    }
}
