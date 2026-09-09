using Comun.Dtos.Integraciones;

namespace Negocio.Interfaz
{
    /// <summary>Generación, revelado y rotación de las llaves de API.</summary>
    public interface IApiKeyService
    {
        Task<List<DtoApiKey>> ListarAsync(string codDane, CancellationToken ct);

        Task<(DtoApiKeyConSecreto? datos, string? error)> CrearAsync(
            string codDane, DtoApiKeyRequest request, string? usuario, string? ip, CancellationToken ct);

        /// <summary>
        /// Devuelve la llave en claro. Queda registrado quién la vio y desde dónde:
        /// es la contrapartida de poder recuperarla en vez de verla una sola vez.
        /// </summary>
        Task<(string? clave, string? error)> RevelarAsync(
            long id, string codDane, string? usuario, string? ip, CancellationToken ct);

        /// <summary>
        /// Emite una llave nueva y deja la anterior viva unas horas, para que el
        /// proveedor externo tenga margen de reconfigurar su equipo.
        /// </summary>
        Task<(DtoApiKeyConSecreto? datos, string? error)> RegenerarAsync(
            long id, string codDane, int horasGracia, string? usuario, string? ip, CancellationToken ct);

        Task<DtoApiKeyResult> CambiarEstadoAsync(long id, string codDane, bool activa, string? usuario, string? ip, CancellationToken ct);
        Task<DtoApiKeyResult> ActualizarAsync(long id, string codDane, DtoApiKeyRequest request, string? usuario, string? ip, CancellationToken ct);
        Task<List<DtoApiKeyAuditoria>> ListarAuditoriaAsync(string codDane, int limite, CancellationToken ct);
    }
}
