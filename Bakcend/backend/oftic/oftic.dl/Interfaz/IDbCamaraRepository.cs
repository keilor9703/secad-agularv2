using Comun.Dtos.Camaras;

namespace Datos.Interfaz
{
    /// <summary>Catálogo de cámaras del CAD: censo institucional + lo que reporta el VMS.</summary>
    public interface IDbCamaraRepository
    {
        /// <summary>
        /// Guarda lo que el VMS acaba de reportar. Actualiza el estado de las
        /// que ya están emparejadas y da de alta las que no conocíamos, sin
        /// coordenadas, a la espera de emparejarlas con el censo.
        /// </summary>
        Task<DtoSyncResult> SincronizarAsync(
            long integracionId, List<DtoVmsCamara> camaras, CancellationToken ct);

        /// <summary>Emparejamientos propuestos entre las cámaras del VMS sin enlazar y las del censo.</summary>
        Task<List<DtoEmparejamientoCamara>> ProponerEmparejamientosAsync(
            long integracionId, CancellationToken ct);

        /// <summary>Confirma un emparejamiento: la fila del censo se queda con el código del VMS.</summary>
        Task<(bool Ok, string Mensaje)> EmparejarAsync(
            long censoId, long vmsId, string usuario, CancellationToken ct);

        /// <summary>Deshace un emparejamiento y devuelve la cámara del VMS a la lista de pendientes.</summary>
        Task<(bool Ok, string Mensaje)> DesemparejarAsync(long censoId, CancellationToken ct);

        /// <summary>Las cámaras más cercanas a un punto, por distancia.</summary>
        Task<List<DtoCamara>> CercanasAsync(
            int sitioGraba, double latitud, double longitud,
            int radioMetros, int limite, CancellationToken ct);

        Task<DtoCamara?> GetPorCodigoAsync(string camaraCodigo, int sitioGraba, CancellationToken ct);

        /// <summary>Deja constancia de que alguien pidió ver una cámara. También si se le negó.</summary>
        Task RegistrarVisualizacionAsync(
            DtoCamara? camara, string camaraCodigo, long? pedidoId, long? eventoId,
            int sitioGraba, string usuario, string? ip, bool concedido, string? motivo,
            CancellationToken ct);
    }
}
