using Comun.Dtos.Recepcion;
using Datos.Interfaz;
using Negocio.Interfaz;

namespace Negocio.Gestion
{
    public class DbAdjuntoService : IDbAdjuntoService
    {
        private readonly IDbAdjuntoRepository _repo;

        public DbAdjuntoService(IDbAdjuntoRepository repo) => _repo = repo;

        public Task<long> RegistrarAdjuntoAsync(DtoAdjunto adjunto, CancellationToken ct)
            => _repo.SaveAdjuntoAsync(adjunto, ct);

        public Task<List<DtoAdjunto>> GetAdjuntosAsync(long pedidoId, CancellationToken ct)
            => _repo.GetAdjuntosByPedidoAsync(pedidoId, ct);

        public async Task<(bool found, string? rutaRelativa)> EliminarRegistroAsync(long adjuntoId, CancellationToken ct)
        {
            var ruta = await _repo.GetRutaRelativaAsync(adjuntoId, ct);
            if (ruta is null) return (false, null);
            await _repo.DeleteAdjuntoAsync(adjuntoId, ct);
            return (true, ruta);
        }
    }
}
