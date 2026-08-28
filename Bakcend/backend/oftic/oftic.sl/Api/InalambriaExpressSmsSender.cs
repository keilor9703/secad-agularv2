using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using Servicios.ApiInterfaz;

namespace Servicios.Api
{
    /// <summary>
    /// Envío de SMS vía Inalambria Express (https://api.inalambria.express/v1) —
    /// endpoint POST /messages/send. Se usa siempre en modo síncrono
    /// (async:false) para obtener confirmación inmediata de envío, igual que
    /// el resto de la app espera de IProveedorSms — el modo síncrono está
    /// limitado a 30 solicitudes/minuto según la documentación de la API, lo
    /// cual sobra para el volumen de esta app (unos pocos SMS de enlace de
    /// videollamada por vez, no campañas masivas).
    /// </summary>
    public class InalambriaExpressSmsSender : IInalambriaExpressSmsSender
    {
        private const string BaseUrlPorDefecto = "https://api.inalambria.express/v1";

        private static readonly JsonSerializerOptions JsonOpts = new()
        {
            PropertyNamingPolicy   = JsonNamingPolicy.CamelCase,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
        };

        private readonly HttpClient _http;
        private readonly ILogger<InalambriaExpressSmsSender> _logger;

        public InalambriaExpressSmsSender(HttpClient http, ILogger<InalambriaExpressSmsSender> logger)
        {
            _http   = http;
            _logger = logger;
        }

        public async Task<bool> EnviarAsync(string baseUrl, string apiKey, string numero, string mensaje, CancellationToken ct = default)
        {
            if (string.IsNullOrWhiteSpace(apiKey))
            {
                _logger.LogWarning("Inalambria Express no configurado (ApiKey) — SMS NO enviado. Destino={Numero}", numero);
                return false;
            }

            var destino = NormalizarNumeroE164(numero);
            if (destino is null)
            {
                _logger.LogWarning("Número de destino inválido para SMS: {Numero}", numero);
                return false;
            }

            var host = string.IsNullOrWhiteSpace(baseUrl) ? BaseUrlPorDefecto : baseUrl.TrimEnd('/');
            var body = new InalambriaRequest
            {
                Content    = mensaje,
                Recipients = new[] { destino },
                Async      = false
            };

            try
            {
                using var req = new HttpRequestMessage(HttpMethod.Post, $"{host}/messages/send");
                req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
                req.Content = new StringContent(JsonSerializer.Serialize(body, JsonOpts), Encoding.UTF8, "application/json");

                using var resp = await _http.SendAsync(req, ct);
                var respBody = await resp.Content.ReadAsStringAsync(ct);

                if (!resp.IsSuccessStatusCode)
                {
                    _logger.LogWarning("Inalambria Express SMS falló ({Status}) para {Numero}: {Body}", resp.StatusCode, destino, respBody);
                    return false;
                }

                _logger.LogInformation("Inalambria Express SMS enviado a {Numero}. Respuesta: {Body}", destino, respBody);
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error llamando a Inalambria Express SMS, destino={Numero}", destino);
                return false;
            }
        }

        /// <summary>Formato E.164 con '+' (requerido por Inalambria Express). Asume Colombia (+57) para celulares nacionales de 10 dígitos.</summary>
        private static string? NormalizarNumeroE164(string numero)
        {
            var digitos = new string((numero ?? "").Where(char.IsDigit).ToArray());
            if (digitos.Length == 10 && digitos.StartsWith('3'))
                return "+57" + digitos;
            if (digitos.Length == 12 && digitos.StartsWith("57"))
                return "+" + digitos;
            if ((numero ?? "").TrimStart().StartsWith('+'))
                return "+" + digitos;
            return digitos.Length >= 8 ? "+" + digitos : null;
        }

        private sealed class InalambriaRequest
        {
            public string   Content    { get; init; } = "";
            public string[] Recipients { get; init; } = Array.Empty<string>();
            public bool     Async      { get; init; }
        }
    }
}
