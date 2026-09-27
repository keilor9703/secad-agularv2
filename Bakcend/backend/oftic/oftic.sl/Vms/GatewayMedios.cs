using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace Servicios.Vms
{
    /// <summary>
    /// Cliente de la API de control del gateway de medios del nodo edge
    /// (MediaMTX).
    ///
    /// ── Qué resuelve ────────────────────────────────────────────────────────
    /// HikCentral entrega HLS con ~7 s de retraso, y con el PTZ eso es un
    /// problema de uso: el operador corrige contra una imagen vieja. El gateway
    /// toma el RTSP del VMS y lo republica al navegador por WebRTC. Medido en un
    /// banco con MediaMTX real y Chromium real, el tramo WebRTC no añade retraso
    /// apreciable —va incluso por delante de un lector ffmpeg local de baja
    /// latencia—, frente a los 5-7 s que HLS impone por su estructura de
    /// segmentos. Ver docs/Documentacion/CCTV_LATENCIA.md.
    ///
    /// ── Cómo se usa ─────────────────────────────────────────────────────────
    /// Cuando el operador abre una cámara, SECAD le pide a HikCentral la URL
    /// RTSP y le dice al gateway «esta ruta se sirve de este RTSP, y solo tírala
    /// cuando alguien mire» (sourceOnDemand). El navegador recibe la URL WHEP.
    ///
    /// ── El contrato de la API, observado, no supuesto ───────────────────────
    /// Verificado contra MediaMTX v1.21.1:
    ///   POST  /v3/config/paths/add/{ruta}    → 200 la primera vez,
    ///                                          400 si la ruta YA existe
    ///   PATCH /v3/config/paths/patch/{ruta}  → 200 si existe, 404 si no
    /// O sea: «add» NO es idempotente. Por eso se intenta primero el patch y
    /// solo se crea si no había nada. Al revés, cada segunda apertura de la misma
    /// cámara ensuciaría el log del gateway con un 400.
    /// </summary>
    public class GatewayMedios
    {
        public const string NombreCliente = "gateway-medios";

        private readonly IHttpClientFactory _http;
        private readonly ILogger<GatewayMedios> _logger;

        public GatewayMedios(IHttpClientFactory http, ILogger<GatewayMedios> logger)
        {
            _http = http; _logger = logger;
        }

        /// <summary>
        /// Deja la ruta lista en el gateway apuntando a ese RTSP. Idempotente
        /// aunque la API no lo sea.
        /// </summary>
        /// <param name="apiUrl">API de control, como la ve el backend.</param>
        /// <param name="token">Credencial de la API, si está protegida.</param>
        public async Task<(bool Ok, string Mensaje)> AsegurarRutaAsync(
            string apiUrl, string? token, string ruta, string urlRtsp, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(apiUrl))
                return (false, "El gateway de medios no tiene URL de API configurada.");

            var baseUrl = apiUrl.TrimEnd('/');
            var cuerpo = JsonSerializer.Serialize(new
            {
                source = urlRtsp,
                // Solo se conecta al VMS cuando alguien mira, y se desconecta
                // sola al rato. Mantener abiertas cientos de sesiones RTSP
                // contra el HikCentral «por si acaso» es la forma más rápida de
                // que el administrador del VMS nos cierre la puerta.
                sourceOnDemand = true,
            });

            // Primero patch: es lo que ocurre casi siempre, porque la ruta ya
            // existe de la apertura anterior.
            var patch = await EnviarAsync(HttpMethod.Patch,
                $"{baseUrl}/v3/config/paths/patch/{Uri.EscapeDataString(ruta)}", cuerpo, token, ct);
            if (patch.Ok) return (true, "Ruta actualizada en el gateway.");

            if (patch.Codigo != HttpStatusCode.NotFound)
                return (false, $"El gateway rechazó actualizar la ruta: {patch.Mensaje}");

            var add = await EnviarAsync(HttpMethod.Post,
                $"{baseUrl}/v3/config/paths/add/{Uri.EscapeDataString(ruta)}", cuerpo, token, ct);
            return add.Ok
                ? (true, "Ruta creada en el gateway.")
                : (false, $"El gateway rechazó crear la ruta: {add.Mensaje}");
        }

        /// <summary>URL WHEP que se le entrega al navegador.</summary>
        public static string UrlWhep(string gatewayUrl, string ruta) =>
            $"{gatewayUrl.TrimEnd('/')}/{Uri.EscapeDataString(ruta)}/whep";

        /// <summary>
        /// Nombre de ruta para una cámara. MediaMTX admite un juego limitado de
        /// caracteres en los nombres de ruta, y los códigos de cámara de un VMS
        /// pueden traer cualquier cosa: se normaliza, y se conserva el código
        /// reconocible para que el log del gateway siga siendo legible.
        /// </summary>
        public static string RutaDeCamara(string camaraCodigo)
        {
            var sb = new StringBuilder("cam-", 4 + camaraCodigo.Length);
            foreach (var c in camaraCodigo)
                sb.Append(char.IsAsciiLetterOrDigit(c) ? char.ToLowerInvariant(c) : '_');
            return sb.ToString();
        }

        private async Task<(bool Ok, HttpStatusCode Codigo, string Mensaje)> EnviarAsync(
            HttpMethod metodo, string url, string cuerpo, string? token, CancellationToken ct)
        {
            try
            {
                var cliente = _http.CreateClient(NombreCliente);
                using var pet = new HttpRequestMessage(metodo, url)
                {
                    Content = new StringContent(cuerpo, Encoding.UTF8, "application/json"),
                };
                if (!string.IsNullOrWhiteSpace(token))
                    pet.Headers.Add("Authorization", $"Bearer {token}");

                using var resp = await cliente.SendAsync(pet, ct);
                var texto = await resp.Content.ReadAsStringAsync(ct);

                if (resp.IsSuccessStatusCode) return (true, resp.StatusCode, texto);

                _logger.LogWarning("El gateway de medios respondió {Codigo} a {Metodo} {Url}: {Cuerpo}",
                    (int)resp.StatusCode, metodo.Method, url, Recortar(texto));
                return (false, resp.StatusCode, $"HTTP {(int)resp.StatusCode}. {Recortar(texto)}");
            }
            catch (TaskCanceledException) when (!ct.IsCancellationRequested)
            {
                return (false, HttpStatusCode.RequestTimeout,
                    "El gateway de medios no respondió a tiempo.");
            }
            catch (HttpRequestException ex)
            {
                _logger.LogWarning(ex, "No se pudo contactar el gateway de medios en {Url}.", url);
                return (false, HttpStatusCode.ServiceUnavailable,
                    "No se pudo contactar el gateway de medios del municipio.");
            }
        }

        private static string Recortar(string? s) =>
            string.IsNullOrEmpty(s) ? "" : (s.Length <= 200 ? s : s[..200]);
    }
}
