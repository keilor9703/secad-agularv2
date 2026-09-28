using Comun.Dtos.Camaras;
using Microsoft.Extensions.Logging;
using Servicios.ApiInterfaz;

namespace Servicios.Vms
{
    /// <summary>
    /// Driver genérico para cámaras y NVR por RTSP.
    ///
    /// ── Para quién es ───────────────────────────────────────────────────────
    /// La mayoría de los municipios del país NO tienen un VMS central: tienen un
    /// NVR en la estación con doce o veinte cámaras, o cámaras sueltas. Ahí no
    /// hay API que preguntar, pero sí hay RTSP, que lo habla todo: Hikvision,
    /// Dahua, Axis, Bosch, y cualquier equipo ONVIF.
    ///
    /// ── En qué se diferencia del driver de HikCentral ───────────────────────
    /// HikCentral tiene una API que responde «qué cámaras hay» y «dame la URL de
    /// esta». Un NVR suelto no responde nada de eso: la URL se ARMA con una
    /// plantilla, y el inventario lo pone el administrador. Así que aquí:
    ///
    /// - El catálogo son los canales que el administrador declara. No se
    ///   inventan: si dice 1-16, son dieciséis.
    /// - El estado en línea se comprueba de verdad, hablando RTSP con el equipo.
    ///   Es lo único honesto: no hay un campo «status» que copiar, y decir «en
    ///   línea» sin mirar sería mentir en la pantalla del despachador.
    /// - El video sale por el gateway del nodo edge, igual que en HikCentral con
    ///   RTSP: ningún navegador reproduce RTSP por su cuenta.
    ///
    /// ── Lo que NO hace, y es deliberado ─────────────────────────────────────
    /// No hace descubrimiento ONVIF (WS-Discovery). Es multicast, no cruza de la
    /// red de cámaras a la institucional, y en la práctica el administrador ya
    /// sabe qué canales tiene su NVR. Si algún día hace falta, entra aquí sin
    /// tocar nada más.
    ///
    /// ── Lo que cuesta sincronizar ───────────────────────────────────────────
    /// Sincronizar sondea CADA canal declarado, y eso lleva tiempo: con un
    /// equipo apagado, cada canal consume su espera completa. Dieciséis canales
    /// contra un NVR caído son unos diez segundos; declarar doscientos y que no
    /// respondan, más de un minuto. Es aceptable porque sincronizar lo dispara
    /// un administrador a mano, no la operación, y el precio se paga una vez
    /// para no mostrarle al despachador cámaras que dicen estar en línea y no
    /// lo están.
    /// </summary>
    public class OnvifRtspVmsReader : IVmsReader
    {
        public string Driver => VmsDrivers.OnvifRtsp;

        /// <summary>
        /// Tope de canales que se sondean en paralelo. Un NVR pequeño aguanta
        /// poco: abrirle veinte conexiones a la vez es la forma de que empiece a
        /// rechazar, y entonces el catálogo saldría con cámaras «fuera de línea»
        /// que sí funcionan.
        /// </summary>
        private const int SondasEnParalelo = 4;

        /// <summary>
        /// Tope de canales que se declaran. Existe para que un «1-99999» por
        /// error no deje al servidor sondeando durante horas.
        /// </summary>
        private const int MaxCanales = 256;

        private readonly RtspSonda     _sonda;
        private readonly GatewayMedios _gateway;
        private readonly ILogger<OnvifRtspVmsReader> _logger;

        public OnvifRtspVmsReader(
            RtspSonda sonda, GatewayMedios gateway, ILogger<OnvifRtspVmsReader> logger)
        {
            _sonda = sonda; _gateway = gateway; _logger = logger;
        }

