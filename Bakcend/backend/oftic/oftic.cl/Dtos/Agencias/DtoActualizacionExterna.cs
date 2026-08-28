namespace Comun.Dtos.Agencias
{
    /// <summary>
    /// Payload que envía la agencia externa (via PIP) para actualizar el estado
    /// de su intervención en un caso SECAD.
    /// PIP llama: POST /api/ActualizacionExterna/{casoId}
    /// </summary>
    public class DtoActualizacionExternaRequest
    {
        // ── Identificación de la actuación ─────────────────────────────────────
        /// <summary>
        /// ID de la actuación SECAD (incluido en el payload original del despacho,
        /// sección "actuaciones[n].id"). Preferir este campo.
        /// </summary>
        public string? ActuacionId { get; set; }

        /// <summary>
        /// ID de la fuerza/agencia (fuerzaId del payload original).
        /// Usado para localizar la actuación si no se envía ActuacionId.
        /// </summary>
        public int? FuerzaId { get; set; }

        /// <summary>
        /// Referencia del caso en el sistema de la agencia externa
        /// (útil para correlación cruzada y trazabilidad bidireccional).
        /// </summary>
        public string? ReferenciaCasoExterno { get; set; }

        /// <summary>Nombre de la agencia que envía la actualización.</summary>
        public string? AgenciaNombre { get; set; }

        // ── Estado ─────────────────────────────────────────────────────────────
        /// <summary>Nuevo estado: D=Despachada | A=Atendida (en sitio) | C=Cerrada | V=Anulada</summary>
        public string? Estado { get; set; }

        // ── Timestamps ─────────────────────────────────────────────────────────
        public DateTimeOffset? FechaDespacho { get; set; }
        public DateTimeOffset? FechaLlegada  { get; set; }
        public DateTimeOffset? FechaCierre   { get; set; }

        // ── Recurso despachado ─────────────────────────────────────────────────
        public string? Unidad { get; set; }
        public string? Placa  { get; set; }

        // ── Cierre ─────────────────────────────────────────────────────────────
        public string? CodigoCierre      { get; set; }
        public string? ClasifCierre      { get; set; }
        public string? ObservacionCierre { get; set; }

        // ── Nota libre ─────────────────────────────────────────────────────────
        /// <summary>Novedad o nota de campo que la agencia quiere registrar.</summary>
        public string? Nota { get; set; }
    }

    /// <summary>Respuesta que SECAD retorna a PIP tras procesar la actualización.</summary>
    public class DtoActualizacionExternaResult
    {
        public bool    Success     { get; set; }
        public string  Message     { get; set; } = "";
        /// <summary>ID del caso SECAD procesado.</summary>
        public string? CasoId      { get; set; }
        /// <summary>ID de la actuación actualizada.</summary>
        public string? ActuacionId { get; set; }
        /// <summary>Estado final registrado.</summary>
        public string? Estado      { get; set; }
    }

    /// <summary>DTO para registrar la auditoría de la actualización.</summary>
    public class DtoAuditoriaActualizacionExterna
    {
        public long    Id             { get; set; }
        public long    CasoId         { get; set; }
        public long?   ActuacionId    { get; set; }
        public string? AgenciaNombre  { get; set; }
        public string? EstadoReportado{ get; set; }
        public string? PayloadCrudo   { get; set; }
        public bool    Procesado      { get; set; }
        public string? IpOrigen       { get; set; }
    }
}
