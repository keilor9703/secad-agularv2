using Comun.Dtos.Menu;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Datos.Interfaz
{
    public interface IDbMenuRepository
    {
        Task<List<DtoMenuItem>> GetMyMenuAsync(long idUsuario, CancellationToken ct);
        Task<List<DtoMenuItem>> GetAdminMenuAsync(CancellationToken ct);
        Task<DtoMenuResult> SaveMenuAsync(DtoMenuSaveRequest request, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct);
        Task<DtoMenuResult> SetEstadoMenuAsync(long idMenu, int vigente, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct);
        Task<List<DtoMenuRolCatalogItem>> GetRolesCatalogAsync(CancellationToken ct);
        Task<List<DtoMenuRolItem>> GetRolesByMenuAsync(long idMenu, CancellationToken ct);
        Task<DtoMenuResult> AssignRolToMenuAsync(long idMenu, int idRol, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct);
        Task<DtoMenuResult> RemoveRolFromMenuAsync(long idMenu, int idRol, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct);
        Task<List<DtoRoleMenuItem>> GetMenusByRolAsync(int idRol, CancellationToken ct);
        Task<DtoMenuResult> AssignMenuToRolAsync(int idRol, long idMenu, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct);
        Task<DtoMenuResult> RemoveMenuFromRolAsync(int idRol, long idMenu, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct);
    }
}
