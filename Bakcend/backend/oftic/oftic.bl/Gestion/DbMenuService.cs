using Comun.Dtos.Menu;
using Negocio.Interfaz;
using Datos.Interfaz;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Negocio.Gestion
{
    public class DbMenuService : IDbMenuService
    {
        private readonly IDbMenuRepository _repo;

        public DbMenuService(IDbMenuRepository repo)
        {
            _repo = repo;
        }
        public Task<List<DtoMenuItem>> GetMyMenuAsync(long idUsuario, CancellationToken ct)
        => _repo.GetMyMenuAsync(idUsuario, ct);

        public Task<List<DtoMenuItem>> GetAdminMenuAsync(CancellationToken ct)
        => _repo.GetAdminMenuAsync(ct);

        public Task<DtoMenuResult> SaveMenuAsync(DtoMenuSaveRequest request, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        => _repo.SaveMenuAsync(request, usuarioAuditoria, maquinaAuditoria, ct);

        public Task<DtoMenuResult> SetEstadoMenuAsync(long idMenu, int vigente, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        => _repo.SetEstadoMenuAsync(idMenu, vigente, usuarioAuditoria, maquinaAuditoria, ct);

        public Task<List<DtoMenuRolCatalogItem>> GetRolesCatalogAsync(CancellationToken ct)
        => _repo.GetRolesCatalogAsync(ct);

        public Task<List<DtoMenuRolItem>> GetRolesByMenuAsync(long idMenu, CancellationToken ct)
        => _repo.GetRolesByMenuAsync(idMenu, ct);

        public Task<DtoMenuResult> AssignRolToMenuAsync(long idMenu, int idRol, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        => _repo.AssignRolToMenuAsync(idMenu, idRol, usuarioAuditoria, maquinaAuditoria, ct);

        public Task<DtoMenuResult> RemoveRolFromMenuAsync(long idMenu, int idRol, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        => _repo.RemoveRolFromMenuAsync(idMenu, idRol, usuarioAuditoria, maquinaAuditoria, ct);

        public Task<List<DtoRoleMenuItem>> GetMenusByRolAsync(int idRol, CancellationToken ct)
        => _repo.GetMenusByRolAsync(idRol, ct);

        public Task<DtoMenuResult> AssignMenuToRolAsync(int idRol, long idMenu, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        => _repo.AssignMenuToRolAsync(idRol, idMenu, usuarioAuditoria, maquinaAuditoria, ct);

        public Task<DtoMenuResult> RemoveMenuFromRolAsync(int idRol, long idMenu, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        => _repo.RemoveMenuFromRolAsync(idRol, idMenu, usuarioAuditoria, maquinaAuditoria, ct);

        public Task<DtoMenuResult> ReemplazarMenusDeRolAsync(int idRol, IReadOnlyCollection<long> idMenus, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        => _repo.ReemplazarMenusDeRolAsync(idRol, idMenus, usuarioAuditoria, maquinaAuditoria, ct);
    }
}
