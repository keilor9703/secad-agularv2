namespace Negocio.Interfaz
{
    public interface IJwtService
    {
        string CreateToken(long idUsuario, string usuario, List<long> roles, string codDane, string? nombreCad,
                           int sitioGraba = 0, int acd = 0, int fuerzaId = 0, int canalId = 0,
                           string? homeCodDane = null, string? identificacion = null);
        string GenerateToken(string usuario);
    }
}
