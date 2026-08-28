using System.Text.Json.Serialization;

namespace Comun.Dtos.Recepcion
{
    // ── Incoming telephony event (from PlantaTel interface) ─────────────────────
    // IMPORTANTE: todas las propiedades llevan [JsonPropertyName] explícito con su
    // nombre literal en mayúsculas. Program.cs configura PropertyNamingPolicy =
    // JsonNamingPolicy.CamelCase globalmente, que SÍ transforma nombres ya en
    // mayúsculas (p.ej. "NUME_LLAMADA" no sale igual en el JSON de salida) — sin
    // esta anotación el frontend (que lee las claves literales en mayúsculas)
    // recibe todo el objeto con valores undefined. Mismo patrón que DtoCasoItem.
    public class DtoLlamadaEntrante
    {
        /// <summary>ID Snowflake (= cad_pedidos.id). Anotado por consistencia con el resto
        /// del código; el conversor JSON global ya protege la precisión en tránsito.</summary>
        [JsonPropertyName("NUME_LLAMADA")]
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long   NUME_LLAMADA  { get; set; }
        [JsonPropertyName("NUME_TELEFONO")]
        public long   NUME_TELEFONO { get; set; }
        [JsonPropertyName("CORDX")]
        public string CORDX         { get; set; } = "0";
        [JsonPropertyName("CORDY")]
        public string CORDY         { get; set; } = "0";
        [JsonPropertyName("TIPOSHAPE")]
        public string TIPOSHAPE     { get; set; } = "";
        [JsonPropertyName("RADIO")]
        public int    RADIO         { get; set; }
        [JsonPropertyName("FECHAGMLC")]
        public string FECHAGMLC     { get; set; } = "";
        [JsonPropertyName("OPERADOR")]
        public string OPERADOR      { get; set; } = "";
    }

    // ── Case code autocomplete item ─────────────────────────────────────────────
    public class DtoCasoItem
    {
        [JsonPropertyName("CODIGO_CASO")]
        public string CODIGO_CASO { get; set; } = "";

        [JsonPropertyName("DESCRIPCION_CASO")]
        public string DESCRIPCION_CASO { get; set; } = "";

        /// <summary>
        /// ID de la categoría del Asistente Inteligente vinculada a este caso.
        /// Se serializa como string para preservar la precisión de Snowflake IDs (19 dígitos).
        /// Null cuando el caso no tiene categoría configurada.
        /// </summary>
        [JsonPropertyName("ID_CATEGORIA_ASISTENTE")]
        public string? ID_CATEGORIA_ASISTENTE { get; set; }

        /// <summary>Código interno de la categoría (ej: HURTO, RINA). Usado para seleccionar plantilla narrativa.</summary>
        [JsonPropertyName("CATEGORIA_CODIGO")]
        public string? CATEGORIA_CODIGO { get; set; }

        /// <summary>Descripción de la categoría del asistente (JOIN informativo).</summary>
        [JsonPropertyName("CATEGORIA_DESCRIPCION")]
        public string? CATEGORIA_DESCRIPCION { get; set; }
    }

    // ── Dispatch channel ────────────────────────────────────────────────────────
    public class DtoCanalRecepcion
    {
        public int    Codigo      { get; set; }
        public string Descripcion { get; set; } = "";
        public string Fuerza      { get; set; } = "";
        /// <summary>
        /// ID numérico de la fuerza a la que pertenece el canal (cad_fuerzas.id).
        /// El frontend lo usa para distinguir canales propios de la agencia del operador
        /// de canales de otras agencias que también usan SECAD.
        /// </summary>
        public int    FuerzaId    { get; set; }
    }

    // ── Reference catalog row (TIPO_PEDIDO, CALI_PEDIDO, …) ────────────────────
    public class DtoReferenciaSecad
    {
        public string Nombre       { get; set; } = "";
        public string Codigo       { get; set; } = "";
        public string Descripcion  { get; set; } = "";
        public string Abreviatura  { get; set; } = "";
    }

    // ── "Associate call" search request ────────────────────────────────────────
    public class DtoBusquedaAsociarLlamada
    {
        public int    SitioGraba  { get; set; }
        public string HoraCaso    { get; set; } = "";
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long   NumeLlamada { get; set; }
    }

