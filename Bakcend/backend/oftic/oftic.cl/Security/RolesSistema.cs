namespace Comun.Security
{
    /// <summary>
    /// Los roles que el propio sistema reconoce por su identificador, no por su
    /// nombre. El nombre se puede editar desde la pantalla de roles; el id, no.
    ///
    /// Estaba escrito a mano en varios sitios —JwtService comparaba con 2L, el
    /// frontend con su propia constante— y una regla de seguridad repartida en
    /// literales sueltos es una regla que tarde o temprano se aplica en unos
    /// sitios y en otros no.
    /// </summary>
    public static class RolesSistema
    {
        /// <summary>
        /// Administrador del CAD. Es un rol DEL TENANT: administra su CAD y
        /// nada más.
        ///
        /// Aquí vivía también una constante SuperAdministrador = 2, y ya no
        /// existe. Ser superadministrador del sistema dejó de ser un rol de
        /// tenant en V66: se registra en secad_super_admins, en la base
        /// MAESTRA. El id 2 volvió a ser un id corriente, y un CAD puede
        /// usarlo para el rol que quiera.
        /// </summary>
        public const int Administrador = 1;
    }
}
