using Comun.Dtos.Operacion;

namespace Datos.Interfaz
{
    /// <summary>
    /// Repositorio para el Asistente Inteligente (§6.17).
    /// Gestiona el catálogo de categorías y preguntas orientadoras
    /// que se muestran al despachador al tipificar un incidente.
    /// Sin IA — solo catálogo configurable por el administrador.
    /// </summary>
    public interface IDbAsistenteRepository
    {
        // ── Categorías ────────────────────────────────────────────────────────

        /// <summary>Devuelve todas las categorías, opcionalmente solo las activas.</summary>
        Task<List<DtoAsistenteCategoria>> GetCategoriasAsync(bool soloActivas, CancellationToken ct);

        /// <summary>Obtiene una categoría por su Snowflake ID.</summary>
        Task<DtoAsistenteCategoria?> GetCategoriaByIdAsync(long id, CancellationToken ct);

        /// <summary>Crea una categoría y devuelve el registro creado.</summary>
        Task<DtoAsistenteCategoria> CreateCategoriaAsync(
            DtoAsistenteCategoriaRequest req, string username, CancellationToken ct);

        /// <summary>Actualiza una categoría existente.</summary>
        Task<bool> UpdateCategoriaAsync(
            long id, DtoAsistenteCategoriaRequest req, CancellationToken ct);

        /// <summary>Elimina una categoría (y sus preguntas en cascada por FK).</summary>
        Task<bool> DeleteCategoriaAsync(long id, CancellationToken ct);

        // ── Preguntas ─────────────────────────────────────────────────────────

        /// <summary>
        /// Devuelve preguntas filtradas por categoría.
        /// Si <paramref name="categoriaId"/> es null devuelve todas las preguntas
        /// (útil para el panel de administración sin categoría seleccionada).
        /// </summary>
        Task<List<DtoAsistentePregunta>> GetPreguntasAsync(
            long? categoriaId, bool soloActivas, CancellationToken ct);

        /// <summary>Obtiene una pregunta por su Snowflake ID.</summary>
        Task<DtoAsistentePregunta?> GetPreguntaByIdAsync(long id, CancellationToken ct);

        /// <summary>Crea una pregunta y devuelve el registro creado.</summary>
        Task<DtoAsistentePregunta> CreatePreguntaAsync(
            DtoAsistentePreguntaRequest req, string username, CancellationToken ct);

        /// <summary>Actualiza una pregunta existente.</summary>
        Task<bool> UpdatePreguntaAsync(
            long id, DtoAsistentePreguntaRequest req, string username, CancellationToken ct);

        /// <summary>Elimina una pregunta.</summary>
        Task<bool> DeletePreguntaAsync(long id, CancellationToken ct);
    }
}
