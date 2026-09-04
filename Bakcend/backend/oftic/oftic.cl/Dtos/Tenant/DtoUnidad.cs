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
    /// Resultado de una importación masiva desde Excel.
    /// </summary>
    public class DtoImportarUnidadesResult
    {
        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
        public int Creadas { get; set; }
        public int Actualizadas { get; set; }
        /// <summary>
        /// Filas que no se pudieron guardar, con el número de fila del archivo
        /// para que quien importa sepa dónde mirar. No se corta la importación
        /// por una fila mala: las demás sí entran.
        /// </summary>
        public List<DtoImportarUnidadesError> Errores { get; set; } = new();
    }

    public class DtoImportarUnidadesError
    {
        public int Fila { get; set; }
        public string Descripcion { get; set; } = string.Empty;
        public string Motivo { get; set; } = string.Empty;
    }

    /// <summary>
    /// Una fila del archivo importado. Es el mismo juego de campos que el alta
    /// manual, más el número de fila para poder señalar los errores.
    /// </summary>
    public class DtoUnidadImportItem : DtoUnidadSaveRequest
    {
        /// <summary>Fila del Excel de la que salió, para el informe de errores.</summary>
        public int Fila { get; set; }
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
