using Comun.Dtos.Auth;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Servicios.ApiInterfaz;
using Microsoft.Extensions.Logging;

namespace Servicios.Api
{
    public class ApiWebOud : IApiWebOud
    {
        private readonly HttpClient _http;
        private readonly IConfiguration _cfg;
        private readonly ILogger<ApiWebOud> _logger;

        public ApiWebOud(HttpClient http, IConfiguration cfg, ILogger<ApiWebOud> logger)
        {
            _http = http;
            _cfg = cfg;
            _logger = logger;
        }

        public async Task<string> ConsultarFuncionarioAsync(string identificacion, CancellationToken ct)
        {
            var baseUrl = _cfg["ApiSettings:ConsultaFuncionarios"]!;
            var url = $"{baseUrl}{Uri.EscapeDataString(identificacion)}";

            using var resp = await _http.GetAsync(url, ct);
            resp.EnsureSuccessStatusCode();
            return await resp.Content.ReadAsStringAsync(ct);
        }

        public async Task<bool> ValidarCredencialesAsync(string usuario, string contrasena, CancellationToken ct)
        {
            var result = await ValidarYObtenerDatosAsync(usuario, contrasena, ct);
            return result.Success;
        }

        public async Task<DtoOudResult> ValidarYObtenerDatosAsync(string usuario, string contrasena, CancellationToken ct)
        {
            var url = _cfg["ApiSettings:OudLogin"]?.Trim();
            if (string.IsNullOrWhiteSpace(url))
            {
                _logger.LogWarning("ApiSettings:OudLogin no configurado.");
                return new DtoOudResult { Success = false };
            }

            var normalizedUser = usuario?.Trim().ToLowerInvariant() ?? string.Empty;
            var payload = new { Usuario = normalizedUser, Contrasena = contrasena ?? string.Empty };
            var json = JsonSerializer.Serialize(payload);

            try
            {
                using var content = new StringContent(json, Encoding.UTF8, "application/json");
                using var resp = await _http.PostAsync(url, content, ct);
                var body = await resp.Content.ReadAsStringAsync(ct);

                if (!resp.IsSuccessStatusCode)
                {
                    _logger.LogWarning("OUD login failed: {Status}. Body: {Body}", resp.StatusCode, body);
                    return new DtoOudResult { Success = false };
                }

                return ParseOudResponse(body);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error llamando OUD login para {Usuario}", normalizedUser);
                return new DtoOudResult { Success = false };
            }
        }

        private DtoOudResult ParseOudResponse(string body)
        {
            if (string.IsNullOrWhiteSpace(body))
                return new DtoOudResult { Success = false };

            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;

                if (!TryGetProp(root, "estado", out var estadoEl) || estadoEl.ValueKind != JsonValueKind.True)
                    return new DtoOudResult { Success = false };

                if (!TryGetProp(root, "respuesta", out var respEl))
                    return new DtoOudResult { Success = false };

                // OUD returns respuesta=true (simple) or respuesta=[{...user attrs...}]
                if (respEl.ValueKind == JsonValueKind.True)
                    return new DtoOudResult { Success = true };

                if (respEl.ValueKind == JsonValueKind.Array && respEl.GetArrayLength() > 0)
                {
                    var first = respEl[0];
                    return new DtoOudResult
                    {
                        Success = true,
                        Uid = GetStr(first, "uid"),
                        SiglaLaborando = GetStr(first, "siglaLaborando") ?? GetStr(first, "siglalaborando"),
                        UndeLaborandoCodigo = GetStr(first, "undeLaborandoCodigo") ?? GetStr(first, "undelaborandocodigo"),
                        Identificacion = GetStr(first, "identificacion") ?? GetStr(first, "cedula"),
                        Nombres = GetStr(first, "nombres") ?? GetStr(first, "nombre"),
                        Apellidos = GetStr(first, "apellidos") ?? GetStr(first, "apellido"),
                        Correo = GetStr(first, "correo") ?? GetStr(first, "email")
                    };
                }

                if (respEl.ValueKind == JsonValueKind.String &&
                    bool.TryParse(respEl.GetString(), out var asBool) && asBool)
                    return new DtoOudResult { Success = true };

                return new DtoOudResult { Success = false };
            }
            catch (JsonException ex)
            {
                _logger.LogWarning(ex, "Error parseando respuesta OUD: {Body}", body);
                return new DtoOudResult { Success = false };
            }
        }

        private static bool TryGetProp(JsonElement element, string name, out JsonElement value)
        {
            if (element.TryGetProperty(name, out value))
                return true;

            foreach (var prop in element.EnumerateObject())
            {
                if (string.Equals(prop.Name, name, StringComparison.OrdinalIgnoreCase))
                {
                    value = prop.Value;
                    return true;
                }
            }

            value = default;
            return false;
        }

        private static string? GetStr(JsonElement element, string name)
        {
            if (!TryGetProp(element, name, out var val))
                return null;
            if (val.ValueKind == JsonValueKind.String)
            {
                var s = val.GetString()?.Trim();
                return string.IsNullOrEmpty(s) ? null : s;
            }
            return null;
        }
    }
}
