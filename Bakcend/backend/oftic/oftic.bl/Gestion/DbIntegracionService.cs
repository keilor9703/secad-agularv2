using Comun.Dtos.Integraciones;
using Datos.Interfaz;
using Negocio.Interfaz;

namespace Negocio.Gestion
{
    public class DbIntegracionService : IDbIntegracionService
    {
        private readonly IDbIntegracionRepository _repo;

        public DbIntegracionService(IDbIntegracionRepository repo) => _repo = repo;

        public Task<List<DtoIntegracionEntrante>> GetEntrantesAsync(CancellationToken ct)
            => _repo.GetEntrantesAsync(ct);

        public Task<DtoIntegracionEntrante?> GetEntranteByIdAsync(long id, CancellationToken ct)
            => _repo.GetEntranteByIdAsync(id, ct);

        public async Task<(bool success, string message, long id)> CreateEntranteAsync(
            DtoIntegracionEntranteRequest req, string usuario, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(req.Nombre))
                return (false, "El nombre es obligatorio.", 0);

            req.EndpointRelativo = RutaDelCanal(req.TipoCanal);

            var id = await _repo.CreateEntranteAsync(req, usuario, ct);
            return (true, "Integración entrante creada.", id);
        }

        public async Task<(bool success, string message)> UpdateEntranteAsync(
            long id, DtoIntegracionEntranteRequest req, string usuario, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(req.Nombre))
                return (false, "El nombre es obligatorio.");

            req.EndpointRelativo = RutaDelCanal(req.TipoCanal);

            var ok = await _repo.UpdateEntranteAsync(id, req, usuario, ct);
            return ok ? (true, "Integración actualizada.") : (false, "No se encontró la integración.");
        }

        /// <summary>
        /// La ruta la decide el canal, no el formulario.
        ///
        /// Las rutas de las integraciones entrantes están fijas en los
        /// controladores: un «endpoint relativo» escrito a mano nunca enrutó
        /// nada, solo servía para guardar documentación equivocada. Y hay tipos
        /// de canal —«Otra», «API Fotos»— que no tienen endpoint propio en
        /// SECAD: su ficha es puramente documental y queda con la ruta vacía,
        /// que es la verdad, en vez de rechazar el alta pidiendo un dato que no
        /// existe.
        /// </summary>
        private static string RutaDelCanal(string? tipoCanal)
            => ContratosIntegracion.RutaDeTipoCanal(tipoCanal);

        public async Task<(bool success, string message)> ToggleEntranteAsync(long id, CancellationToken ct)
        {
            var ok = await _repo.ToggleEntranteAsync(id, ct);
            return ok ? (true, "Estado actualizado.") : (false, "No se encontró la integración.");
        }

        public Task<List<DtoDespachoAuditoria>> GetDespachoAuditoriaAsync(
            int limit, string? agenciaId, CancellationToken ct)
            => _repo.GetDespachoAuditoriaAsync(limit, agenciaId, ct);

        public Task<List<DtoRecepcionAuditoria>> GetRecepcionAuditoriaAsync(
            int limit, string? canal, CancellationToken ct)
            => _repo.GetRecepcionAuditoriaAsync(limit, canal, ct);
    }
}
