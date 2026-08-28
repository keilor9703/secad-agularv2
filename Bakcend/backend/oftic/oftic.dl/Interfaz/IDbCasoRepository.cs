using Comun.Dtos.Administracion;

namespace Datos.Interfaz
{
    public interface IDbCasoRepository
    {
        Task<List<DtoCaso>> GetAllAsync(string? busqueda, CancellationToken ct);
        Task<bool> ExisteAsync(string codigo, CancellationToken ct);
        Task CrearAsync(DtoCasoRequest request, CancellationToken ct);
        Task<bool> ActualizarAsync(DtoCasoRequest request, CancellationToken ct);
        Task<bool> SetVigenteAsync(string codigo, bool vigente, CancellationToken ct);

        /// <summary>
        /// Upsert masivo por código (INSERT … ON CONFLICT DO UPDATE) en un solo
        /// round-trip, pensado para importar cientos/miles de filas de una vez.
        /// Retorna cuántas filas fueron creadas vs. actualizadas.
        /// </summary>
        Task<(int creados, int actualizados)> ImportarMasivoAsync(
            List<DtoCasoImportItem> items, CancellationToken ct);
    }
}
