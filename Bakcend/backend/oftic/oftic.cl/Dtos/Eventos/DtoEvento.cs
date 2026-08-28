using System.Text.Json.Serialization;

namespace Comun.Dtos.Eventos;

// ─────────────────────────────────────────────────────────────────────────────
// Constantes de origen — definen quién o qué sistema creó el evento.
// Deben coincidir exactamente con el CHECK constraint de cad_eventos.origen.
// ─────────────────────────────────────────────────────────────────────────────
public static class OrigenEvento
{
    public const string PlantaTel    = "PLANTATEL";
    public const string Recepcion    = "RECEPCION";
    public const string AppMovil     = "APP_MOVIL";
    public const string Integracion  = "INTEGRACION";
    public const string Siedco       = "SIEDCO";
    public const string Interno      = "INTERNO";
    public const string Manual       = "MANUAL";
}

// ─────────────────────────────────────────────────────────────────────────────
// Constantes de estado del evento.
// ─────────────────────────────────────────────────────────────────────────────
public static class EstadoEvento
{
    public const string Pendiente   = "P";  // creado, aún no despachado
    public const string Despachado  = "D";  // unidad en camino
    public const string Atendido    = "A";  // unidad en el lugar del hecho
    public const string Cerrado     = "C";  // finalizado con código de cierre
    public const string Anulado     = "V";  // falsa alarma / duplicado / cierre rápido
}

// ─────────────────────────────────────────────────────────────────────────────
// Un código de cierre individual (puede ser primario, secundario, disposición…)
// ─────────────────────────────────────────────────────────────────────────────
public class DtoCodigoCierreEvento
{
    /// <summary>Posición del código: 1=primario, 2=secundario, etc.</summary>
    public int    Orden            { get; set; } = 1;

    /// <summary>Código del catálogo (ej. "333", "101").</summary>
    public string CodigoCierre     { get; set; } = "";

    /// <summary>CIERRE | DISPOSICION | NOVEDAD</summary>
    public string TipoCodigo       { get; set; } = "CIERRE";

