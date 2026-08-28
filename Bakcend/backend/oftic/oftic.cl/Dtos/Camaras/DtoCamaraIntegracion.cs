using System.Text.Json.Serialization;

namespace Comun.Dtos.Camaras
{
    // ── Identificadores de driver soportados por el backend ───────────────────────
    public static class VmsDrivers
    {
        public const string HikCentral = "HIKCENTRAL";
        public const string OnvifRtsp  = "ONVIF_RTSP";
    }

    /// <summary>
    /// Un campo de configuración que un driver necesita. El frontend usa esta
    /// metadata para PINTAR el formulario dinámicamente — así una sola UI sirve
    /// para todos los drivers, y agregar un driver no obliga a tocar la UI.
    /// </summary>
    public class DtoVmsDriverField
    {
        /// <summary>Clave del campo (queda en config_publico o config_secreto).</summary>
        public string Key       { get; set; } = "";
        public string Nombre    { get; set; } = "";
        /// <summary>Tipo de control: "text" | "password" | "number" | "select" | "textarea".</summary>
        public string Tipo      { get; set; } = "text";
        public bool   Requerido { get; set; }
        /// <summary>true = campo secreto (write-only; nunca se devuelve al frontend).</summary>
        public bool   Secreto   { get; set; }
        public string? Ayuda    { get; set; }
        public string? Ejemplo  { get; set; }
        /// <summary>Opciones para tipo "select".</summary>
        public List<string>? Opciones { get; set; }
    }

    /// <summary>
    /// Descriptor auto-declarado de un driver de VMS. El backend expone la lista
    /// vía GET /api/CamaraIntegracion/drivers y el frontend renderiza el formulario.
    /// </summary>
    public class DtoVmsDriverDescriptor
    {
        public string Driver      { get; set; } = "";
        public string Nombre      { get; set; } = "";
        public string Descripcion { get; set; } = "";
        /// <summary>Clase FontAwesome para el ícono en la UI.</summary>
        public string Icono       { get; set; } = "fa-solid fa-video";
        /// <summary>true = requiere un media gateway externo (RTSP→web). Informativo para el admin.</summary>
        public bool   RequiereGateway { get; set; }
        public List<DtoVmsDriverField> Campos { get; set; } = new();
    }

    // ── Integración VMS (registro configurable) ──────────────────────────────────

    /// <summary>Integración VMS tal como se devuelve al frontend (sin secretos).</summary>
    public class DtoCamaraIntegracion
    {
        /// <summary>Snowflake serializado como string para preservar precisión en JS.</summary>
        public string  Id           { get; set; } = "";
        public string  Nombre       { get; set; } = "";
        public string? Descripcion  { get; set; }
        public string  Driver       { get; set; } = "";
        /// <summary>Nombre legible del driver (resuelto desde el descriptor).</summary>
        public string  DriverNombre { get; set; } = "";
        public string? BaseUrl      { get; set; }
        /// <summary>Parámetros NO secretos (los secretos nunca se devuelven).</summary>
        public Dictionary<string, string> Config { get; set; } = new();
        /// <summary>true si ya hay al menos un secreto guardado (para no re-pedirlo en edición).</summary>
        public bool    TieneSecreto { get; set; }
        public bool    Activa       { get; set; }
        public int     TotalCamaras { get; set; }
        public string? FechaCreacion     { get; set; }
        public string? FechaModificacion { get; set; }
    }

    /// <summary>Request para crear/actualizar una integración VMS.</summary>
    public class DtoCamaraIntegracionRequest
    {
        public string  Nombre      { get; set; } = "";
        public string? Descripcion { get; set; }
        public string  Driver      { get; set; } = "";
        public string? BaseUrl     { get; set; }
        public Dictionary<string, string>  Config   { get; set; } = new();
        /// <summary>Secretos a guardar. En edición, si un secreto llega vacío, se conserva el anterior.</summary>
        public Dictionary<string, string>? Secretos { get; set; }
        public bool    Activa      { get; set; } = true;
    }

    /// <summary>Resultado de probar la conexión a un VMS (validación previa a operar).</summary>
    public class DtoCamaraPruebaResult
    {
        public bool    Ok      { get; set; }
        public string  Mensaje { get; set; } = "";
        /// <summary>Cantidad de cámaras detectadas en la prueba (si aplica).</summary>
        public int?    CamarasDetectadas { get; set; }
    }
}
