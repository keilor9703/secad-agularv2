namespace Comun.Dtos.Entidades
{
    /// <summary>
    /// Sitio de grabación: la unidad policial que opera dentro de un CAD.
    ///
    /// No se confunde con el tenant. El tenant es el CAD físico; el sitio es
    /// la unidad que trabaja en él. Un mismo CAD puede alojar varios sitios
    /// —dos municipios vecinos que comparten sala porque uno solo no puede
    /// costearla— y sus registros deben quedar separados. Por eso el sitio
    /// marca al usuario, a la fuerza y a todo lo que se recibe y despacha.
    /// </summary>
    public class DtoSitioGrabacion
    {
        /// <summary>Código del sitio (cad_sitios_grabacion.consecutivo). Lo define el CAD.</summary>
        public int     consecutivo   { get; set; }
        public string  descripcion   { get; set; } = string.Empty;
        /// <summary>Sigla con la que se nombra la unidad: MEBAR, DEATA…</summary>
        public string? abreviatura   { get; set; }
        /// <summary>DANE del municipio de la unidad (V31).</summary>
        public string? codDane       { get; set; }
        public string  vigente       { get; set; } = "S";
        /// <summary>Cuántas fuerzas están marcadas con este sitio.</summary>
        public int     totalFuerzas  { get; set; }
        /// <summary>Cuántos usuarios están marcados con este sitio.</summary>
        public int     totalUsuarios { get; set; }
    }

    /// <summary>Request para crear o actualizar un sitio de grabación.</summary>
    public class DtoSitioGrabacionRequest
    {
        /// <summary>Código elegido por el CAD. Requerido al crear, ignorado al actualizar.</summary>
        public int     consecutivo { get; set; }
        public string  descripcion { get; set; } = string.Empty;
        public string? abreviatura { get; set; }
        public string? codDane     { get; set; }
        public string  vigente     { get; set; } = "S";
    }
}
