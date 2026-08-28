using Comun.Dtos.Mapa;

namespace Datos.Interfaz
{
    public interface IDbMapaEstadisticoRepository
    {
        Task<DtoAnalisisEstadistico> GetAnalisisAsync(DtoFiltroEstadistico filtro, CancellationToken ct);

        /// <summary>sitioGraba: 0 = sin restringir (solo super-admin).</summary>
        Task<List<string>> GetCiudadesAsync(int sitioGraba, CancellationToken ct);

        /// <summary>sitioGraba: 0 = sin restringir (solo super-admin).</summary>
        Task<List<string>> GetBarriosAsync(string? ciudad, int sitioGraba, CancellationToken ct);
    }
}
