namespace Comun.Dtos.Tenant
{
    /// <summary>
    /// Un superadministrador del sistema, tal como lo guarda la base MAESTRA
    /// (secad_super_admins). No es un rol de ningún CAD: es una autoridad sobre
    /// todos ellos, y por eso vive fuera de las bases de los tenants.
    ///
    /// La clave es el username de OUD, no el id: ctr_usuarios.id_usuario es
    /// local a cada tenant y el mismo número identifica a personas distintas en
    /// CAD distintos.
    /// </summary>
    public class DtoSuperAdmin
    {
        public string  Username        { get; set; } = string.Empty;
        public string? Nombre          { get; set; }
        public string? CodDaneOrigen   { get; set; }
        /// <summary>Nombre del CAD de origen, resuelto contra secad_tenants.</summary>
        public string? NombreCadOrigen { get; set; }
        public bool    Activo          { get; set; } = true;
        public string? Observacion     { get; set; }
        public DateTime? FechaCreacion { get; set; }
        public DateTime? FechaModifica { get; set; }
    }

    /// <summary>Alta o edición de un superadministrador.</summary>
    public class DtoSuperAdminRequest
    {
        public string  Username      { get; set; } = string.Empty;
        public string? Nombre        { get; set; }
        public string? CodDaneOrigen { get; set; }
        public bool    Activo        { get; set; } = true;
        public string? Observacion   { get; set; }
    }
}
