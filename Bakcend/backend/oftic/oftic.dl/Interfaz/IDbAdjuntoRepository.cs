using Comun.Dtos.Recepcion;

namespace Datos.Interfaz
{
    public interface IDbAdjuntoRepository
    {
        /// <summary>Inserta un registro en cad_adjuntos y retorna el ID generado.</summary>
        Task<long> SaveAdjuntoAsync(DtoAdjunto adjunto, CancellationToken ct);

        /// <summary>Lista adjuntos de un pedido ordenados por fecha desc. No filtra por sitio_graba.</summary>
        Task<List<DtoAdjunto>> GetAdjuntosByPedidoAsync(long pedidoId, CancellationToken ct);

        /// <summary>Retorna la ruta relativa del adjunto para poder borrarlo del disco.</summary>
        Task<string?> GetRutaRelativaAsync(long adjuntoId, CancellationToken ct);

        /// <summary>Elimina el registro de cad_adjuntos.</summary>
        Task<bool> DeleteAdjuntoAsync(long adjuntoId, CancellationToken ct);

        /// <summary>Inserta un registro de auditoría en cad_recepciones_externas.</summary>
        Task SaveAuditoriaAsync(DtoAuditoriaRecepcionExterna auditoria, CancellationToken ct);

        /// <summary>Marca la auditoría como procesada y vincula el pedido generado.</summary>
        Task UpdateAuditoriaProcesadaAsync(long auditoriaId, long pedidoId, CancellationToken ct);

        /// <summary>Registra error en auditoría (procesado=false + mensaje).</summary>
        Task UpdateAuditoriaErrorAsync(long auditoriaId, string error, CancellationToken ct);
    }
}
