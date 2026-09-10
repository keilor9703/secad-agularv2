using System.Text.Json.Serialization;

namespace Comun.Dtos.Camaras
{
    /// <summary>
    /// Una cámara del catálogo de SECAD. Junta los dos hechos que la definen:
    /// dónde está (censo institucional) y si se puede ver (VMS).
    /// </summary>
    public class DtoCamara
    {
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long    Id            { get; set; }
        public string  Nombre        { get; set; } = string.Empty;
        public string? NumeroCenso   { get; set; }
        public string? Direccion     { get; set; }
        public string? Municipio     { get; set; }
        public string? Unidad        { get; set; }
        public double? Latitud       { get; set; }
        public double? Longitud      { get; set; }
        public bool    TienePtz      { get; set; }
        /// <summary>Del inventario: dada de alta y en servicio.</summary>
        public bool?   Operativa     { get; set; }
        /// <summary>Del VMS y en vivo: 0 desconocido · 1 en línea · 2 fuera de línea.</summary>
        public int     Estado        { get; set; }
        public string? CamaraCodigo  { get; set; }
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long?   IntegracionId { get; set; }
        public string  Origen        { get; set; } = "CENSO";
        /// <summary>true = está emparejada con el VMS y se le puede pedir video.</summary>
        public bool    Reproducible  => IntegracionId is > 0 && !string.IsNullOrWhiteSpace(CamaraCodigo);
        /// <summary>Metros hasta el incidente. Solo lo llena la consulta de cercanas.</summary>
        public int?    Distancia     { get; set; }
    }

    /// <summary>
    /// Un emparejamiento propuesto entre una cámara que reporta el VMS y una
    /// del censo institucional.
    ///
    /// Hace falta porque el censo NO trae el identificador del VMS
    /// (cameraIndexCode), así que la única pista es el nombre. Un nombre
    /// parecido no es una prueba: la propuesta la confirma una persona antes de
    /// que SECAD le muestre a un despachador video de una cámara equivocada.
    /// </summary>
    public class DtoEmparejamientoCamara
    {
        /// <summary>Cámara del censo (la que tiene coordenadas).</summary>
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long    CensoId        { get; set; }
        public string  CensoNombre    { get; set; } = string.Empty;
        public string? CensoNumero    { get; set; }
        public string? CensoDireccion { get; set; }

        /// <summary>Cámara del VMS (la que se puede reproducir).</summary>
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long    VmsId          { get; set; }
        public string  VmsCodigo      { get; set; } = string.Empty;
        public string  VmsNombre      { get; set; } = string.Empty;
        public int     VmsEstado      { get; set; }

        /// <summary>0 a 100. Cuánto se parecen los nombres, ya normalizados.</summary>
        public int     Puntaje        { get; set; }
        /// <summary>Por qué se propuso, en palabras, para que quien confirma pueda juzgar.</summary>
        public string  Motivo         { get; set; } = string.Empty;
    }

    public class DtoEmparejarRequest
    {
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long CensoId { get; set; }
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long VmsId   { get; set; }
    }

    /// <summary>Resumen de una sincronización con el VMS.</summary>
    public class DtoSyncResult
    {
        public bool   Ok           { get; set; }
        public string Mensaje      { get; set; } = string.Empty;
        public int    Reportadas   { get; set; }
        public int    Nuevas       { get; set; }
        public int    Actualizadas { get; set; }
        /// <summary>Cámaras del VMS que todavía no se han emparejado con el censo.</summary>
        public int    SinEmparejar { get; set; }
    }

    /// <summary>Lo que el navegador necesita para reproducir, más de dónde bajarlo.</summary>
    public class DtoStreamCamara
    {
        public string  Url           { get; set; } = string.Empty;
        public string? Autenticacion { get; set; }
        public string  Protocolo     { get; set; } = "hls_s";
        public string  CamaraNombre  { get; set; } = string.Empty;
        /// <summary>
        /// Nodo desde el que se pidió la URL. Informativo para el operador:
        /// si el video no carga, saber por dónde iba es la mitad del
        /// diagnóstico.
        /// </summary>
        public string? Nodo          { get; set; }
    }
}
