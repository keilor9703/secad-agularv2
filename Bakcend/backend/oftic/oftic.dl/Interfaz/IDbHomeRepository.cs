using Comun.Dtos.Home;

namespace Datos.Interfaz
{
    public interface IDbHomeRepository
    {
        Task<DtoHomeStats> GetStatsAsync(CancellationToken ct);
    }
}
