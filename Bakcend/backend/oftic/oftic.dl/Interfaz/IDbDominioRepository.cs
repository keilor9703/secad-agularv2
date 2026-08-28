using Comun.Dtos.Dominio;
using Comun.Dtos.LineasMando;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Datos.Interfaz
{
    public interface IDbDominioRepository
    {
        Task<List<DtoDominio>> GetAllAsync(CancellationToken ct);
        Task<DtoDominioResult> CreateAsync(DtoDominioRequest request, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct);
        Task<DtoDominioResult> UpdateAsync(long id, DtoDominioRequest request, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct);
        Task<DtoDominioResult> DeletelogicalAsync(long id, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct);
    }
}
