using Comun.Dtos.Incidentes;
using Ev = Comun.Dtos.Eventos;

namespace Negocio.Interfaz
{
    public interface IDbPedidoService
    {
        Task<DtoPedidoListPagedResult> GetListAsync(
            string? estado, int? sitioGraba, DateTime? fechaDesde, DateTime? fechaHasta,
            int page, int pageSize, CancellationToken ct);
        Task<DtoPedidoDetalle?> GetByIdAsync(long id, CancellationToken ct);
        Task<DtoPedidoResult> CreateAsync(DtoPedidoRequest request, long usuarioAuditoria, string usernameAuditoria, string maquinaAuditoria, CancellationToken ct);
        Task<DtoPedidoResult> UpdateAsync(long id, DtoPedidoRequest request, long usuarioAuditoria, string usernameAuditoria, string maquinaAuditoria, CancellationToken ct);
        Task<DtoPedidoResult> CerrarRapidoAsync(long id, DtoCerrarRapidoRequest request, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct);

        /// <summary>
        /// Cierra la participación de UN canal en un evento desde el módulo
        /// Despachador. Si el pedido está asignado a varios canales (multi-agencia),
        /// solo cierra la fila de cad_pedidos_canales de este canal — el cierre
        /// GLOBAL (cad_eventos/cad_pedidos) solo ocurre cuando todos los canales
        /// asignados ya cerraron su parte y no quedan actuaciones abiertas en
        /// ninguno. Persiste datos en cad_eventos; NUNCA modifica cad_pedidos.comentario.
        /// </summary>
        Task<DtoPedidoResult> CerrarEventoDesdeDespachoAsync(
            long pedidoId, Ev.DtoCerrarEventoDespachoRequest request,
            int canalCodigo, int fuerzaId,
            long usuarioId, string username, string maquina, CancellationToken ct);

        Task<DtoPedidoResult> SetEstadoAsync(
            long id, string estado, long usuarioAuditoria, string usernameAuditoria,
            string maquinaAuditoria, string? motivo, CancellationToken ct);
        Task<List<DtoEstadoHistorialItem>> GetEstadoHistorialAsync(long pedidoId, CancellationToken ct);
        /// <summary>Vincula (sitioGraba+numeLlamada no nulos) o desvincula (ambos null) este pedido de un caso padre.</summary>
        Task<DtoPedidoResult> VincularPedidoAsync(
            long id, int? sitioGraba, long? numeLlamada, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct);
        Task<List<DtoAnotacion>> GetAnotacionesAsync(long idPedido, CancellationToken ct);
        Task<DtoPedidoResult> CreateAnotacionAsync(long idPedido, DtoAnotacionRequest request, long usuarioAuditoria, string usernameAuditoria, string maquinaAuditoria, CancellationToken ct);
        Task<List<DtoPedidoAsociar>> BuscarParaAsociarAsync(int sitioGraba, CancellationToken ct);

        // ─── Eventos (dispatcher queue) ──────────────────────────────────────
        Task<List<DtoEventoListItem>> GetEventosByCanalAsync(int canalCodigo, int fuerzaId, string? estado, CancellationToken ct);
        Task<List<DtoEventoListItem>> G_BuscarEventosAsync(string texto, int fuerzaId, int sitioGraba, CancellationToken ct);
        Task<List<string>> G_GetPresenciaAsync(long pedidoId, long usuarioActual, CancellationToken ct);
        Task<List<DtoCanalItem>> GetCanalesPorSitioAsync(int sitioGraba, CancellationToken ct);
        Task<Ev.DtoCanalesAsignadosResult> G_GetCanalesAsignadosAsync(long pedidoId, CancellationToken ct);

        // ─── Conteos y turno ──────────────────────────────────────────────────
        Task<DtoEventoConteos> GetConteosByCanalAsync(int canalCodigo, int fuerzaId, CancellationToken ct);

        // ─── Auditoría y SLA ──────────────────────────────────────────────────
        Task<string?> RegistrarAccesoAsync(long pedidoId, long usuarioId, string username,
                                  string ip, string accion, CancellationToken ct);
        Task<List<DtoSlaConfig>> GetSlaConfigAsync(CancellationToken ct);
    }
}
