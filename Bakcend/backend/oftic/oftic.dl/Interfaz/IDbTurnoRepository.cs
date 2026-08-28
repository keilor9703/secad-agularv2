using Comun.Dtos.Turnos;

namespace Datos.Interfaz
{
    public interface IDbTurnoRepository
    {
        // ── Consultas de turnos ─────────────────────────────────────────────────

        /// <summary>Lista de turnos para una fecha y fuerza.</summary>
        Task<List<DtoTurnoListItem>> G_GetTurnosAsync(
            int fuerzaId, string fechaTurno, int sitioGraba, CancellationToken ct);

        /// <summary>Detalle de un turno con sus unidades.</summary>
        Task<DtoTurno?> G_GetTurnoPorIdAsync(long turnoId, CancellationToken ct);

        /// <summary>Unidades registradas en un turno.</summary>
        Task<List<DtoTurnoUnidad>> G_GetUnidadesTurnoAsync(long turnoId, CancellationToken ct);

        /// <summary>Medios disponibles de una unidad en un turno.</summary>
        Task<List<DtoMedioDisponible>> G_GetMediosTurnoAsync(
            long turnoId, long? turnoUnidadId, CancellationToken ct);

        // ── Panel de despacho (Módulo de Eventos) ───────────────────────────────

        /// <summary>
        /// Recursos activos en turno para un canal de radio.
        /// Solo devuelve turnos vigentes (hora_inicia ≤ NOW ≤ hora_termina).
        /// Incluye posición GPS y personal.
        /// canalFuerzaId es obligatorio para el filtrado: cad_canales.codigo NO es
        /// único por sí solo (cada fuerza numera sus canales desde 1), así que
        /// filtrar solo por canalCodigo devuelve patrullas, GPS y personal de
        /// CUALQUIER fuerza que tenga un canal con ese mismo número.
        /// </summary>
        Task<List<DtoMedioDisponible>> G_GetMediosActivosPorCanalAsync(
            int canalCodigo, int canalFuerzaId, int sitioGraba, CancellationToken ct);

        /// <summary>Versión compacta para polling rápido desde el frontend.</summary>
        Task<List<DtoMedioDisponibleResumen>> G_GetResumenMediosCanalAsync(
            int canalCodigo, int canalFuerzaId, int sitioGraba, CancellationToken ct);

        // ── Creación / edición de turnos ────────────────────────────────────────

        /// <summary>
        /// Crea un nuevo turno. Valida duración (6-9h), no solapamiento
        /// y unicidad por clase_turno + día + fuerza.
        /// </summary>
        Task<DtoTurnoResult> P_CrearTurnoAsync(
            DtoCrearTurnoRequest req, string usuario, CancellationToken ct);

        /// <summary>
        /// Copia un turno existente a una nueva franja horaria,
        /// duplicando todas sus unidades y medios.
        /// fuerzaId (0 = sin verificar) debe coincidir con la fuerza del turno origen.
        /// </summary>
        Task<DtoTurnoResult> P_CopiarTurnoAsync(
            DtoCopiarTurnoRequest req, int fuerzaId, string usuario, CancellationToken ct);

        // ── Unidades ────────────────────────────────────────────────────────────

        Task<DtoTurnoResult> P_AgregarUnidadAsync(
            DtoAgregarUnidadRequest req, int fuerzaId, string usuario, CancellationToken ct);

        // ── Medios disponibles ──────────────────────────────────────────────────

        Task<DtoTurnoResult> P_AgregarMedioAsync(
            DtoAgregarMedioRequest req, int fuerzaId, string usuario, CancellationToken ct);

        /// <summary>
        /// Actualiza los datos editables de un medio existente (código, descripción, tipo,
        /// canal y personal). Reemplaza completamente la lista de personal anterior.
        /// No modifica turnoId, unidadId, fuerza ni estado operativo.
        /// </summary>
        Task<DtoTurnoResult> P_ActualizarMedioAsync(
            long medioId, DtoActualizarMedioRequest req, int fuerzaId, string usuario, CancellationToken ct);

