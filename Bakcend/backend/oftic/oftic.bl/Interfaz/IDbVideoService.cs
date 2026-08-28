using Comun.Dtos.Videos;

namespace Negocio.Interfaz;

public interface IDbVideoService
{
    Task<List<DtoVideo>> GetAllAsync(CancellationToken ct);
    Task<DtoVideo?> GetByIdAsync(long id, CancellationToken ct);
    Task<DtoVideoResult> CreateAsync(DtoVideoRequest request, string usuarioAuditoria, string maquinaAuditoria, CancellationToken ct);
    Task<DtoVideoResult> UpdateAsync(long id, DtoVideoRequest request, string usuarioAuditoria, string maquinaAuditoria, CancellationToken ct);
    Task<DtoVideoResult> DeleteAsync(long id, string usuarioAuditoria, string maquinaAuditoria, CancellationToken ct);
}