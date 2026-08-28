namespace Comun.Dtos.Reportes
{
    // ── Parámetros de filtro comunes ──────────────────────────────────────────
    public class DtoReporteParams
    {
        /// <summary>Fecha inicio en formato yyyy-MM-dd. Nulo = inicio del turno actual.</summary>
        public string? Desde     { get; set; }
        /// <summary>Fecha fin en formato yyyy-MM-dd. Nulo = ahora.</summary>
        public string? Hasta     { get; set; }
        public int     FuerzaId  { get; set; }   // 0 = todas
        /// <summary>
        /// Turno de vigilancia: 0=Todos, 1=Segundo(06-13h), 2=Tercer(14-21h), 3=Cuarto(22-05h).
        /// </summary>
        public int     TurnoVigilancia { get; set; }  // 0 = todos los turnos
    }

    // ── Resumen general del período ───────────────────────────────────────────
    public class DtoResumenReporte
    {
        public int     TotalIncidentes    { get; set; }
        public int     Activos            { get; set; }
        public int     Pendientes         { get; set; }
        public int     Cerrados           { get; set; }
        public int     Flash              { get; set; }
        public int     Inmediatos         { get; set; }
        public int     Rutina             { get; set; }
        public int     SinPrioridad       { get; set; }
        public int     ConEventoActivo    { get; set; }
        public int     SinEventoAun       { get; set; }
        public string  FechaDesde         { get; set; } = "";
        public string  FechaHasta         { get; set; } = "";
    }

    // ── Distribución por canal de origen ─────────────────────────────────────
    public class DtoPorOrigen
    {
        public string Origen    { get; set; } = "";
        public int    Total     { get; set; }
        public double Porcentaje{ get; set; }
    }

    // ── Distribución por fuerza ───────────────────────────────────────────────
    public class DtoPorFuerza
    {
        public int    FuerzaId    { get; set; }
        public string Fuerza      { get; set; } = "";
        public int    Total        { get; set; }
        public int    Activos      { get; set; }
        public int    Cerrados     { get; set; }
        public double Porcentaje   { get; set; }
    }

    // ── Top códigos de caso más frecuentes ────────────────────────────────────
    public class DtoTopCaso
    {
        public string CodigoCaso    { get; set; } = "";
        public string Descripcion   { get; set; } = "";
        public int    Total          { get; set; }
        public double Porcentaje     { get; set; }
    }

    // ── Métricas de tiempo de atención ────────────────────────────────────────
    public class DtoTiemposAtencion
    {
        /// <summary>Tiempo promedio (minutos) desde creación hasta primer acceso de despachador.</summary>
        public double? MinutosPrimerAccesoPromedio  { get; set; }
        /// <summary>Tiempo promedio (minutos) desde creación hasta despacho (estado D en evento).</summary>
        public double? MinutosDespachoPromedio       { get; set; }
        /// <summary>Tiempo promedio (minutos) desde creación hasta cierre.</summary>
        public double? MinutosCierrePromedio         { get; set; }
        /// <summary>Tiempo promedio (minutos) solo para incidentes Flash.</summary>
        public double? MinutosFlashPromedio          { get; set; }
        /// <summary>Incidentes que tuvieron despacho en los datos.</summary>
        public int     ConDespacho                   { get; set; }
        /// <summary>Incidentes cerrados en el período.</summary>
        public int     Cerrados                      { get; set; }
    }

    // ── Cumplimiento SLA ──────────────────────────────────────────────────────
    public class DtoSlaItem
    {
        public string Nombre          { get; set; } = "";
        public int    UmbralMinutos   { get; set; }
        public string ColorHex        { get; set; } = "#6b7280";
        /// <summary>Incidentes que cumplieron el SLA (se atendieron antes del umbral).</summary>
        public int    Cumplieron      { get; set; }
        /// <summary>Incidentes que superaron el umbral.</summary>
        public int    Incumplieron    { get; set; }
        public double PorcentajeCumplimiento { get; set; }
    }

    // ── Distribución por hora del día ─────────────────────────────────────────
    public class DtoPorHora
    {
        public int Hora    { get; set; }  // 0–23
        public int Total   { get; set; }
    }

    // ── Respuesta consolidada del reporte (dashboard existente) ─────────────
    public class DtoReporteCompleto
    {
        public DtoResumenReporte       Resumen    { get; set; } = new();
        public List<DtoPorOrigen>      PorOrigen  { get; set; } = new();
        public List<DtoPorFuerza>      PorFuerza  { get; set; } = new();
        public List<DtoTopCaso>        TopCasos   { get; set; } = new();
        public DtoTiemposAtencion      Tiempos    { get; set; } = new();
        public List<DtoSlaItem>        Sla        { get; set; } = new();
        public List<DtoPorHora>        PorHora    { get; set; } = new();
    }

    // ════════════════════════════════════════════════════════════════════════
    // REPORTES DETALLADOS (nuevos §6.16+)
    // ════════════════════════════════════════════════════════════════════════

    // ── Parámetros extendidos para reportes paginados ─────────────────────
    public class DtoReporteParamsEx : DtoReporteParams
    {
        public int    Page    { get; set; } = 1;
        public int    Limit   { get; set; } = 100;
        public string? Calidad { get; set; }   // filtro opcional por cali_pedido
        public int    Top     { get; set; } = 50;
    }

    // ── Respuesta paginada genérica ───────────────────────────────────────
    public class DtoPagedResult<T>
    {
        public int       Total    { get; set; }
        public int       Page     { get; set; }
        public int       Limit    { get; set; }
        public List<T>   Data     { get; set; } = new();
    }

    // ─────────────────────────────────────────────────────────────────────
    // R1 — Llamadas por calidad (cali_pedido)
    // ─────────────────────────────────────────────────────────────────────
    public class DtoPorCalidad
    {
        public string CaliPedido  { get; set; } = "";
        /// <summary>Etiqueta legible derivada del código de calidad.</summary>
        public string Descripcion { get; set; } = "";
        public int    Total       { get; set; }
        public double Porcentaje  { get; set; }
    }

    // ─────────────────────────────────────────────────────────────────────
    // R2 — Pedidos efectivos (tabla detallada)
    // ─────────────────────────────────────────────────────────────────────
    public class DtoPedidoEfectivo
    {
        public string  NumeTelefono  { get; set; } = "";
        public string  NumeLlamada   { get; set; } = "";  // p.id Snowflake
        public string  HoraLlamada   { get; set; } = "";  // hora_caso
        public string  CodigoCaso    { get; set; } = "";
        public string  DescCaso      { get; set; } = "";
        public string  Canal         { get; set; } = "";  // canal de la actuación
        public string  Unidad        { get; set; } = "";  // unidad_asignada
        public string  Placa         { get; set; } = "";
        /// <summary>H/Asigna — cuando el despachador asignó el evento (fecha_despacho).</summary>
        public string? HoraAsignacion { get; set; }
        /// <summary>H/Llega — cuando la unidad llegó al sitio (fecha_llegada).</summary>
        public string? HoraLlegada    { get; set; }
        /// <summary>H/Ter — cuando se cerró (fecha_cierre).</summary>
        public string? HoraTermino    { get; set; }
        /// <summary>T/Llegada — tiempo de desplazamiento (H/Llega – H/Asigna).</summary>
        public string? TiempoLlegada  { get; set; }
        /// <summary>T/Atención — tiempo de atención (H/Ter – H/Llega).</summary>
        public string? TiempoAtencion { get; set; }
        /// <summary>T/Total — desde H/Llamada hasta H/Ter.</summary>
        public string? TiempoTotal    { get; set; }
        public string  CaliPedido     { get; set; } = "";
        public string  Prioridad      { get; set; } = "";
    }

    // ─────────────────────────────────────────────────────────────────────
    // R3 — Resumen de tiempos de atención por unidad (tabla detallada)
    // ─────────────────────────────────────────────────────────────────────
    public class DtoTiempoDetalleItem
    {
        public string  Seccional        { get; set; } = "";  // fuerza
        public string  Unidad           { get; set; } = "";  // unidad_asignada
        public string  NroLlamada       { get; set; } = "";
        public string  CodigoCaso       { get; set; } = "";
        public string  DescCaso         { get; set; } = "";
        /// <summary>H/Llamada — hora_caso (cuando llamó el ciudadano).</summary>
        public string  HoraLlamada      { get; set; } = "";
        /// <summary>CALL-CENT H/Envío — fecha_primer_acceso (cuando el operador tomó la llamada).</summary>
        public string? HoraEnvioCentral { get; set; }
        /// <summary>CALL-Desp H/Asig — fecha_despacho del evento (cuando el despachador asignó).</summary>
        public string? HoraDespacho     { get; set; }
        /// <summary>Patrulla H/Llegada — fecha_llegada de la actuación.</summary>
        public string? HoraLlegada      { get; set; }
        /// <summary>H/Termino del Caso — fecha_cierre de la actuación.</summary>
        public string? HoraTermino      { get; set; }
        /// <summary>Desplaz. = HoraLlegada – HoraDespacho.</summary>
        public string? TiempoDesplazamiento { get; set; }
        /// <summary>Atención = HoraTermino – HoraLlegada.</summary>
        public string? TiempoAtencionCaso   { get; set; }
        /// <summary>Total = HoraTermino – HoraLlamada.</summary>
        public string? TiempoTotalCaso      { get; set; }
        public string  Placa            { get; set; } = "";
        public string  Prioridad        { get; set; } = "";
    }

    // ─────────────────────────────────────────────────────────────────────
    // R4 — Trabajo de operadores y despachadores
    // ─────────────────────────────────────────────────────────────────────
    public class DtoTrabajoOperador
    {
        public string  Usuario           { get; set; } = "";
        /// <summary>Casos creados (pedidos donde él es el usuario_genera del evento).</summary>
        public int     CasosRecibidos    { get; set; }
        /// <summary>Eventos creados/despachados por este usuario.</summary>
        public int     EventosDespachados { get; set; }
        /// <summary>Actuaciones asignadas en sus eventos.</summary>
        public int     Actuaciones       { get; set; }
        /// <summary>Eventos cerrados (fecha_cierre IS NOT NULL).</summary>
        public int     EventosCerrados   { get; set; }
        /// <summary>Promedio de tiempo de despacho desde primer acceso al evento (minutos).</summary>
        public double? PromMinDespacho   { get; set; }
        /// <summary>Primer y último hora de actividad en el período.</summary>
        public string  PrimeraActividad  { get; set; } = "";
        public string  UltimaActividad   { get; set; } = "";
    }

    // ─────────────────────────────────────────────────────────────────────
    // R5 — Llamadas por código (lista completa configurable)
    // ─────────────────────────────────────────────────────────────────────
    // Reutiliza DtoTopCaso (ya existe) — solo cambia el endpoint y el límite.
}
