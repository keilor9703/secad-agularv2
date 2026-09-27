using System.Collections.Concurrent;
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

        /// <summary>
        /// Cámaras que están ejecutando un movimiento ahora mismo, por
        /// «sitioGraba:codigo». Dos comandos simultáneos sobre la misma cámara
        /// (izquierda y derecha a la vez, o un arranque mientras otra llamada
        /// va a parar) dejan la cámara donde nadie pidió, y la propia OpenAPI
        /// advierte de no llamar seguido (§4.4.5).
        ///
        /// Es un candado por proceso, no distribuido: si algún día la API corre
        /// replicada detrás de un balanceador, dos instancias no se ven. Cubre
        /// el caso real —un operador pulsando rápido, dos operadores del mismo
        /// CAD— y no pretende más.
        /// </summary>
        private static readonly ConcurrentDictionary<string, byte> _enMovimiento = new();

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
                Reproductor   = r.Datos.Reproductor,
                RutaGateway   = r.Datos.RutaGateway,
                CamaraNombre  = camara.Nombre,
                // De dónde salió la URL. Si el video no carga, saber por qué
                // nodo iba es la mitad del diagnóstico.
                Nodo          = string.IsNullOrWhiteSpace(cx.NodoEdgeUrl) ? "central" : cx.NodoEdgeUrl,
            });
        }

        public async Task<bool> AutorizarLecturaGatewayAsync(
            string camaraCodigo, int sitioGraba, string usuario, string? ip, CancellationToken ct)
        {
            // El gateway pregunta por CADA lectura, así que esto se ejecuta
            // también en cada reconexión del navegador. Es una consulta por
            // código y sitio: barata, y es justo la frontera que hay que
            // comprobar.
            var camara = await _repo.GetPorCodigoAsync(camaraCodigo, sitioGraba, ct);
            var ok = camara is not null
                  && camara.IntegracionId is > 0
                  && camara.Operativa != false;

            await _repo.RegistrarVisualizacionAsync(
                camara, camaraCodigo, null, null, sitioGraba, usuario, ip,
                ok, ok ? null : "El gateway pidió autorización para una cámara que no puede ver.",
                ct, AccionGateway,
                // El detalle dice por dónde entró: una lectura por el gateway no
                // es lo mismo que una consulta de URL, y al revisar la bitácora
                // conviene distinguirlas.
                "gateway/webrtc");

            if (!ok)
                _logger.LogWarning(
                    "El gateway pidió ver la cámara {Cod} para {Usuario} (sitio {Sitio}) y se le negó.",
                    camaraCodigo, usuario, sitioGraba);

            return ok;
        }

        /// <summary>Acción con la que se audita una lectura servida por el gateway.</summary>
        private const string AccionGateway = "VER_GATEWAY";

        public async Task<(bool Ok, string Mensaje, DtoPtzResultado? Datos)> ControlarPtzAsync(
            string camaraCodigo, int sitioGraba, DtoPtzPeticion p,
            string usuario, string? ip, CancellationToken ct)
        {
            // Mover una cámara es más sensible que mirarla: deja de apuntar a
            // donde la dejó el turno anterior. Todo intento se audita con el
            // comando, concedido o negado.
            var accion  = string.IsNullOrWhiteSpace(p.Comando) ? "PTZ" : p.Comando.ToUpperInvariant();
            var detalle = Detalle(p);

            async Task<(bool, string, DtoPtzResultado?)> Negar(DtoCamara? cam, string motivo)
            {
                await _repo.RegistrarVisualizacionAsync(
                    cam, camaraCodigo, p.PedidoId, p.EventoId, sitioGraba, usuario, ip,
                    false, motivo, ct, accion, detalle);
                return (false, motivo, null);
            }

            if (string.IsNullOrWhiteSpace(camaraCodigo))
                return await Negar(null, "Falta el código de la cámara.");
            if (!PtzComandos.EsValido(p.Comando))
                return await Negar(null, $"Comando PTZ desconocido: «{p.Comando}».");

            // Misma frontera que el video: el sitio de grabación. Un operador no
            // mueve cámaras de otra unidad aunque adivine el código.
            var camara = await _repo.GetPorCodigoAsync(camaraCodigo, sitioGraba, ct);
            if (camara is null)
                return await Negar(null, "Esa cámara no existe en este CAD, o pertenece a otra unidad.");
            if (camara.IntegracionId is not > 0)
                return await Negar(camara, "La cámara no está emparejada con ningún VMS: no se puede mover.");
            if (camara.Operativa == false)
                return await Negar(camara, "La cámara está fuera de servicio según el inventario.");
            if (!camara.TienePtz)
                return await Negar(camara,
                    "Esta cámara no es PTZ según el VMS. Si se le instaló motor después, "
                  + "hay que sincronizar la integración para que lo refleje.");

            var cx = await _integraciones.GetConexionAsync(camara.IntegracionId!.Value, ct);
            if (cx is null)
                return await Negar(camara, "La integración de video de esta cámara está inactiva.");

            var lector = _drivers.Para(cx.Driver);
            if (lector is null)
                return await Negar(camara, $"El driver '{cx.Driver}' no tiene implementación de conexión.");

            // Capacidad opcional: un driver que solo sepa leer no implementa
            // IVmsPtz, y eso es una respuesta válida, no un error del sistema.
            if (lector is not IVmsPtz ptz)
                return await Negar(camara, $"El driver '{cx.Driver}' no soporta control PTZ.");

            var llave = $"{sitioGraba}:{camaraCodigo}";
            if (!_enMovimiento.TryAdd(llave, 0))
                return await Negar(camara, "Esa cámara ya está ejecutando un movimiento; espere a que termine.");

            DtoVmsResultado<DtoPtzResultado> r;
            try
            {
                r = await ptz.MoverAsync(cx, camaraCodigo, p, ct);
            }
            finally
            {
                // El finally es obligatorio: si una excepción dejara la llave
                // puesta, esa cámara quedaría bloqueada hasta reiniciar la API.
                _enMovimiento.TryRemove(llave, out _);
            }

            if (!r.Ok) return await Negar(camara, r.Mensaje);

            await _repo.RegistrarVisualizacionAsync(
                camara, camaraCodigo, p.PedidoId, p.EventoId, sitioGraba, usuario, ip,
                true, null, ct, accion, detalle);

            // Si el VMS aceptó el arranque pero no confirmó la parada, la llamada
            // es un éxito a medias: el operador tiene que saberlo, porque la
            // cámara puede haber quedado moviéndose.
            if (!r.Datos!.Detenida)
                _logger.LogWarning(
                    "{Usuario} movió la cámara {Cod} ({Comando}) y el VMS no confirmó la parada.",
                    usuario, camaraCodigo, accion);

            return (true, r.Datos.Mensaje, r.Datos);
        }

        /// <summary>
        /// Resumen del movimiento para la bitácora. Cabe en los 160 caracteres
        /// de la columna: lo justo para reconstruir qué se pidió.
        /// </summary>
        private static string Detalle(DtoPtzPeticion p)
        {
            var partes = new List<string>(4);
            if (p.Velocidad  is > 0) partes.Add($"vel={p.Velocidad}");
            if (p.DuracionMs is > 0) partes.Add($"dur={p.DuracionMs}ms");
            if (p.Preset     is > 0) partes.Add($"preset={p.Preset}");
            if (p.Patrulla   is > 0) partes.Add($"patrulla={p.Patrulla}");
            var texto = string.Join(' ', partes);
            return texto.Length <= 160 ? texto : texto[..160];
        }
    }
}
