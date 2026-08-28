using Comun.Dtos.Eventos;
using Comun.Dtos.Recepcion;
using Datos.Interfaz;
using Negocio.Interfaz;

namespace Negocio.Gestion
{
    public class DbRecepcionService : IDbRecepcionService
    {
        private readonly IDbRecepcionRepository _repo;

        public DbRecepcionService(IDbRecepcionRepository repo)
        {
            _repo = repo;
        }

        // ── PlantaTel / Incoming call ────────────────────────────────────────────
        public Task<DtoLlamadaEntrante?> F_GetLlamadasAsync(int sitioGraba, int acd, CancellationToken ct)
            => _repo.F_GetLlamadasAsync(sitioGraba, acd, ct);

        public Task<DtoPlantaTelEntradaResult> P_RegistrarLlamadaPlantaTelAsync(
            int sitioGraba, int acd, long numeTelefono, CancellationToken ct)
            => _repo.P_RegistrarLlamadaPlantaTelAsync(sitioGraba, acd, numeTelefono, ct);

        public Task<long> F_ConsultarSeqPedidoAsync(CancellationToken ct)
            => _repo.F_ConsultarSeqPedidoAsync(ct);

        // ── Catalog lookups ─────────────────────────────────────────────────────
        public Task<List<DtoCasoItem>> F_GetCasosIntelAsync(string busqueda, CancellationToken ct)
            => _repo.F_GetCasosIntelAsync(busqueda, ct);

        public Task<DtoCasoItem?> F_GetCasoPorCodigoAsync(string codigo, CancellationToken ct)
            => _repo.F_GetCasoPorCodigoAsync(codigo, ct);

        public Task<List<DtoCanalRecepcion>> F_GetCanalesAsync(int sitioGraba, CancellationToken ct)
            => _repo.F_GetCanalesAsync(sitioGraba, ct);

        public Task<List<DtoReferenciaSecad>> F_GetReferenciasAsync(string nombre, CancellationToken ct)
            => _repo.F_GetReferenciasAsync(nombre, ct);

        public Task<List<DtoLlamadaAsociar>> F_BuscarLlamadasAsociarAsync(
            int sitioGraba, string horaCaso, long numeLlamada, CancellationToken ct)
            => _repo.F_BuscarLlamadasAsociarAsync(sitioGraba, horaCaso, numeLlamada, ct);

        // ── Save / close ────────────────────────────────────────────────────────
        public Task<DtoRecepcionResult> P_GuardarLlamadaAsync(
            DtoRecepcion datos, int canalFuerza, string usuario, long idEmpleado, CancellationToken ct)
            => _repo.P_GuardarLlamadaAsync(datos, canalFuerza, usuario, idEmpleado, ct);

        public Task<DtoRecepcionResult> P_CerrarLlamadaRapidaAsync(
            DtoRecepcion datos, string usuario, CancellationToken ct)
            => _repo.P_CerrarLlamadaRapidaAsync(datos, usuario, ct);

        // ── Event lifecycle ─────────────────────────────────────────────────────
        public Task<DtoEvento?> G_GetEventoAsync(long eventoId, CancellationToken ct)
            => _repo.G_GetEventoAsync(eventoId, ct);

        public Task<List<DtoEventoListItem>> G_GetEventosPorPedidoAsync(long pedidoId, CancellationToken ct)
            => _repo.G_GetEventosPorPedidoAsync(pedidoId, ct);

        public Task<DtoEventoResult> P_ActualizarEstadoEventoAsync(
            long eventoId, string estado, string usuario, CancellationToken ct)
            => _repo.P_ActualizarEstadoEventoAsync(eventoId, estado, usuario, ct);

        public Task<DtoEventoResult> P_CerrarEventoAsync(
            DtoCierreEventoRequest request, string usuario, long usuarioId, string maquina, CancellationToken ct)
            => _repo.P_CerrarEventoAsync(request, usuario, usuarioId, maquina, ct);

        // ── External integrations ───────────────────────────────────────────────
        public Task<DtoEventoResult> P_CrearEventoIntegracionAsync(
            DtoEventoIntegracionRequest request, string usuario, CancellationToken ct)
            => _repo.P_CrearEventoIntegracionAsync(request, usuario, ct);

        // ── Remisión a canal SECAD ──────────────────────────────────────────────
        public Task<(bool success, string message, int canalesAgregados)> RemitirCanalAsync(
            DtoRemitirCanalRequest req, string usuario, CancellationToken ct)
            => _repo.RemitirCanalAsync(req, usuario, ct);

        // ── Duplicate detection ─────────────────────────────────────────────────
        public Task<List<DtoPedidoCercano>> G_GetPedidosCercanosAsync(
            double lat, double lng, int radioMetros, int minutosAtras,
            string? codCaso, CancellationToken ct)
            => _repo.G_GetPedidosCercanosAsync(lat, lng, radioMetros, minutosAtras, codCaso, ct);
    }
}
