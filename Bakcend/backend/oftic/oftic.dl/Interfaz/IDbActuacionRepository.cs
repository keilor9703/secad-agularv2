using Comun.Dtos.Actuaciones;
using Comun.Dtos.Agencias;

namespace Datos.Interfaz
{
    public interface IDbActuacionRepository
    {
        // ── Retroalimentación desde agencias externas (via PIP) ─────────────────

        /// <summary>
        /// Registra la auditoría de una actualización entrante desde PIP y
        /// aplica el cambio de estado a la actuación correspondiente.
        /// Equivalente a SaveAuditoriaAsync + UpdateAuditoria* en RecepcionExterna.
        /// </summary>
        Task<DtoActualizacionExternaResult> P_ActualizarDesdeExternoAsync(
            long casoId,
            DtoActualizacionExternaRequest req,
            long auditoriaId,
            string ipOrigen,
            CancellationToken ct);

        /// <summary>Guarda el registro de auditoría antes de procesar.</summary>
        Task SaveAuditoriaActualizacionAsync(
            DtoAuditoriaActualizacionExterna dto, CancellationToken ct);

        /// <summary>Marca la auditoría como procesada con la actuacionId resuelta.</summary>
        Task UpdateAuditoriaActualizacionOkAsync(
            long auditoriaId, long actuacionId, string estado, CancellationToken ct);

        /// <summary>Marca la auditoría como error.</summary>
        Task UpdateAuditoriaActualizacionErrorAsync(
            long auditoriaId, string error, CancellationToken ct);
        // ── Consultas ───────────────────────────────────────────────────────────

        /// <summary>
        /// Lista resumida de todas las actuaciones de un evento, una por agencia/canal.
        /// </summary>
        Task<List<DtoActuacionListItem>> G_GetActuacionesEventoAsync(
            long eventoId, CancellationToken ct);

        /// <summary>
        /// Detalle completo de una actuación: datos base + códigos de cierre
        /// + unidades despachadas + notas de campo.
        /// </summary>
        Task<DtoActuacion?> G_GetActuacionAsync(long actuacionId, CancellationToken ct);

        // ── Ciclo operativo ─────────────────────────────────────────────────────

        /// <summary>
        /// Crea una nueva actuación en estado P (Pendiente/Asignado).
        /// Vincula el medio al evento si se proporciona MedioId.
        /// Este es el primer paso del flujo de despacho:
        ///   Asignar (P) → En ruta (D) → En sitio (A) → Atendió (C).
        /// </summary>
        Task<DtoActuacionResult> P_CrearActuacionAsync(
            DtoCrearActuacionRequest req,
            string usuario,
            CancellationToken ct);

        /// <summary>
        /// Avanza la actuación al estado D (Despachada) o A (Atendida).
        /// Registra el timestamp correspondiente y, opcionalmente,
        /// actualiza la unidad/placa asignada.
        /// También actualiza el estado operativo del medio vinculado:
        ///   D → medio 30 (En ruta) | A → medio 28 (En sitio/Ocupado).
        /// canalCodigo/fuerzaId identifican la sesión que gestiona: si la actuación
        /// fue asignada por OTRO canal (evento multi-canal), se rechaza — cada canal
        /// solo gestiona los recursos que él mismo despachó.
        /// </summary>
        Task<DtoActuacionResult> P_ActualizarEstadoActuacionAsync(
            long actuacionId,
            DtoActualizarEstadoActuacionRequest req,
            int canalCodigo, int fuerzaId,
            string usuario,
            CancellationToken ct);

        /// <summary>
        /// Cierra la actuación (estado C o V) con sus códigos de cierre.
        /// Inserta los códigos en cad_actuaciones_codigos y llama a
        /// fn_recalcular_estado_evento para actualizar el estado global del evento.
        /// Todo en una sola transacción. Rechaza si canalCodigo/fuerzaId no coincide
        /// con el canal que asignó la actuación (ver P_ActualizarEstadoActuacionAsync).
        /// </summary>
        Task<DtoActuacionResult> P_CerrarActuacionAsync(
            DtoCierreActuacionRequest req,
            int canalCodigo, int fuerzaId,
            string usuario,
            CancellationToken ct);

