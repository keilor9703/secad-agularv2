using Comun.Dtos.Reportes;
using Datos.Interfaz;
using Negocio.Interfaz;

namespace Negocio.Gestion
{
    public class DbReporteService : IDbReporteService
    {
        private readonly IDbReporteRepository _repo;
        public DbReporteService(IDbReporteRepository repo) => _repo = repo;

        public Task<DtoReporteCompleto>                   GetReporteCompletoAsync  (DtoReporteParams   p, CancellationToken ct) => _repo.GetReporteCompletoAsync(p,   ct);
        public Task<List<DtoPorCalidad>>                  GetPorCalidadAsync       (DtoReporteParams   p, CancellationToken ct) => _repo.GetPorCalidadAsync(p,        ct);
        public Task<DtoPagedResult<DtoPedidoEfectivo>>    GetEfectivosAsync        (DtoReporteParamsEx p, CancellationToken ct) => _repo.GetEfectivosAsync(p,          ct);
        public Task<DtoPagedResult<DtoTiempoDetalleItem>> GetTiemposDetalleAsync   (DtoReporteParamsEx p, CancellationToken ct) => _repo.GetTiemposDetalleAsync(p,     ct);
        public Task<List<DtoTrabajoOperador>>             GetTrabajoOperadoresAsync(DtoReporteParams   p, CancellationToken ct) => _repo.GetTrabajoOperadoresAsync(p,  ct);
        public Task<List<DtoTopCaso>>                     GetPorCodigoAsync        (DtoReporteParamsEx p, CancellationToken ct) => _repo.GetPorCodigoAsync(p,          ct);
    }
}
