using Comun.Dtos.Tenant;
using Datos.Interfaz;
using Datos.Tenant;
using Microsoft.Extensions.Options;
using Npgsql;
using System.Collections.Concurrent;
using System.Diagnostics;

namespace Api.BackgroundServices
{
    /// <summary>
    /// Servicio alojado que sondea periódicamente la base de datos de cada CAD registrado
    /// y persiste las métricas de salud resultantes en la BD maestra.
    ///
    /// <para><b>Ciclo de sondeo:</b></para>
    /// <list type="number">
    ///   <item>Carga todos los tenants activos con credenciales desde la BD maestra.</item>
    ///   <item>Sondea cada CAD en paralelo (máx. <see cref="CadHealthMonitorOptions.MaxParallelProbes"/>)
    ///         abriendo una conexión real a su PostgreSQL y ejecutando <c>SELECT 1</c>.</item>
    ///   <item>Clasifica el resultado: <em>Normal (1)</em>, <em>Degradado (2)</em> u <em>Offline (3)</em>.</item>
    ///   <item>Persiste los cambios vía <see cref="IDbMasterRepository.UpdateSaludCadAsync"/>.</item>
    /// </list>
    ///
    /// <para><b>Circuit-breaker:</b></para>
    /// <list type="bullet">
    ///   <item>Fallos transitorios (menores a <see cref="CadHealthMonitorOptions.OfflineThreshold"/>)
    ///         no se persisten, evitando alertas falsas.</item>
    ///   <item>Una vez confirmado Offline, el CAD entra en una ventana de back-off
    ///         (<see cref="CadHealthMonitorOptions.OfflineBackoffSeconds"/>) y no se sondea
    ///         en cada ciclo, evitando saturar redes caídas.</item>
    ///   <item>Al recuperarse, el estado se reinicia inmediatamente.</item>
    /// </list>
    ///
    /// <para>La configuración se lee de la sección <c>HealthMonitor</c> de appsettings.json.</para>
    /// </summary>
    public sealed class CadHealthMonitorService : BackgroundService
    {
        // ── Dependencias ──────────────────────────────────────────────────────────
        private readonly IServiceScopeFactory          _scopeFactory;
        private readonly ConnectionPoolManager         _poolManager;
        private readonly CadHealthMonitorOptions       _opts;
        private readonly ILogger<CadHealthMonitorService> _logger;

        // ── Estado interno por CAD (circuit-breaker) ──────────────────────────────
        private readonly ConcurrentDictionary<string, CadProbeState> _state =
            new(StringComparer.OrdinalIgnoreCase);

        // ── Constructor ───────────────────────────────────────────────────────────
        public CadHealthMonitorService(
            IServiceScopeFactory                  scopeFactory,
            ConnectionPoolManager                 poolManager,
            IOptions<CadHealthMonitorOptions>     opts,
            ILogger<CadHealthMonitorService>      logger)
        {
            _scopeFactory = scopeFactory;
            _poolManager  = poolManager;
            _opts         = opts.Value;
            _logger       = logger;
        }

        // ── Bucle principal ───────────────────────────────────────────────────────

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            if (!_opts.Enabled)
            {
                _logger.LogInformation(
                    "[HealthMonitor] Servicio deshabilitado (HealthMonitor:Enabled = false).");
                return;
            }

            _logger.LogInformation(
                "[HealthMonitor] Iniciando. " +
                "Intervalo={Interval}s | Timeout={Timeout}s | " +
                "UmbralDegradado={Degraded}ms | UmbralOffline={Threshold} fallos | " +
                "BackoffOffline={Backoff}s | ParalelismoMax={Parallel}",
                _opts.IntervalSeconds, _opts.ProbeTimeoutSeconds,
                _opts.DegradedLatencyMs, _opts.OfflineThreshold,
                _opts.OfflineBackoffSeconds, _opts.MaxParallelProbes);

