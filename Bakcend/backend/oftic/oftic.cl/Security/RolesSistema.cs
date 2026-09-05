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
        /// SuperAdministrador. Opera por encima de un CAD concreto: da de alta
        /// tenants, conmuta de contexto y ve la salud de la red nacional.
        ///
        /// Solo un SuperAdministrador puede concederlo o retirarlo, y para
        /// quien no lo es este rol no existe: no aparece en los catálogos ni
        /// en la lista de roles de un usuario. Un administrador de unidad que
        /// pudiera asignarlo —aunque fuese a sí mismo— se saltaría de un salto
        /// la frontera entre administrar SU CAD y administrar todos.
        /// </summary>
        public const int SuperAdministrador = 2;

        /// <summary>Administrador del CAD.</summary>
        public const int Administrador = 1;
    }
}
