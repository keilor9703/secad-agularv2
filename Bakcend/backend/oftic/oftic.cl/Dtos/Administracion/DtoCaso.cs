namespace Comun.Dtos.Administracion
{
    // ── Código de caso (catálogo cad_casos) ──────────────────────────────────

    public class DtoCaso
    {
        public string  Codigo               { get; set; } = "";
        public string  Descripcion          { get; set; } = "";
        public bool    Vigente              { get; set; } = true;
        public string? IdCategoriaAsistente  { get; set; }
        public string? CategoriaDescripcion  { get; set; }
    }

    public class DtoCasoRequest
    {
        public string  Codigo              { get; set; } = "";
        public string  Descripcion         { get; set; } = "";
        public bool    Vigente             { get; set; } = true;
        public string? IdCategoriaAsistente { get; set; }
    }

    public class DtoCasoResult
    {
        public bool   Success { get; set; }
        public string Message { get; set; } = "";
    }

    // ── Importación masiva (filas ya parseadas del Excel en el frontend) ─────

    public class DtoCasoImportItem
    {
        public string Codigo      { get; set; } = "";
        public string Descripcion { get; set; } = "";
    }

    public class DtoImportarCasosResult
    {
        public bool         Success      { get; set; }
        public string       Message      { get; set; } = "";
        public int          Creados      { get; set; }
        public int          Actualizados { get; set; }
        public List<string> Errores      { get; set; } = new();
    }
}