    // ── Row returned by F_BuscarLlamadasAsociar ─────────────────────────────────
    // Mismo motivo que DtoLlamadaEntrante: [JsonPropertyName] explícito porque la
    // policy CamelCase global mangla nombres ya en mayúsculas.
    public class DtoLlamadaAsociar
    {
        [JsonPropertyName("NUME_LLAMADA")]
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long   NUME_LLAMADA  { get; set; }
        [JsonPropertyName("HORA_CASO")]
        public string HORA_CASO     { get; set; } = "";
        [JsonPropertyName("NUME_TELEFONO")]
        public long   NUME_TELEFONO { get; set; }
        [JsonPropertyName("CALI_PEDIDO")]
        public string CALI_PEDIDO   { get; set; } = "";
        [JsonPropertyName("CIUDAD")]
        public string CIUDAD        { get; set; } = "";
        [JsonPropertyName("NOMB_LLAMANTE")]
        public string NOMB_LLAMANTE { get; set; } = "";
        [JsonPropertyName("DIRE_CASO")]
        public string DIRE_CASO     { get; set; } = "";
        [JsonPropertyName("CODI_PEDIDO")]
        public string CODI_PEDIDO   { get; set; } = "";
        [JsonPropertyName("ESTADO")]
        public string ESTADO        { get; set; } = "";
        [JsonPropertyName("SITIO_GRABA")]
        public int    SITIO_GRABA   { get; set; }
    }

    // ── Canal seleccionado — llave compuesta (codigo + fuerza_id) ───────────────
    /// <summary>
    /// Un canal se identifica por (Codigo, FuerzaId) — el Codigo solo no es único
    /// ya que distintas fuerzas pueden tener el mismo número de canal.
    /// </summary>
    public class DtoCanalSeleccionado
    {
        public int Codigo   { get; set; }
        public int FuerzaId { get; set; }
    }

    // ── Main reception-form payload (used for both save and quick-close) ────────
    public class DtoRecepcion
    {
        public int    SITIO_GRABA    { get; set; }
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long   NUME_LLAMADA   { get; set; }
        /// <summary>Format: dd/MM/yyyy HH:mm:ss</summary>
        public string HORA_CASO      { get; set; } = "";
        public long   NUME_TELEFONO  { get; set; }
        public string PROP_TELEFONO  { get; set; } = "";
        public string NOMB_LLAMANTE  { get; set; } = "";
        public string DIRE_LLAMANTE  { get; set; } = "";
        public string TIPO_PEDIDO    { get; set; } = "";
        public string CALI_PEDIDO    { get; set; } = "";
        public string BARRIO         { get; set; } = "";
        public string CIUDAD         { get; set; } = "";
        public string DIRE_CASO      { get; set; } = "";
        public string LATITUD_CASO   { get; set; } = "";
        public string LONGITUD_CASO  { get; set; } = "";
        public string COMENTARIO     { get; set; } = "";
        public string CODI_PEDIDO    { get; set; } = "";
        public string CODI_PEDIDO2   { get; set; } = "";
        public string IMPORTANCIA    { get; set; } = "01";
        public string PRIORIDAD      { get; set; } = "03";
        public string DISP_TELEFONICO{ get; set; } = "";
        /// <summary>celda_marcacion / cell ID of calling device</summary>
        public string OPERADOR       { get; set; } = "";
        public string ESTADO         { get; set; } = "A";
        public string ENVIAR         { get; set; } = "N";
        /// <summary>
        /// Origen del evento a registrar en cad_eventos.
        /// Valores: PLANTATEL | RECEPCION | APP_MOVIL | INTEGRACION | SIEDCO | INTERNO | MANUAL.
        /// El frontend envía "PLANTATEL" cuando la llamada llega de la centralita,
        /// "RECEPCION" cuando el operador la digita manualmente.
        /// </summary>
        public string Origen         { get; set; } = "RECEPCION";
        /// <summary>
        /// Canales seleccionados para despacho. Cada elemento lleva Codigo + FuerzaId
        /// porque el código de canal NO es único: distintas fuerzas pueden compartirlo.
        /// </summary>
        public List<DtoCanalSeleccionado> CANALES_SELECCIONADOS { get; set; } = new();
        public int?   CANAL_FUERZA   { get; set; }
        public string? CADPEDI_SITIO_GRABA  { get; set; }
        public string? CADPEDI_NUME_LLAMADA { get; set; }
    }

