using Comun.Dtos.Administracion;
using Datos.Interfaz;
using Negocio.Interfaz;
using Servicios.ApiInterfaz;

namespace Negocio.Gestion
{
    public class DbConfigSmsService : IDbConfigSmsService
    {
        private static readonly HashSet<string> ProveedoresValidos = new(StringComparer.OrdinalIgnoreCase)
        {
            "INFOBIP", "INALAMBRIA_EXPRESS"
        };

        private readonly IDbConfigSmsRepository _repo;
        private readonly IProveedorSms _proveedorSms;

        public DbConfigSmsService(IDbConfigSmsRepository repo, IProveedorSms proveedorSms)
        {
            _repo         = repo;
            _proveedorSms = proveedorSms;
        }

        public async Task<DtoConfigSms> GetAsync(CancellationToken ct)
        {
            var cfg = await _repo.GetAsync(ct);
            return new DtoConfigSms
            {
                Proveedor       = cfg.Proveedor,
                BaseUrl         = cfg.BaseUrl,
                Sender          = cfg.Sender,
                TieneApiKey     = !string.IsNullOrWhiteSpace(cfg.ApiKey),
                ApiKeyMascara   = EnmascararApiKey(cfg.ApiKey),
                UsuarioModifica = cfg.UsuarioModifica,
                FechaModifica   = cfg.FechaModifica?.ToString("dd/MM/yyyy HH:mm")
            };
        }

        public async Task<DtoConfigSmsResult> ActualizarAsync(DtoConfigSmsRequest request, string usuario, CancellationToken ct)
        {
            var proveedor = (request.Proveedor ?? "").Trim().ToUpperInvariant();
            if (!ProveedoresValidos.Contains(proveedor))
                return new DtoConfigSmsResult { Success = false, Message = "Proveedor no reconocido." };

            var actual = await _repo.GetAsync(ct);

            // Api_key vacío en el request = mantener el ya guardado (mismo patrón
            // que el token de AgenciaExternaController: no se pide reescribir la
            // credencial cada vez que se edita otro campo).
            var apiKey = string.IsNullOrWhiteSpace(request.ApiKey) ? actual.ApiKey : request.ApiKey.Trim();

            await _repo.GuardarAsync(new ConfigSmsRegistro
            {
                Proveedor       = proveedor,
                BaseUrl         = string.IsNullOrWhiteSpace(request.BaseUrl) ? null : request.BaseUrl.Trim(),
                ApiKey          = apiKey,
                Sender          = string.IsNullOrWhiteSpace(request.Sender) ? null : request.Sender.Trim(),
                UsuarioModifica = usuario
            }, ct);

            return new DtoConfigSmsResult { Success = true, Message = "Configuración de SMS guardada correctamente." };
        }

        public async Task<DtoConfigSmsResult> ProbarEnvioAsync(string numeroTelefono, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(numeroTelefono))
                return new DtoConfigSmsResult { Success = false, Message = "Ingrese un número de teléfono." };

            var enviado = await _proveedorSms.EnviarSmsAsync(
                numeroTelefono.Trim(),
                "SECAD/OFTIC: mensaje de prueba de configuración del proveedor SMS.",
                ct);

            return enviado
                ? new DtoConfigSmsResult { Success = true, Message = "SMS de prueba enviado correctamente." }
                : new DtoConfigSmsResult { Success = false, Message = "No se pudo enviar el SMS de prueba — revise las credenciales y el log del servidor." };
        }

        private static string? EnmascararApiKey(string? apiKey)
        {
            if (string.IsNullOrWhiteSpace(apiKey)) return null;
            return apiKey.Length <= 4 ? "••••" : $"••••{apiKey[^4..]}";
        }
    }
}