            // Esperar arranque completo de la app antes del primer sondeo
            if (_opts.StartupDelaySeconds > 0)
            {
                _logger.LogInformation(
                    "[HealthMonitor] Esperando {Delay}s antes del primer ciclo (startup delay).",
                    _opts.StartupDelaySeconds);

                await Task.Delay(
                    TimeSpan.FromSeconds(_opts.StartupDelaySeconds), stoppingToken)
                    .ConfigureAwait(false);
            }

            while (!stoppingToken.IsCancellationRequested)
            {
                var cycleTimer = Stopwatch.GetTimestamp();

                try
                {
                    await RunProbeCycleAsync(stoppingToken).ConfigureAwait(false);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break; // Shutdown normal
                }
                catch (Exception ex)
                {
                    // Error en el ciclo completo — loggear y continuar en el siguiente intervalo
                    _logger.LogError(ex, "[HealthMonitor] Error inesperado en el ciclo de sondeo.");
                }

                // Respetar el intervalo configurado descontando el tiempo que tomó el ciclo
                var elapsed   = Stopwatch.GetElapsedTime(cycleTimer);
                var remaining = TimeSpan.FromSeconds(_opts.IntervalSeconds) - elapsed;

                if (remaining > TimeSpan.Zero)
                    await Task.Delay(remaining, stoppingToken).ConfigureAwait(false);
            }

            _logger.LogInformation("[HealthMonitor] Servicio detenido.");
        }

        // ── Ciclo de sondeo ───────────────────────────────────────────────────────

        private async Task RunProbeCycleAsync(CancellationToken ct)
        {
            // Abrir un scope scoped para cargar los tenants
            List<DtoTenant> tenants;
            try
            {
                await using var scope = _scopeFactory.CreateAsyncScope();
                var repo = scope.ServiceProvider.GetRequiredService<IDbMasterRepository>();
                tenants  = await repo.GetActiveTenantsForMonitorAsync(ct);
            }
            catch (OperationCanceledException) { return; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[HealthMonitor] Error cargando la lista de tenants activos.");
                return;
            }

            if (tenants.Count == 0)
            {
                _logger.LogDebug("[HealthMonitor] Sin tenants activos. Ciclo omitido.");
                return;
            }

            _logger.LogDebug("[HealthMonitor] Ciclo iniciado — {Count} CADs a sondear.", tenants.Count);

            // Sondeo paralelo con límite de concurrencia
            var maxParallel = Math.Min(tenants.Count, Math.Max(1, _opts.MaxParallelProbes));
            var semaphore   = new SemaphoreSlim(maxParallel);

            var tasks = tenants.Select(t => ProbeAndPersistAsync(t, semaphore, ct));
            await Task.WhenAll(tasks).ConfigureAwait(false);

            _logger.LogDebug("[HealthMonitor] Ciclo completado.");
        }

        // ── Sondeo individual + persistencia ─────────────────────────────────────

