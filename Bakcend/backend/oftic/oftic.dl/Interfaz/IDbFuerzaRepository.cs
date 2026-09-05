using Comun.Dtos.Entidades;

namespace Datos.Interfaz
{
    public interface IDbFuerzaRepository
    {
        // ── Fuerzas ──────────────────────────────────────────────────────────
        /// <summary>Lista todas las fuerzas del sitio de grabación, con contadores de canales y usuarios.</summary>
        Task<List<DtoFuerza>> GetFuerzasAsync(int sitioGraba, CancellationToken ct);

        /// <summary>Obtiene una fuerza por su ID.</summary>
        Task<DtoFuerza?> GetFuerzaAsync(int id, CancellationToken ct);

        /// <summary>Crea (id=null) o actualiza (id set) una fuerza.</summary>
        Task<DtoFuerzaResult> SaveFuerzaAsync(int? id, DtoFuerzaRequest request, int sitioGraba, CancellationToken ct);

        /// <summary>Invierte el estado vigente de la fuerza (S→N, N→S).</summary>
        Task<DtoFuerzaResult> ToggleFuerzaAsync(int id, CancellationToken ct);

        /// <summary>
        /// Mueve en bloque todas las fuerzas de un sitio a otro, y con ellas los
        /// usuarios que colgaban de esas fuerzas. Va en una transacción: mover
        /// las fuerzas sin mover a su gente deja a los despachadores sin canales.
        /// </summary>
        Task<DtoFuerzaResult> ReasignarSitioAsync(int sitioOrigen, int sitioDestino, CancellationToken ct);

        // ── Canales ──────────────────────────────────────────────────────────
        /// <summary>Lista los canales de una fuerza.</summary>
        Task<List<DtoCanalFuerza>> GetCanalesAsync(int fuerzaId, CancellationToken ct);

        /// <summary>Crea (codigo=null) o actualiza un canal dentro de la fuerza.</summary>
        Task<DtoFuerzaResult> SaveCanalAsync(int fuerzaId, int? codigo, DtoCanalRequest request, CancellationToken ct);

        /// <summary>Invierte el estado vigente de un canal.</summary>
        Task<DtoFuerzaResult> ToggleCanalAsync(int fuerzaId, int codigo, CancellationToken ct);

        // ── Usuarios en fuerza ───────────────────────────────────────────────
        /// <summary>Lista los usuarios que tienen asignada esta fuerza.</summary>
        Task<List<DtoUsuarioEnFuerza>> GetUsuariosByFuerzaAsync(int fuerzaId, CancellationToken ct);

        // ── Datos operacionales de usuario ───────────────────────────────────
        /// <summary>Lee los datos operacionales de un usuario (fuerza, canal, ACD) con nombres enriquecidos.</summary>
        Task<DtoUsuarioOperacion?> GetUsuarioOperacionAsync(long idUsuario, CancellationToken ct);

        /// <summary>
        /// Guarda sitio de grabación, fuerza, canal y ACD en ctr_usuarios.
        /// Si la petición no trae sitio, se hereda el de la fuerza elegida.
        /// </summary>
        Task<DtoFuerzaResult> SaveUsuarioOperacionAsync(long idUsuario, DtoUsuarioOperacionRequest request, CancellationToken ct);
    }
}