    // ── Result wrapper for save/close operations ─────────────────────────────────
    public class DtoRecepcionResult
    {
        public bool   Success  { get; set; }
        public string Message  { get; set; } = "";
        /// <summary>ID Snowflake del evento creado. Disponible tras P_GuardarLlamadaAsync.</summary>
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long?  EventoId { get; set; }
        /// <summary>ID Snowflake del pedido (igual a NUME_LLAMADA). Cómodo para APIs externas.</summary>
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long?  PedidoId { get; set; }
    }

    // ── Remisión a canal SECAD (§6.11 / §6.1) ────────────────────────────────────
    /// <summary>
    /// Solicitud para remitir un pedido/evento a uno o más canales SECAD adicionales.
    /// Se inserta una fila en cad_pedidos_canales por cada canal, haciendo que el
    /// evento sea visible en la cola del módulo Eventos de esos canales.
    /// </summary>
    public class DtoRemitirCanalRequest
    {
        /// <summary>
        /// ID Snowflake de cad_pedidos.id (servidor) — el que ve el frontend.
        /// RemitirCanalAsync resuelve internamente nume_llamada (Snowflake generado
        /// en cliente, usado por cad_pedidos_canales) a partir de este id.
        /// </summary>
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long       PedidoId    { get; set; }
        public int        SitioGraba  { get; set; }
        /// <summary>ID de cad_eventos (= cadeven_nume_evento).</summary>
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long       EventoId    { get; set; }
        /// <summary>
        /// Canales destino con llave compuesta (Codigo + FuerzaId).
        /// El código solo no es único entre fuerzas.
        /// </summary>
        public List<DtoCanalSeleccionado> Canales { get; set; } = new();
        public string?    Observacion { get; set; }

        /// <summary>
        /// Si es true, el caso se REMUEVE del canal desde el que se remite (gestión
        /// exclusiva en el/los canal(es) destino — típico cuando llegó al canal
        /// incorrecto). Si es false (default), el caso permanece también en el
        /// canal origen (gestión conjunta — un motivo que requiere varias agencias
        /// a la vez). Requiere CanalOrigenCodigo/CanalOrigenFuerzaId.
        /// </summary>
        public bool       RemoverCanalOrigen  { get; set; }
        /// <summary>Canal desde el que se remite — solo se usa si RemoverCanalOrigen=true.</summary>
        public int?       CanalOrigenCodigo   { get; set; }
        public int?       CanalOrigenFuerzaId { get; set; }
    }

    // ── Duplicate / nearby-call detection (§6.8) ─────────────────────────────────
    /// <summary>
    /// Pedido (llamada) activo encontrado en un radio geográfico y ventana temporal
    /// configurables. Devuelto por G_GetPedidosCercanosAsync para que el operador
    /// decida si vincular la llamada actual a un pedido preexistente o continuar
    /// como caso nuevo.
    /// La fuente es <c>cad_pedidos</c>, que es donde se almacena la georreferenciación
    /// y los códigos de caso del formulario de recepción.
    /// </summary>
    public class DtoPedidoCercano
    {
        /// <summary>ID Snowflake del pedido (string para preservar precisión JS).</summary>
        public string  Id              { get; set; } = "";
        /// <summary>Sitio de grabación — necesario para el vínculo CADPEDI_SITIO_GRABA.</summary>
        public int     SitioGraba      { get; set; }
        public string? CodiPedido      { get; set; }
        public string? CodiPedido2     { get; set; }
        public string? DireCaso        { get; set; }
        public string? Ciudad          { get; set; }
        public string? Barrio          { get; set; }
        public string? Estado          { get; set; }
        public string? Prioridad       { get; set; }
        public string? NombLlamante    { get; set; }
        public string? HoraCaso        { get; set; }  // ISO-8601
        /// <summary>Distancia calculada en metros (Haversine).</summary>
        public int     DistanciaMetros { get; set; }
        /// <summary>Minutos transcurridos desde la hora del caso.</summary>
        public int     MinutosAtras    { get; set; }
    }
}
