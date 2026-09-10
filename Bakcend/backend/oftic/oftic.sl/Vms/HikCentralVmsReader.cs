using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Comun.Dtos.Camaras;
using Microsoft.Extensions.Logging;
using Servicios.ApiInterfaz;

namespace Servicios.Vms
{
    /// <summary>
    /// Driver de HikCentral Professional OpenAPI («Artemis»), V3.1.0.
    ///
    /// Solo hace dos cosas, que son las que necesita el despacho: listar las
    /// cámaras con su estado, y pedir la URL de video en vivo. La ubicación NO
    /// sale de aquí —la OpenAPI no expone las coordenadas de las cámaras
    /// fijas—, viene del censo institucional.
    ///
    /// El video nunca pasa por este backend: se pide una URL y se le entrega al
    /// navegador, que baja el stream directo del servidor de medios. Meter el
    /// video por Kestrel tumbaría el servidor con tres operadores mirando.
    /// </summary>
    public class HikCentralVmsReader : IVmsReader
    {
        public string Driver => VmsDrivers.HikCentral;

        private const string RutaCamaras  = "/artemis/api/resource/v1/cameras";
        private const string RutaPreview  = "/artemis/api/video/v2/cameras/previewURLs";

        private readonly IHttpClientFactory _http;
        private readonly ILogger<HikCentralVmsReader> _logger;

        private static readonly JsonSerializerOptions Json = new()
        {
            PropertyNameCaseInsensitive = true,
        };

        public HikCentralVmsReader(IHttpClientFactory http, ILogger<HikCentralVmsReader> logger)
        {
            _http   = http;
            _logger = logger;
        }

        // ── Operaciones ──────────────────────────────────────────────────────

        public async Task<DtoVmsResultado<int>> ProbarAsync(DtoVmsConexion cx, CancellationToken ct)
        {
            // Una página de una cámara: confirma credenciales, permisos y red
            // sin traerse el catálogo entero.
            var r = await ListarCamarasAsync(cx, 1, 1, ct);
            if (!r.Ok) return DtoVmsResultado<int>.Mal(r.Mensaje);

            var total = r.Datos?.Total ?? 0;
            return DtoVmsResultado<int>.Bien(total,
                total > 0
                    ? $"Conexión correcta. El VMS reporta {total} cámara(s) visibles para este usuario."
                    : "Conexión correcta, pero el usuario vinculado al Partner no ve ninguna cámara. " +
                      "Revise sus permisos en HikCentral.");
        }

        public async Task<DtoVmsResultado<DtoVmsPagina>> ListarCamarasAsync(
            DtoVmsConexion cx, int pagina, int tamano, CancellationToken ct)
        {
            // pageSize máximo del manual: 500.
            var cuerpo = JsonSerializer.Serialize(new
            {
                pageNo   = Math.Max(1, pagina),
                pageSize = Math.Clamp(tamano, 1, 500),
            });

            var r = await LlamarAsync(cx, RutaCamaras, cuerpo, ct);
            if (!r.Ok) return DtoVmsResultado<DtoVmsPagina>.Mal(r.Mensaje);

            try
            {
                var data = r.Datos!.Value;
                var pag = new DtoVmsPagina
                {
                    Total  = Entero(data, "total"),
                    Pagina = Entero(data, "pageNo", pagina),
                    Tamano = Entero(data, "pageSize", tamano),
                };

                if (data.TryGetProperty("list", out var lista) && lista.ValueKind == JsonValueKind.Array)
                    foreach (var c in lista.EnumerateArray())
                    {
                        var capacidades = Texto(c, "capabilitySet") ?? "";
                        pag.Camaras.Add(new DtoVmsCamara
                        {
                            Codigo       = Texto(c, "cameraIndexCode") ?? "",
                            Nombre       = Texto(c, "cameraName") ?? "",
                            RegionCodigo = Texto(c, "regionIndexCode"),
                            Estado       = Entero(c, "status"),
                            // capabilitySet es una lista separada por comas:
                            // "vss,ptz,gis". Contains bastaría pero marcaría
                            // como PTZ cualquier capacidad que contenga «ptz».
                            TienePtz = capacidades
                                .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
                                .Any(x => x.Equals("ptz", StringComparison.OrdinalIgnoreCase)),
                        });
                    }

                return DtoVmsResultado<DtoVmsPagina>.Bien(pag);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "HikCentral devolvió un catálogo que no se pudo leer.");
                return DtoVmsResultado<DtoVmsPagina>.Mal("El VMS respondió, pero con un formato inesperado.");
            }
        }

        public async Task<DtoVmsResultado<DtoVmsStream>> ObtenerStreamAsync(
            DtoVmsConexion cx, string camaraCodigo, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(camaraCodigo))
                return DtoVmsResultado<DtoVmsStream>.Mal("Falta el código de la cámara.");

