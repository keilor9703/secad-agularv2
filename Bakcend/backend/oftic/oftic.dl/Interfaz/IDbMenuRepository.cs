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

        /// <summary>
        /// Deja el rol con EXACTAMENTE los menús indicados: concede los que
        /// falten y retira los que sobren, en una sola transacción. Es lo que
        /// necesita una pantalla de casillas, donde el administrador revisa
        /// toda la lista y guarda una vez.
        /// </summary>
        /// <param name="puedeGestionarSuper">
        /// false para un administrador de CAD: las pantallas de Super Admin no
        /// se le ofrecen, no puede concederlas y —esto es lo que se olvida— las
        /// que ya estén concedidas NO se le retiran al guardar. Si no las ve,
        /// su lista no puede decidir sobre ellas.
        /// </param>
        Task<DtoMenuResult> ReemplazarMenusDeRolAsync(
            int idRol, IReadOnlyCollection<long> idMenus, bool puedeGestionarSuper,
            long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct);
    }
}