        /// <summary>
        /// Consulta las unidades con minuta activa en GESPO para el turno indicado.
        /// Lee VM_MINUTAS_ACTIVAS directo en Oracle vía IGespoMinutaReader (sin FDW).
        /// Los parámetros de filtro (sigla física, clase turno, fecha) se derivan del propio turno.
        /// </summary>
        Task<List<DtoUnidadSivicc>> G_GetUnidadesSiviccAsync(
            long turnoId, CancellationToken ct);

        /// <summary>
        /// Importa medios y personal de las unidades seleccionadas desde SIVICC.
        /// Las unidades vienen del resultado de G_GetUnidadesSiviccAsync; el usuario
        /// nunca introduce MinutaId ni Consecutivo manualmente.
        /// </summary>
        Task<DtoTurnoResult> P_ImportarDesdeSiviccAsync(
            DtoImportarSiviccRequest req, int fuerzaId, string usuario, CancellationToken ct);

        // ── Estado de medios (tiempo real) ──────────────────────────────────────

        /// <summary>
        /// Cambia el estado de un medio (libre ↔ en ruta ↔ ocupado ↔ fuera)
        /// y escribe el log de cambio.
        /// </summary>
        Task<DtoTurnoResult> P_CambiarEstadoMedioAsync(
            long medioId, DtoCambiarEstadoMedioRequest req, int fuerzaId, string usuario, CancellationToken ct);

        /// <summary>
        /// Actualiza las posiciones GPS de múltiples medios en lote — un solo UPDATE
        /// con unnest() del arreglo recibido. Llamado tanto por el endpoint de push
        /// (POST api/Turnos/gespo/ubicaciones, sin contexto de canal — pasa
        /// canalCodigo=0/canalFuerzaId=0 para no restringir) como por
        /// P_SincronizarGpsBajoDemandaAsync (pull directo a Oracle vía
        /// IGespoOracleReader, sin FDW/Postgres de por medio), que sí conoce el
        /// canal/fuerza y lo usa para no escribir en medios de otro canal que
        /// coincidan por patrulla_codigo.
        /// </summary>
        Task<int> P_ActualizarUbicacionesGespoAsync(
            IEnumerable<DtoGespoUbicacion> ubicaciones,
            int canalCodigo, int canalFuerzaId,
            CancellationToken ct);

        /// <summary>
        /// Sincroniza el GPS de las patrullas activas del canal/fuerza indicados
        /// bajo demanda — pull directo a Oracle GESPO, sin ningún BackgroundService
        /// de fondo. Pensado para llamarse desde el tick de polling que ya existe
        /// en Eventos mientras el operador tiene un canal seleccionado; nunca corre
        /// si no hay canal abierto. Turnos NO llama a este método — ese módulo no
        /// hace georreferenciación. Devuelve 0 (sin error) si canalCodigo es
        /// inválido, si el canal no tiene medios activos en turno en este momento,
        /// si otra sincronización de este mismo canal corrió hace muy poco (ver
        /// GespoSyncCooldown), o si Oracle falla — la consulta a Oracle nunca
        /// propaga la excepción, solo loguea un warning.
        /// </summary>
        Task<int> P_SincronizarGpsBajoDemandaAsync(int canalCodigo, int canalFuerzaId, CancellationToken ct);

        /// <summary>
        /// Sugiere los medios Libres más cercanos a un punto (lat, lng) dentro de un
        /// canal de despacho activo, calculando la distancia Haversine en SQL plano
        /// sobre latitud/longitud (sin PostGIS — ver V40__postgis_medios_geo.sql).
        /// Mismo alcance (canal + fuerza + sitio + turno activo) que
        /// G_GetMediosActivosPorCanalAsync, para que el panel de despacho de Eventos
        /// (que solo conoce el canal, no el turnoId) pueda consumirlo directamente.
        /// Solo sugerencia: el llamador decide si asigna, nunca es automático.
        /// prioridadAlta (incidentes de prioridad 01/02) le da preferencia suave a
        /// unidades de más capacidad (patrulla/ambulancia) sobre motos/bicicletas
        /// cuando están razonablemente cerca — ver comentario en la implementación.
        /// </summary>
        Task<List<DtoRecursoCercano>> G_GetRecursoMasCercanoAsync(
            int canalCodigo, int canalFuerzaId, int sitioGraba,
            double lat, double lng, int top, bool prioridadAlta, CancellationToken ct);
    }
}