            // streamType 1 = sub-stream. El manual es explícito: «Streaming via
            // RTMP and HLS only supports H.264 video encoding», y el main
            // stream de Hikvision suele ir en H.265, que el navegador no
            // reproduce. Por eso el valor por defecto es el sub-stream, aunque
            // el administrador puede cambiarlo en la ficha.
            var tipo = int.TryParse(cx.Publico("streamType", "1"), out var t) ? t : 1;

            var cuerpo = JsonSerializer.Serialize(new
            {
                // El manual se contradice: la tabla de parámetros dice
                // «cameraIndexCodes» y el ejemplo escribe «cameraIndexCode».
                // Se mandan los dos: el gateway ignora el que no conozca y así
                // el driver funciona con cualquiera de las dos lecturas.
                cameraIndexCodes = camaraCodigo,
                cameraIndexCode  = camaraCodigo,
                streamType       = tipo,
                protocol         = cx.Publico("protocol", "hls"),
                transmode        = int.TryParse(cx.Publico("transmode", "1"), out var tm) ? tm : 1,
            });

            var r = await LlamarAsync(cx, RutaPreview, cuerpo, ct);
            if (!r.Ok) return DtoVmsResultado<DtoVmsStream>.Mal(r.Mensaje);

            var data = r.Datos!.Value;
            var url  = Texto(data, "url");
            if (string.IsNullOrWhiteSpace(url))
                return DtoVmsResultado<DtoVmsStream>.Mal(
                    "El VMS aceptó la petición pero no devolvió URL. Suele significar que esa cámara " +
                    "no tiene sub-stream en H.264, que es lo único que HLS admite.");

