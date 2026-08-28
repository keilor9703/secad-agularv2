namespace Datos.Interfaz
{
    public interface IDbAuthRepository
    {
        Task<(long? idUsuario, string identificacion, List<long> roles, int sitioGraba, int acd, int fuerzaId, int canalCodigo)> GetUsuarioYRolesAsync(string usuario, CancellationToken ct);
    }
}
