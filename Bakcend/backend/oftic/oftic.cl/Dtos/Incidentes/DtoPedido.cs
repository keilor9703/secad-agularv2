using System.Text.Json.Serialization;

namespace Comun.Dtos.Incidentes
{
    // ─── Request DTOs ──────────────────────────────────────────────────────────

    public class DtoPedidoRequest
    {
        public int SitioGraba { get; set; }
        public long NumeLlamada { get; set; }
        public string HoraCaso { get; set; } = string.Empty;
        public long NumeTelefono { get; set; }
        public string PropTelefono { get; set; } = string.Empty;
        public string NombLlamante { get; set; } = string.Empty;
        public string Barrio { get; set; } = string.Empty;
        public string Ciudad { get; set; } = string.Empty;
        public string DireLlamante { get; set; } = string.Empty;
        public string DireCaso { get; set; } = string.Empty;
        public string LatitudCaso { get; set; } = string.Empty;
        public string LongitudCaso { get; set; } = string.Empty;
        public string Cordx { get; set; } = string.Empty;
        public string Cordy { get; set; } = string.Empty;
        public string Tiposhape { get; set; } = string.Empty;
        public int Radio { get; set; }
        public string Comentario { get; set; } = string.Empty;
        public string CodiPedido { get; set; } = string.Empty;
        public string CodiPedido2 { get; set; } = string.Empty;
        public string TipoPedido { get; set; } = string.Empty;
        public string CaliPedido { get; set; } = string.Empty;
        public string Importancia { get; set; } = string.Empty;
        public string Prioridad { get; set; } = string.Empty;
        public string DispTelefonico { get; set; } = string.Empty;
        public string CeldaMarcacion { get; set; } = string.Empty;
        public List<int> CanalesSeleccionados { get; set; } = new();
        public string CanalFuerza { get; set; } = string.Empty;
        public string Enviar { get; set; } = "N";
        public string Estado { get; set; } = "A";
        public int? PedidoPadreSitio { get; set; }
        public long? PedidoPadreNum { get; set; }
    }

    public class DtoCerrarRapidoRequest
    {
        public string Comentario { get; set; } = string.Empty;
        public string CodiPedido { get; set; } = string.Empty;
        public string Enviar { get; set; } = "N";
    }

    public class DtoAnotacionRequest
    {
        public string Titulo { get; set; } = string.Empty;
        public string Anotacion { get; set; } = string.Empty;
        public string TipoAnotacion { get; set; } = "GENERAL";
    }

    public class DtoEstadoPedidoRequest
    {
        public string Estado { get; set; } = string.Empty;
        /// <summary>
        /// Motivo del cambio de estado — obligatorio desde Eventos (EventoController
        /// lo valida), opcional desde el dashboard de Jefe de Turno (PedidoController).
        /// Queda registrado en cad_pedidos_estado_historial.
        /// </summary>
        public string? Motivo { get; set; }
    }

    /// <summary>Una fila del historial de cambios de estado de un pedido/evento.</summary>
    public class DtoEstadoHistorialItem
    {
        public string? EstadoAnterior { get; set; }
        public string  EstadoNuevo    { get; set; } = "";
        public string? Motivo         { get; set; }
        public string? Username       { get; set; }
        public string  Fecha          { get; set; } = "";  // ISO-8601
    }

    // ─── Response DTOs ─────────────────────────────────────────────────────────

    public class DtoPedidoListItem
    {
        /// <summary>Snowflake ID — serializado como string para preservar precisión en JavaScript.</summary>
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long Id { get; set; }
        public int SitioGraba { get; set; }
        public long? NumeLlamada { get; set; }
        public DateTime? HoraCaso { get; set; }
        public long? NumeTelefono { get; set; }
        public string DireCaso { get; set; } = string.Empty;
        public string Estado { get; set; } = string.Empty;
        public string Enviar { get; set; } = string.Empty;
        public string CodiPedido { get; set; } = string.Empty;
        public string CodiPedido2 { get; set; } = string.Empty;
        public string Comentario { get; set; } = string.Empty;
        public string UsernameCreacion { get; set; } = string.Empty;
        public DateTime? FechaCreacion { get; set; }
    }

    /// <summary>
    /// Página de resultados de GetListAsync — cad_pedidos puede crecer a millones de
    /// filas, así que el listado ya no devuelve un array plano sin acotar; el cliente
    /// pide una página (offset/limit) y opcionalmente un rango de fechas, y el total
    /// permite construir un paginador real en vez de un límite fijo silencioso.
    /// </summary>
    public class DtoPedidoListPagedResult
    {
        public List<DtoPedidoListItem> Items { get; set; } = new();
        public int Total { get; set; }
        public int Page { get; set; }
        public int PageSize { get; set; }
    }

