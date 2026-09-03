using System.Text.Json.Serialization;

namespace Comun.Dtos.Actuaciones;

// ─────────────────────────────────────────────────────────────────────────────
// Constantes de estado de actuación.
// Deben coincidir exactamente con el CHECK constraint de cad_actuaciones.estado.
// ─────────────────────────────────────────────────────────────────────────────
public static class EstadoActuacion
{
    public const string Pendiente  = "P";  // asignada, sin despachar
    public const string Despachada = "D";  // unidad en camino
    public const string Atendida   = "A";  // unidad en el lugar del hecho
    public const string Cerrada    = "C";  // actuación finalizada con código
    public const string Anulada    = "V";  // no fue necesaria / error / duplicado
}

// ─────────────────────────────────────────────────────────────────────────────
// DTO completo de una actuación (usado en el panel de detalle del despachador).
// ─────────────────────────────────────────────────────────────────────────────
public class DtoActuacion
{
    [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
    public long    Id                    { get; set; }
    [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
    public long    EventoId              { get; set; }
    [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
    public long?   PedidoId             { get; set; }
    public int     SitioGraba           { get; set; }

    // Agencia / Canal
    public int?    FuerzaId             { get; set; }
    public int?    CanalCodigo          { get; set; }
    /// <summary>Snapshot de la descripción al momento del despacho.</summary>
    public string  FuerzaDescripcion    { get; set; } = "";
    public string  CanalDescripcion     { get; set; } = "";

    // Quién despachó
    public string? DespachadorUsuario   { get; set; }
    /// <summary>D=Despachador, O=Operador, S=Sistema, N=N/A</summary>
    public string? TipoDespachador      { get; set; }

    // Recurso/Unidad principal (la principal; las adicionales en Unidades)
    public string? UnidadAsignada       { get; set; }
    public string? PlacaUnidad          { get; set; }

    // Estado propio de esta actuación (independiente de las demás del evento)
    public string  Estado               { get; set; } = EstadoActuacion.Pendiente;

    // Timestamps propios
    public string  FechaCreacion        { get; set; } = "";
    public string? FechaDespacho        { get; set; }
    public string? FechaLlegada         { get; set; }
    public string? FechaCierre          { get; set; }

    // Cierre
    public string? CodigoCierrePrimario { get; set; }
    public string? ClasifCierre         { get; set; }
    public string? ObservacionCierre    { get; set; }

    // Calificación de esta actuación específica (puede diferir del pedido)
    public string? CaliPedido           { get; set; }

    // Auditoría
    public string? FechaModificacion    { get; set; }
    public string? UsuarioModifica      { get; set; }

    // Sub-colecciones (se cargan en el endpoint de detalle)
    public List<DtoCodigoCierreActuacion> CodigosCierre { get; set; } = new();
    public List<DtoActuacionUnidad>       Unidades      { get; set; } = new();
    public List<DtoActuacionNota>         Notas         { get; set; } = new();
}

// ─────────────────────────────────────────────────────────────────────────────
// Item reducido para la grilla de actuaciones de un evento.
// ─────────────────────────────────────────────────────────────────────────────
public class DtoActuacionListItem
{
    [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
    public long    Id              { get; set; }
    [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
    public long    EventoId        { get; set; }
    public string  FuerzaDesc      { get; set; } = "";
    public string  CanalDesc       { get; set; } = "";
    /// <summary>
    /// Canal/fuerza que asignó este recurso (cad_actuaciones.canal_codigo/fuerza_id).
    /// El frontend los compara contra la sesión activa para habilitar o no los
    /// botones de gestión — solo el canal que asignó el recurso puede operarlo
    /// (ver VerificarCanalPropietarioAsync en el backend).
    /// </summary>
    public int?    CanalCodigo     { get; set; }
    public int?    FuerzaId        { get; set; }
    public string? UnidadAsignada  { get; set; }
    /// <summary>Nombre legible del cuadrante (patrulla_desc) para mostrar en la UI en vez del código.</summary>
    public string? UnidadDesc      { get; set; }
    public string  Estado          { get; set; } = "";
    public string  FechaCreacion   { get; set; } = "";
    public string? FechaDespacho   { get; set; }
    public string? FechaLlegada    { get; set; }
    public string? FechaCierre     { get; set; }
    public string? CaliPedido          { get; set; }
    public int?    TotalUnidades       { get; set; }
    public int?    TotalNotas          { get; set; }
    public string? PlacaUnidad         { get; set; }
    /// <summary>Username del despachador que asignó el recurso (auditoría del Jefe de Turno).</summary>
    public string? DespachadorUsuario  { get; set; }
    /// <summary>Solicitud de apoyo urgente activa sobre este recurso (seguridad del funcionario).</summary>
    public bool    SolicitaApoyo       { get; set; }
    public string? FechaSolicitaApoyo  { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Código de cierre de una actuación (tabla cad_actuaciones_codigos).
// ─────────────────────────────────────────────────────────────────────────────
public class DtoCodigoCierreActuacion
{
    /// <summary>Posición: 1=primario, 2=secundario, etc.</summary>
    public int    Orden             { get; set; } = 1;
    public string CodigoCierre      { get; set; } = "";
    /// <summary>CIERRE | DISPOSICION | NOVEDAD</summary>
    public string TipoCodigo        { get; set; } = "CIERRE";
    public string? DescripcionLibre { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Unidad individual despachada dentro de una actuación
// (tabla cad_actuaciones_unidades).
// ─────────────────────────────────────────────────────────────────────────────
public class DtoActuacionUnidad
{
    public long    Id               { get; set; }
    public string  UnidadCodigo     { get; set; } = "";
    public string? Placa            { get; set; }
    /// <summary>PATRULLA | AMBULANCIA | CAMION | MOTO | etc.</summary>
    public string? TipoUnidad       { get; set; }
    /// <summary>D=Despachada, A=Atendiendo, L=Liberada, V=Anulada</summary>
    public string  Estado           { get; set; } = "D";
    public string? FechaDespacho    { get; set; }
    public string? FechaLlegada     { get; set; }
    public string? FechaLiberacion  { get; set; }
    public string? Observacion      { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Nota de campo de una actuación (tabla cad_actuaciones_notas).
// ─────────────────────────────────────────────────────────────────────────────
public class DtoActuacionNota
{
    public long   Id              { get; set; }
    public string Nota            { get; set; } = "";
    /// <summary>GENERAL | NOVEDAD | ALERTA | CIERRE</summary>
    public string TipoNota        { get; set; } = "GENERAL";
    public string UsuarioRegistra { get; set; } = "";
    public string FechaRegistra   { get; set; } = "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Request: avanzar el estado operativo de la actuación (despacho → llegada).
// ─────────────────────────────────────────────────────────────────────────────
public class DtoActualizarEstadoActuacionRequest
{
    /// <summary>D=Despachada, A=Atendida (en sitio).</summary>
    public string  Estado         { get; set; } = "";
    public string? UnidadAsignada { get; set; }
    public string? PlacaUnidad    { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Request: cerrar una actuación con uno o más códigos.
// ─────────────────────────────────────────────────────────────────────────────
public class DtoCierreActuacionRequest
{
    public long   ActuacionId        { get; set; }
    /// <summary>C=Cerrada, V=Anulada.</summary>
    public string Estado             { get; set; } = EstadoActuacion.Cerrada;
    public string? ClasifCierre      { get; set; }
    public string? ObservacionCierre { get; set; }
    public List<DtoCodigoCierreActuacion> CodigosCierre { get; set; } = new();

    /// <summary>
    /// Decisión del despachador en el modal «Atendió»: si cerrar también el
    /// evento o solo esta actuación. En <c>false</c> el evento se queda abierto
    /// AUNQUE esta fuera su última actuación, que es justo lo que el
    /// recálculo automático hacía por su cuenta pasando por encima de la
    /// elección. <c>null</c> (no enviado) mantiene el comportamiento anterior,
    /// para no cambiarle la semántica a los clientes que no envían el campo.
    /// </summary>
    public bool? CerrarEvento { get; set; }

    // ── Resultado operativo estructurado (opcional) ──────────────────────────
    /// <summary>Código de la actividad policial (de cad_act_policial.codigo).</summary>
    public string? ActividadCodigo { get; set; }
    /// <summary>O=Operativa, P=Preventiva.</summary>
    public string? ActividadTipo   { get; set; }
    /// <summary>Snapshot de la descripción al momento del registro.</summary>
    public string? ActividadDesc   { get; set; }
    /// <summary>Artículo del Código Penal (de cad_delitos.articulo).</summary>
    public string? DelitoArticulo  { get; set; }
    /// <summary>Snapshot de la descripción del delito.</summary>
    public string? DelitoDesc      { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Item del catálogo de actividades policiales (cad_act_policial).
// ─────────────────────────────────────────────────────────────────────────────
public class DtoActividadPolicial
{
    public int    Id             { get; set; }
    /// <summary>O=Operativa, P=Preventiva.</summary>
    public string Tipo           { get; set; } = "";
    public string Codigo         { get; set; } = "";
    public string Descripcion    { get; set; } = "";
    /// <summary>Si true, se debe seleccionar el artículo del Código Penal al cerrar.</summary>
    public bool   RequiereDelito { get; set; }
    public int    Orden          { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Item del catálogo de delitos — Código Penal Colombiano (cad_delitos).
// ─────────────────────────────────────────────────────────────────────────────
public class DtoDelitoItem
{
    public int     Id           { get; set; }
    public string  Articulo     { get; set; } = "";
    public string  Descripcion  { get; set; } = "";
    public string? BienJuridico { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Item del catálogo de casos/códigos de tipificación (cad_casos).
// Usado para la búsqueda de códigos de cierre en el panel de despacho.
// ─────────────────────────────────────────────────────────────────────────────
public class DtoCodigoCasoItem
{
    public string Codigo      { get; set; } = "";
    public string Descripcion { get; set; } = "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Request: agregar una nota de campo a una actuación.
// ─────────────────────────────────────────────────────────────────────────────
public class DtoAgregarNotaActuacionRequest
{
    public string Nota     { get; set; } = "";
    /// <summary>GENERAL | NOVEDAD | ALERTA | CIERRE</summary>
    public string TipoNota { get; set; } = "GENERAL";
}

// ─────────────────────────────────────────────────────────────────────────────
// Request: crear una nueva actuación (primer despacho desde el módulo Eventos).
// ─────────────────────────────────────────────────────────────────────────────
public class DtoCrearActuacionRequest
{
    /// <summary>cad_pedidos.id enviado como string para preservar precisión Snowflake.</summary>
    [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
    public long    EventoId        { get; set; }
    public int     SitioGraba      { get; set; }
    public int?    FuerzaId        { get; set; }
    public int?    CanalCodigo     { get; set; }
    /// <summary>Código de la patrulla/unidad asignada (snapshot del recurso).</summary>
    public string? UnidadAsignada  { get; set; }
    public string? PlacaUnidad     { get; set; }
    /// <summary>
    /// ID del medio en cad_medios_disponibles, enviado como string para preservar
    /// la precisión del Snowflake ID en el transporte JSON.
    /// </summary>
    public string? MedioId         { get; set; }
    /// <summary>D=Despachador, O=Operador, S=Sistema.</summary>
    public string  TipoDespachador { get; set; } = "D";
}

// ─────────────────────────────────────────────────────────────────────────────
// Request: registrar una unidad adicional a la actuación.
// ─────────────────────────────────────────────────────────────────────────────
public class DtoAgregarUnidadActuacionRequest
{
    public string  UnidadCodigo  { get; set; } = "";
    public string? Placa         { get; set; }
    public string? TipoUnidad    { get; set; }
    public string? Observacion   { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Request: desasignar/cancelar un recurso de una actuación.
// En estado P el motivo es opcional (por defecto "Desasignado por operador").
// En D/A (ya salió en ruta o está en sitio) el motivo es OBLIGATORIO — cancelar
// un despacho ya en curso es una decisión operativa que debe quedar justificada.
// ─────────────────────────────────────────────────────────────────────────────
public class DtoDesasignarActuacionRequest
{
    public string? Motivo { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Resultado genérico para operaciones sobre actuaciones.
// ─────────────────────────────────────────────────────────────────────────────
public class DtoActuacionResult
{
    public bool   Success     { get; set; }
    public string Message     { get; set; } = "";
    public long   ActuacionId { get; set; }
    /// <summary>ID del sub-registro creado (nota, unidad, etc.).</summary>
    public long?  SubId       { get; set; }
    /// <summary>
    /// Nuevo estado del pedido (cad_pedidos.estado) si esta operación lo promovió
    /// automáticamente a 'E' (En proceso); null si no cambió.
    /// </summary>
    public string? EstadoEventoActual { get; set; }
}
