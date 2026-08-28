using Comun.Dtos.LineasMando;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace Datos.Interfaz
{
    public interface IDbLineaMandoRepository
    {
        Task<List<DtoLineaMando>> GetAllAsync(CancellationToken ct);
        Task<DtoLineaMando?> GetByIdAsync(long id, CancellationToken ct);
        Task<DtoLineaMando?> GetByIdentificacionAsync(string identificacion, CancellationToken ct);
        Task<DtoLineaMandoResult> CreateAsync(DtoLineaMandoRequest request, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct);
        Task<DtoLineaMandoResult> UpdateAsync(long id, DtoLineaMandoRequest request, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct);
        Task<DtoLineaMandoResult> DeleteAsync(long id, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct);
        Task<DtoLineaMandoResult> SetVigenteAsync(long id, int vigente, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct);
    }
}
