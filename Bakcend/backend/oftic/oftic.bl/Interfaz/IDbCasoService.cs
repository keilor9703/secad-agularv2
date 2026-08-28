using Comun.Dtos.Administracion;

namespace Negocio.Interfaz
{
    public interface IDbCasoService
    {
        Task<List<DtoCaso>> GetAllAsync(string? busqueda, CancellationToken ct);
        Task<DtoCasoResult> CrearAsync(DtoCasoRequest request, CancellationToken ct);
        Task<DtoCasoResult> ActualizarAsync(DtoCasoRequest request, CancellationToken ct);
        Task<DtoCasoResult> SetVigenteAsync(string codigo, bool vigente, CancellationToken ct);
        Task<DtoImportarCasosResult> ImportarAsync(List<DtoCasoImportItem> items, CancellationToken ct);
    }
}