    public class DtoPedidoDetalle : DtoPedidoListItem
    {
        public string PropTelefono { get; set; } = string.Empty;
        public string NombLlamante { get; set; } = string.Empty;
        public string Barrio { get; set; } = string.Empty;
        public string Ciudad { get; set; } = string.Empty;
        public string DireLlamante { get; set; } = string.Empty;
        public string LatitudCaso { get; set; } = string.Empty;
        public string LongitudCaso { get; set; } = string.Empty;
        public string Cordx { get; set; } = string.Empty;
        public string Cordy { get; set; } = string.Empty;
        public string Tiposhape { get; set; } = string.Empty;
        public int Radio { get; set; }
        public string TipoPedido { get; set; } = string.Empty;
        public string CaliPedido { get; set; } = string.Empty;
        public string Importancia { get; set; } = string.Empty;
        public string Prioridad { get; set; } = string.Empty;
        public string DispTelefonico { get; set; } = string.Empty;
        public string CeldaMarcacion { get; set; } = string.Empty;
        public string Canales { get; set; } = string.Empty;
        public string CanalFuerza { get; set; } = string.Empty;
        public int? PedidoPadreSitio { get; set; }
        public long? PedidoPadreNum { get; set; }
        /// <summary>Descripción del código de caso 1 (JOIN cad_casos.descripcion).</summary>
        public string DescPedido  { get; set; } = string.Empty;
        /// <summary>Descripción del código de caso 2 (JOIN cad_casos.descripcion).</summary>
        public string DescPedido2 { get; set; } = string.Empty;
        public List<DtoAnotacion> Anotaciones { get; set; } = new();

        // ── Datos del evento de despacho (cad_eventos) ────────────────────────

        /// <summary>Snowflake ID del evento de despacho asociado.</summary>
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long? EventoId { get; set; }

        /// <summary>Código del canal de atención que gestionó el incidente.</summary>
        public int CanalCodigo { get; set; }

        /// <summary>Descripción del canal de atención.</summary>
        public string CanalDescripcion { get; set; } = string.Empty;

        /// <summary>Descripción de la fuerza que atendió.</summary>
        public string FuerzaDescripcion { get; set; } = string.Empty;

        /// <summary>Fecha y hora en que se cerró el evento formalmente.</summary>
        public DateTime? FechaCierre { get; set; }

        /// <summary>Observación libre registrada al cerrar el evento.</summary>
        public string ObservacionCierre { get; set; } = string.Empty;

        /// <summary>Usuario que cerró el evento (cad_eventos.usuario_modifica).</summary>
        public string UsuarioCierre { get; set; } = string.Empty;

        /// <summary>
        /// Estado propio de cad_eventos (P/D/A/C/V), dominio independiente de <see cref="Estado"/>
        /// (que refleja cad_pedidos.estado, sin valor 'V'). Permite distinguir cierre normal
        /// de anulación en el timeline sin confundir los dos dominios de estado.
        /// </summary>
        public string? EventoEstado { get; set; }

        /// <summary>Códigos de cierre registrados en cad_eventos_codigos_cierre.</summary>
        public List<DtoCodigoCierrePedido> CodigosCierre { get; set; } = new();

        // ── Trazabilidad (cad_auditoria_acceso_evento) ────────────────────────

        /// <summary>Username del último despachador que abrió este evento.</summary>
        public string? UltimoAccesoUsername { get; set; }

        /// <summary>Fecha/hora del último acceso registrado.</summary>
        public DateTime? UltimoAccesoFecha { get; set; }
    }

    /// <summary>Código de cierre asociado a un evento, para mostrar en la trazabilidad.</summary>
    public class DtoCodigoCierrePedido
    {
        public int    Orden             { get; set; }
        public string CodigoCierre      { get; set; } = string.Empty;
        public string TipoCodigo        { get; set; } = string.Empty;
        public string DescripcionLibre  { get; set; } = string.Empty;
    }

    public class DtoPedidoResult
    {
        public bool   Success { get; set; }
        public string Message { get; set; } = string.Empty;
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long   Id      { get; set; }
        /// <summary>
        /// Nuevo estado del pedido si esta operación lo promovió automáticamente a
        /// 'E' (En proceso); null si no cambió. Permite al frontend reflejar el
        /// cambio sin esperar el próximo poll.
        /// </summary>
        public string? EstadoActual { get; set; }
    }

    public class DtoAnotacion
    {
        public long Id { get; set; }
        public long IdPedido { get; set; }
        public string Titulo { get; set; } = string.Empty;
        public string Anotacion { get; set; } = string.Empty;
        public string TipoAnotacion { get; set; } = string.Empty;
        public long? UsuarioCreacion { get; set; }
        public string UsernameCreacion { get; set; } = string.Empty;
        public DateTime? FechaCreacion { get; set; }
        public string MaquinaCreacion { get; set; } = string.Empty;
    }

