using Comun.Dtos.Actuaciones;
using Comun.Dtos.Agencias;
using Datos.Interfaz;
using Negocio.Interfaz;

namespace Negocio.Gestion
{
    public class DbActuacionService : IDbActuacionService
    {
        private readonly IDbActuacionRepository _repo;

        public DbActuacionService(IDbActuacionRepository repo)
        {
            _repo = repo;
        }

        public Task<List<DtoActuacionListItem>> G_GetActuacionesEventoAsync(
            long eventoId, CancellationToken ct)
            => _repo.G_GetActuacionesEventoAsync(eventoId, ct);

        public Task<DtoActuacion?> G_GetActuacionAsync(
            long actuacionId, CancellationToken ct)
            => _repo.G_GetActuacionAsync(actuacionId, ct);

        public Task<DtoActuacionResult> P_CrearActuacionAsync(
            DtoCrearActuacionRequest req,
            string usuario,
            CancellationToken ct)
            => _repo.P_CrearActuacionAsync(req, usuario, ct);

        public Task<DtoActuacionResult> P_ActualizarEstadoActuacionAsync(
            long actuacionId,
            DtoActualizarEstadoActuacionRequest req,
            int canalCodigo, int fuerzaId,
            string usuario,
            CancellationToken ct)
            => _repo.P_ActualizarEstadoActuacionAsync(actuacionId, req, canalCodigo, fuerzaId, usuario, ct);

        public Task<DtoActuacionResult> P_CerrarActuacionAsync(
            DtoCierreActuacionRequest req,
            int canalCodigo, int fuerzaId,
            string usuario,
            CancellationToken ct)
            => _repo.P_CerrarActuacionAsync(req, canalCodigo, fuerzaId, usuario, ct);

        public Task<DtoActuacionResult> P_AgregarNotaActuacionAsync(
            long actuacionId,
            DtoAgregarNotaActuacionRequest req,
            int canalCodigo, int fuerzaId,
            string usuario,
            CancellationToken ct)
            => _repo.P_AgregarNotaActuacionAsync(actuacionId, req, canalCodigo, fuerzaId, usuario, ct);

        public Task<DtoActuacionResult> P_AgregarUnidadActuacionAsync(
            long actuacionId,
            DtoAgregarUnidadActuacionRequest req,
            int canalCodigo, int fuerzaId,
            string usuario,
            CancellationToken ct)
            => _repo.P_AgregarUnidadActuacionAsync(actuacionId, req, canalCodigo, fuerzaId, usuario, ct);

        public Task<DtoActuacionResult> P_DesasignarActuacionAsync(
            long actuacionId,
            string? motivo,
            int canalCodigo, int fuerzaId,
            string usuario,
            CancellationToken ct)
            => _repo.P_DesasignarActuacionAsync(actuacionId, motivo, canalCodigo, fuerzaId, usuario, ct);

        public Task<DtoActuacionResult> P_SolicitarApoyoActuacionAsync(
            long actuacionId, int canalCodigo, int fuerzaId, string usuario, CancellationToken ct)
            => _repo.P_SolicitarApoyoActuacionAsync(actuacionId, canalCodigo, fuerzaId, usuario, ct);

        public Task<DtoActuacionResult> P_AtenderApoyoActuacionAsync(
            long actuacionId, int canalCodigo, int fuerzaId, string usuario, CancellationToken ct)
            => _repo.P_AtenderApoyoActuacionAsync(actuacionId, canalCodigo, fuerzaId, usuario, ct);

        public Task<List<DtoActividadPolicial>> G_GetActividadesPolicialesAsync(
            string? tipo, CancellationToken ct)
            => _repo.G_GetActividadesPolicialesAsync(tipo, ct);

        public Task<List<DtoDelitoItem>> G_BuscarDelitosAsync(
            string q, int limit, CancellationToken ct)
            => _repo.G_BuscarDelitosAsync(q, limit, ct);

        public Task<List<DtoCodigoCasoItem>> G_BuscarCodigosCierreAsync(
            string q, int limit, CancellationToken ct)
            => _repo.G_BuscarCodigosCierreAsync(q, limit, ct);

        // ── Retroalimentación externa (via PIP) ────────────────────────────────
        public Task SaveAuditoriaActualizacionAsync(
            DtoAuditoriaActualizacionExterna dto, CancellationToken ct)
            => _repo.SaveAuditoriaActualizacionAsync(dto, ct);

        public Task UpdateAuditoriaActualizacionOkAsync(
            long auditoriaId, long actuacionId, string estado, CancellationToken ct)
            => _repo.UpdateAuditoriaActualizacionOkAsync(auditoriaId, actuacionId, estado, ct);

        public Task UpdateAuditoriaActualizacionErrorAsync(
            long auditoriaId, string error, CancellationToken ct)
            => _repo.UpdateAuditoriaActualizacionErrorAsync(auditoriaId, error, ct);

        public Task<DtoActualizacionExternaResult> P_ActualizarDesdeExternoAsync(
            long casoId, DtoActualizacionExternaRequest req,
            long auditoriaId, string ipOrigen, CancellationToken ct)
            => _repo.P_ActualizarDesdeExternoAsync(casoId, req, auditoriaId, ipOrigen, ct);
    }
}
