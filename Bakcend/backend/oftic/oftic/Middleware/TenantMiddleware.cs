using Comun.Dtos.Integraciones;
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
            ApiKeyContext      apiKeyContext,
            ConnectionPoolManager poolManager,
            IDbMasterRepository   masterRepo,
            IDbApiKeyRepository   apiKeyRepo)
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
                // ── Ruta externa sin JWT (Chat, SMS, planta telefónica, PIP,
                //    callbacks de agencias externas) ─────────────────────────
                //
                // La llave manda. Cada llave de secad_api_keys pertenece a UN
                // CAD, así que resolverla resuelve el tenant y no hace falta
                // creerle a ninguna cabecera. Antes el CAD lo decidía
                // X-Cod-Dane mientras la clave era una sola para todo el país:
                // quien la tuviera escribía en el CAD que quisiera cambiando esa
                // cabecera. Aquí se cierra.
                var presentada = context.Request.Headers["X-Api-Key"].FirstOrDefault();
                if (!string.IsNullOrWhiteSpace(presentada))
                {
                    var llave = await apiKeyRepo.ResolverAsync(
                        HuellaApiKey.Calcular(presentada), context.RequestAborted);

                    if (llave is not null)
                    {
                        apiKeyContext.Set(llave);
                        codDane       = llave.CodDane;
                        sitioGrabaJwt = llave.SitioGrabaDefecto > 0 ? llave.SitioGrabaDefecto : null;

                        if (llave.EnGracia)
                            _logger.LogWarning(
                                "Llave «{Nombre}» ({Dane}) usada dentro del periodo de gracia: el sistema " +
                                "externo todavía no cambió a la nueva.", llave.Nombre, llave.CodDane);
                    }
                }

                // Respaldo mientras queden integraciones con la clave global de
                // appsettings —y para los callbacks de agencia, cuya URL lleva
                // el codDane embebido y se entregó antes de que existieran las
                // llaves. En cuanto la petición trae una llave válida, esto ya
                // no se mira.
                codDane ??= context.Request.Headers["X-Cod-Dane"].FirstOrDefault()
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