    public class DtoPedidoAsociar
    {
        public long Id { get; set; }
        public long? NumeLlamada { get; set; }
        public string HoraCaso { get; set; } = string.Empty;
        public long? NumeTelefono { get; set; }
        public string CaliPedido { get; set; } = string.Empty;
        public string Ciudad { get; set; } = string.Empty;
        public string NombLlamante { get; set; } = string.Empty;
        public string DireCaso { get; set; } = string.Empty;
        public string CodiPedido { get; set; } = string.Empty;
        public string Estado { get; set; } = string.Empty;
        public int SitioGraba { get; set; }
    }

    // ─── Eventos (dispatcher queue) DTOs ──────────────────────────────────────

    /// <summary>
    /// List item for the dispatcher's queue. Extends DtoPedidoListItem with
    /// fields needed for semaforización without loading the full detail.
    /// </summary>
    public class DtoEventoListItem : DtoPedidoListItem
    {
        public string    Prioridad             { get; set; } = string.Empty;
        public string    CaliPedido            { get; set; } = string.Empty;
        public string    Ciudad                { get; set; } = string.Empty;

        /// <summary>
        /// Canal de origen del evento (PLANTATEL, RECEPCION, APP_MOVIL, INTEGRACION, SIEDCO, INTERNO, MANUAL).
        /// Proviene de cad_eventos.origen vía JOIN. Valor por defecto "MANUAL" cuando es NULL.
        /// </summary>
        public string    Origen                { get; set; } = "MANUAL";

        /// <summary>Descripción del código de caso principal (JOIN cad_casos).</summary>
        public string    DescPedido            { get; set; } = string.Empty;

        /// <summary>
        /// Número de actuaciones activas (estado P/D/A) vinculadas al evento.
        /// Permite mostrar en la tarjeta si hay recursos asignados sin cargar el detalle.
        /// </summary>
        public int       TotalActuacionesActivas { get; set; }

        /// <summary>
        /// Timestamp del primer acceso por un despachador.
        /// NULL = nadie ha abierto todavía el evento. Usado para la semaforización SLA.
        /// </summary>
        public DateTime? FechaPrimerAcceso     { get; set; }

        /// <summary>
        /// ID Snowflake del registro en cad_eventos (≠ Id que es cad_pedidos.Id).
        /// Este es el número oficial del evento que el despachador debe ver.
        /// NULL si el pedido no tiene evento asociado (caso prácticamente imposible
        /// para pedidos con enviar='S' pero se maneja defensivamente).
        /// </summary>
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long? NumeEvento { get; set; }

        /// <summary>
        /// Nombre de la persona que realizó la llamada o del afectado reportado.
        /// Proviene de cad_pedidos.nomb_llamante. Incluido en la lista para permitir
        /// búsqueda sin necesidad de cargar el detalle completo.
        /// </summary>
        public string NombLlamante { get; set; } = string.Empty;
    }

    /// <summary>
    /// Represents a dispatch channel available in the site.
    /// </summary>
    public class DtoCanalItem
    {
        public int    Codigo      { get; set; }
        public int    FuerzaId    { get; set; }
        public string Descripcion { get; set; } = string.Empty;
        public string FuerzaDesc  { get; set; } = string.Empty;
    }

    /// <summary>
    /// Contadores de eventos por estado para la bandeja del despachador.
    /// Permite mostrar badges en los filtros sin cargar los registros completos.
    /// </summary>
    public class DtoEventoConteos
    {
        /// <summary>Total de eventos activos (cualquier estado distinto de C).</summary>
        public int    Total          { get; set; }
        public int    Activos        { get; set; }   // estado = 'A'
        public int    Pendientes     { get; set; }   // estado = 'P'
        public int    EnProceso      { get; set; }   // estado = 'E'
        public int    Seguimiento    { get; set; }   // estado = 'T'
        public int    Revision       { get; set; }   // estado = 'R'
        /// <summary>Cerrados SOLO durante el turno vigente (no histórico total).</summary>
        public int    CerradosTurno  { get; set; }
        /// <summary>Etiqueta del turno actual: "1ro", "2do" o "3ro".</summary>
        public string TurnoActual    { get; set; } = "";
        /// <summary>Inicio del turno vigente en ISO-8601 (hora Colombia UTC-5).</summary>
        public string TurnoDesde     { get; set; } = "";
    }

    /// <summary>
    /// One SLA threshold entry from cad_config_sla.
    /// Used by the dispatcher frontend to color-code events without hardcoding values.
    /// </summary>
    public class DtoSlaConfig
    {
        public int    Id             { get; set; }
        public string Nombre         { get; set; } = string.Empty;
        public int    UmbralMinutos  { get; set; }
        public string ColorHex       { get; set; } = "#f59e0b";
        public string Descripcion    { get; set; } = string.Empty;
        public int    Orden          { get; set; }
    }
}