        private async Task ProbeAndPersistAsync(
            DtoTenant tenant, SemaphoreSlim semaphore, CancellationToken ct)
        {
            var probeState = _state.GetOrAdd(tenant.CodDane, _ => new CadProbeState());

            // Circuit-breaker: CAD ya confirmado Offline y en ventana de back-off → omitir
            if (probeState.ShouldSkipDueToBackoff(_opts.OfflineBackoffSeconds))
            {
                _logger.LogDebug(
                    "[HealthMonitor] {CodDane} — back-off activo, {Remaining}s restantes.",
                    tenant.CodDane,
                    probeState.BackoffSecondsRemaining(_opts.OfflineBackoffSeconds));
                return;
            }

            await semaphore.WaitAsync(ct).ConfigureAwait(false);
            try
            {
                var (nivel, latenciaMs, obs) = await ProbeAsync(tenant, ct).ConfigureAwait(false);

                if (nivel == 3)
                {
                    probeState.RecordFailure(_opts.OfflineThreshold);

                    // Fallos transitorios: no persistir aún — esperar al umbral
                    if (probeState.ConsecutiveFailures < _opts.OfflineThreshold)
                    {
                        _logger.LogWarning(
                            "[HealthMonitor] ⚠  {CodDane} ({Nombre}) — fallo transitorio " +
                            "{N}/{Max}. No se persiste aún.",
                            tenant.CodDane, tenant.Nombre,
                            probeState.ConsecutiveFailures, _opts.OfflineThreshold);
                        return;
                    }
                    // Umbral superado → persistir como Offline
                }
                else
                {
                    probeState.RecordSuccess();
                }

                // Persistir métricas (scope propio para evitar DbContext viciado)
                var request = new DtoSaludCadRequest
                {
                    CodDane        = tenant.CodDane,
                    NivelOperacion = nivel,
                    LatenciaMs     = latenciaMs,
                    Observaciones  = obs
                };

                await using var scope = _scopeFactory.CreateAsyncScope();
                var repo = scope.ServiceProvider.GetRequiredService<IDbMasterRepository>();
                await repo.UpdateSaludCadAsync(request, ct).ConfigureAwait(false);

                LogNivelChange(tenant, nivel, latenciaMs, obs, probeState);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                /* Apagado ordenado — no loggear como error */
            }
            catch (Exception ex)
            {
                _logger.LogError(ex,
                    "[HealthMonitor] Error inesperado procesando CAD {CodDane}.",
                    tenant.CodDane);
            }
            finally
            {
                semaphore.Release();
            }
        }

        // ── Prueba de conectividad ────────────────────────────────────────────────

        /// <summary>
        /// Abre una conexión real a la BD del CAD y ejecuta <c>SELECT 1</c>.
        /// Devuelve el nivel de operación, latencia medida y observaciones.
        /// </summary>
        private async Task<(int nivel, int? latenciaMs, string? obs)> ProbeAsync(
            DtoTenant tenant, CancellationToken outerCt)
        {
            // CTS propio limitado al timeout configurado, encadenado al token de apagado
            using var probeCts = CancellationTokenSource.CreateLinkedTokenSource(outerCt);
            probeCts.CancelAfter(TimeSpan.FromSeconds(_opts.ProbeTimeoutSeconds));

            var sw = Stopwatch.StartNew();
            try
            {
                var dataSource = _poolManager.GetOrCreate(tenant);

                await using var conn = await dataSource
                    .OpenConnectionAsync(probeCts.Token)
                    .ConfigureAwait(false);

                await using var cmd = conn.CreateCommand();
                cmd.CommandText = "SELECT 1";
                await cmd.ExecuteScalarAsync(probeCts.Token).ConfigureAwait(false);

                sw.Stop();
                var ms    = (int)sw.ElapsedMilliseconds;
                var nivel = ms >= _opts.DegradedLatencyMs ? 2 : 1;
                var obs   = nivel == 2 ? $"Latencia alta: {ms} ms (umbral: {_opts.DegradedLatencyMs} ms)" : null;
                return (nivel, ms, obs);
            }
            catch (OperationCanceledException) when (!outerCt.IsCancellationRequested)
            {
                // El timeout del probe se disparó (no es apagado de la app)
                sw.Stop();
                return (3, null, $"Timeout al conectar (límite: {_opts.ProbeTimeoutSeconds}s)");
            }
            catch (NpgsqlException ex)
            {
                sw.Stop();
                // Limpiar el pool para forzar una conexión fresca en el próximo sondeo exitoso
                _poolManager.Invalidate(tenant.CodDane);
                return (3, null, SanitizeError(ex.Message));
            }
            catch (Exception ex) when (!outerCt.IsCancellationRequested)
            {
                sw.Stop();
                return (3, null, SanitizeError(ex.Message));
            }
        }

        // ── Logging estructurado ─────────────────────────────────────────────────

