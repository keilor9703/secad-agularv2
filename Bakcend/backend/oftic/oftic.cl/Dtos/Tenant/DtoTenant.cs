namespace Comun.Dtos.Tenant
{
    /// <summary>
    /// Internal DTO — includes DB credentials. Only used inside the backend for tenant resolution.
    /// Never serialise directly to the API response.
    /// </summary>
    public class DtoTenant
    {
        public int Id { get; set; }
        public string CodDane { get; set; } = string.Empty;
        public string? CodUnidad { get; set; }
        public string Nombre { get; set; } = string.Empty;
        public string? Departamento { get; set; }
        public string? Municipio { get; set; }
        public string? Categoria { get; set; }
        public bool Activo { get; set; } = true;
        public bool Suspendido { get; set; } = false;
        /// <summary>
        /// Consecutivo del sitio de grabación principal de este CAD
        /// (hace match con cad_sitios_grabacion.consecutivo en el schema del tenant).
        /// </summary>
        public int? SitioGraba { get; set; }
        public string DbHost { get; set; } = string.Empty;
        public int DbPort { get; set; } = 5432;
        public string DbName { get; set; } = string.Empty;
        public string DbUsername { get; set; } = string.Empty;
        public string DbPassword { get; set; } = string.Empty;
        /// <summary>
        /// Sigla de la unidad tal como aparece en GESPO (columna SIGLA_PAPA_UNIDAD de
        /// VW_CONSULTA_ACTUAL_GPS) — permite filtrar la consulta a Oracle para que este
        /// tenant reciba solo sus propias patrullas, no las de todo el país. Es un
        /// campo distinto de CodUnidad (que viene de la integración OUD/login), aunque
        /// coincida en valor para algunos tenants — se define aparte para no acoplar
        /// esta característica a un campo de otra integración. Null/vacío = GPS
        /// deshabilitado para ese tenant hasta que se configure.
        /// </summary>
        public string? GespoSiglaUnidad { get; set; }
    }

    /// <summary>
    /// Public-facing tenant DTO for API responses — no DB credentials exposed.
    /// </summary>
    public class DtoTenantPublico
    {
        public int Id { get; set; }
        public string CodDane { get; set; } = string.Empty;
        public string? CodUnidad { get; set; }
        public string Nombre { get; set; } = string.Empty;
        public string? Departamento { get; set; }
        public string? Municipio { get; set; }
        public string? Categoria { get; set; }
        public bool Activo { get; set; }
        public bool Suspendido { get; set; }
        /// <summary>Sitio de grabación principal del CAD (consecutivo en cad_sitios_grabacion).</summary>
        public int? SitioGraba { get; set; }
        public DateTime? FechaCreacion { get; set; }
        public DateTime? FechaModificacion { get; set; }

        // Health monitoring (from V23 columns)
        public int NivelOperacion { get; set; } = 1;
        public int? LatenciaMs { get; set; }
        public DateTime? UltimaSincro { get; set; }
        public int IncidentesActivos { get; set; }
        public string? Observaciones { get; set; }
    }

    /// <summary>
    /// Request DTO for creating or updating a tenant.
    /// </summary>
    public class DtoTenantRequest
    {
        public string CodDane { get; set; } = string.Empty;
        public string? CodUnidad { get; set; }
        public string Nombre { get; set; } = string.Empty;
        public string? Departamento { get; set; }
        public string? Municipio { get; set; }
        public string Categoria { get; set; } = "A";
        /// <summary>
        /// Sitio de grabación principal del CAD.
        /// Debe corresponder a un consecutivo válido en cad_sitios_grabacion del tenant.
        /// </summary>
        public int? SitioGraba { get; set; }
        public string DbHost { get; set; } = string.Empty;
        public int DbPort { get; set; } = 5432;
        public string DbName { get; set; } = string.Empty;
        public string DbUsername { get; set; } = string.Empty;
        /// <summary>DB password. If null/empty on update, existing password is preserved.</summary>
        public string? DbPassword { get; set; }
        public bool Activo { get; set; } = true;
    }

    /// <summary>
    /// Request DTO to update health metrics for a CAD.
    /// </summary>
    public class DtoSaludCadRequest
    {
        public string CodDane { get; set; } = string.Empty;
        public int NivelOperacion { get; set; } = 1;
        public int? LatenciaMs { get; set; }
        public string? Observaciones { get; set; }
    }

    /// <summary>
    /// Request DTO for SuperAdmin context switching.
    /// </summary>
    public class DtoContextSwitch
    {
        public string CodDane { get; set; } = string.Empty;
    }
}
