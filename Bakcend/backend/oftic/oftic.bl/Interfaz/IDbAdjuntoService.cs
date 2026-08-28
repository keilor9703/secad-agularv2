using Comun.Dtos.Recepcion;

namespace Negocio.Interfaz
{
    public interface IDbAdjuntoService
    {
        /// <summary>Persiste el registro del adjunto en cad_adjuntos y retorna el ID generado.</summary>
        Task<long> RegistrarAdjuntoAsync(DtoAdjunto adjunto, CancellationToken ct);

        /// <summary>Lista adjuntos de un pedido. No filtra por sitio_graba — el ID Snowflake es único.</summary>
        Task<List<DtoAdjunto>> GetAdjuntosAsync(long pedidoId, CancellationToken ct);

        /// <summary>
        /// Elimina el registro de la BD y retorna la ruta relativa del archivo para
        /// que el controlador lo borre del disco.
        /// Retorna found=false si el adjunto no existía.
        /// </summary>
        Task<(bool found, string? rutaRelativa)> EliminarRegistroAsync(long adjuntoId, CancellationToken ct);
    }
}
