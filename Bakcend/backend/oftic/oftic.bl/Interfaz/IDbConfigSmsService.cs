using Comun.Dtos.Administracion;

namespace Negocio.Interfaz
{
    public interface IDbConfigSmsService
    {
        Task<DtoConfigSms> GetAsync(CancellationToken ct);
        Task<DtoConfigSmsResult> ActualizarAsync(DtoConfigSmsRequest request, string usuario, CancellationToken ct);
        Task<DtoConfigSmsResult> ProbarEnvioAsync(string numeroTelefono, CancellationToken ct);
    }
}
