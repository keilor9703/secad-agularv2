using Comun.Dtos.Integraciones;

namespace Datos.Interfaz
{
    public interface IDbIntegracionRepository
    {
        // ── Integraciones entrantes (cad_integraciones_entrantes) ───────────────
        Task<List<DtoIntegracionEntrante>> GetEntrantesAsync(CancellationToken ct);
        Task<DtoIntegracionEntrante?> GetEntranteByIdAsync(long id, CancellationToken ct);
        Task<long> CreateEntranteAsync(DtoIntegracionEntranteRequest req, string usuario, CancellationToken ct);
        Task<bool> UpdateEntranteAsync(long id, DtoIntegracionEntranteRequest req, string usuario, CancellationToken ct);
        Task<bool> ToggleEntranteAsync(long id, CancellationToken ct);

        // ── Auditoría salientes (cad_despachos_externos) ─────────────────────────
        Task<List<DtoDespachoAuditoria>> GetDespachoAuditoriaAsync(
            int limit, string? agenciaId, CancellationToken ct);

        // ── Auditoría entrantes (cad_recepciones_externas) ───────────────────────
        Task<List<DtoRecepcionAuditoria>> GetRecepcionAuditoriaAsync(
            int limit, string? canal, CancellationToken ct);
    }
}
