using Comun.Dtos.Camaras;

namespace Datos.Interfaz
{
    /// <summary>
    /// Acceso a datos de las integraciones VMS (cámaras) configurables por el
    /// administrador. Los secretos son write-only: nunca se devuelven al frontend.
    /// </summary>
    public interface IDbCamaraIntegracionRepository
    {
        Task<List<DtoCamaraIntegracion>> GetAllAsync(CancellationToken ct);
        Task<(bool Success, string Message, string? Id)> CreateAsync(
            DtoCamaraIntegracionRequest req, string usuario, CancellationToken ct);
        Task<(bool Success, string Message)> UpdateAsync(
            long id, DtoCamaraIntegracionRequest req, string usuario, CancellationToken ct);
        Task<(bool Success, string Message)> ToggleAsync(long id, CancellationToken ct);
        Task<(bool Success, string Message)> DeleteAsync(long id, CancellationToken ct);

        /// <summary>
        /// Todo lo que un driver necesita para hablar con ese VMS: la parte
        /// pública más los secretos YA DESCIFRADOS. Solo para uso del backend
        /// —nunca sale hacia el navegador—, por eso vive aparte de GetAllAsync.
        /// </summary>
        Task<DtoVmsConexion?> GetConexionAsync(long id, CancellationToken ct);
    }
}
