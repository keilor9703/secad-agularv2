using Comun.Dtos.Camaras;

namespace Negocio.Interfaz
{
    /// <summary>Lo que el CAD hace con sus cámaras: sincronizar, emparejar, buscar y ver.</summary>
    public interface IDbCamaraService
    {
        Task<DtoSyncResult> SincronizarAsync(long integracionId, string usuario, CancellationToken ct);
        Task<List<DtoEmparejamientoCamara>> ProponerEmparejamientosAsync(long integracionId, CancellationToken ct);
        Task<(bool Ok, string Mensaje)> EmparejarAsync(long censoId, long vmsId, string usuario, CancellationToken ct);
        Task<(bool Ok, string Mensaje)> DesemparejarAsync(long censoId, CancellationToken ct);

        Task<List<DtoCamara>> CercanasAsync(
            int sitioGraba, double lat, double lng, int radioMetros, int limite, CancellationToken ct);

        /// <summary>
        /// URL para ver una cámara. Comprueba que exista en este CAD, se la
        /// pide al VMS y registra la consulta —concedida o negada— porque el
        /// acceso a video es un dato sensible.
        /// </summary>
        Task<(bool Ok, string Mensaje, DtoStreamCamara? Datos)> ObtenerStreamAsync(
            string camaraCodigo, int sitioGraba, long? pedidoId, long? eventoId,
            string usuario, string? ip, CancellationToken ct);
    }
}
