namespace Negocio.Interfaz
{
    public interface IJwtService
    {
        /// <param name="esSuperAdmin">
        /// Se resuelve contra secad_super_admins de la base MAESTRA. No se
        /// deduce de los roles del tenant: la autoridad sobre todos los CAD no
        /// puede depender de la base de uno.
        /// </param>
        string CreateToken(long idUsuario, string usuario, List<long> roles, string codDane, string? nombreCad,
                           int sitioGraba = 0, int acd = 0, int fuerzaId = 0, int canalId = 0,
                           string? homeCodDane = null, string? identificacion = null,
                           bool esSuperAdmin = false);
        string GenerateToken(string usuario);
    }
}