        // ── Sub-registros ───────────────────────────────────────────────────────

        /// <summary>
        /// Agrega una nota de campo a la actuación (novedad, alerta, cierre, etc.).
        /// Rechaza si canalCodigo/fuerzaId no coincide con el canal que asignó la
        /// actuación (ver P_ActualizarEstadoActuacionAsync).
        /// </summary>
        Task<DtoActuacionResult> P_AgregarNotaActuacionAsync(
            long actuacionId,
            DtoAgregarNotaActuacionRequest req,
            int canalCodigo, int fuerzaId,
            string usuario,
            CancellationToken ct);

        /// <summary>
        /// Registra una unidad adicional despachada dentro de la misma actuación.
        /// Usar cuando la agencia envía más de un recurso al incidente. Rechaza si
        /// canalCodigo/fuerzaId no coincide con el canal que asignó la actuación
        /// (ver P_ActualizarEstadoActuacionAsync).
        /// </summary>
        Task<DtoActuacionResult> P_AgregarUnidadActuacionAsync(
            long actuacionId,
            DtoAgregarUnidadActuacionRequest req,
            int canalCodigo, int fuerzaId,
            string usuario,
            CancellationToken ct);

        /// <summary>
        /// Desasigna/cancela un recurso de una actuación en estado P, D o A.
        /// Pasa la actuación a estado V (Anulada), libera el medio (estado=27, evento_id=NULL)
        /// y recalcula el estado global del evento.
        /// En P el motivo es opcional (se usa un texto por defecto); en D/A
        /// (ya en ruta o en sitio) el motivo es OBLIGATORIO — se rechaza si viene
        /// vacío. Rechaza también si canalCodigo/fuerzaId no coincide con el canal
        /// que asignó la actuación (ver P_ActualizarEstadoActuacionAsync).
        /// </summary>
        Task<DtoActuacionResult> P_DesasignarActuacionAsync(
            long actuacionId,
            string? motivo,
            int canalCodigo, int fuerzaId,
            string usuario,
            CancellationToken ct);

        /// <summary>Marca una solicitud de apoyo urgente activa sobre la actuación (seguridad del funcionario).</summary>
        Task<DtoActuacionResult> P_SolicitarApoyoActuacionAsync(
            long actuacionId, int canalCodigo, int fuerzaId, string usuario, CancellationToken ct);

        /// <summary>Marca como atendida una solicitud de apoyo urgente activa.</summary>
        Task<DtoActuacionResult> P_AtenderApoyoActuacionAsync(
            long actuacionId, int canalCodigo, int fuerzaId, string usuario, CancellationToken ct);

        // ── Catálogos ───────────────────────────────────────────────────────────

        /// <summary>
        /// Retorna el catálogo de actividades policiales (cad_act_policial).
        /// tipo = "O" para Operativas, "P" para Preventivas, null para todas.
        /// </summary>
        Task<List<DtoActividadPolicial>> G_GetActividadesPolicialesAsync(
            string? tipo, CancellationToken ct);

        /// <summary>
        /// Búsqueda full-text de delitos del Código Penal (cad_delitos).
        /// Filtra por descripción, artículo o bien jurídico.
        /// </summary>
        Task<List<DtoDelitoItem>> G_BuscarDelitosAsync(
            string q, int limit, CancellationToken ct);

        /// <summary>
        /// Búsqueda de códigos de tipificación/cierre en cad_casos.
        /// Misma tabla que usa el módulo de Recepción.
        /// </summary>
        Task<List<DtoCodigoCasoItem>> G_BuscarCodigosCierreAsync(
            string q, int limit, CancellationToken ct);
    }
}
