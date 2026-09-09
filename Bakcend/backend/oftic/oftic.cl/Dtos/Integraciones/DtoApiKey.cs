using System.Text.Json.Serialization;

namespace Comun.Dtos.Integraciones
{
    /// <summary>Qué puede hacer una llave. Se valida en cada endpoint externo.</summary>
    public static class AlcanceApiKey
    {
        public const string Pbx           = "PBX";
        public const string Chat          = "CHAT";
        public const string Sms           = "SMS";
        public const string Actualizacion = "ACTUALIZACION";
        /// <summary>Comodín al EMITIR: una llave así sirve para todos los canales.</summary>
        public const string Todo          = "TODO";

        /// <summary>
        /// Comodín al EXIGIR: el endpoint acepta cualquier alcance. Es distinto
        /// de <see cref="Todo"/> —ese es una propiedad de la llave, este una
        /// propiedad del endpoint— y confundirlos hacía que /verificar
        /// rechazara con 403 a una llave PBX perfectamente válida.
        /// </summary>
        public const string Cualquiera    = "*";

        public static readonly string[] Todos =
            { Pbx, Chat, Sms, Actualizacion, Todo };

        public static bool EsValido(string? a) =>
            !string.IsNullOrWhiteSpace(a) && Todos.Contains(a);

        /// <summary>¿La llave con este alcance puede usar un endpoint que exige `exigido`?</summary>
        public static bool Cubre(string? alcanceLlave, string exigido) =>
            exigido == Cualquiera || alcanceLlave == Todo || alcanceLlave == exigido;
    }

    /// <summary>
    /// Una llave tal como se muestra en la pantalla de administración: nunca
    /// lleva el secreto. Para verlo hay que pedirlo aparte, y ese acto se audita.
    /// </summary>
    public class DtoApiKey
    {
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long    Id                { get; set; }
        public string  CodDane           { get; set; } = string.Empty;
        public string  Nombre            { get; set; } = string.Empty;
        public string  Alcance           { get; set; } = AlcanceApiKey.Pbx;
        /// <summary>Trozo visible, para reconocerla sin revelarla: «sk_pbx_a1b2…».</summary>
        public string  Prefijo           { get; set; } = string.Empty;
        public int     SitioGrabaDefecto { get; set; }
        public bool    Activa            { get; set; }
        public string? Notas             { get; set; }

        /// <summary>Hasta cuándo sigue sirviendo la llave anterior tras una rotación.</summary>
        public DateTime? AnteriorExpira  { get; set; }
        public DateTime? UltimoUso       { get; set; }
        public string?   UltimoUsoIp     { get; set; }
        public long      TotalUsos       { get; set; }
        public DateTime  FechaCreacion   { get; set; }
        public string?   UsuarioCreacion { get; set; }
        public DateTime? FechaRevocacion { get; set; }
    }

    /// <summary>Lo que devuelve crear o regenerar: aquí sí viaja el secreto.</summary>
    public class DtoApiKeyConSecreto
    {
        public DtoApiKey Llave  { get; set; } = new();
        public string    Clave  { get; set; } = string.Empty;
        /// <summary>Aviso de la ventana de gracia, cuando la hay.</summary>
        public string?   Mensaje { get; set; }
    }

    public class DtoApiKeyRequest
    {
        public string  Nombre            { get; set; } = string.Empty;
        public string  Alcance           { get; set; } = AlcanceApiKey.Pbx;
        public int     SitioGrabaDefecto { get; set; }
        public string? Notas             { get; set; }
    }

    /// <summary>Una línea de la bitácora de la llave.</summary>
    public class DtoApiKeyAuditoria
    {
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long     Id      { get; set; }
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long     ApiKeyId { get; set; }
        public string   Accion  { get; set; } = string.Empty;
        public string?  Usuario { get; set; }
        public string?  Ip      { get; set; }
        public string?  Detalle { get; set; }
        public DateTime Fecha   { get; set; }
    }

    /// <summary>
    /// Lo que el middleware saca de la cabecera X-Api-Key. Es la identidad del
    /// llamante externo: de aquí sale el tenant, no de una cabecera que
    /// cualquiera puede escribir.
    /// </summary>
    public class DtoApiKeyResuelta
    {
        public long   Id                { get; set; }
        public string CodDane           { get; set; } = string.Empty;
        public string Nombre            { get; set; } = string.Empty;
        public string Alcance           { get; set; } = string.Empty;
        public int    SitioGrabaDefecto { get; set; }
        /// <summary>true = entró con la llave anterior, dentro del periodo de gracia.</summary>
        public bool   EnGracia          { get; set; }
    }

    /// <summary>Fila persistida. Solo la usa el repositorio.</summary>
    public class DtoApiKeyPersistencia
    {
        public long    Id                   { get; set; }
        public string  CodDane              { get; set; } = string.Empty;
        public string  Nombre               { get; set; } = string.Empty;
        public string  Alcance              { get; set; } = string.Empty;
        public string  Prefijo              { get; set; } = string.Empty;
        public string  Huella               { get; set; } = string.Empty;
        public string  ClaveCifrada         { get; set; } = string.Empty;
        public int     SitioGrabaDefecto    { get; set; }
        public string? Notas                { get; set; }
        public string? UsuarioCreacion      { get; set; }
    }

    public class DtoApiKeyResult
    {
        public bool   success { get; set; }
        public string message { get; set; } = string.Empty;
    }
}
