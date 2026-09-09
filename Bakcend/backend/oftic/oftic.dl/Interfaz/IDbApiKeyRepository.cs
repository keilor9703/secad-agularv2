using Comun.Dtos.Integraciones;

namespace Datos.Interfaz
{
    /// <summary>
    /// Llaves de API de las integraciones entrantes. Viven en la MAESTRA porque
    /// la llave es la que dice a qué tenant pertenece la petición: consultarlas
    /// en la base del tenant exigiría saber el tenant de antemano, que es
    /// justamente lo que se está resolviendo.
    /// </summary>
    public interface IDbApiKeyRepository
    {
        /// <summary>
        /// Resuelve una llave presentada por un sistema externo, buscando por su
        /// huella. Contempla la llave anterior mientras dure su periodo de
        /// gracia. null = no existe, está revocada o la gracia venció.
        /// </summary>
        Task<DtoApiKeyResuelta?> ResolverAsync(string huella, CancellationToken ct);

        /// <summary>Marca el uso (fecha, IP y contador). No debe tumbar la petición si falla.</summary>
        Task RegistrarUsoAsync(long id, string? ip, CancellationToken ct);

        Task<List<DtoApiKey>> ListarAsync(string codDane, CancellationToken ct);
        Task<DtoApiKey?>      ObtenerAsync(long id, string codDane, CancellationToken ct);

        /// <summary>La clave cifrada, para el botón «Ver». El descifrado es cosa de la capa de negocio.</summary>
        Task<string?> ObtenerClaveCifradaAsync(long id, string codDane, CancellationToken ct);

        Task<DtoApiKeyResult> CrearAsync(DtoApiKeyPersistencia llave, CancellationToken ct);

        /// <summary>
        /// Sustituye la llave y deja la anterior viva hasta `anteriorExpira`.
        /// Sin esa ventana, rotar deja al proveedor externo fuera en el acto.
        /// </summary>
        Task<DtoApiKeyResult> RegenerarAsync(
            long id, string codDane, string prefijo, string huella, string claveCifrada,
            DateTime anteriorExpira, string? usuario, CancellationToken ct);

        Task<DtoApiKeyResult> CambiarEstadoAsync(long id, string codDane, bool activa, string? usuario, CancellationToken ct);
        Task<DtoApiKeyResult> ActualizarAsync(long id, string codDane, DtoApiKeyRequest request, string? usuario, CancellationToken ct);

        Task AuditarAsync(long apiKeyId, string codDane, string accion, string? usuario, string? ip, string? detalle, CancellationToken ct);
        Task<List<DtoApiKeyAuditoria>> ListarAuditoriaAsync(string codDane, int limite, CancellationToken ct);
    }
}
