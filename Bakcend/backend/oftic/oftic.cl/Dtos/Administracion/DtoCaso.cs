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

        /// <summary>
        /// Código DANE del CAD/municipio al que aplica el código de caso.
        /// Si es NULL o vacío, es de ámbito nacional (aplica a todos los tenants).
        /// </summary>
        public string? CodDane              { get; set; }
        public string? NombreCad            { get; set; }
        public bool    EsNacional           => string.IsNullOrWhiteSpace(CodDane);
    }

    public class DtoCasoRequest
    {
        public string  Codigo              { get; set; } = "";
        public string  Descripcion         { get; set; } = "";
        public bool    Vigente             { get; set; } = true;
        public string? IdCategoriaAsistente { get; set; }

        /// <summary>
        /// Código DANE del CAD específico, o null/vacío si es de ámbito nacional.
        /// </summary>
        public string? CodDane              { get; set; }
    }

    public class DtoCasoResult
    {
        public bool   Success { get; set; }
        public string Message { get; set; } = "";
    }

    // ── Importación masiva (filas ya parseadas del Excel en el frontend) ─────

    public class DtoCasoImportItem
    {
        public string  Codigo      { get; set; } = "";
        public string  Descripcion { get; set; } = "";
        public string? CodDane     { get; set; }
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
