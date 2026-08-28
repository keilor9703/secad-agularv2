using Comun.Dtos.Auth;

namespace Servicios.ApiInterfaz
{
    public interface IApiWebOud
    {
        Task<bool> ValidarCredencialesAsync(string usuario, string contrasena, CancellationToken ct);
        Task<DtoOudResult> ValidarYObtenerDatosAsync(string usuario, string contrasena, CancellationToken ct);
    }
}
