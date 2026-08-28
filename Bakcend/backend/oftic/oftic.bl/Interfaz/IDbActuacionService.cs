using Comun.Dtos.Actuaciones;
using Comun.Dtos.Agencias;

namespace Negocio.Interfaz
{
    public interface IDbActuacionService
    {
        // ── Retroalimentación externa (via PIP) ────────────────────────────────

        /// <summary>Guarda el registro inicial de auditoría antes de procesar.</summary>
        Task SaveAuditoriaActualizacionAsync(
            DtoAuditoriaActualizacionExterna dto, CancellationToken ct);

        /// <summary>Marca la auditoría como procesada correctamente.</summary>
        Task UpdateAuditoriaActualizacionOkAsync(
            long auditoriaId, long actuacionId, string estado, CancellationToken ct);

        /// <summary>Marca la auditoría como error.</summary>
        Task UpdateAuditoriaActualizacionErrorAsync(
            long auditoriaId, string error, CancellationToken ct);

        /// <summary>
        /// Aplica la actualización de estado enviada por una agencia externa via PIP:
        /// localiza la actuación, actualiza estado/timestamps/cierre, agrega nota
        /// y recalcula el estado global del evento.
        /// </summary>
        Task<DtoActualizacionExternaResult> P_ActualizarDesdeExternoAsync(
            long casoId,
            DtoActualizacionExternaRequest req,
            long auditoriaId,
            string ipOrigen,
            CancellationToken ct);
        Task<List<DtoActuacionListItem>> G_GetActuacionesEventoAsync(
            long eventoId, CancellationToken ct);

        Task<DtoActuacion?> G_GetActuacionAsync(
            long actuacionId, CancellationToken ct);

        Task<DtoActuacionResult> P_CrearActuacionAsync(
            DtoCrearActuacionRequest req,
            string usuario,
            CancellationToken ct);

        Task<DtoActuacionResult> P_ActualizarEstadoActuacionAsync(
            long actuacionId,
            DtoActualizarEstadoActuacionRequest req,
            int canalCodigo, int fuerzaId,
            string usuario,
            CancellationToken ct);

        Task<DtoActuacionResult> P_CerrarActuacionAsync(
            DtoCierreActuacionRequest req,
            int canalCodigo, int fuerzaId,
            string usuario,
            CancellationToken ct);

        Task<DtoActuacionResult> P_AgregarNotaActuacionAsync(
            long actuacionId,
            DtoAgregarNotaActuacionRequest req,
            int canalCodigo, int fuerzaId,
            string usuario,
            CancellationToken ct);

        Task<DtoActuacionResult> P_AgregarUnidadActuacionAsync(
            long actuacionId,
            DtoAgregarUnidadActuacionRequest req,
            int canalCodigo, int fuerzaId,
            string usuario,
            CancellationToken ct);

        /// <summary>
        /// Desasigna/cancela un recurso de una actuación en P, D o A.
        /// En D/A el motivo es obligatorio (lo valida el repositorio).
        /// </summary>
        Task<DtoActuacionResult> P_DesasignarActuacionAsync(
            long actuacionId,
            string? motivo,
            int canalCodigo, int fuerzaId,
            string usuario,
            CancellationToken ct);

        Task<DtoActuacionResult> P_SolicitarApoyoActuacionAsync(
            long actuacionId, int canalCodigo, int fuerzaId, string usuario, CancellationToken ct);

        Task<DtoActuacionResult> P_AtenderApoyoActuacionAsync(
            long actuacionId, int canalCodigo, int fuerzaId, string usuario, CancellationToken ct);

        /// <summary>Catálogo de actividades policiales. tipo = O/P/null (todas).</summary>
        Task<List<DtoActividadPolicial>> G_GetActividadesPolicialesAsync(
            string? tipo, CancellationToken ct);

        /// <summary>Búsqueda de delitos del Código Penal por texto libre.</summary>
        Task<List<DtoDelitoItem>> G_BuscarDelitosAsync(
            string q, int limit, CancellationToken ct);

        /// <summary>Búsqueda de códigos de tipificación/cierre (cad_casos).</summary>
        Task<List<DtoCodigoCasoItem>> G_BuscarCodigosCierreAsync(
            string q, int limit, CancellationToken ct);
    }
}
