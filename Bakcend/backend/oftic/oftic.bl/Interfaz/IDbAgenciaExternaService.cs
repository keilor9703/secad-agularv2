using Comun.Dtos.Agencias;

namespace Negocio.Interfaz
{
    public interface IDbAgenciaExternaService
    {
        Task<List<DtoAgenciaExterna>> GetAllAsync(CancellationToken ct);
        Task<DtoAgenciaExterna?> GetByIdAsync(long id, CancellationToken ct);
        Task<(bool success, string message, string? id)> CreateAsync(DtoAgenciaExternaRequest req, CancellationToken ct);
        Task<(bool success, string message)> UpdateAsync(long id, DtoAgenciaExternaRequest req, CancellationToken ct);
        Task<(bool success, string message)> ToggleAsync(long id, CancellationToken ct);
        Task<DtoDespachoExternoResult> DespacharAsync(DtoDespachoExternoRequest req, string usuario, CancellationToken ct);
    }
}
