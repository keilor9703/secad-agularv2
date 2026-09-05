namespace Datos.Interfaz
{
    public interface IDbAuthRepository
    {
        Task<(long? idUsuario, string identificacion, List<long> roles, bool esAdmin, int sitioGraba, int acd, int fuerzaId, int canalCodigo)> GetUsuarioYRolesAsync(string usuario, CancellationToken ct);

        /// <summary>
        /// ¿Alguno de estos roles es administrativo EN ESTE CAD? Lo declara
        /// ctr_roles.es_admin (V69), no un id fijo: id_rol es un BIGSERIAL local
        /// a cada tenant y el mismo número es otro rol en otra base.
        /// </summary>
        Task<bool> AlgunRolEsAdministrativoAsync(IReadOnlyCollection<long> roles, CancellationToken ct);
    }
}