        private void LogNivelChange(
            DtoTenant tenant, int nivel, int? latenciaMs,
            string? obs, CadProbeState state)
        {
            var prevNivel = state.LastPersistedNivel;
            state.LastPersistedNivel = nivel;

            switch (nivel)
            {
                case 1:
                    if (prevNivel == 0)
                        _logger.LogInformation(
                            "[HealthMonitor] ✅ {CodDane} ({Nombre}) — Normal ({Ms} ms). Primer registro.",
                            tenant.CodDane, tenant.Nombre, latenciaMs);
                    else if (prevNivel != 1)
                        _logger.LogInformation(
                            "[HealthMonitor] ✅ {CodDane} ({Nombre}) — RECUPERADO → Normal ({Ms} ms).",
                            tenant.CodDane, tenant.Nombre, latenciaMs);
                    else
                        _logger.LogDebug(
                            "[HealthMonitor] {CodDane} — Normal ({Ms} ms).",
                            tenant.CodDane, latenciaMs);
                    break;

                case 2:
                    _logger.LogWarning(
                        "[HealthMonitor] ⚠  {CodDane} ({Nombre}) — Degradado ({Ms} ms). {Obs}",
                        tenant.CodDane, tenant.Nombre, latenciaMs, obs ?? string.Empty);
                    break;

                case 3:
                    _logger.LogError(
                        "[HealthMonitor] 🔴 {CodDane} ({Nombre}) — OFFLINE " +
                        "({Fallos} fallos consecutivos). {Obs}",
                        tenant.CodDane, tenant.Nombre,
                        state.ConsecutiveFailures, obs ?? string.Empty);
                    break;
            }
        }

        // ── Utilidades ────────────────────────────────────────────────────────────

        /// <summary>
        /// Trunca mensajes de error largos antes de guardarlos en la columna <c>observaciones</c>.
        /// No incluye credenciales (Npgsql no las expone en los mensajes de excepción).
        /// </summary>
        private static string SanitizeError(string message)
        {
            if (string.IsNullOrWhiteSpace(message)) return "Error desconocido";
            return message.Length > 250 ? message[..250] + "…" : message;
        }
    }

    // ── Estado por CAD (circuit-breaker interno) ─────────────────────────────────

    /// <summary>
    /// Rastreador de estado por CAD para implementar el circuit-breaker.
    /// Una instancia por cada <c>cod_dane</c>, almacenada en el <see cref="ConcurrentDictionary"/>.
    /// </summary>
    internal sealed class CadProbeState
    {
        // Número de fallos consecutivos desde el último éxito
        public int ConsecutiveFailures { get; private set; }

        // Último nivel persistido (0 = nunca sondeado)
        public int LastPersistedNivel { get; set; } = 0;

        // Momento en que se alcanzó el umbral de Offline (para calcular back-off)
        private DateTime? _offlineConfirmedAt;

        /// <summary>
        /// Registra un fallo. Si se alcanza el umbral, fija la marca de tiempo de inicio de back-off.
        /// </summary>
        public void RecordFailure(int offlineThreshold)
        {
            ConsecutiveFailures++;
            if (ConsecutiveFailures >= offlineThreshold)
                _offlineConfirmedAt ??= DateTime.UtcNow; // fijar solo la primera vez
        }

        /// <summary>Registra un éxito y reinicia todos los contadores.</summary>
        public void RecordSuccess()
        {
            ConsecutiveFailures  = 0;
            _offlineConfirmedAt  = null;
        }

        /// <summary>
        /// Indica si el CAD está en la ventana de back-off y debe omitirse en este ciclo.
        /// </summary>
        public bool ShouldSkipDueToBackoff(int backoffSeconds)
        {
            if (_offlineConfirmedAt is null) return false;
            return (DateTime.UtcNow - _offlineConfirmedAt.Value).TotalSeconds < backoffSeconds;
        }

        /// <summary>Segundos restantes de la ventana de back-off actual.</summary>
        public int BackoffSecondsRemaining(int backoffSeconds)
        {
            if (_offlineConfirmedAt is null) return 0;
            var elapsed = (DateTime.UtcNow - _offlineConfirmedAt.Value).TotalSeconds;
            return Math.Max(0, (int)(backoffSeconds - elapsed));
        }
    }
}