            return DtoVmsResultado<DtoVmsStream>.Bien(new DtoVmsStream
            {
                Url           = url!,
                Autenticacion = Texto(data, "authentication"),
                Protocolo     = cx.Publico("protocol", "hls"),
                TipoStream    = tipo,
            });
        }

        // ── Transporte ───────────────────────────────────────────────────────

        /// <summary>
        /// Una llamada firmada al gateway. Devuelve el nodo «data» de la
        /// respuesta, o el motivo por el que no se pudo.
        /// </summary>
        private async Task<DtoVmsResultado<JsonElement?>> LlamarAsync(
            DtoVmsConexion cx, string ruta, string cuerpoJson, CancellationToken ct)
        {
            var baseUrl   = cx.BaseUrl.TrimEnd('/');
            var appKey    = cx.Publico("appKey");
            var appSecret = cx.Secreto("appSecret");
            var userId    = cx.Publico("userId");

            if (string.IsNullOrWhiteSpace(baseUrl))   return DtoVmsResultado<JsonElement?>.Mal("Falta la URL del HikCentral.");
            if (string.IsNullOrWhiteSpace(appKey))    return DtoVmsResultado<JsonElement?>.Mal("Falta el App Key.");
            if (string.IsNullOrWhiteSpace(appSecret)) return DtoVmsResultado<JsonElement?>.Mal("Falta el App Secret.");
            // userId no es opcional: el manual lo marca requerido tanto en
            // resource/v1/cameras como en video/v2/previewURLs.
            if (string.IsNullOrWhiteSpace(userId))    return DtoVmsResultado<JsonElement?>.Mal("Falta el usuario (userId) vinculado al Partner.");

            const string accept = "application/json";

            // Solo estas entran en la firma; el resto las excluye el gateway.
            var firmadas = new List<KeyValuePair<string, string>>
            {
                new("x-ca-key",       appKey),
                new("x-ca-timestamp", HikSignature.Timestamp()),
                new("x-ca-nonce",     Guid.NewGuid().ToString()),
                new("userid",         userId),
            };
            var domainId = cx.Publico("domainId");
            if (!string.IsNullOrWhiteSpace(domainId))
                firmadas.Add(new("domainid", domainId));

            // El cliente de referencia de Hikvision no envía Content-MD5 y el
            // manual lo marca opcional. Se deja apagado por defecto y se puede
            // encender desde la ficha si un despliegue lo exige: enviarlo sin
            // firmarlo (o al revés) da un 401 que no explica nada.
            var usarMd5 = cx.Publico("contentMd5").Equals("1", StringComparison.Ordinal)
                       || cx.Publico("contentMd5").Equals("true", StringComparison.OrdinalIgnoreCase);
            var md5 = usarMd5 ? HikSignature.ContentMd5(cuerpoJson) : null;

            var cadena = HikSignature.CadenaAFirmar(
                "POST", accept, md5, ContentType, date: null, firmadas, ruta);
            var firma = HikSignature.Firmar(cadena, appSecret);

            var cliente = _http.CreateClient(NombreCliente);
            using var req = new HttpRequestMessage(HttpMethod.Post, baseUrl + ruta)
            {
                Content = new StringContent(cuerpoJson, Encoding.UTF8),
            };
            // El gateway compara la firma contra el Content-Type que RECIBE,
            // carácter por carácter. StringContent(…, "application/json") le
            // añade «; charset=utf-8» por su cuenta, así que firmar
            // «application/json» daba un 401 que no explicaba nada. Se fija el
            // valor exacto a mano y se firma ese mismo.
            req.Content.Headers.Remove("Content-Type");
            req.Content.Headers.TryAddWithoutValidation("Content-Type", ContentType);
            req.Headers.Accept.ParseAdd(accept);
            req.Headers.TryAddWithoutValidation("X-Ca-Key",               appKey);
            req.Headers.TryAddWithoutValidation("X-Ca-Signature",         firma);
            req.Headers.TryAddWithoutValidation("X-Ca-Signature-Headers", HikSignature.ListaDeFirmadas(firmadas));
            foreach (var h in firmadas.Where(h => h.Key != "x-ca-key"))
                req.Headers.TryAddWithoutValidation(h.Key, h.Value);
            if (md5 is not null)
                req.Content.Headers.ContentMD5 = Convert.FromBase64String(md5);

            HttpResponseMessage resp;
            try
            {
                resp = await cliente.SendAsync(req, ct);
            }
            catch (TaskCanceledException) when (!ct.IsCancellationRequested)
            {
                return DtoVmsResultado<JsonElement?>.Mal(
                    $"El HikCentral no respondió a tiempo ({baseUrl}). Revise la red entre este nodo y el VMS.");
            }
            catch (HttpRequestException ex)
            {
                // El caso típico del piloto: el central de Bogotá no alcanza la
                // red de cámaras del municipio. Merece un mensaje que lo diga.
                return DtoVmsResultado<JsonElement?>.Mal(
                    $"No se pudo conectar con {baseUrl}: {ex.Message}. Si este backend no está en la " +
                    "misma red que las cámaras, configure el nodo edge en la ficha de la integración.");
            }

            var texto = await resp.Content.ReadAsStringAsync(ct);
            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogWarning("HikCentral {Ruta} respondió {Codigo}: {Cuerpo}",
                    ruta, (int)resp.StatusCode, Recortar(texto));
                return DtoVmsResultado<JsonElement?>.Mal(
                    $"El VMS respondió HTTP {(int)resp.StatusCode}. {PistaHttp((int)resp.StatusCode)}");
            }

            try
            {
                using var doc = JsonDocument.Parse(texto);
                var raiz = doc.RootElement.Clone();
                var code = Texto(raiz, "code") ?? "";
                if (code != "0")
                {
                    var msg = Texto(raiz, "msg") ?? "sin detalle";
                    _logger.LogWarning("HikCentral {Ruta} devolvió code={Code} msg={Msg}", ruta, code, msg);
                    return DtoVmsResultado<JsonElement?>.Mal($"El VMS rechazó la petición (code {code}): {msg}.");
                }

                return DtoVmsResultado<JsonElement?>.Bien(
                    raiz.TryGetProperty("data", out var data) ? data : default);
            }
            catch (JsonException)
            {
                _logger.LogWarning("HikCentral {Ruta} devolvió algo que no es JSON: {Cuerpo}", ruta, Recortar(texto));
                return DtoVmsResultado<JsonElement?>.Mal(
                    "La respuesta del VMS no es JSON. ¿La URL apunta al gateway de la OpenAPI (/artemis)?");
            }
        }

        /// <summary>Nombre del HttpClient con nombre; ver el registro en Program.cs.</summary>
        public const string NombreCliente = "hikcentral";

        /// <summary>
        /// El Content-Type exacto que se envía Y se firma. Tiene que ser una
        /// sola constante: si los dos valores se separan, vuelven a poder
        /// diferir y el gateway responde 401 sin decir por qué.
        /// </summary>
        private const string ContentType = "application/json;charset=UTF-8";

        // ── Ayudas ───────────────────────────────────────────────────────────

        private static string PistaHttp(int codigo) => codigo switch
        {
            401 => "Credenciales rechazadas: revise App Key y App Secret, y que el Partner siga vigente.",
            403 => "El Partner no tiene habilitada esta API, o el usuario vinculado no tiene permiso sobre las cámaras.",
            404 => "Ruta no encontrada: revise que la OpenAPI esté habilitada y que la URL sea la del gateway.",
            _   => "Revise el log del HikCentral para el detalle.",
        };

        private static string Recortar(string s) => s.Length <= 400 ? s : s[..400] + "…";

        private static string? Texto(JsonElement e, string prop) =>
            e.ValueKind == JsonValueKind.Object && e.TryGetProperty(prop, out var v)
                ? v.ValueKind switch
                {
                    JsonValueKind.String => v.GetString(),
                    JsonValueKind.Null   => null,
                    _                    => v.ToString(),
                }
                : null;

        private static int Entero(JsonElement e, string prop, int porDefecto = 0)
        {
            if (e.ValueKind != JsonValueKind.Object || !e.TryGetProperty(prop, out var v)) return porDefecto;
            return v.ValueKind switch
            {
                JsonValueKind.Number => v.TryGetInt32(out var n) ? n : porDefecto,
                JsonValueKind.String => int.TryParse(v.GetString(), out var s) ? s : porDefecto,
                _                    => porDefecto,
            };
        }
    }
}
