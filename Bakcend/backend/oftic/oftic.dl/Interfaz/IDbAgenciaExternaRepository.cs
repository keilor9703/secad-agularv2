using Comun.Dtos.Agencias;

namespace Datos.Interfaz
{
    public interface IDbAgenciaExternaRepository
    {
        Task<List<DtoAgenciaExterna>> GetAllAsync(CancellationToken ct);
        Task<DtoAgenciaExterna?> GetByIdAsync(long id, CancellationToken ct);
        Task<(bool success, string message, string? id)> CreateAsync(DtoAgenciaExternaRequest req, CancellationToken ct);
        Task<(bool success, string message)> UpdateAsync(long id, DtoAgenciaExternaRequest req, CancellationToken ct);
        Task<(bool success, string message)> ToggleAsync(long id, CancellationToken ct);

        /// <summary>
        /// Envía los datos del pedido a la API externa de la agencia y
        /// registra el resultado en cad_despachos_externos (auditoría).
        /// </summary>
        Task<DtoDespachoExternoResult> DespacharAsync(
            DtoDespachoExternoRequest req, string usuario, CancellationToken ct);
    }
}
