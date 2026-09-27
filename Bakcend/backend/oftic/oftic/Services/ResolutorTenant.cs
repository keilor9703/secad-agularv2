using Datos.Interfaz;
using Datos.Tenant;

namespace Api.Services
{
    /// <summary>
    /// Establece el tenant de una petición que NO trae JWT ni llave de API.
    ///
    /// ── Por qué existe ──────────────────────────────────────────────────────
    /// TenantMiddleware resuelve el CAD del JWT del usuario, o de la llave de
    /// API de un sistema externo. Hay un caso que no encaja en ninguno de los
    /// dos: el gateway de medios del nodo edge preguntando «¿puede este token
    /// ver esta cámara?». Quien llama es el gateway, no un navegador con sesión,
    /// y la autorización la da un token firmado por SECAD que va en el cuerpo.
    ///
    /// Sin esto, el endpoint revienta con «TenantContext no ha sido
    /// inicializado» en cuanto toca la base del CAD. Lo encontró la prueba de
    /// extremo a extremo con MediaMTX real; leyendo el código no se veía.
    ///
    /// El CAD sale de dentro del token firmado, nunca de una cabecera: una
    /// cabecera la pone quien llama, y aquí quien llama no está autenticado.
    /// </summary>
    public class ResolutorTenant
    {
        private readonly TenantContext         _tenant;
        private readonly ConnectionPoolManager _pool;
        private readonly IDbMasterRepository   _master;
        private readonly ILogger<ResolutorTenant> _logger;

        public ResolutorTenant(
            TenantContext tenant, ConnectionPoolManager pool,
            IDbMasterRepository master, ILogger<ResolutorTenant> logger)
        {
            _tenant = tenant; _pool = pool; _master = master; _logger = logger;
        }

        /// <summary>
        /// Deja el TenantContext apuntando al CAD indicado. false si ese CAD no
        /// existe o está inactivo.
        /// </summary>
        public async Task<bool> EstablecerAsync(string? codDane, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(codDane)) return false;
            if (_tenant.IsInitialized) return true;

            if (_pool.TryGet(codDane, out var ds) && ds is not null)
            {
                _tenant.Set(ds, codDane, null, _pool.GetSitioGraba(codDane), _pool.GetGespoSigla(codDane));
                return true;
            }

            var t = await _master.GetTenantByCodDaneAsync(codDane, ct);
            if (t is null)
            {
                _logger.LogWarning("Se pidió resolver el CAD {Dane} y no existe.", codDane);
                return false;
            }

            _tenant.Set(_pool.GetOrCreate(t), codDane, null, t.SitioGraba, t.GespoSiglaUnidad);
            return true;
        }
    }
}
