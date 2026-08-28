using Comun.Dtos.Incidentes;
using Ev = Comun.Dtos.Eventos;
using Datos.Interfaz;
using Negocio.Interfaz;

namespace Negocio.Gestion
{
    public class DbPedidoService : IDbPedidoService
    {
        private readonly IDbPedidoRepository _repository;

        public DbPedidoService(IDbPedidoRepository repository)
        {
            _repository = repository;
        }

        public Task<DtoPedidoListPagedResult> GetListAsync(
            string? estado, int? sitioGraba, DateTime? fechaDesde, DateTime? fechaHasta,
            int page, int pageSize, CancellationToken ct)
            => _repository.GetListAsync(estado, sitioGraba, fechaDesde, fechaHasta, page, pageSize, ct);

        public Task<DtoPedidoDetalle?> GetByIdAsync(long id, CancellationToken ct)
        {
            if (id <= 0) return Task.FromResult<DtoPedidoDetalle?>(null);
            return _repository.GetByIdAsync(id, ct);
        }

        public Task<DtoPedidoResult> CreateAsync(DtoPedidoRequest request, long usuario, string username, string maquina, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(request.DireCaso) && string.IsNullOrWhiteSpace(request.CodiPedido))
                return Task.FromResult(new DtoPedidoResult
                {
                    Success = false,
                    Message = "Se requiere al menos la direccion del caso o el codigo de pedido."
                });

            return _repository.CreateAsync(request, usuario, username, maquina, ct);
        }

        public Task<DtoPedidoResult> UpdateAsync(long id, DtoPedidoRequest request, long usuario, string username, string maquina, CancellationToken ct)
        {
            if (id <= 0)
                return Task.FromResult(new DtoPedidoResult { Success = false, Message = "ID invalido." });

            return _repository.UpdateAsync(id, request, usuario, maquina, ct);
        }

        public Task<DtoPedidoResult> CerrarRapidoAsync(long id, DtoCerrarRapidoRequest request, long usuario, string maquina, CancellationToken ct)
        {
            if (id <= 0)
                return Task.FromResult(new DtoPedidoResult { Success = false, Message = "ID invalido." });

            return _repository.CerrarRapidoAsync(id, request, usuario, maquina, ct);
        }

        public Task<DtoPedidoResult> CerrarEventoDesdeDespachoAsync(
            long pedidoId, Ev.DtoCerrarEventoDespachoRequest request,
            int canalCodigo, int fuerzaId,
            long usuarioId, string username, string maquina, CancellationToken ct)
        {
            if (pedidoId <= 0)
                return Task.FromResult(new DtoPedidoResult { Success = false, Message = "ID de pedido inválido." });
            if (request.CodigosCierre.Count == 0)
                return Task.FromResult(new DtoPedidoResult { Success = false, Message = "Se requiere al menos un código de cierre." });

            return _repository.CerrarEventoDesdeDespachoAsync(pedidoId, request, canalCodigo, fuerzaId, usuarioId, username, maquina, ct);
        }

        public Task<DtoPedidoResult> SetEstadoAsync(
            long id, string estado, long usuario, string username,
            string maquina, string? motivo, CancellationToken ct)
        {
            if (id <= 0)
                return Task.FromResult(new DtoPedidoResult { Success = false, Message = "ID invalido." });
            if (string.IsNullOrWhiteSpace(estado))
                return Task.FromResult(new DtoPedidoResult { Success = false, Message = "Estado requerido." });

            return _repository.SetEstadoAsync(id, estado, usuario, username, maquina, motivo, ct);
        }

        public Task<List<DtoEstadoHistorialItem>> GetEstadoHistorialAsync(long pedidoId, CancellationToken ct)
            => _repository.GetEstadoHistorialAsync(pedidoId, ct);

        public Task<DtoPedidoResult> VincularPedidoAsync(
            long id, int? sitioGraba, long? numeLlamada, long usuario, string maquina, CancellationToken ct)
            => _repository.VincularPedidoAsync(id, sitioGraba, numeLlamada, usuario, maquina, ct);

        public Task<List<DtoAnotacion>> GetAnotacionesAsync(long idPedido, CancellationToken ct)
        {
            if (idPedido <= 0) return Task.FromResult(new List<DtoAnotacion>());
            return _repository.GetAnotacionesAsync(idPedido, ct);
        }

        public Task<DtoPedidoResult> CreateAnotacionAsync(long idPedido, DtoAnotacionRequest request, long usuario, string username, string maquina, CancellationToken ct)
        {
            if (idPedido <= 0)
                return Task.FromResult(new DtoPedidoResult { Success = false, Message = "ID de pedido invalido." });
            if (string.IsNullOrWhiteSpace(request.Anotacion))
                return Task.FromResult(new DtoPedidoResult { Success = false, Message = "El texto de la anotacion es requerido." });

            return _repository.CreateAnotacionAsync(idPedido, request, usuario, username, maquina, ct);
        }

        public Task<List<DtoPedidoAsociar>> BuscarParaAsociarAsync(int sitioGraba, CancellationToken ct)
            => _repository.BuscarParaAsociarAsync(sitioGraba, ct);

        // ─── Eventos (dispatcher queue) ──────────────────────────────────────

        public Task<List<DtoEventoListItem>> GetEventosByCanalAsync(int canalCodigo, int fuerzaId, string? estado, CancellationToken ct)
        {
            if (canalCodigo <= 0)
                return Task.FromResult(new List<DtoEventoListItem>());
            return _repository.GetEventosByCanalAsync(canalCodigo, fuerzaId, estado, ct);
        }

        public Task<List<DtoEventoListItem>> G_BuscarEventosAsync(string texto, int fuerzaId, int sitioGraba, CancellationToken ct)
            => _repository.G_BuscarEventosAsync(texto, fuerzaId, sitioGraba, ct);

        public Task<List<string>> G_GetPresenciaAsync(long pedidoId, long usuarioActual, CancellationToken ct)
            => _repository.G_GetPresenciaAsync(pedidoId, usuarioActual, ct);

        public Task<List<DtoCanalItem>> GetCanalesPorSitioAsync(int sitioGraba, CancellationToken ct)
            => _repository.GetCanalesPorSitioAsync(sitioGraba, ct);

        public Task<Ev.DtoCanalesAsignadosResult> G_GetCanalesAsignadosAsync(long pedidoId, CancellationToken ct)
            => _repository.G_GetCanalesAsignadosAsync(pedidoId, ct);

        public Task<DtoEventoConteos> GetConteosByCanalAsync(int canalCodigo, int fuerzaId, CancellationToken ct)
        {
            if (canalCodigo <= 0)
                return Task.FromResult(new DtoEventoConteos());
            return _repository.GetConteosByCanalAsync(canalCodigo, fuerzaId, ct);
        }

        // ─── Auditoría y SLA ──────────────────────────────────────────────────

        public Task<string?> RegistrarAccesoAsync(long pedidoId, long usuarioId, string username,
                                         string ip, string accion, CancellationToken ct)
            => _repository.RegistrarAccesoAsync(pedidoId, usuarioId, username, ip, accion, ct);

        public Task<List<DtoSlaConfig>> GetSlaConfigAsync(CancellationToken ct)
            => _repository.GetSlaConfigAsync(ct);
    }
}
