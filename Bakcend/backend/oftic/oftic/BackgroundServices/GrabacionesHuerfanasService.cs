using Api.Services;
using Datos.Interfaz;
using Datos.Tenant;
using Negocio.Interfaz;

namespace Api.BackgroundServices
{
    /// <summary>
    /// Red de seguridad final de las grabaciones de videollamada.
    ///
    /// <para>El navegador del despachador sube la grabación por trozos mientras
    /// graba, así que el archivo ya está a salvo en el servidor. Lo que puede
    /// faltar es el <b>cierre</b>: si el puesto del despachador muere de golpe
    /// —se cierra Chrome, se va la luz, se cae la red y no vuelve— nadie llama a
    /// <c>grabacion/finalizar</c> y la grabación se quedaría en disco sin quedar
    /// registrada como adjunto del caso.</para>
    ///
    /// <para>Este servicio recorre periódicamente todos los CAD buscando
    /// grabaciones que sigan abiertas y que no reciban un trozo desde hace más de
    /// <see cref="MinutosInactividad"/> minutos, y las cierra él mismo. Con esto se
    /// cumple la regla dura: <b>una grabación iniciada siempre termina guardada en
    /// el caso</b>, sin importar cómo haya terminado la llamada.</para>
    ///
    /// <para>La descripción del adjunto deja constancia de que el cierre fue
    /// automático, para que quede claro en la trazabilidad del material.</para>
    /// </summary>
    public sealed class GrabacionesHuerfanasService : BackgroundService
    {
        private readonly IServiceScopeFactory  _scopeFactory;
        private readonly ConnectionPoolManager _poolManager;
        private readonly ILogger<GrabacionesHuerfanasService> _logger;

        /// <summary>Sin trozos por más de esto ⇒ el puesto del despachador ya no está.</summary>
        private const int MinutosInactividad = 3;

        /// <summary>Cada cuánto se hace el barrido.</summary>
        private static readonly TimeSpan Intervalo = TimeSpan.FromMinutes(2);

        /// <summary>Margen para que la app termine de arrancar antes del primer barrido.</summary>
        private static readonly TimeSpan RetardoInicial = TimeSpan.FromMinutes(1);

        public GrabacionesHuerfanasService(
            IServiceScopeFactory  scopeFactory,
            ConnectionPoolManager poolManager,
            ILogger<GrabacionesHuerfanasService> logger)
        {
            _scopeFactory = scopeFactory;
            _poolManager  = poolManager;
            _logger       = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation(
                "[GrabHuerfanas] Iniciando. Barrido cada {Int} min, umbral de inactividad {Umbral} min.",
                Intervalo.TotalMinutes, MinutosInactividad);

            try { await Task.Delay(RetardoInicial, stoppingToken); }
            catch (OperationCanceledException) { return; }

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await BarrerTodosLosTenantsAsync(stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    // Nunca dejar morir el bucle: es la última línea de defensa de la evidencia.
                    _logger.LogError(ex, "[GrabHuerfanas] Error inesperado en el barrido.");
                }

                try { await Task.Delay(Intervalo, stoppingToken); }
                catch (OperationCanceledException) { break; }
            }

            _logger.LogInformation("[GrabHuerfanas] Servicio detenido.");
        }

        private async Task BarrerTodosLosTenantsAsync(CancellationToken ct)
        {
            List<Comun.Dtos.Tenant.DtoTenant> tenants;
            await using (var scope = _scopeFactory.CreateAsyncScope())
            {
                var master = scope.ServiceProvider.GetRequiredService<IDbMasterRepository>();
                tenants = await master.GetActiveTenantsForMonitorAsync(ct);
            }

            foreach (var tenant in tenants)
            {
                if (ct.IsCancellationRequested) return;
                try
                {
                    await BarrerTenantAsync(tenant, ct);
                }
                catch (Exception ex)
                {
                    // Un CAD caído no debe impedir barrer los demás.
                    _logger.LogWarning(ex,
                        "[GrabHuerfanas] No se pudo barrer el CAD {CodDane}.", tenant.CodDane);
                }
            }
        }

        private async Task BarrerTenantAsync(Comun.Dtos.Tenant.DtoTenant tenant, CancellationToken ct)
        {
            await using var scope = _scopeFactory.CreateAsyncScope();
            var sp = scope.ServiceProvider;

            // Este scope no viene de un request HTTP, así que no hay TenantMiddleware:
            // hay que fijar el tenant a mano, igual que hace VideoSignalingHub.
            var dataSource = _poolManager.GetOrCreate(tenant);
            sp.GetRequiredService<TenantContext>()
              .Set(dataSource, tenant.CodDane, tenant.Nombre, tenant.SitioGraba);

            var videoSvc = sp.GetRequiredService<IDbVideoLlamadaService>();
            var huerfanas = await videoSvc.GetGrabacionesHuerfanasAsync(MinutosInactividad, ct);
            if (huerfanas.Count == 0) return;

            _logger.LogWarning(
                "[GrabHuerfanas] CAD {CodDane}: {N} grabación(es) quedaron abiertas sin cierre; se finalizan automáticamente.",
                tenant.CodDane, huerfanas.Count);

            var finalizador = sp.GetRequiredService<GrabacionFinalizador>();

            foreach (var g in huerfanas)
            {
                if (ct.IsCancellationRequested) return;
                try
                {
                    await finalizador.FinalizarAsync(
                        g,
                        g.Usuario ?? "sistema",
                        "Grabación de videollamada (cierre automático: la llamada terminó de forma abrupta)",
                        ct);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex,
                        "[GrabHuerfanas] No se pudo finalizar la grabación de la sesión {SesionId}.", g.SesionId);
                }
            }
        }
    }
}
