using System.Text.Json.Serialization;

namespace Comun.Dtos.Agencias
{
    // ── Tipos de agencia ──────────────────────────────────────────────────────────
    public static class TiposAgencia
    {
        public const string Bomberos    = "BOMBEROS";
        public const string CruzRoja    = "CRUZ_ROJA";
        public const string Transito    = "TRANSITO";
        public const string Ejercito    = "EJERCITO";
        public const string Psicosocial = "PSICOSOCIAL";
        public const string Ambulancia  = "AMBULANCIA";
        public const string Otra        = "OTRA";
    }

    // ── Formatos de payload saliente ──────────────────────────────────────────────
    public static class AgenciaPayloadFormato
    {
        /// <summary>
        /// Body simple y plano: solo los campos del caso con el campo_mapeo aplicado.
        /// Formato por defecto — lo que espera la gran mayoría de agencias externas.
        /// Ejemplo: { "direccion_emergencia": "Cra 7...", "tipo_incidente": "310" }
        /// </summary>
        public const string Plano        = "PLANO";

        /// <summary>
        /// Body jerárquico completo con secciones _secad, caso, ubicacion, reportante,
        /// despacho, actuaciones y camposMapeados. Para agencias sofisticadas o SECAD-a-SECAD.
        /// </summary>
        public const string Estructurado = "ESTRUCTURADO";
    }

    // ── Modos de autenticación saliente ───────────────────────────────────────────
    public static class AgenciaAuthMode
    {
        /// <summary>Sin cabecera de autenticación.</summary>
        public const string None      = "NONE";
        /// <summary>Authorization: Bearer &lt;token estático&gt;</summary>
        public const string Bearer    = "BEARER";
        /// <summary>Authorization: Basic base64(usuario:password)</summary>
        public const string Basic     = "BASIC";
        /// <summary>SECAD solicita token a token_url y lo usa como Bearer.</summary>
        public const string OAuth2    = "OAUTH2";
        /// <summary>API Key en cabecera personalizada (p. ej. X-Api-Key).</summary>
        public const string ApiKey    = "API_KEY";
        /// <summary>Usuario y contraseña inyectados en el body junto con el caso.</summary>
        public const string CredsBody = "CREDS_BODY";
        /// <summary>
        /// Canal institucional PIP (Plataforma de Integración Policía).
        /// SECAD reutiliza el token técnico ya cacheado de PIP — no requiere
        /// configurar credenciales adicionales en la agencia.
        /// La api_url debe apuntar al endpoint de PIP para esa integración:
        ///   https://internalpip.policia.gov.co:8080/api/{servicio}
        /// </summary>
        public const string PipToken  = "PIP_TOKEN";
    }

    // ── DTO de salida (sin credenciales expuestas) ────────────────────────────────
    public class DtoAgenciaExterna
    {
        public string  Id              { get; set; } = "";
        public string  Nombre          { get; set; } = "";
        public string? Descripcion     { get; set; }
        public string  TipoAgencia     { get; set; } = TiposAgencia.Otra;
        public string? ApiUrl          { get; set; }
        public string  ApiMetodo       { get; set; } = "POST";

        /// <summary>Modo de autenticación configurado.</summary>
        public string  TipoAuth        { get; set; } = AgenciaAuthMode.Bearer;
        /// <summary>Indica si hay credencial configurada (token, usuario o password).</summary>
        public bool    TieneCredencial { get; set; }
        /// <summary>Para compatibilidad con código anterior.</summary>
        public bool    TieneToken      => TieneCredencial;
        /// <summary>Usuario (para BASIC, OAUTH2, CREDS_BODY). No se expone la contraseña.</summary>
        public string? ApiUsuario      { get; set; }
        /// <summary>Configuración extra como JSON (tokenUrl, keyHeader, bodyFields…).</summary>
        public string? AuthExtra       { get; set; }

        public string? ApiCabeceras    { get; set; }
        public string? CampoMapeo      { get; set; }

        /// <summary>
        /// PLANO (default) = body simple con campos mapeados, lo que espera la mayoría de agencias.<br/>
        /// ESTRUCTURADO    = body jerárquico completo (_secad, caso, ubicacion, reportante, …).
        /// </summary>
        public string  FormatoPayload  { get; set; } = AgenciaPayloadFormato.Plano;

        public bool    Activa          { get; set; }
        public DateTime? FechaCreacion    { get; set; }
        public DateTime? FechaModificacion { get; set; }
    }

    // ── DTO de entrada (crear / actualizar) ───────────────────────────────────────
    public class DtoAgenciaExternaRequest
    {
        public string  Nombre       { get; set; } = "";
        public string? Descripcion  { get; set; }
        public string  TipoAgencia  { get; set; } = TiposAgencia.Otra;
        public string? ApiUrl       { get; set; }
        public string  ApiMetodo    { get; set; } = "POST";

        // ── Auth ──────────────────────────────────────────────────────────────────
        public string  TipoAuth     { get; set; } = AgenciaAuthMode.Bearer;
        /// <summary>Token estático (BEARER) o valor del API Key (API_KEY).
        /// En UPDATE: null/vacío = mantener el existente.</summary>
        public string? ApiToken     { get; set; }
        /// <summary>Usuario para BASIC / OAUTH2 / CREDS_BODY.</summary>
        public string? ApiUsuario   { get; set; }
        /// <summary>Contraseña para BASIC / OAUTH2 / CREDS_BODY.
        /// En UPDATE: null/vacío = mantener la existente.</summary>
        public string? ApiPassword  { get; set; }
        /// <summary>Config adicional JSON por modo (tokenUrl, keyHeader, bodyFields…).</summary>
        public string? AuthExtra    { get; set; }

        public string? ApiCabeceras   { get; set; }
        public string? CampoMapeo    { get; set; }
        /// <summary>PLANO o ESTRUCTURADO. Default: PLANO.</summary>
        public string  FormatoPayload { get; set; } = AgenciaPayloadFormato.Plano;
        public bool    Activa        { get; set; } = true;
    }

    // ── DTO para registrar un despacho externo ────────────────────────────────────
    public class DtoDespachoExternoRequest
    {
        public long PedidoId   { get; set; }
        public int  SitioGraba { get; set; }
        public long AgenciaId  { get; set; }
    }

    // ── DTO resultado del despacho externo ────────────────────────────────────────
    public class DtoDespachoExternoResult
    {
        public bool    Success    { get; set; }
        public string  Message    { get; set; } = "";
        public int?    HttpStatus { get; set; }
        public string? Response   { get; set; }
    }
}
