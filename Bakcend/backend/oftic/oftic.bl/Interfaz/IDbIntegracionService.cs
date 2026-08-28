using Comun.Dtos.Integraciones;

namespace Negocio.Interfaz
{
    public interface IDbIntegracionService
    {
        Task<List<DtoIntegracionEntrante>> GetEntrantesAsync(CancellationToken ct);
        Task<DtoIntegracionEntrante?> GetEntranteByIdAsync(long id, CancellationToken ct);
        Task<(bool success, string message, long id)> CreateEntranteAsync(DtoIntegracionEntranteRequest req, string usuario, CancellationToken ct);
        Task<(bool success, string message)> UpdateEntranteAsync(long id, DtoIntegracionEntranteRequest req, string usuario, CancellationToken ct);
        Task<(bool success, string message)> ToggleEntranteAsync(long id, CancellationToken ct);

        Task<List<DtoDespachoAuditoria>> GetDespachoAuditoriaAsync(int limit, string? agenciaId, CancellationToken ct);
        Task<List<DtoRecepcionAuditoria>> GetRecepcionAuditoriaAsync(int limit, string? canal, CancellationToken ct);
    }
}
