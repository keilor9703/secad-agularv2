namespace Api.BackgroundServices
{
    /// <summary>
    /// Parámetros de configuración para el servicio de monitoreo de salud de CADs.
    /// Se ligan a la sección <c>HealthMonitor</c> de appsettings.json.
    /// </summary>
    public sealed class CadHealthMonitorOptions
    {
        public const string Section = "HealthMonitor";

        /// <summary>
        /// Habilita o deshabilita el monitor completamente.
        /// Útil para ambientes de prueba o mantenimiento sin reiniciar el proceso.
        /// Valor por defecto: <c>true</c>.
        /// </summary>
        public bool Enabled { get; set; } = true;

        /// <summary>
        /// Intervalo en segundos entre ciclos de sondeo completos (todos los CADs).
        /// Valor por defecto: <c>60</c> segundos.
        /// </summary>
        public int IntervalSeconds { get; set; } = 60;

        /// <summary>
        /// Tiempo máximo en segundos que se espera para establecer conexión con cada CAD.
        /// Si se supera, el CAD se registra como candidato a Offline.
        /// Valor por defecto: <c>5</c> segundos.
        /// </summary>
        public int ProbeTimeoutSeconds { get; set; } = 5;

        /// <summary>
        /// Latencia en milisegundos a partir de la cual un CAD conectado
        /// se clasifica como <em>Degradado</em> (nivel 2) en lugar de Normal (nivel 1).
        /// Valor por defecto: <c>300</c> ms.
        /// </summary>
        public int DegradedLatencyMs { get; set; } = 300;

        /// <summary>
        /// Número de fallos de conexión <em>consecutivos</em> que deben acumularse
        /// antes de marcar definitivamente un CAD como <em>Offline</em> (nivel 3) y
        /// persistir el resultado. Evita cambios de estado por fallos transitorios.
        /// Valor por defecto: <c>2</c>.
        /// </summary>
        public int OfflineThreshold { get; set; } = 2;

        /// <summary>
        /// Segundos de espera antes de reintentar el sondeo de un CAD que ya fue
        /// confirmado como Offline. Implementa un circuit-breaker suave para no
        /// saturar redes lentas ni generar ruido en los logs.
        /// Valor por defecto: <c>120</c> segundos (2 minutos).
        /// </summary>
        public int OfflineBackoffSeconds { get; set; } = 120;

        /// <summary>
        /// Máximo de CADs sondeados en paralelo por ciclo.
        /// Limita la presión sobre la red cuando hay muchos tenants registrados.
        /// Valor por defecto: <c>8</c>.
        /// </summary>
        public int MaxParallelProbes { get; set; } = 8;

        /// <summary>
        /// Segundos de espera inicial tras el arranque de la aplicación
        /// antes del primer ciclo de sondeo.
        /// Permite que la app termine de inicializarse antes de generar carga.
        /// Valor por defecto: <c>30</c> segundos.
        /// </summary>
        public int StartupDelaySeconds { get; set; } = 30;
    }
}
