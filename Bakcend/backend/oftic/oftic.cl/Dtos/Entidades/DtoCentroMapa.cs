namespace Comun.Dtos.Entidades
{
    /// <summary>
    /// Dónde abre el mapa cuando el operador entra a una pantalla que lo tiene.
    ///
    /// Los tres mapas del sistema arrancaban con Bogotá escrita a mano, de modo
    /// que el operador de Cali empezaba cada llamada a 400 km de su ciudad.
    /// Esto es lo que responde a «¿dónde trabaja este usuario?».
    /// </summary>
    public class DtoCentroMapa
    {
        public decimal latitud  { get; set; }
        public decimal longitud { get; set; }
        public int     zoom     { get; set; } = 12;

        /// <summary>De dónde salió: 'sitio', 'tenant' o 'defecto'.</summary>
        public string origen { get; set; } = "defecto";

        /// <summary>Nombre de la unidad o del CAD, para poder decirlo en pantalla.</summary>
        public string? descripcion { get; set; }

        /// <summary>
        /// true = nadie configuró coordenadas y esto es el centro de reserva.
        /// La pantalla puede avisarlo en vez de dejar al operador preguntándose
        /// por qué ve otra ciudad.
        /// </summary>
        public bool porDefecto { get; set; }

        /// <summary>Centro de reserva: Bogotá, el mismo que estaba en el código.</summary>
        public static DtoCentroMapa Defecto() => new()
        {
            latitud = 4.711000m, longitud = -74.072100m, zoom = 12,
            origen = "defecto", porDefecto = true,
        };
    }
}
