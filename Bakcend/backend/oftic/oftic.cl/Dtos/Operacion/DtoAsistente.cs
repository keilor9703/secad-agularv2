namespace Comun.Dtos.Operacion
{
    // ═══════════════════════════════════════════════════════════════════════════
    //  §6.17 Asistente Inteligente — Preguntas orientadoras por tipo de incidente
    // ═══════════════════════════════════════════════════════════════════════════

    // ── Categorías de tipo de incidente ──────────────────────────────────────────

    /// <summary>
    /// Categoría que agrupa un conjunto de preguntas orientadoras.
    /// Ejemplos: HURTO, ACCIDENTE_TRANSITO, RIÑA, EMERGENCIA_MEDICA…
    /// </summary>
    public class DtoAsistenteCategoria
    {
        public long   Id             { get; set; }
        public string Codigo         { get; set; } = "";
        public string Descripcion    { get; set; } = "";
        public string Icono          { get; set; } = "fa-circle-question";
        public int    Orden          { get; set; }
        public bool   Activo         { get; set; } = true;
        /// <summary>Conteo de preguntas activas asociadas a esta categoría.</summary>
        public int    TotalPreguntas { get; set; }
    }

    public class DtoAsistenteCategoriaRequest
    {
        public string Codigo      { get; set; } = "";
        public string Descripcion { get; set; } = "";
        public string Icono       { get; set; } = "fa-circle-question";
        public int    Orden       { get; set; }
        public bool   Activo      { get; set; } = true;
    }

    // ── Preguntas orientadoras ────────────────────────────────────────────────────

    /// <summary>
    /// Pregunta guía que se muestra al despachador cuando tipifica un incidente.
    /// TipoRespuesta: TEXTO | SINO | NUMERO | SELECCION
    /// Opciones: JSON array de strings, sólo para TipoRespuesta = SELECCION.
    /// </summary>
    public class DtoAsistentePregunta
    {
        public long    Id            { get; set; }
        public long?   CategoriaId   { get; set; }
        public string? CategoriaDesc { get; set; }
        public string  Pregunta      { get; set; } = "";
        /// <summary>Texto de ayuda / hint para el despachador.</summary>
        public string? Ayuda         { get; set; }
        public string  TipoRespuesta { get; set; } = "TEXTO";
        /// <summary>JSON array de strings para tipo SELECCION.</summary>
        public string? Opciones      { get; set; }
        public bool    Obligatoria   { get; set; }
        public int     Orden         { get; set; }
        public bool    Activo        { get; set; } = true;
    }

    public class DtoAsistentePreguntaRequest
    {
        public long?   CategoriaId   { get; set; }
        public string  Pregunta      { get; set; } = "";
        public string? Ayuda         { get; set; }
        public string  TipoRespuesta { get; set; } = "TEXTO";
        public string? Opciones      { get; set; }
        public bool    Obligatoria   { get; set; }
        public int     Orden         { get; set; }
        public bool    Activo        { get; set; } = true;
    }
}
