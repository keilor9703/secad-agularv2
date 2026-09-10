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

        /// <summary>
        /// Canales de despacho a los que va un caso recibido por este tipo de
        /// canal, según la ficha de integración. Los fija el CAD: el sistema
        /// externo dejó de mandarlos en V74.
        /// </summary>
        Task<DtoDestinoIntegracion> ResolverDestinoAsync(string tipoCanal, long? apiKeyId, CancellationToken ct);

        // ── Auditoría salientes (cad_despachos_externos) ─────────────────────────
        Task<List<DtoDespachoAuditoria>> GetDespachoAuditoriaAsync(
            int limit, string? agenciaId, CancellationToken ct);

        // ── Auditoría entrantes (cad_recepciones_externas) ───────────────────────
        Task<List<DtoRecepcionAuditoria>> GetRecepcionAuditoriaAsync(
            int limit, string? canal, CancellationToken ct);
    }
}
