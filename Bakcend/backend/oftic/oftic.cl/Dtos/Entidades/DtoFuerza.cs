namespace Comun.Dtos.Entidades
{
    /// <summary>Fuerza/Entidad de despacho con contadores agregados.</summary>
    public class DtoFuerza
    {
        public int    id            { get; set; }
        public int    sitioGraba    { get; set; }
        public string descripcion   { get; set; } = string.Empty;
        public string? abreviatura  { get; set; }
        public string vigente       { get; set; } = "S";
        public int    totalCanales  { get; set; }
        public int    totalUsuarios { get; set; }
    }

    /// <summary>Canal de despacho perteneciente a una fuerza.</summary>
    public class DtoCanalFuerza
    {
        public int    codigo      { get; set; }
        public int    fuerzaId    { get; set; }
        public string descripcion { get; set; } = string.Empty;
        public string vigente     { get; set; } = "S";
    }

    /// <summary>Request para crear o actualizar una fuerza.</summary>
    public class DtoFuerzaRequest
    {
        /// <summary>Código / ID definido por el usuario (requerido en creación, ignorado en update).</summary>
        public int     id          { get; set; }
        public string  descripcion { get; set; } = string.Empty;
        public string? abreviatura { get; set; }
        public string  vigente     { get; set; } = "S";
    }

    /// <summary>Request para crear o actualizar un canal dentro de una fuerza.</summary>
    public class DtoCanalRequest
    {
        public string descripcion { get; set; } = string.Empty;
        public string vigente     { get; set; } = "S";
    }

    /// <summary>Resultado genérico de operaciones sobre fuerzas/canales.</summary>
    public class DtoFuerzaResult
    {
        public bool   success { get; set; }
        public int    id      { get; set; }
        public string message { get; set; } = string.Empty;
    }

    /// <summary>Usuario listado dentro del detalle de una fuerza.</summary>
    public class DtoUsuarioEnFuerza
    {
        public long   idUsuario        { get; set; }
        public string username         { get; set; } = string.Empty;
        public string nombreCompleto   { get; set; } = string.Empty;
        public int    canalCodigo      { get; set; }
        public string? canalDescripcion { get; set; }
        public int    acd              { get; set; }
    }

    /// <summary>Request para guardar datos operacionales de un usuario (fuerza, canal, ACD).</summary>
    public class DtoUsuarioOperacionRequest
    {
        public int cadcanaFuerzaId { get; set; }
        public int cadcanaCodigo   { get; set; }
        public int acd             { get; set; }
    }

    /// <summary>Datos operacionales de un usuario leídos desde ctr_usuarios, enriquecidos con nombres.</summary>
    public class DtoUsuarioOperacion
    {
        public int    cadcanaFuerzaId   { get; set; }
        public int    cadcanaCodigo     { get; set; }
        public int    acd               { get; set; }
        public int    sitioGrabacion    { get; set; }
        public string? fuerzaDescripcion { get; set; }
        public string? fuerzaAbreviatura { get; set; }
        public string? canalDescripcion  { get; set; }
    }
}
