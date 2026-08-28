using Comun.Dtos.Eventos;
using Comun.Dtos.Recepcion;

namespace Negocio.Interfaz
{
    public interface IDbRecepcionService
    {
        Task<DtoLlamadaEntrante?> F_GetLlamadasAsync(int sitioGraba, int acd, CancellationToken ct);
        Task<DtoPlantaTelEntradaResult> P_RegistrarLlamadaPlantaTelAsync(
            int sitioGraba, int acd, long numeTelefono, CancellationToken ct);
        Task<long>  F_ConsultarSeqPedidoAsync(CancellationToken ct);
        Task<List<DtoCasoItem>> F_GetCasosIntelAsync(string busqueda, CancellationToken ct);
        Task<DtoCasoItem?> F_GetCasoPorCodigoAsync(string codigo, CancellationToken ct);
        Task<List<DtoCanalRecepcion>> F_GetCanalesAsync(int sitioGraba, CancellationToken ct);
        Task<List<DtoReferenciaSecad>> F_GetReferenciasAsync(string nombre, CancellationToken ct);
        Task<List<DtoLlamadaAsociar>> F_BuscarLlamadasAsociarAsync(
            int sitioGraba, string horaCaso, long numeLlamada, CancellationToken ct);

        Task<DtoRecepcionResult> P_GuardarLlamadaAsync(
            DtoRecepcion datos, int canalFuerza, string usuario, long idEmpleado, CancellationToken ct);
        Task<DtoRecepcionResult> P_CerrarLlamadaRapidaAsync(
            DtoRecepcion datos, string usuario, CancellationToken ct);

        Task<DtoEvento?> G_GetEventoAsync(long eventoId, CancellationToken ct);
        Task<List<DtoEventoListItem>> G_GetEventosPorPedidoAsync(long pedidoId, CancellationToken ct);
        Task<DtoEventoResult> P_ActualizarEstadoEventoAsync(
            long eventoId, string estado, string usuario, CancellationToken ct);
        Task<DtoEventoResult> P_CerrarEventoAsync(
            DtoCierreEventoRequest request, string usuario, long usuarioId, string maquina, CancellationToken ct);
        Task<DtoEventoResult> P_CrearEventoIntegracionAsync(
            DtoEventoIntegracionRequest request, string usuario, CancellationToken ct);

        // ── Remisión a canal SECAD ──────────────────────────────────────────────
        Task<(bool success, string message, int canalesAgregados)> RemitirCanalAsync(
            DtoRemitirCanalRequest req, string usuario, CancellationToken ct);

        // ── Duplicate detection ─────────────────────────────────────────────────
        Task<List<DtoPedidoCercano>> G_GetPedidosCercanosAsync(
            double lat, double lng, int radioMetros, int minutosAtras,
            string? codCaso, CancellationToken ct);
    }
}
