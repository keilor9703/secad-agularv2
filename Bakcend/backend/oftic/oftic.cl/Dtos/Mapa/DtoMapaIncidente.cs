namespace Comun.Dtos.Mapa
{
    /// <summary>
    /// DTO liviano para el módulo GIS 2D (Mapa de Incidentes).
    /// Contiene solo los campos necesarios para pintar marcadores en el mapa
    /// y mostrar un popover con información básica del incidente.
    /// </summary>
    public class DtoMapaIncidente
    {
        /// <summary>Snowflake ID de cad_pedidos (serializado como string).</summary>
        public string Id { get; set; } = "";

        /// <summary>Sitio de grabación (CAD origen).</summary>
        public int SitioGraba { get; set; }

        /// <summary>Código de caso primario (ej. "010301").</summary>
        public string CodiPedido { get; set; } = "";

        /// <summary>Descripción del caso primario (JOIN cad_casos).</summary>
        public string DescPedido { get; set; } = "";

        /// <summary>Código de caso secundario (puede ser vacío).</summary>
        public string CodiPedido2 { get; set; } = "";

        /// <summary>Descripción del caso secundario.</summary>
        public string DescPedido2 { get; set; } = "";

        /// <summary>Dirección del incidente.</summary>
        public string DireCaso { get; set; } = "";

        /// <summary>Barrio del incidente.</summary>
        public string Barrio { get; set; } = "";

        /// <summary>Ciudad/municipio del incidente.</summary>
        public string Ciudad { get; set; } = "";

        /// <summary>Latitud en WGS84 (string para preservar el formato original).</summary>
        public string LatitudCaso { get; set; } = "";

        /// <summary>Longitud en WGS84 (string para preservar el formato original).</summary>
        public string LongitudCaso { get; set; } = "";

        /// <summary>
        /// Estado del pedido: A=Activo, P=Pendiente, E=En proceso,
        /// T=Seguimiento, R=Revisión.
        /// </summary>
        public string Estado { get; set; } = "";

        /// <summary>Prioridad: FLASH | INMEDIATA | RUTINA (o código 01/02/03).</summary>
        public string Prioridad { get; set; } = "";

        /// <summary>Hora de creación del incidente formateada DD/MM/YYYY HH24:MI.</summary>
        public string HoraCaso { get; set; } = "";

        /// <summary>Nombre de usuario del operador que creó el incidente.</summary>
        public string UsernameCreacion { get; set; } = "";

        /// <summary>Canal de origen: PLANTATEL, RECEPCION, APP_MOVIL, INTEGRACION, INTERNO, MANUAL.</summary>
        public string Origen { get; set; } = "";

        /// <summary>Número de actuaciones activas (patrullas despachadas).</summary>
        public int TotalActuaciones { get; set; }

        /// <summary>Código DANE del municipio para centrar el mapa.</summary>
        public string CodDane { get; set; } = "";

        // ── Identificadores para trazabilidad ─────────────────────────────────

        /// <summary>
        /// Número de llamada PlantaTel (cad_pedidos.nume_llamada).
        /// Puede ser NULL si el pedido se creó sin llamada PlantaTel activa.
        /// </summary>
        public long? NumeLlamada { get; set; }

        /// <summary>
        /// Snowflake ID del evento de despacho asociado (cad_eventos.id).
        /// NULL si el pedido aún no tiene evento de despacho.
        /// </summary>
        public string? NumeEvento { get; set; }

        // ── Canal de atención ─────────────────────────────────────────────────

        /// <summary>Código numérico del canal de atención (cad_canales.codigo).</summary>
        public int CanalCodigo { get; set; }

        /// <summary>Descripción del canal de atención (cad_canales.descripcion).</summary>
        public string CanalDescripcion { get; set; } = "";

        /// <summary>ID de la fuerza asociada al canal (cad_canales.cadfuerz_id).</summary>
        public int FuerzaId { get; set; }
    }
}
