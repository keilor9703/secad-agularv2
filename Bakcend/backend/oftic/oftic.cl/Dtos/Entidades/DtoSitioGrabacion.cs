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
        /// <summary>Centro del mapa de la unidad: es donde abre Recepción.</summary>
        public decimal? latitud      { get; set; }
        public decimal? longitud     { get; set; }
        /// <summary>12-13 para un municipio, 8-9 para un departamento entero.</summary>
        public int?     zoomMapa     { get; set; }
        /// <summary>Cuántas fuerzas están marcadas con este sitio.</summary>
        public int     totalFuerzas  { get; set; }
        /// <summary>Cuántos usuarios están marcados con este sitio.</summary>
        public int     totalUsuarios { get; set; }
    }

    /// <summary>
    /// Request para mover en bloque las fuerzas de un sitio a otro.
    ///
    /// Existe por el arranque: en un CAD que ya venía trabajando, las fuerzas
    /// están todas en el sitio 0 («sin clasificar») porque hasta ahora el valor
    /// salía del claim del administrador. Reclasificarlas de a una sería
    /// abrir y guardar veinte formularios.
    /// </summary>
    public class DtoReasignarSitioRequest
    {
        /// <summary>Sitio del que salen. 0 = las que están sin clasificar.</summary>
        public int sitioOrigen  { get; set; }
        /// <summary>Sitio al que van. Debe existir.</summary>
        public int sitioDestino { get; set; }
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
        public decimal? latitud    { get; set; }
        public decimal? longitud   { get; set; }
        public int?     zoomMapa   { get; set; }
    }
}
