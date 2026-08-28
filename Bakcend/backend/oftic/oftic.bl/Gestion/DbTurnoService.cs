using Comun.Dtos.Turnos;
using Datos.Interfaz;
using Negocio.Interfaz;

namespace Negocio.Gestion
{
    public class DbTurnoService : IDbTurnoService
    {
        private readonly IDbTurnoRepository _repo;

        public DbTurnoService(IDbTurnoRepository repo)
        {
            _repo = repo;
        }

        public Task<List<DtoTurnoListItem>> G_GetTurnosAsync(
            int fuerzaId, string fechaTurno, int sitioGraba, CancellationToken ct)
            => _repo.G_GetTurnosAsync(fuerzaId, fechaTurno, sitioGraba, ct);

        public Task<DtoTurno?> G_GetTurnoPorIdAsync(long turnoId, CancellationToken ct)
            => _repo.G_GetTurnoPorIdAsync(turnoId, ct);

        public Task<List<DtoTurnoUnidad>> G_GetUnidadesTurnoAsync(long turnoId, CancellationToken ct)
            => _repo.G_GetUnidadesTurnoAsync(turnoId, ct);

        public Task<List<DtoMedioDisponible>> G_GetMediosTurnoAsync(
            long turnoId, long? turnoUnidadId, CancellationToken ct)
            => _repo.G_GetMediosTurnoAsync(turnoId, turnoUnidadId, ct);

        public Task<List<DtoMedioDisponible>> G_GetMediosActivosPorCanalAsync(
            int canalCodigo, int canalFuerzaId, int sitioGraba, CancellationToken ct)
            => _repo.G_GetMediosActivosPorCanalAsync(canalCodigo, canalFuerzaId, sitioGraba, ct);

        public Task<List<DtoMedioDisponibleResumen>> G_GetResumenMediosCanalAsync(
            int canalCodigo, int canalFuerzaId, int sitioGraba, CancellationToken ct)
            => _repo.G_GetResumenMediosCanalAsync(canalCodigo, canalFuerzaId, sitioGraba, ct);

        public Task<DtoTurnoResult> P_CrearTurnoAsync(
            DtoCrearTurnoRequest req, string usuario, CancellationToken ct)
            => _repo.P_CrearTurnoAsync(req, usuario, ct);

        public Task<DtoTurnoResult> P_CopiarTurnoAsync(
            DtoCopiarTurnoRequest req, int fuerzaId, string usuario, CancellationToken ct)
            => _repo.P_CopiarTurnoAsync(req, fuerzaId, usuario, ct);

        public Task<DtoTurnoResult> P_AgregarUnidadAsync(
            DtoAgregarUnidadRequest req, int fuerzaId, string usuario, CancellationToken ct)
            => _repo.P_AgregarUnidadAsync(req, fuerzaId, usuario, ct);

        public Task<DtoTurnoResult> P_AgregarMedioAsync(
            DtoAgregarMedioRequest req, int fuerzaId, string usuario, CancellationToken ct)
            => _repo.P_AgregarMedioAsync(req, fuerzaId, usuario, ct);

        public Task<DtoTurnoResult> P_ActualizarMedioAsync(
            long medioId, DtoActualizarMedioRequest req, int fuerzaId, string usuario, CancellationToken ct)
            => _repo.P_ActualizarMedioAsync(medioId, req, fuerzaId, usuario, ct);

        public Task<List<DtoUnidadSivicc>> G_GetUnidadesSiviccAsync(
            long turnoId, CancellationToken ct)
            => _repo.G_GetUnidadesSiviccAsync(turnoId, ct);

        public Task<DtoTurnoResult> P_ImportarDesdeSiviccAsync(
            DtoImportarSiviccRequest req, int fuerzaId, string usuario, CancellationToken ct)
            => _repo.P_ImportarDesdeSiviccAsync(req, fuerzaId, usuario, ct);

        public Task<DtoTurnoResult> P_CambiarEstadoMedioAsync(
            long medioId, DtoCambiarEstadoMedioRequest req, int fuerzaId, string usuario, CancellationToken ct)
            => _repo.P_CambiarEstadoMedioAsync(medioId, req, fuerzaId, usuario, ct);

        public Task<int> P_ActualizarUbicacionesGespoAsync(
            IEnumerable<DtoGespoUbicacion> ubicaciones,
            int canalCodigo, int canalFuerzaId,
            CancellationToken ct)
            => _repo.P_ActualizarUbicacionesGespoAsync(ubicaciones, canalCodigo, canalFuerzaId, ct);

        public Task<int> P_SincronizarGpsBajoDemandaAsync(int canalCodigo, int canalFuerzaId, CancellationToken ct)
            => _repo.P_SincronizarGpsBajoDemandaAsync(canalCodigo, canalFuerzaId, ct);

        public Task<List<DtoRecursoCercano>> G_GetRecursoMasCercanoAsync(
            int canalCodigo, int canalFuerzaId, int sitioGraba,
            double lat, double lng, int top, bool prioridadAlta, CancellationToken ct)
            => _repo.G_GetRecursoMasCercanoAsync(canalCodigo, canalFuerzaId, sitioGraba, lat, lng, top, prioridadAlta, ct);
    }
}
