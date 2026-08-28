namespace Comun.Dtos.Mapa
{
    // ── Filtros de consulta ───────────────────────────────────────────────────

    /// <summary>Parámetros de filtro para el módulo GIS Estadístico.</summary>
    public class DtoFiltroEstadistico
    {
        /// <summary>Fecha inicio del rango (ISO 8601, e.g. "2024-01-01").</summary>
        public string Desde { get; set; } = "";
        /// <summary>Fecha fin del rango (inclusive, e.g. "2024-12-31").</summary>
        public string Hasta { get; set; } = "";
        /// <summary>Código de caso a filtrar (vacío = todos).</summary>
        public string CodiPedido { get; set; } = "";
        /// <summary>Prioridad: FLASH | INMEDIATA | RUTINA | "" = todos.</summary>
        public string Prioridad  { get; set; } = "";
        /// <summary>Ciudad/municipio (vacío = todos).</summary>
        public string Ciudad     { get; set; } = "";
        /// <summary>Barrio (vacío = todos).</summary>
        public string Barrio     { get; set; } = "";
        /// <summary>Canal de atención (0 = todos).</summary>
        public int    CanalCodigo{ get; set; }
        /// <summary>
        /// Fuerza propietaria del canal (0 = sin restringir). Obligatorio cuando
        /// CanalCodigo &gt; 0: cad_canales.codigo no es único por sí solo (cada
        /// fuerza numera sus canales desde 1).
        /// </summary>
        public int    CanalFuerzaId { get; set; }
        /// <summary>Sitio de grabación (0 = todos del tenant).</summary>
        public int    SitioGraba { get; set; }
        /// <summary>Solo incidentes cerrados (true) o todos (false).</summary>
        public bool   SoloCerrados { get; set; } = true;
        /// <summary>
        /// Turno de vigilancia: 0=Todos, 1=Segundo(06-13h), 2=Tercer(14-21h), 3=Cuarto(22-05h).
        /// </summary>
        public int    TurnoVigilancia { get; set; }  // 0 = todos
    }

    // ── Respuesta principal ───────────────────────────────────────────────────

    /// <summary>Resultado completo del análisis GIS estadístico.</summary>
    public class DtoAnalisisEstadistico
    {
        /// <summary>Puntos para el mapa (máx. 5.000 registros).</summary>
        public List<DtoPuntoEstadistico> Puntos { get; set; } = new();
        /// <summary>Métricas y agregaciones para los paneles de gráficas.</summary>
        public DtoMetricasEstadisticas   Metricas { get; set; } = new();
    }

    // ── Punto del mapa ────────────────────────────────────────────────────────

    /// <summary>Incidente geoposicionado para el mapa (versión liviana).</summary>
    public class DtoPuntoEstadistico
    {
        public string  Id           { get; set; } = "";
        public string  CodiPedido   { get; set; } = "";
        public string  DescPedido   { get; set; } = "";
        public string  DireCaso     { get; set; } = "";
        public string  Barrio       { get; set; } = "";
        public string  Ciudad       { get; set; } = "";
        public double  Lat          { get; set; }
        public double  Lng          { get; set; }
        public string  Prioridad    { get; set; } = "";
        public string  Estado       { get; set; } = "";
        public string  HoraCaso     { get; set; } = "";
        /// <summary>Intensidad para el mapa de calor (1.0 por defecto, mayor para FLASH).</summary>
        public double  Intensidad   { get; set; } = 1.0;
    }

    // ── Métricas ──────────────────────────────────────────────────────────────

    public class DtoMetricasEstadisticas
    {
        public int Total       { get; set; }
        public int TotalFlash  { get; set; }
        public int TotalInmd   { get; set; }
        public int TotalRutina { get; set; }
        public int TotalOtros  { get; set; }
        public int ConCoordenadas { get; set; }

        /// <summary>Top tipos de caso ordenados por cantidad descendente.</summary>
        public List<DtoAgrupacion> PorTipoCaso    { get; set; } = new();
        /// <summary>Distribución por hora del día (0-23).</summary>
        public List<DtoAgrupacion> PorHora        { get; set; } = new();
        /// <summary>Distribución por día de la semana (0=domingo … 6=sábado).</summary>
        public List<DtoAgrupacion> PorDiaSemana   { get; set; } = new();
        /// <summary>Tendencia mensual (YYYY-MM).</summary>
        public List<DtoAgrupacion> PorMes         { get; set; } = new();
        /// <summary>Top ciudades/barrios.</summary>
        public List<DtoAgrupacion> PorCiudad      { get; set; } = new();
        /// <summary>Distribución por prioridad.</summary>
        public List<DtoAgrupacion> PorPrioridad   { get; set; } = new();
    }

    /// <summary>Par clave/total genérico para cualquier agrupación.</summary>
    public class DtoAgrupacion
    {
        public string Clave       { get; set; } = "";
        public string Descripcion { get; set; } = "";
        public int    Total       { get; set; }
    }
}
