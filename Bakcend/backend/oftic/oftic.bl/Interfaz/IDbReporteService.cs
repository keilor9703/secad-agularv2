using Comun.Dtos.Reportes;

namespace Negocio.Interfaz
{
    public interface IDbReporteService
    {
        Task<DtoReporteCompleto>                   GetReporteCompletoAsync  (DtoReporteParams   p, CancellationToken ct);
        Task<List<DtoPorCalidad>>                  GetPorCalidadAsync       (DtoReporteParams   p, CancellationToken ct);
        Task<DtoPagedResult<DtoPedidoEfectivo>>    GetEfectivosAsync        (DtoReporteParamsEx p, CancellationToken ct);
        Task<DtoPagedResult<DtoTiempoDetalleItem>> GetTiemposDetalleAsync   (DtoReporteParamsEx p, CancellationToken ct);
        Task<List<DtoTrabajoOperador>>             GetTrabajoOperadoresAsync(DtoReporteParams   p, CancellationToken ct);
        Task<List<DtoTopCaso>>                     GetPorCodigoAsync        (DtoReporteParamsEx p, CancellationToken ct);
    }
}
