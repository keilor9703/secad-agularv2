using Datos.Interfaz;
using Microsoft.Extensions.Logging;
using Servicios.ApiInterfaz;

namespace Negocio.Gestion
{
    /// <summary>
    /// Implementación activa de IProveedorSms — lee el proveedor configurado y
    /// sus credenciales de ctr_config_sms (Administración → Proveedor SMS) y
    /// despacha a Infobip o Inalambria Express. Cambiar de proveedor es
    /// editar esa tabla desde la UI, sin redeploy.
    /// </summary>
    public class DbConfigProveedorSms : IProveedorSms
    {
        private readonly IDbConfigSmsRepository _configRepo;
        private readonly IInfobipSmsSender _infobip;
        private readonly IInalambriaExpressSmsSender _inalambria;
        private readonly ILogger<DbConfigProveedorSms> _logger;

        public DbConfigProveedorSms(
            IDbConfigSmsRepository configRepo,
            IInfobipSmsSender infobip,
            IInalambriaExpressSmsSender inalambria,
            ILogger<DbConfigProveedorSms> logger)
        {
            _configRepo = configRepo;
            _infobip    = infobip;
            _inalambria = inalambria;
            _logger     = logger;
        }

        public async Task<bool> EnviarSmsAsync(string numero, string mensaje, CancellationToken ct = default)
        {
            var cfg = await _configRepo.GetAsync(ct);

            if (string.IsNullOrWhiteSpace(cfg.ApiKey))
            {
                _logger.LogWarning(
                    "Proveedor SMS ({Proveedor}) sin api_key configurado — SMS NO enviado. Destino={Numero}",
                    cfg.Proveedor, numero);
                return false;
            }

            return cfg.Proveedor switch
            {
                "INALAMBRIA_EXPRESS" => await _inalambria.EnviarAsync(cfg.BaseUrl ?? "", cfg.ApiKey, numero, mensaje, ct),
                "INFOBIP"            => await _infobip.EnviarAsync(cfg.BaseUrl ?? "", cfg.ApiKey, cfg.Sender, numero, mensaje, ct),
                _ => LogProveedorDesconocido(cfg.Proveedor, numero)
            };
        }

        private bool LogProveedorDesconocido(string proveedor, string numero)
        {
            _logger.LogWarning("Proveedor SMS desconocido: {Proveedor} — SMS NO enviado. Destino={Numero}", proveedor, numero);
            return false;
        }
    }
}
