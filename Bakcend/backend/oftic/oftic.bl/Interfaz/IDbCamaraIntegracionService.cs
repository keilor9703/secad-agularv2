using Comun.Dtos.Camaras;

namespace Negocio.Interfaz
{
    /// <summary>
    /// Lógica de negocio de las integraciones VMS (cámaras). Expone además el
    /// catálogo de drivers soportados (auto-descriptivos) para que el frontend
    /// renderice el formulario de configuración dinámicamente.
    /// </summary>
    public interface IDbCamaraIntegracionService
    {
        /// <summary>Drivers soportados por el backend, con su metadata de configuración.</summary>
        List<DtoVmsDriverDescriptor> GetDrivers();

        Task<List<DtoCamaraIntegracion>> GetAllAsync(CancellationToken ct);
        Task<(bool Success, string Message, string? Id)> CreateAsync(
            DtoCamaraIntegracionRequest req, string usuario, CancellationToken ct);
        Task<(bool Success, string Message)> UpdateAsync(
            long id, DtoCamaraIntegracionRequest req, string usuario, CancellationToken ct);
        Task<(bool Success, string Message)> ToggleAsync(long id, CancellationToken ct);
        Task<(bool Success, string Message)> DeleteAsync(long id, CancellationToken ct);

        /// <summary>
        /// Valida que la configuración esté completa según el descriptor del driver.
        /// La prueba real de conectividad contra el VMS se habilita con el runtime
        /// del driver (entrega posterior, requiere credenciales y acceso de red).
        /// </summary>
        /// <summary>
        /// Prueba la integración de verdad contra el VMS. Antes solo miraba que
        /// los campos estuvieran llenos, así que decía «configuración válida»
        /// de un servidor que no existe — que es justo lo contrario de lo que
        /// el administrador necesita saber.
        /// </summary>
        /// <param name="id">
        /// Ficha ya guardada, para poder reutilizar el secreto almacenado
        /// cuando el formulario no lo reenvía. 0 = probar solo lo que llega.
        /// </param>
        Task<DtoCamaraPruebaResult> ProbarConexionAsync(
            long id, DtoCamaraIntegracionRequest req, CancellationToken ct);
    }
}
