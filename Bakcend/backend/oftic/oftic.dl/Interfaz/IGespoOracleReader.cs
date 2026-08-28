using Comun.Dtos.Turnos;

namespace Datos.Interfaz
{
    /// <summary>
    /// Lee la georreferenciación GPS actual de las patrullas directamente desde
    /// Oracle (vista GESPO VW_CONSULTA_ACTUAL_GPS), sin pasar por Postgres/FDW.
    /// </summary>
    public interface IGespoOracleReader
    {
        /// <summary>
        /// Devuelve un item por cuadrante/patrulla (el fix más reciente entre todos
        /// los policiales de ese cuadrante) filtrado a la lista explícita de
        /// <paramref name="cuadranteIds"/> (=patrulla_codigo) que el llamador ya
        /// resolvió en Postgres para el canal/unidad en cuestión — nunca se trae
        /// GPS de patrullas fuera de ese conjunto, así un tenant/canal nunca recibe
        /// posiciones de otras unidades o de toda la fuerza. Lista vacía si la
        /// lectura está deshabilitada o sin configurar (GespoOracle:Enabled = false
        /// o sin ConnectionString), o si <paramref name="cuadranteIds"/> viene
        /// vacío. Si la consulta a Oracle falla, la excepción se propaga — el
        /// llamador (DbTurnoRepository.P_SincronizarGpsBajoDemandaAsync) la captura
        /// y loguea.
        /// </summary>
        Task<List<DtoGespoUbicacion>> LeerUbicacionesActualesAsync(
            IReadOnlyCollection<string> cuadranteIds, CancellationToken ct);
    }
}
