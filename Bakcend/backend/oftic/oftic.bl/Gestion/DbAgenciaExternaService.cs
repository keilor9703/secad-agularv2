using Comun.Dtos.Agencias;
using Datos.Interfaz;
using Negocio.Interfaz;

namespace Negocio.Gestion
{
    public class DbAgenciaExternaService : IDbAgenciaExternaService
    {
        private readonly IDbAgenciaExternaRepository _repo;

        public DbAgenciaExternaService(IDbAgenciaExternaRepository repo) => _repo = repo;

        public Task<List<DtoAgenciaExterna>> GetAllAsync(CancellationToken ct)
            => _repo.GetAllAsync(ct);

        public Task<DtoAgenciaExterna?> GetByIdAsync(long id, CancellationToken ct)
            => _repo.GetByIdAsync(id, ct);

        public Task<(bool success, string message, string? id)> CreateAsync(
            DtoAgenciaExternaRequest req, CancellationToken ct)
            => _repo.CreateAsync(req, ct);

        public Task<(bool success, string message)> UpdateAsync(
            long id, DtoAgenciaExternaRequest req, CancellationToken ct)
            => _repo.UpdateAsync(id, req, ct);

        public Task<(bool success, string message)> ToggleAsync(long id, CancellationToken ct)
            => _repo.ToggleAsync(id, ct);

        public Task<DtoDespachoExternoResult> DespacharAsync(
            DtoDespachoExternoRequest req, string usuario, CancellationToken ct)
            => _repo.DespacharAsync(req, usuario, ct);
    }
}
