using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Logging;

namespace Servicios.Vms
{
    /// <summary>
    /// Comprueba de verdad si una URL RTSP entrega video, hablando RTSP a mano
    /// sobre un socket.
    ///
    /// ── Por qué no basta con abrir el puerto ────────────────────────────────
    /// Un TCP contra el 554 solo dice que el NVR está encendido. No dice si la
    /// plantilla de la URL es correcta, si el canal existe, ni si la contraseña
    /// sirve. Y esas tres son justo las que se equivocan al configurar.
    ///
    /// Un «probar conexión» que responde CORRECTO y luego no da imagen es peor
    /// que no tener botón: manda a buscar el fallo donde no está. Así que aquí
    /// se hace un DESCRIBE, que es la petición con la que un reproductor de
    /// verdad pide la descripción del stream, y solo se dice que está bien
    /// cuando el equipo contesta con su SDP.
    ///
    /// ── Autenticación ───────────────────────────────────────────────────────
    /// Se implementa Digest además de Basic porque los NVR de Hikvision y Dahua
    /// —los que hay en los municipios— rechazan Basic por defecto. Digest es un
    /// ida y vuelta: el equipo responde 401 con un «nonce», y se repite la
    /// petición firmada con él.
    /// </summary>
    public class RtspSonda
    {
        private readonly ILogger<RtspSonda> _logger;

        public RtspSonda(ILogger<RtspSonda> logger) => _logger = logger;

        public record Resultado(bool Ok, string Mensaje, string? Codec = null);

        /// <summary>
        /// Pide la descripción del stream. <paramref name="timeoutMs"/> acota la
        /// espera: un NVR apagado no puede dejar colgada la petición del
        /// administrador.
        /// </summary>
        public async Task<Resultado> DescribirAsync(
            string urlRtsp, CancellationToken ct, int timeoutMs = 4000)
        {
            if (!Uri.TryCreate(urlRtsp, UriKind.Absolute, out var uri)
                || !uri.Scheme.Equals("rtsp", StringComparison.OrdinalIgnoreCase))
                return new Resultado(false, "La URL no es un RTSP válido.");

            // Las credenciales van en la URL («rtsp://usuario:clave@host/…»),
            // que es como las escribe todo el mundo, pero NO se mandan dentro de
            // la línea de petición: van en la cabecera de autorización.
            var usuario = "";
            var clave   = "";
            if (!string.IsNullOrEmpty(uri.UserInfo))
            {
                var partes = uri.UserInfo.Split(':', 2);
                usuario = Uri.UnescapeDataString(partes[0]);
                clave   = partes.Length > 1 ? Uri.UnescapeDataString(partes[1]) : "";
            }
            var urlLimpia = new UriBuilder(uri) { UserName = "", Password = "" }.Uri.ToString();

            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(timeoutMs);

            try
            {
                using var tcp = new TcpClient();
                await tcp.ConnectAsync(uri.Host, uri.Port > 0 ? uri.Port : 554, cts.Token);
                using var flujo = tcp.GetStream();

                var respuesta = await PedirAsync(flujo, urlLimpia, 1, null, cts.Token);

                // 401: hay que autenticarse. Se reintenta UNA vez con lo que pida
                // el equipo. Reintentar más sería empezar a probar contraseñas.
                if (respuesta.Codigo == 401)
                {
                    if (string.IsNullOrEmpty(usuario))
                        return new Resultado(false,
                            "El equipo pide usuario y contraseña y la plantilla no los incluye.");

                    var autorizacion = ConstruirAutorizacion(respuesta.Cabeceras, usuario, clave, urlLimpia);
                    if (autorizacion is null)
                        return new Resultado(false,
                            "El equipo pide un método de autenticación que no se reconoce.");

                    respuesta = await PedirAsync(flujo, urlLimpia, 2, autorizacion, cts.Token);
                }

                return respuesta.Codigo switch
                {
                    200 => new Resultado(true, "El equipo entrega video en esa ruta.",
                                         CodecDelSdp(respuesta.Cuerpo)),
                    401 => new Resultado(false, "Usuario o contraseña incorrectos."),
                    403 => new Resultado(false, "El equipo rechazó el acceso a esa cámara."),
                    404 => new Resultado(false,
                        "Ese canal no existe en el equipo. Revise el número de canal y la plantilla de la URL."),
                    453 => new Resultado(false,
                        "El equipo no tiene más conexiones libres. Suele pasar cuando otro sistema " +
                        "ya está viendo todas las cámaras."),
                    _   => new Resultado(false, $"El equipo respondió RTSP {respuesta.Codigo}."),
                };
            }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested)
            {
                return new Resultado(false,
                    $"El equipo no respondió en {timeoutMs} ms. Puede estar apagado o no alcanzarse " +
                    "desde este servidor.");
            }
            catch (SocketException ex)
            {
                _logger.LogDebug(ex, "No se pudo abrir RTSP contra {Host}.", uri.Host);
                return new Resultado(false,
                    "No se pudo abrir la conexión con el equipo. Revise la dirección, el puerto y la red.");
            }
            catch (IOException ex)
            {
                _logger.LogDebug(ex, "RTSP cortó la conexión con {Host}.", uri.Host);
                return new Resultado(false, "El equipo cortó la conexión.");
            }
        }

        private record RespuestaRtsp(int Codigo, Dictionary<string, string> Cabeceras, string Cuerpo);