        public async Task<DtoVmsResultado<int>> ProbarAsync(DtoVmsConexion cx, CancellationToken ct)
        {
            var canales = Canales(cx);
            if (canales.Count == 0)
                return DtoVmsResultado<int>.Mal(
                    "Declare los canales del equipo (por ejemplo «1-16») para poder probar.");

            var plantilla = cx.Publico("rtspPlantilla");
            if (string.IsNullOrWhiteSpace(plantilla))
                return DtoVmsResultado<int>.Mal("Falta la plantilla de la URL RTSP.");

            // Se prueba el PRIMER canal y nada más. Con uno ya se sabe si la
            // plantilla, las credenciales y la red están bien, que es lo que
            // quiere saber quien acaba de llenar el formulario; sondear los
            // dieciséis lo dejaría esperando sin ganar información.
            var url = Armar(cx, canales[0]);
            var r = await _sonda.DescribirAsync(url, ct);

            if (!r.Ok)
                return DtoVmsResultado<int>.Mal($"Canal {canales[0]}: {r.Mensaje}");

            // H.265 aquí no es un problema: el video de este driver SIEMPRE sale
            // por el gateway, que no tiene la restricción de H.264 que sí tiene
            // HLS. Se dice para que nadie salga a buscar un sub-stream que no
            // hace falta.
            var aviso = r.Codec == "H265"
                ? " Ese canal emite H.265 y se ve igual, porque el video va por el gateway de medios."
                : "";
            return DtoVmsResultado<int>.Bien(canales.Count,
                $"Conexión correcta. El canal {canales[0]} entrega video" +
                (r.Codec is not null ? $" en {r.Codec}" : "") +
                $". Se declararon {canales.Count} canal(es)." + aviso);
        }

        public async Task<DtoVmsResultado<DtoVmsPagina>> ListarCamarasAsync(
            DtoVmsConexion cx, int pagina, int tamano, CancellationToken ct)
        {
            var canales = Canales(cx);
            if (canales.Count == 0)
                return DtoVmsResultado<DtoVmsPagina>.Mal(
                    "Declare los canales del equipo (por ejemplo «1-16») antes de sincronizar.");

            var n = Math.Max(1, pagina);
            var trozo = canales.Skip((n - 1) * tamano).Take(tamano).ToList();
            // HayMas lo deduce el propio DTO de Pagina*Tamano < Total, así que
            // hay que rellenar los tres y no inventarse la bandera.
            var pag = new DtoVmsPagina
            {
                Total  = canales.Count,
                Pagina = n,
                Tamano = tamano,
            };
            if (trozo.Count == 0) return DtoVmsResultado<DtoVmsPagina>.Bien(pag);

            // El estado se sondea de verdad, con paralelismo acotado.
            var estados = new int[trozo.Count];
            using var puerta = new SemaphoreSlim(SondasEnParalelo);
            await Task.WhenAll(trozo.Select(async (canal, i) =>
            {
                await puerta.WaitAsync(ct);
                try
                {
                    var r = await _sonda.DescribirAsync(Armar(cx, canal), ct, timeoutMs: 2500);
                    // 1 en línea · 2 fuera de línea, igual que reporta un VMS.
                    estados[i] = r.Ok ? 1 : 2;
                }
                finally { puerta.Release(); }
            }));

            for (var i = 0; i < trozo.Count; i++)
                pag.Camaras.Add(new DtoVmsCamara
                {
                    Codigo = trozo[i],
                    // El nombre real lo pone el censo al emparejar; aquí solo se
                    // identifica el canal para que el administrador lo reconozca.
                    Nombre = $"Canal {trozo[i]}",
                    Estado = estados[i],
                    // Un NVR no dice si la cámara tiene motor. Se deja en false y
                    // lo corrige el inventario: mejor que el operador no vea los
                    // controles PTZ que verlos y que no hagan nada.
                    TienePtz = false,
                });

            return DtoVmsResultado<DtoVmsPagina>.Bien(pag);
        }

