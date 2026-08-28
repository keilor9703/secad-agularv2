namespace Comun.Dtos.Operacion
{
    /// <summary>
    /// Anotación general de turno (bitácora).
    /// No está ligada a ningún incidente — registra comunicados,
    /// revistas, novedades y actividades durante el turno.
    /// Especificación técnica SECAD §6.15.
    /// </summary>
    public class DtoAnotacionTurno
    {
        public long    Id                { get; set; }
        public string  Tipo              { get; set; } = "GENERAL";
        public string? Titulo            { get; set; }
        public string  Descripcion       { get; set; } = "";
        public int?    CanalCodigo       { get; set; }
        public string? CanalDesc         { get; set; }
        public int?    FuerzaId          { get; set; }
        public string? FuerzaDesc        { get; set; }
        public int?    SitioGraba        { get; set; }
        public string? UsernameCreacion  { get; set; }
        public string? NombreCompleto    { get; set; }
        public string? FechaCreacion     { get; set; }  // formateada dd/MM/yyyy HH:mm:ss
        public string? FechaModifica     { get; set; }
        public string? UsuarioModifica   { get; set; }
    }

    public class DtoAnotacionTurnoRequest
    {
        public string  Tipo         { get; set; } = "GENERAL";
        public string? Titulo       { get; set; }
        public string  Descripcion  { get; set; } = "";
        public int?    CanalCodigo  { get; set; }
        public int?    FuerzaId     { get; set; }
        public int?    SitioGraba   { get; set; }
    }
}