        private static async Task<RespuestaRtsp> PedirAsync(
            NetworkStream flujo, string url, int cseq, string? autorizacion, CancellationToken ct)
        {
            var sb = new StringBuilder()
                .Append("DESCRIBE ").Append(url).Append(" RTSP/1.0\r\n")
                .Append("CSeq: ").Append(cseq).Append("\r\n")
                .Append("Accept: application/sdp\r\n")
                .Append("User-Agent: SECAD\r\n");
            if (autorizacion is not null) sb.Append("Authorization: ").Append(autorizacion).Append("\r\n");
            sb.Append("\r\n");

            var bytes = Encoding.ASCII.GetBytes(sb.ToString());
            await flujo.WriteAsync(bytes, ct);
            await flujo.FlushAsync(ct);

            // Se lee hasta el final de las cabeceras y, si hay, el cuerpo que
            // anuncie Content-Length. Con un búfer acotado: un equipo que mande
            // basura sin fin no puede comerse la memoria del servidor.
            var texto = new StringBuilder();
            var buf = new byte[4096];
            var topeCabeceras = -1;
            while (texto.Length < 64 * 1024)
            {
                var n = await flujo.ReadAsync(buf, ct);
                if (n <= 0) break;
                texto.Append(Encoding.ASCII.GetString(buf, 0, n));

                if (topeCabeceras < 0) topeCabeceras = texto.ToString().IndexOf("\r\n\r\n", StringComparison.Ordinal);
                if (topeCabeceras < 0) continue;

                var completo = texto.ToString();
                var largo = LargoDelCuerpo(completo[..topeCabeceras]);
                if (completo.Length >= topeCabeceras + 4 + largo) break;
            }

            var todo = texto.ToString();
            var fin  = todo.IndexOf("\r\n\r\n", StringComparison.Ordinal);
            var cabecerasTexto = fin >= 0 ? todo[..fin] : todo;
            var cuerpo = fin >= 0 ? todo[(fin + 4)..] : "";

            var lineas = cabecerasTexto.Split("\r\n");
            var codigo = 0;
            if (lineas.Length > 0)
            {
                var trozos = lineas[0].Split(' ');
                if (trozos.Length > 1) _ = int.TryParse(trozos[1], out codigo);
            }

            var cabeceras = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var l in lineas.Skip(1))
            {
                var i = l.IndexOf(':');
                if (i > 0) cabeceras[l[..i].Trim()] = l[(i + 1)..].Trim();
            }

            return new RespuestaRtsp(codigo, cabeceras, cuerpo);
        }

        private static int LargoDelCuerpo(string cabeceras)
        {
            foreach (var l in cabeceras.Split("\r\n"))
                if (l.StartsWith("Content-Length:", StringComparison.OrdinalIgnoreCase)
                    && int.TryParse(l[15..].Trim(), out var n))
                    return n;
            return 0;
        }

        /// <summary>
        /// Arma la cabecera Authorization a partir de lo que pidió el equipo.
        /// Digest si lo ofrece —los NVR de Hikvision y Dahua solo aceptan ese—,
        /// y Basic si es lo único que hay.
        /// </summary>
        private static string? ConstruirAutorizacion(
            Dictionary<string, string> cabeceras, string usuario, string clave, string url)
        {
            if (!cabeceras.TryGetValue("WWW-Authenticate", out var reto)) return null;

            if (reto.StartsWith("Digest", StringComparison.OrdinalIgnoreCase))
            {
                var realm = Campo(reto, "realm") ?? "";
                var nonce = Campo(reto, "nonce") ?? "";
                // RFC 2069, que es lo que hablan estos equipos: no mandan qop.
                var ha1 = Md5($"{usuario}:{realm}:{clave}");
                var ha2 = Md5($"DESCRIBE:{url}");
                var respuesta = Md5($"{ha1}:{nonce}:{ha2}");
                return $"Digest username=\"{usuario}\", realm=\"{realm}\", nonce=\"{nonce}\", " +
                       $"uri=\"{url}\", response=\"{respuesta}\"";
            }

            if (reto.StartsWith("Basic", StringComparison.OrdinalIgnoreCase))
                return "Basic " + Convert.ToBase64String(Encoding.UTF8.GetBytes($"{usuario}:{clave}"));

            return null;
        }

        private static string? Campo(string reto, string nombre)
        {
            var marca = nombre + "=\"";
            var i = reto.IndexOf(marca, StringComparison.OrdinalIgnoreCase);
            if (i < 0) return null;
            i += marca.Length;
            var j = reto.IndexOf('"', i);
            return j > i ? reto[i..j] : null;
        }

        private static string Md5(string s) =>
            Convert.ToHexString(MD5.HashData(Encoding.UTF8.GetBytes(s))).ToLowerInvariant();

        /// <summary>
        /// Códec del SDP. Es informativo pero útil: si el municipio se queda en
        /// HLS, H.265 no se va a ver, y saberlo aquí ahorra el viaje.
        /// </summary>
        private static string? CodecDelSdp(string sdp)
        {
            foreach (var l in sdp.Split('\n'))
            {
                var t = l.Trim();
                if (!t.StartsWith("a=rtpmap:", StringComparison.OrdinalIgnoreCase)) continue;
                if (t.Contains("H264", StringComparison.OrdinalIgnoreCase)) return "H264";
                if (t.Contains("H265", StringComparison.OrdinalIgnoreCase)) return "H265";
                if (t.Contains("JPEG", StringComparison.OrdinalIgnoreCase)) return "MJPEG";
            }
            return null;
        }
    }
}
