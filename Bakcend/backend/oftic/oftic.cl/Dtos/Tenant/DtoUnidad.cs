using System;
using System.Collections.Generic;

namespace Comun.Dtos.Tenant
{
    /// <summary>
    /// Representación de una unidad institucional (tabla secad_unidades en Master).
    /// </summary>
    public class DtoUnidadItem
    {
        public decimal Consecutivo { get; set; }
        public decimal? Fuerza { get; set; }
        public string DescripcionDependencia { get; set; } = string.Empty;
        public string Vigente { get; set; } = "SI";
        public string? SiglaFisica { get; set; }
        public string? SiglaPapa { get; set; }
        public string? SiglaDepende { get; set; }
        public string? Departamento { get; set; }
        public decimal? CodigoDepartamento { get; set; }
        public string? Municipio { get; set; }
        public string? CodigoDane { get; set; }
        public string? DescRegional { get; set; }
        public decimal? CodRegional { get; set; }
        public string? Direccion { get; set; }
        public string? Telefono { get; set; }
        public string? TelefonoIp { get; set; }
        public string? Email { get; set; }
        public string? Zona { get; set; }
        public string? Tipo { get; set; }
        public string? TipoDescripcion { get; set; }
        public DateTime? FechaCreacion { get; set; }
        public DateTime? FechaActualiza { get; set; }
    }

    /// <summary>
    /// Elemento simplificado de departamento para listas desplegables.
    /// </summary>
    public class DtoDepartamentoItem
    {
        public string Departamento { get; set; } = string.Empty;
        public decimal? CodigoDepartamento { get; set; }
        public int TotalMunicipios { get; set; }
    }

    /// <summary>
    /// Elemento simplificado de municipio para listas desplegables en registro de tenants.
    /// </summary>
    public class DtoMunicipioItem
    {
        public decimal Consecutivo { get; set; }
        public string Municipio { get; set; } = string.Empty;
        public string Departamento { get; set; } = string.Empty;
        public string CodigoDane { get; set; } = string.Empty;
        public string? SiglaFisica { get; set; }
        public string? DescripcionDependencia { get; set; }
        public string? DescRegional { get; set; }
    }

    /// <summary>
    /// Solicitud de creación o actualización de una unidad institucional.
    /// </summary>
    public class DtoUnidadSaveRequest
    {
        public decimal? Consecutivo { get; set; }
        public decimal? Fuerza { get; set; } = 6;
        public string DescripcionDependencia { get; set; } = string.Empty;
        public string Vigente { get; set; } = "SI";
        public string? SiglaFisica { get; set; }
        public string? SiglaPapa { get; set; }
        public string Departamento { get; set; } = string.Empty;
        public decimal? CodigoDepartamento { get; set; }
        public string Municipio { get; set; } = string.Empty;
        public string CodigoDane { get; set; } = string.Empty;
        public string? DescRegional { get; set; }
        public decimal? CodRegional { get; set; }
        public string? Direccion { get; set; }
        public string? Telefono { get; set; }
        public string? TelefonoIp { get; set; }
        public string? Email { get; set; }
        public string? Zona { get; set; } = "UR";
        public string? Tipo { get; set; } = "DE";
        public string? TipoDescripcion { get; set; } = "CM";
    }

    /// <summary>
    /// Respuesta paginada de unidades institucionales.
    /// </summary>
    public class DtoUnidadesPaginadas
    {
        public List<DtoUnidadItem> Items { get; set; } = new();
        public int TotalCount { get; set; }
        public int Page { get; set; }
        public int PageSize { get; set; }
    }
}
