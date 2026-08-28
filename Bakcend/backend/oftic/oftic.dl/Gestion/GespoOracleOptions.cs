namespace Datos.Gestion
{
    /// <summary>
    /// Parámetros de conexión a Oracle GESPO para lectura directa (sin FDW).
    /// Se ligan a la sección <c>GespoOracle</c> de appsettings.json.
    /// </summary>
    public sealed class GespoOracleOptions
    {
        public const string Section = "GespoOracle";

        /// <summary>
        /// Habilita la lectura directa a Oracle. Valor por defecto <c>false</c> —
        /// activar solo tras confirmar ConnectionString/Schema/ViewName reales.
        /// </summary>
        public bool Enabled { get; set; } = false;

        /// <summary>
        /// Cadena de conexión Oracle completa, p.ej.
        /// "User Id=usr;Password=***;Data Source=host:1521/SERVICE_NAME".
        /// Gestionada como secreto (appsettings.Development.json local, o
        /// variable de entorno / secret manager en producción) — nunca en
        /// código fuente ni en el repositorio.
        /// </summary>
        public string ConnectionString { get; set; } = "";

        /// <summary>Esquema/owner Oracle donde vive la vista.</summary>
        public string Schema { get; set; } = "GESPO_OWNER";

        /// <summary>Nombre de la vista Oracle a consultar.</summary>
        public string ViewName { get; set; } = "VW_CONSULTA_ACTUAL_GPS";

        /// <summary>
        /// Timeout en segundos para la consulta a Oracle. VW_CONSULTA_ACTUAL_GPS trae
        /// GPS de todo el país filtrado por sigla — sin un índice sobre esa columna
        /// en Oracle, la consulta puede tardar bastante más que un timeout corto
        /// (visto en la práctica: 15s no alcanza y produce ORA-01013 "el usuario ha
        /// solicitado la cancelación de la operación actual", que es justamente lo
        /// que ODP.NET genera cuando cancela por CommandTimeout).
        /// </summary>
        public int TimeoutSeconds { get; set; } = 30;
    }
}
