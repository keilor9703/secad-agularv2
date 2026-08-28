using Datos.Interfaz;
using Datos.Tenant;
using System.Security.Claims;

namespace Api.Middleware
{
    public class TenantMiddleware
    {
        private readonly RequestDelegate         _next;
        private readonly ILogger<TenantMiddleware> _logger;

        public TenantMiddleware(RequestDelegate next, ILogger<TenantMiddleware> logger)
        {
            _next   = next;
            _logger = logger;
        }

        public async Task InvokeAsync(
            HttpContext        context,
            TenantContext      tenantContext,
            ConnectionPoolManager poolManager,
            IDbMasterRepository   masterRepo)
        {
            string? codDane   = null;
            string? nombreCad = null;
            int?    sitioGrabaJwt = null;  // sitio del USUARIO (JWT claim)

            if (context.User.Identity?.IsAuthenticated == true)
            {
                // Ruta normal: usuario autenticado con JWT
                codDane      = context.User.FindFirstValue("cod_dane");
                nombreCad    = context.User.FindFirstValue("nombre_cad");
                if (int.TryParse(context.User.FindFirstValue("sitio_graba"), out var sg))
                    sitioGrabaJwt = sg;
            }
            else
            {
                // Ruta externa sin JWT (Chat, SMS, PIP, callbacks de agencias externas).
                // Prioridad:
                //   1. Header X-Cod-Dane  — estándar para integraciones configuradas (PIP, bots).
                //   2. Query ?codDane=    — callbackUrl autocontenida generada por DespacharAsync.
                //      La agencia recibe la URL completa con el codDane embebido y la devuelve
                //      tal cual. Así SECAD no depende de que la agencia sepa nada del tenant.
                codDane = context.Request.Headers["X-Cod-Dane"].FirstOrDefault()
                       ?? context.Request.Query["codDane"].FirstOrDefault();
            }

            if (!string.IsNullOrWhiteSpace(codDane))
            {
                int?    sitioGrabaTenant = null;   // sitio DEFAULT del tenant (de secad_tenants)
                string? gespoSigla       = null;

                if (!poolManager.TryGet(codDane, out var dataSource) || dataSource is null)
                {
                    // Cache miss: cargar tenant desde BD maestra
                    var tenant = await masterRepo.GetTenantByCodDaneAsync(codDane, context.RequestAborted);
                    if (tenant is null)
                    {
                        _logger.LogWarning(
                            "TenantMiddleware: tenant no encontrado para cod_dane={CodDane}", codDane);
                        context.Response.StatusCode = StatusCodes.Status403Forbidden;
                        await context.Response.WriteAsJsonAsync(new { message = "Tenant no autorizado." });
                        return;
                    }
                    // GetOrCreate ya cachea sitio_graba/gespo_sigla_unidad junto con el pool.
                    dataSource       = poolManager.GetOrCreate(tenant);
                    sitioGrabaTenant = tenant.SitioGraba;
                    gespoSigla       = tenant.GespoSiglaUnidad;
                }
                else
                {
                    // Cache hit: recuperar lo ya almacenado
                    sitioGrabaTenant = poolManager.GetSitioGraba(codDane);
                    gespoSigla       = poolManager.GetGespoSigla(codDane);
                }

                // En rutas JWT: el sitio del contexto es el del usuario (JWT claim).
                // En rutas externas sin JWT: usamos el sitio por defecto del tenant.
                var sitioEfectivo = sitioGrabaJwt ?? sitioGrabaTenant;

                tenantContext.Set(dataSource, codDane, nombreCad, sitioEfectivo, gespoSigla);
            }

            await _next(context);
        }
    }
}
