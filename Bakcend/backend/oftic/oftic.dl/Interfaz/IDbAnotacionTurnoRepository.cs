using Comun.Dtos.Operacion;

namespace Datos.Interfaz
{
    /// <summary>
    /// Repositorio para la bitácora de turno (§6.15 Anotaciones Generales).
    /// Las anotaciones NO están ligadas a incidentes — son registros de turno.
    /// </summary>
    public interface IDbAnotacionTurnoRepository
    {
        /// <summary>
        /// Obtiene anotaciones vigentes filtradas por canal, sitio, tipo y/o fecha.
        /// fuerzaId es obligatorio (0 = sin restringir, solo para super-admin) — sin
        /// este filtro se devolverían anotaciones de cualquier fuerza, porque
        /// canal_codigo por sí solo no identifica una fuerza de forma única.
        /// </summary>
        Task<List<DtoAnotacionTurno>> GetListAsync(
            int?     canalCodigo,
            int?     sitioGraba,
            string?  tipo,
            string?  fechaDesde,   // "yyyy-MM-dd"
            string?  fechaHasta,   // "yyyy-MM-dd"
            int      fuerzaId,     // 0 = sin restringir (solo super-admin)
            CancellationToken ct);

        /// <summary>
        /// Obtiene una anotación vigente por su ID Snowflake.
        /// fuerzaId (0 = sin restringir, solo super-admin) evita que un operador
        /// consulte por ID una anotación de otra fuerza.
        /// </summary>
        Task<DtoAnotacionTurno?> GetByIdAsync(long id, int fuerzaId, CancellationToken ct);

        /// <summary>Crea una nueva anotación de turno y devuelve el registro creado.</summary>
        Task<DtoAnotacionTurno> CreateAsync(
            DtoAnotacionTurnoRequest request,
            long     idUsuario,
            string   username,
            string   nombreCompleto,
            string   maquina,
            CancellationToken ct);

        /// <summary>
        /// Actualiza título, tipo y descripción de una anotación existente.
        /// Solo tiene efecto si username coincide con username_creacion, o si
        /// isAdmin es true — de lo contrario no actualiza ninguna fila.
        /// </summary>
        Task<bool> UpdateAsync(
            long     id,
            DtoAnotacionTurnoRequest request,
            string   username,
            bool     isAdmin,
            CancellationToken ct);

        /// <summary>
        /// Elimina lógicamente (vigente=0) una anotación — solo el autor
        /// (username_creacion) o un super-admin (isAdmin) pueden hacerlo.
        /// </summary>
        Task<bool> DeleteAsync(long id, string username, bool isAdmin, CancellationToken ct);
    }
}
