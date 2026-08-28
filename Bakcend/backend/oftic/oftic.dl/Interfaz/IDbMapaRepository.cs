using Comun.Dtos.Mapa;

namespace Datos.Interfaz
{
    /// <summary>
    /// Repositorio de datos para el módulo GIS 2D (Mapa de Incidentes).
    /// </summary>
    public interface IDbMapaRepository
    {
        /// <summary>
        /// Retorna todos los incidentes activos (no cerrados / no anulados)
        /// que tienen coordenadas geográficas válidas, para ser pintados en el mapa.
        /// </summary>
        /// <param name="sitioGraba">Filtra por sitio de grabación. Si es 0, retorna todos.</param>
        /// <param name="canalCodigo">Filtra por canal de atención. Si es 0, retorna todos los canales.</param>
        /// <param name="canalFuerzaId">
        /// Fuerza propietaria del canal. Obligatorio cuando canalCodigo &gt; 0: cad_canales.codigo
        /// no es único por sí solo (cada fuerza numera sus canales desde 1), así que filtrar solo
        /// por canalCodigo devuelve incidentes de CUALQUIER fuerza que tenga un canal con ese
        /// mismo número. Si es 0, no se restringe por fuerza.
        /// </param>
        /// <param name="ct">Token de cancelación.</param>
        Task<(List<DtoMapaIncidente> Items, bool Truncated)> GetIncidentesActivosAsync(
            int sitioGraba, int canalCodigo, int canalFuerzaId, CancellationToken ct);
    }
}
