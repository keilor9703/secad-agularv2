using Comun.Dtos.Entidades;

namespace Datos.Interfaz
{
    /// <summary>
    /// Catálogo de sitios de grabación (unidades policiales) del CAD.
    /// Vive en la base del tenant: cada CAD administra los suyos.
    /// </summary>
    public interface IDbSitioGrabacionRepository
    {
        /// <summary>Lista los sitios del CAD con cuántas fuerzas y usuarios cuelgan de cada uno.</summary>
        Task<List<DtoSitioGrabacion>> GetSitiosAsync(bool soloVigentes, CancellationToken ct);

        /// <summary>Obtiene un sitio por su consecutivo.</summary>
        Task<DtoSitioGrabacion?> GetSitioAsync(int consecutivo, CancellationToken ct);

        /// <summary>Crea (consecutivo=null) o actualiza un sitio.</summary>
        Task<DtoFuerzaResult> SaveSitioAsync(int? consecutivo, DtoSitioGrabacionRequest request, CancellationToken ct);

        /// <summary>Invierte la vigencia del sitio (S→N, N→S).</summary>
        Task<DtoFuerzaResult> ToggleSitioAsync(int consecutivo, CancellationToken ct);

        /// <summary>
        /// Borra el sitio, pero solo si no hay nada apuntándole. Un sitio con
        /// fuerzas o usuarios no se borra: se retira con ToggleSitioAsync, para
        /// no dejar huérfano el histórico que lo referencia.
        /// </summary>
        Task<DtoFuerzaResult> DeleteSitioAsync(int consecutivo, CancellationToken ct);
    }
}
