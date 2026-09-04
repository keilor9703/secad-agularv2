using Comun.Dtos;

namespace Datos.Interfaz
{
    public interface IDbUsuarioRepository
    {
        Task<long?> GetUsuarioIdByUsernameAsync(string username, CancellationToken ct);
        Task<long?> GetUsuarioIdByIdentificacionAsync(string identificacion, CancellationToken ct);
        Task<string?> GetIdentificacionByUsernameAsync(string username, CancellationToken ct);
        Task<bool?> GetActivoByIdentificacionOrUsernameAsync(string? identificacion, string? username, CancellationToken ct);
        Task<long> EnsureUsuarioExistsAsync(DtoFuncionario funcionario, CancellationToken ct);
        Task<List<DtoUsuarioListadoItem>> GetUsuariosListadoAsync(string? nombre, CancellationToken ct);
        Task<List<DtoRolAsignado>> GetRolesAsignadosAsync(string username, CancellationToken ct);
        Task<List<DtoRol>> GetRolesAsync(CancellationToken ct);
        Task<DtoGuardarUsuarioResult> SaveUsuarioAsync(
            DtoUsuarioRequest request,
            string usuarioAuditoria,
            string maquinaAuditoria,
            CancellationToken ct);
        Task<DtoGuardarUsuarioResult> EliminarUsuarioAsync(
            long idUsuario,
            string usuarioAuditoria,
            string maquinaAuditoria,
            CancellationToken ct);
        Task<DtoGuardarUsuarioResult> AsignarRolAsync(
            long idUsuario,
            DtoAsignarRolRequest request,
            string usuarioAuditoria,
            string maquinaAuditoria,
            CancellationToken ct);
        Task<DtoGuardarUsuarioResult> EliminarRolAsync(
            long idUsuario,
            int rolId,
            string usuarioAuditoria,
            string maquinaAuditoria,
            CancellationToken ct);
        Task<List<DtoRolAdmin>> GetRolesAdminAsync(CancellationToken ct);
        Task<DtoSaveRolResult> SaveRolAdminAsync(
            DtoSaveRolRequest request,
            string usuarioAuditoria,
            string maquinaAuditoria,
            CancellationToken ct);
        Task<DtoSaveRolResult> SetRolEstadoAsync(
            long idRol,
            int vigente,
            string usuarioAuditoria,
            string maquinaAuditoria,
            CancellationToken ct);

        /// <summary>
        /// Crea o actualiza un usuario civil en ctr_usuarios del tenant.
        /// tipo_usuario = 'CIVIL'; sin grado, funcionario ni unde_laborando.
        /// </summary>
        Task<DtoGuardarUsuarioResult> CreateCivilUsuarioAsync(
            DtoCivilUsuarioRequest request,
            string usuarioAuditoria,
            string maquinaAuditoria,
            CancellationToken ct);

        /// <summary>
        /// Lee los datos de un usuario directamente desde ctr_usuarios (sin pasar por PIP).
        /// Usado para administrar usuarios civiles / otras entidades.
        /// </summary>
        Task<DtoUsuarioLocalDetalle?> GetLocalUsuarioAsync(string username, CancellationToken ct);

        /// <summary>
        /// Obtiene los datos de un usuario o funcionario directamente desde ctr_usuarios del tenant,
        /// mapeado a DtoFuncionario para permitir la edición local cuando la API PIP externa no esté disponible.
        /// </summary>
        Task<DtoFuncionario?> GetFuncionarioLocalAsync(string identificacionOrUsername, CancellationToken ct);
    }
}
