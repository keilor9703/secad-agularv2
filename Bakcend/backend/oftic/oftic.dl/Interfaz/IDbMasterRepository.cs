using Comun.Dtos.Tenant;

namespace Datos.Interfaz
{
    public interface IDbMasterRepository
    {
        // ── Tenant resolution (used by TenantMiddleware + login flow) ─────────
        Task<DtoTenant?> GetTenantByCodDaneAsync(string codDane, CancellationToken ct);
        Task<DtoTenant?> GetTenantByCodUnidadAsync(string codUnidad, CancellationToken ct);
        Task<(string? codDane, string? passwordHash)> GetFallbackUserAsync(string username, CancellationToken ct);
        Task AuditFallbackLoginAsync(string username, string codDane, string? ipOrigen, bool modoFallback, CancellationToken ct);

        /// <summary>Crea o actualiza un usuario civil en secad_users_fallback.</summary>
        Task<(bool success, string message)> SaveCivilUserAsync(
            string username, string passwordHash, string codDane, bool activo, CancellationToken ct);

        // ── SuperAdmin: tenant management ─────────────────────────────────────
        /// <summary>Returns all tenants (active and inactive) for the SuperAdmin management UI.</summary>
        Task<List<DtoTenantPublico>> GetAllTenantsAsync(CancellationToken ct);

        /// <summary>Creates a new tenant record. Returns the new tenant's cod_dane on success.</summary>
        Task<(bool success, string message, string? codDane)> CreateTenantAsync(DtoTenantRequest request, CancellationToken ct);

        /// <summary>Updates an existing tenant. Pass null/empty DbPassword to preserve existing credentials.</summary>
        Task<(bool success, string message)> UpdateTenantAsync(int id, DtoTenantRequest request, CancellationToken ct);

        /// <summary>Toggles activo flag for a tenant.</summary>
        Task<(bool success, string message)> ToggleTenantAsync(int id, CancellationToken ct);

        // ── SuperAdmin: Salud CADs ────────────────────────────────────────────
        /// <summary>Returns all tenants with their current health metrics.</summary>
        Task<List<DtoTenantPublico>> GetSaludCadsAsync(CancellationToken ct);

        /// <summary>
        /// Returns all active tenants including DB credentials.
        /// <b>Internal use only</b> — exclusively for the health monitor background service.
        /// Never expose the result of this method in an API response.
        /// </summary>
        Task<List<DtoTenant>> GetActiveTenantsForMonitorAsync(CancellationToken ct);

        /// <summary>Updates health metrics for a single CAD (called by monitoring agent).</summary>
        Task UpdateSaludCadAsync(DtoSaludCadRequest request, CancellationToken ct);

        /// <summary>Returns the last N health history records for a given CAD.</summary>
        Task<List<DtoSaludHistorial>> GetSaludHistorialAsync(string codDane, int limit, CancellationToken ct);

        // ── SuperAdmin: Unidades y Municipios Institucionales ────────────────
        /// <summary>Lista única de departamentos institucionales.</summary>
        Task<List<DtoDepartamentoItem>> GetDepartamentosAsync(CancellationToken ct);

        /// <summary>Lista de municipios pertenecientes a un departamento.</summary>
        Task<List<DtoMunicipioItem>> GetMunicipiosByDepartamentoAsync(string departamento, CancellationToken ct);

        /// <summary>Listado paginado y filtrable de unidades institucionales.</summary>
        Task<DtoUnidadesPaginadas> GetUnidadesAsync(string? filtro, string? departamento, int page, int pageSize, CancellationToken ct);

        /// <summary>Crea o actualiza una unidad institucional.</summary>
        Task<(bool success, string message, decimal consecutivo)> SaveUnidadAsync(DtoUnidadSaveRequest request, string usuarioAuditoria, CancellationToken ct);

        /// <summary>
        /// Importación masiva desde Excel. Una sola transacción para todo el
        /// archivo: o entra completo o no entra nada, de modo que un corte a
        /// mitad no deja el catálogo a medias.
        /// </summary>
        Task<DtoImportarUnidadesResult> ImportarUnidadesAsync(List<DtoUnidadImportItem> items, string usuarioAuditoria, CancellationToken ct);

        /// <summary>Alterna el estado vigente (SI/NO) de una unidad institucional.</summary>
        Task<(bool success, string message)> ToggleUnidadVigenteAsync(decimal consecutivo, CancellationToken ct);
    }

    public class DtoSaludHistorial
    {
        public long Id { get; set; }
        public string CodDane { get; set; } = string.Empty;
        public int NivelOperacion { get; set; }
        public int? LatenciaMs { get; set; }
        public string? Observacion { get; set; }
        public DateTime RegistradoEn { get; set; }
    }
}
