namespace Comun.Dtos.Camaras
{
    /// <summary>
    /// Una cámara tal como la describe el VMS. Es lo dinámico —qué cámaras hay
    /// y cuáles están en línea—; la ubicación viene del censo institucional,
    /// porque la OpenAPI de HikCentral no expone las coordenadas de las cámaras
    /// fijas.
    /// </summary>
    public class DtoVmsCamara
    {
        /// <summary>Identificador en el VMS (cameraIndexCode en HikCentral).</summary>
        public string Codigo      { get; set; } = string.Empty;
        public string Nombre      { get; set; } = string.Empty;
        /// <summary>Área del VMS a la que pertenece.</summary>
        public string? RegionCodigo { get; set; }
        /// <summary>0 desconocido · 1 en línea · 2 fuera de línea.</summary>
        public int    Estado      { get; set; }
        public bool   TienePtz    { get; set; }
    }

    /// <summary>Lo que hace falta para reproducir una cámara en el navegador.</summary>
    public class DtoVmsStream
    {
        /// <summary>URL del manifiesto HLS (.m3u8) o del protocolo pedido.</summary>
        public string  Url            { get; set; } = string.Empty;
        /// <summary>Credenciales/token que algunos despliegues devuelven aparte.</summary>
        public string? Autenticacion  { get; set; }
        public string  Protocolo      { get; set; } = "hls";
        /// <summary>0 main (suele H.265) · 1 sub-stream (H.264, el que reproduce el navegador).</summary>
        public int     TipoStream     { get; set; }
    }

    /// <summary>
    /// Resultado de hablar con un VMS. No se lanzan excepciones hacia arriba:
    /// que un VMS de un municipio esté caído es una condición normal de
    /// operación, no un fallo del sistema, y el operador necesita ver el motivo.
    /// </summary>
    public class DtoVmsResultado<T>
    {
        public bool   Ok      { get; set; }
        public string Mensaje { get; set; } = string.Empty;
        public T?     Datos   { get; set; }

        public static DtoVmsResultado<T> Bien(T datos, string mensaje = "") =>
            new() { Ok = true, Datos = datos, Mensaje = mensaje };

        public static DtoVmsResultado<T> Mal(string mensaje) =>
            new() { Ok = false, Mensaje = mensaje };
    }

    /// <summary>Una página del catálogo de cámaras del VMS.</summary>
    public class DtoVmsPagina
    {
        public int  Total    { get; set; }
        public int  Pagina   { get; set; }
        public int  Tamano   { get; set; }
        public List<DtoVmsCamara> Camaras { get; set; } = new();
        /// <summary>true = quedan páginas por pedir.</summary>
        public bool HayMas => Pagina * Tamano < Total;
    }

    /// <summary>
    /// Lo que un driver necesita para hablar con UN VMS concreto: la parte
    /// pública de la ficha más sus secretos ya descifrados. Se arma en el
    /// backend y no sale nunca hacia el navegador.
    /// </summary>
    public class DtoVmsConexion
    {
        public string Driver    { get; set; } = string.Empty;
        public string BaseUrl   { get; set; } = string.Empty;
        /// <summary>Nodo que alcanza la red de cámaras; vacío = este backend.</summary>
        public string? NodoEdgeUrl { get; set; }
        public Dictionary<string, string> Config   { get; set; } = new();
        public Dictionary<string, string> Secretos { get; set; } = new();

        public string Publico(string clave, string porDefecto = "") =>
            Config.TryGetValue(clave, out var v) && !string.IsNullOrWhiteSpace(v) ? v.Trim() : porDefecto;

        public string Secreto(string clave, string porDefecto = "") =>
            Secretos.TryGetValue(clave, out var v) && !string.IsNullOrWhiteSpace(v) ? v.Trim() : porDefecto;
    }
}
