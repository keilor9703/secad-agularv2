using Comun.Dtos.Incidentes;
using Ev = Comun.Dtos.Eventos;

namespace Datos.Interfaz
{
    public interface IDbPedidoRepository
    {
        Task<DtoPedidoListPagedResult> GetListAsync(
            string? estado, int? sitioGraba, DateTime? fechaDesde, DateTime? fechaHasta,
            int page, int pageSize, CancellationToken ct);
        Task<DtoPedidoDetalle?> GetByIdAsync(long id, CancellationToken ct);
        Task<DtoPedidoResult> CreateAsync(DtoPedidoRequest request, long usuarioAuditoria, string usernameAuditoria, string maquinaAuditoria, CancellationToken ct);
        Task<DtoPedidoResult> UpdateAsync(long id, DtoPedidoRequest request, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct);
        Task<DtoPedidoResult> CerrarRapidoAsync(long id, DtoCerrarRapidoRequest request, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct);

        /// <summary>
        /// Cierra la participación de un canal en un evento multi-agencia. Si el
        /// pedido solo tiene un canal asignado (caso común), equivale a un cierre
        /// global inmediato. Si tiene varios, solo cierra la fila de
        /// cad_pedidos_canales de (canalCodigo, fuerzaId); el cierre GLOBAL
        /// (cad_eventos + cad_eventos_codigos_cierre; en cad_pedidos SOLO
        /// estado='C' — NUNCA comentario ni codi_pedido) ocurre automáticamente
        /// solo cuando todos los canales asignados ya cerraron su parte y no
        /// quedan actuaciones abiertas en ninguno.
        /// </summary>
        Task<DtoPedidoResult> CerrarEventoDesdeDespachoAsync(
            long pedidoId, Ev.DtoCerrarEventoDespachoRequest request,
            int canalCodigo, int fuerzaId,
            long usuarioId, string username, string maquina, CancellationToken ct);

        Task<DtoPedidoResult> SetEstadoAsync(
            long id, string estado, long usuarioAuditoria, string usernameAuditoria,
            string maquinaAuditoria, string? motivo, CancellationToken ct);
        /// <summary>Historial de cambios de cad_pedidos.estado (cad_pedidos_estado_historial), más reciente primero.</summary>
        Task<List<DtoEstadoHistorialItem>> GetEstadoHistorialAsync(long pedidoId, CancellationToken ct);
        Task<DtoPedidoResult> VincularPedidoAsync(
            long id, int? sitioGraba, long? numeLlamada, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct);
        Task<List<DtoAnotacion>> GetAnotacionesAsync(long idPedido, CancellationToken ct);
        Task<DtoPedidoResult> CreateAnotacionAsync(long idPedido, DtoAnotacionRequest request, long usuarioAuditoria, string usernameAuditoria, string maquinaAuditoria, CancellationToken ct);
        Task<List<DtoPedidoAsociar>> BuscarParaAsociarAsync(int sitioGraba, CancellationToken ct);

        // ─── Eventos (dispatcher queue) ──────────────────────────────────────
        /// <summary>
        /// Returns incidents dispatched to a specific canal, ordered by priority
        /// then oldest-first within each priority group.
        /// </summary>
        Task<List<DtoEventoListItem>> GetEventosByCanalAsync(int canalCodigo, int fuerzaId, string? estado, CancellationToken ct);
        Task<List<DtoEventoListItem>> G_BuscarEventosAsync(string texto, int fuerzaId, int sitioGraba, CancellationToken ct);
        /// <summary>Usernames que vieron este caso en los últimos 5 minutos, excluyendo al usuario actual.</summary>
        Task<List<string>> G_GetPresenciaAsync(long pedidoId, long usuarioActual, CancellationToken ct);

        /// <summary>
        /// Returns the dispatch channels available for a given recording site.
        /// </summary>
        Task<List<DtoCanalItem>> GetCanalesPorSitioAsync(int sitioGraba, CancellationToken ct);

        /// <summary>
        /// Canales SECAD y agencias externas que tienen (o tuvieron) conocimiento
        /// de un evento — visibilidad multi-canal para cualquier funcionario.
        /// </summary>
        Task<Ev.DtoCanalesAsignadosResult> G_GetCanalesAsignadosAsync(long pedidoId, CancellationToken ct);

        // ─── Conteos para badges de filtro ───────────────────────────────────
        /// <summary>
        /// Devuelve contadores por estado para la bandeja del canal.
        /// Siempre excluye eventos cerrados del total activo;
        /// para cerrados solo cuenta los del turno vigente.
        /// </summary>
        Task<DtoEventoConteos> GetConteosByCanalAsync(int canalCodigo, int fuerzaId, CancellationToken ct);

        // ─── Auditoría de acceso ──────────────────────────────────────────────
        /// <summary>
        /// Logs a dispatcher's access to an event, marks fecha_primer_acceso on
        /// cad_pedidos if this is the first view, and promotes estado to 'E' (En
        /// proceso) if it was 'P'/'A'. Non-throwing. Returns the new estado if it
        /// was promoted, or null if unchanged.
        /// </summary>
        Task<string?> RegistrarAccesoAsync(long pedidoId, long usuarioId, string username,
                                  string ip, string accion, CancellationToken ct);

        // ─── SLA configuration ────────────────────────────────────────────────
        /// <summary>Returns active SLA thresholds from cad_config_sla.</summary>
        Task<List<DtoSlaConfig>> GetSlaConfigAsync(CancellationToken ct);
    }
}