    /// <summary>Nota libre adicional al código.</summary>
    public string? DescripcionLibre { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Detalle completo de un evento (para consultas desde el módulo de Eventos).
// ─────────────────────────────────────────────────────────────────────────────
public class DtoEvento
{
    [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
    public long    Id                    { get; set; }
    public int     SitioGraba            { get; set; }
    public string  Origen                { get; set; } = "";
    public string? OrigenReferenciaExt   { get; set; }
    public int?    IntegracionClienteId  { get; set; }
    public string? IntegracionNombre     { get; set; }

    // Pedido de origen
    [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
    public long?   PedidoId             { get; set; }
    public int?    PedidoSitioGraba     { get; set; }
    public string  HoraCasoPedido       { get; set; } = "";  // formateado dd/MM/yyyy HH:mm:ss
    public string  DireccionCaso        { get; set; } = "";
    public string  CodiPedido           { get; set; } = "";
    public string  CaliPedido           { get; set; } = "";

    // Despacho
    public int?    FuerzaId             { get; set; }
    public string  FuerzaDescripcion    { get; set; } = "";
    public int?    CanalCodigo          { get; set; }
    public string  CanalDescripcion     { get; set; } = "";

    // Personal
    public string? CeduEmpleado         { get; set; }
    public string  UsuarioGenera        { get; set; } = "";
    public string? TipoDespachador      { get; set; }

    // Estado
    public string  Estado               { get; set; } = "";

    // Timestamps (ISO-8601 string para facilidad en Angular)
    public string  FechaCreacion        { get; set; } = "";
    public string? FechaDespacho        { get; set; }
    public string? FechaLlegada         { get; set; }
    public string? FechaCierre          { get; set; }

    // Cierre
    public string? CodigoCierrePrimario { get; set; }
    public string? ClasifCierre         { get; set; }
    public string? ObservacionCierre    { get; set; }

    // Códigos de cierre (tabla hija)
    public List<DtoCodigoCierreEvento> CodigosCierre { get; set; } = new();
}

// ─────────────────────────────────────────────────────────────────────────────
// Item reducido para listas/grillas (sin los sub-objetos pesados).
// ─────────────────────────────────────────────────────────────────────────────
public class DtoEventoListItem
{
    [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
    public long    Id               { get; set; }
    public string  Origen           { get; set; } = "";
    public string  Estado           { get; set; } = "";
    [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
    public long?   PedidoId         { get; set; }
    public string  DireccionCaso    { get; set; } = "";
    public string  CodiPedido       { get; set; } = "";
    public string  CaliPedido       { get; set; } = "";
    public string  FuerzaDesc       { get; set; } = "";
    public string  CanalDesc        { get; set; } = "";
    public string  FechaCreacion    { get; set; } = "";
    public string? FechaDespacho    { get; set; }
    public string? FechaCierre      { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Request: cerrar un evento con uno o más códigos de cierre.
// ─────────────────────────────────────────────────────────────────────────────
public class DtoCierreEventoRequest
{
    /// <summary>ID Snowflake del evento a cerrar.</summary>
    [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
    public long   EventoId           { get; set; }

    /// <summary>Estado final: C=Cerrado, V=Anulado.</summary>
    public string Estado             { get; set; } = EstadoEvento.Cerrado;

    /// <summary>Clasificación de cierre (FK catálogo).</summary>
    public string? ClasifCierre      { get; set; }

    /// <summary>Notas libres del operador al cerrar.</summary>
    public string? ObservacionCierre { get; set; }

    /// <summary>
    /// Lista de códigos de cierre (mínimo 1).
    /// El primer elemento (Orden=1) se usa como código primario.
    /// </summary>
    public List<DtoCodigoCierreEvento> CodigosCierre { get; set; } = new();
}

// ─────────────────────────────────────────────────────────────────────────────
// Request: cerrar un evento desde el módulo Despachador (por pedido_id).
// IMPORTANTE: Este DTO NO contiene comentario ni codiPedido del pedido —
// esos campos son INMUTABLES en cad_pedidos una vez registrados en Recepción.
// Solo actualiza cad_eventos y cad_eventos_codigos_cierre; en cad_pedidos
// únicamente se actualiza el estado a 'C'.
// ─────────────────────────────────────────────────────────────────────────────
public class DtoCerrarEventoDespachoRequest
{
    /// <summary>Estado final: C=Cerrado (default), V=Anulado.</summary>
    public string Estado { get; set; } = EstadoEvento.Cerrado;

    /// <summary>Clasificación de cierre (FK catálogo).</summary>
    public string? ClasifCierre { get; set; }

    /// <summary>Observación libre del despachador. Va a cad_eventos.observacion_cierre.</summary>
    public string? ObservacionCierre { get; set; }

    /// <summary>Códigos de cierre seleccionados. El de Orden=1 es el primario.</summary>
    public List<DtoCodigoCierreEvento> CodigosCierre { get; set; } = new();
}

// ─────────────────────────────────────────────────────────────────────────────
// Request: vincular un caso a otro (padre) — mismo incidente real reportado
// por llamadas/canales distintos. Identifica al padre por su clave de negocio
// (sitio_graba + nume_llamada), no por cad_pedidos.id — es la misma clave que
// ya usa DtoPedidoCercano al listar candidatos de duplicado.
// ─────────────────────────────────────────────────────────────────────────────
public class DtoVincularPedidoRequest
{
    public int  SitioGraba  { get; set; }
    public long NumeLlamada { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Request: actualizar el estado de ciclo operativo (despacho / llegada).
// ─────────────────────────────────────────────────────────────────────────────
public class DtoActualizarEstadoEventoRequest
{
    public long   EventoId  { get; set; }
    /// <summary>D=Despachado, A=Atendido</summary>
    public string Estado    { get; set; } = "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Request: crear un evento desde integración externa (app móvil, API, etc.).
// Permite a sistemas externos reportar incidentes que llegan al SECAD.
// ─────────────────────────────────────────────────────────────────────────────
public class DtoEventoIntegracionRequest
{
    /// <summary>
    /// Tipo de origen. Valores válidos: APP_MOVIL | INTEGRACION | INTERNO | SIEDCO.
    /// </summary>
    public string  Origen               { get; set; } = OrigenEvento.Integracion;

    /// <summary>ID del cliente de integración registrado en cad_integraciones_clientes.</summary>
    public int     IntegracionClienteId  { get; set; }

    /// <summary>Referencia propia del sistema externo (para trazabilidad cross-system).</summary>
    public string? OrigenReferenciaExt   { get; set; }

    // Datos del incidente reportado
    public int     SitioGraba           { get; set; }
    public string  DireccionCaso        { get; set; } = "";
    public string  Ciudad               { get; set; } = "";
    public string  Barrio               { get; set; } = "";
    public string? LatitudCaso          { get; set; }
    public string? LongitudCaso         { get; set; }
    public string  CodiPedido           { get; set; } = "";  // tipo de incidente
    public string  CaliPedido           { get; set; } = "01";
    public string  Comentario           { get; set; } = "";
    public string  NombReportante       { get; set; } = "";
    public string? TelefonoReportante   { get; set; }

    // Canales sugeridos (el despachador puede modificarlos)
    public List<int> CanalesSugeridos   { get; set; } = new();
}

// ─────────────────────────────────────────────────────────────────────────────
// Resultado genérico para operaciones de evento.
// ─────────────────────────────────────────────────────────────────────────────
public class DtoEventoResult
{
    public bool   Success   { get; set; }
    public string Message   { get; set; } = "";
    [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
    public long   EventoId  { get; set; }
    [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
    public long?  PedidoId  { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Visibilidad multi-canal (§ gestión conjunta): qué canales SECAD y qué
// agencias externas tienen conocimiento/participación en un evento.
// ─────────────────────────────────────────────────────────────────────────────
public class DtoCanalAsignadoEvento
{
    public int     Codigo              { get; set; }
    public int     FuerzaId            { get; set; }
    public string  FuerzaDescripcion   { get; set; } = "";
    public string  CanalDescripcion    { get; set; } = "";
    /// <summary>'A' = activo en la cola de ese canal. 'C' = ese canal ya cerró su participación.</summary>
    public string  Estado              { get; set; } = "A";
    /// <summary>Actuaciones (recursos) actualmente abiertas para ESTE canal.</summary>
    public int     ActuacionesActivas  { get; set; }
    public string? FechaModificacion   { get; set; }
    public string? UsuarioModifica     { get; set; }
}

public class DtoAgenciaDespachadaEvento
{
    [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
    public long    AgenciaId    { get; set; }
    public string  Nombre       { get; set; } = "";
    public string  TipoAgencia  { get; set; } = "";
    public string  FechaEnvio   { get; set; } = "";
    public bool    Exitoso      { get; set; }
    public string? EnviadoPor   { get; set; }
}

public class DtoCanalesAsignadosResult
{
    public List<DtoCanalAsignadoEvento>     Canales          { get; set; } = new();
    public List<DtoAgenciaDespachadaEvento> AgenciasExternas { get; set; } = new();
}
