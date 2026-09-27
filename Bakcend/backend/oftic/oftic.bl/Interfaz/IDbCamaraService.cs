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

        /// <summary>
        /// Mueve una cámara PTZ un paso acotado. Pasa por los mismos controles
        /// que el video —la cámara tiene que ser de este CAD y estar operativa—
        /// y además exige que el inventario la declare PTZ y que el driver
        /// sepa moverla. Cada movimiento queda auditado con su comando.
        /// </summary>
        /// <summary>
        /// Responde a la pregunta que hace el gateway de medios del nodo edge
        /// antes de dejar ver una cámara: ¿este usuario puede leer esta cámara?
        ///
        /// Aplica las MISMAS reglas que la entrega de la URL —la cámara tiene que
        /// ser de este CAD y estar operativa— y deja la lectura auditada. Sin
        /// esto, cualquiera que alcanzara el puerto del gateway vería cualquier
        /// cámara registrada, saltándose el control de acceso entero.
        /// </summary>
        Task<bool> AutorizarLecturaGatewayAsync(
            string camaraCodigo, int sitioGraba, string usuario, string? ip, CancellationToken ct);

        Task<(bool Ok, string Mensaje, DtoPtzResultado? Datos)> ControlarPtzAsync(
            string camaraCodigo, int sitioGraba, DtoPtzPeticion peticion,
            string usuario, string? ip, CancellationToken ct);
    }
}
