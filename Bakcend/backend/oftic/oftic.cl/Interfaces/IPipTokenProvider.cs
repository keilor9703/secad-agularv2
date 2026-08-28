namespace Comun.Interfaces
{
    /// <summary>
    /// Abstracción mínima para obtener el token técnico institucional de PIP
    /// desde la capa de datos, sin crear una dependencia circular hacia Servicios.
    /// Implementada por TokenProvider en oftic.sl.
    /// </summary>
    public interface IPipTokenProvider
    {
        /// <summary>
        /// Retorna el token técnico PIP (del caché si está vigente, o lo solicita).
        /// Retorna string.Empty si no se puede obtener.
        /// </summary>
        Task<string> GetPipTokenAsync(CancellationToken ct = default);
    }
}
