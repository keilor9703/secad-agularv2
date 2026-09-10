using Comun.Dtos.Camaras;
using Datos.Interfaz;
using Microsoft.Extensions.Logging;
using Negocio.Interfaz;
using Servicios.ApiInterfaz;

namespace Negocio.Gestion
{
    public class DbCamaraService : IDbCamaraService
    {
        /// <summary>
        /// Tope de páginas al sincronizar. Un CAD grande no pasa de unos miles
        /// de cámaras (500 por página); el tope existe para que un VMS que
        /// devuelva mal el total no deje al servidor girando.
        /// </summary>
        private const int MaxPaginas = 40;
        private const int TamanoPagina = 500;

        private readonly IDbCamaraRepository            _repo;
        private readonly IDbCamaraIntegracionRepository _integraciones;
        private readonly IVmsReaderFactory              _drivers;
        private readonly ILogger<DbCamaraService>       _logger;

        public DbCamaraService(
            IDbCamaraRepository repo,
            IDbCamaraIntegracionRepository integraciones,
            IVmsReaderFactory drivers,
            ILogger<DbCamaraService> logger)
        {
            _repo = repo; _integraciones = integraciones; _drivers = drivers; _logger = logger;
        }

        public async Task<DtoSyncResult> SincronizarAsync(long integracionId, string usuario, CancellationToken ct)
        {
            var cx = await _integraciones.GetConexionAsync(integracionId, ct);
            if (cx is null)
                return new DtoSyncResult { Ok = false, Mensaje = "La integración no existe o está inactiva." };

            var lector = _drivers.Para(cx.Driver);
            if (lector is null)
                return new DtoSyncResult { Ok = false, Mensaje = $"El driver '{cx.Driver}' no tiene implementación de conexión." };

            var todas = new List<DtoVmsCamara>();
            for (var pagina = 1; pagina <= MaxPaginas; pagina++)
            {
                var r = await lector.ListarCamarasAsync(cx, pagina, TamanoPagina, ct);
                if (!r.Ok)
                    return new DtoSyncResult { Ok = false, Mensaje = r.Mensaje };

                todas.AddRange(r.Datos!.Camaras);
                if (!r.Datos.HayMas || r.Datos.Camaras.Count == 0) break;
                if (pagina == MaxPaginas)
                    _logger.LogWarning(
                        "Sincronización de la integración {Id} cortada en {N} páginas; el VMS reporta {Total} cámaras.",
                        integracionId, MaxPaginas, r.Datos.Total);
            }

            var res = await _repo.SincronizarAsync(integracionId, todas, ct);
            _logger.LogInformation("{Usuario} sincronizó la integración {Id}: {Msg}", usuario, integracionId, res.Mensaje);
            return res;
        }

        public Task<List<DtoEmparejamientoCamara>> ProponerEmparejamientosAsync(long integracionId, CancellationToken ct)
            => _repo.ProponerEmparejamientosAsync(integracionId, ct);

        public Task<(bool Ok, string Mensaje)> EmparejarAsync(long censoId, long vmsId, string usuario, CancellationToken ct)
            => _repo.EmparejarAsync(censoId, vmsId, usuario, ct);

        public Task<(bool Ok, string Mensaje)> DesemparejarAsync(long censoId, CancellationToken ct)
            => _repo.DesemparejarAsync(censoId, ct);

        public Task<List<DtoCamara>> CercanasAsync(
            int sitioGraba, double lat, double lng, int radioMetros, int limite, CancellationToken ct)
            => _repo.CercanasAsync(sitioGraba, lat, lng, radioMetros, limite, ct);

        public async Task<(bool Ok, string Mensaje, DtoStreamCamara? Datos)> ObtenerStreamAsync(
            string camaraCodigo, int sitioGraba, long? pedidoId, long? eventoId,
            string usuario, string? ip, CancellationToken ct)
        {
            // Cada salida por «no» también se audita: quién intentó ver qué y
            // por qué no se le dejó es tan interesante como quién sí vio.
            async Task<(bool, string, DtoStreamCamara?)> Negar(DtoCamara? cam, string motivo)
            {
                await _repo.RegistrarVisualizacionAsync(
                    cam, camaraCodigo, pedidoId, eventoId, sitioGraba, usuario, ip, false, motivo, ct);
                return (false, motivo, null);
            }

            if (string.IsNullOrWhiteSpace(camaraCodigo))
                return await Negar(null, "Falta el código de la cámara.");

            // El filtro por sitio de grabación es la frontera: un operador no
            // puede pedir video de una cámara de otra unidad aunque adivine su
            // código.
            var camara = await _repo.GetPorCodigoAsync(camaraCodigo, sitioGraba, ct);
            if (camara is null)
                return await Negar(null, "Esa cámara no existe en este CAD, o pertenece a otra unidad.");
            if (camara.IntegracionId is not > 0)
                return await Negar(camara, "La cámara está en el inventario pero no se ha emparejado con ningún VMS: no hay video.");
            if (camara.Operativa == false)
                return await Negar(camara, "La cámara está fuera de servicio según el inventario.");

            var cx = await _integraciones.GetConexionAsync(camara.IntegracionId!.Value, ct);
            if (cx is null)
                return await Negar(camara, "La integración de video de esta cámara está inactiva.");

            var lector = _drivers.Para(cx.Driver);
            if (lector is null)
                return await Negar(camara, $"El driver '{cx.Driver}' no tiene implementación de conexión.");

            var r = await lector.ObtenerStreamAsync(cx, camaraCodigo, ct);
            if (!r.Ok) return await Negar(camara, r.Mensaje);

            await _repo.RegistrarVisualizacionAsync(
                camara, camaraCodigo, pedidoId, eventoId, sitioGraba, usuario, ip, true, null, ct);

            return (true, "URL entregada.", new DtoStreamCamara
            {
                Url           = r.Datos!.Url,
                Autenticacion = r.Datos.Autenticacion,
                Protocolo     = r.Datos.Protocolo,
                CamaraNombre  = camara.Nombre,
                // De dónde salió la URL. Si el video no carga, saber por qué
                // nodo iba es la mitad del diagnóstico.
                Nodo          = string.IsNullOrWhiteSpace(cx.NodoEdgeUrl) ? "central" : cx.NodoEdgeUrl,
            });
        }
    }
}