        public async Task<DtoVmsResultado<DtoVmsStream>> ObtenerStreamAsync(
            DtoVmsConexion cx, string camaraCodigo, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(camaraCodigo))
                return DtoVmsResultado<DtoVmsStream>.Mal("Falta el código de la cámara.");
            if (string.IsNullOrWhiteSpace(cx.Publico("rtspPlantilla")))
                return DtoVmsResultado<DtoVmsStream>.Mal("Falta la plantilla de la URL RTSP.");

            var url = Armar(cx, camaraCodigo);

            // La URL lleva la contraseña del NVR y NO sale hacia el navegador:
            // se le entrega al gateway, que corre en el nodo edge, y el navegador
            // solo recibe la URL del gateway. Si esta URL llegara al puesto, la
            // contraseña del NVR quedaría en el historial del navegador.
            return await _gateway.PublicarAsync(cx, camaraCodigo, url, VmsProtocolos.Rtsp, ct);
        }

        // ── Ayudas ───────────────────────────────────────────────────────────

        /// <summary>
        /// Rellena la plantilla. Se admiten {usuario}, {clave}, {host}, {puerto}
        /// y {canal}, que es lo que cambia entre marcas:
        ///
        ///   Hikvision: rtsp://{usuario}:{clave}@{host}:554/Streaming/Channels/{canal}02
        ///   Dahua:     rtsp://{usuario}:{clave}@{host}:554/cam/realmonitor?channel={canal}&amp;subtype=1
        ///   Axis:      rtsp://{usuario}:{clave}@{host}/axis-media/media.amp?camera={canal}
        /// </summary>
        private static string Armar(DtoVmsConexion cx, string canal)
        {
            var host = cx.Publico("host");
            if (string.IsNullOrWhiteSpace(host) && !string.IsNullOrWhiteSpace(cx.BaseUrl))
                // La ficha puede traer el equipo en BaseUrl; se acepta y se le
                // quita el esquema, que en la plantilla no va.
                host = cx.BaseUrl.Replace("rtsp://", "", StringComparison.OrdinalIgnoreCase)
                                 .Replace("http://", "", StringComparison.OrdinalIgnoreCase)
                                 .Replace("https://", "", StringComparison.OrdinalIgnoreCase)
                                 .TrimEnd('/');

            return cx.Publico("rtspPlantilla")
                .Replace("{usuario}", Uri.EscapeDataString(cx.Publico("usuario")))
                .Replace("{clave}",   Uri.EscapeDataString(cx.Secreto("clave")))
                .Replace("{host}",    host)
                .Replace("{puerto}",  cx.Publico("puerto", "554"))
                .Replace("{canal}",   canal);
        }

        /// <summary>
        /// Los canales que declaró el administrador: «1-16», «1,3,5», o mezcla.
        /// Se aceptan códigos que no sean números —hay equipos cuyos canales se
        /// llaman por nombre— y solo se expanden los rangos numéricos.
        /// </summary>
        private List<string> Canales(DtoVmsConexion cx)
        {
            var crudo = cx.Publico("canales");
            if (string.IsNullOrWhiteSpace(crudo)) return new List<string>();

            var salida = new List<string>();
            foreach (var parte in crudo.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
            {
                var guion = parte.IndexOf('-');
                if (guion > 0
                    && int.TryParse(parte[..guion].Trim(), out var desde)
                    && int.TryParse(parte[(guion + 1)..].Trim(), out var hasta)
                    && hasta >= desde)
                {
                    for (var n = desde; n <= hasta && salida.Count < MaxCanales; n++)
                        salida.Add(n.ToString());
                }
                else if (salida.Count < MaxCanales)
                {
                    salida.Add(parte);
                }
            }

            if (salida.Count >= MaxCanales)
                _logger.LogWarning(
                    "La integración declara más de {Max} canales; se ignoran los que sobran.", MaxCanales);

            // Duplicados fuera: «1-4,2» no debe dar dos veces el canal 2, porque
            // al sincronizar se crearían dos filas para la misma cámara.
            return salida.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        }
    }
}
