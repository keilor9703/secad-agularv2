using Comun.Dtos;
using Comun.Interfaces;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Servicios.ApiInterfaz;
using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Servicios.Api
{
    /// <summary>
    /// Implementa ITokenProvider (caché de token PIP) e IPipTokenProvider
    /// (interfaz mínima accesible desde la capa de datos).
    /// </summary>
    public class TokenProvider : ITokenProvider, IPipTokenProvider
    {
        private readonly IHttpClientFactory _factory;
        private readonly IMemoryCache _cache;
        private readonly IConfiguration _cfg;
        private readonly ILogger<TokenProvider> _logger;

        public TokenProvider(
            IHttpClientFactory factory,
            IMemoryCache cache,
            IConfiguration cfg,
            ILogger<TokenProvider> logger)
        {
            _factory = factory;
            _cache = cache;
            _cfg = cfg;
            _logger = logger;
        }

        // ── IPipTokenProvider ─────────────────────────────────────────────────────
        // Expone el token cacheado al repositorio de datos sin crear dependencia
        // circular hacia Servicios desde Datos.
        public Task<string> GetPipTokenAsync(CancellationToken ct = default)
            => GetTokenAsync(ct);

        // ── ITokenProvider ────────────────────────────────────────────────────────
        public async Task<string> GetTokenAsync(CancellationToken ct = default)
        {
            if (_cache.TryGetValue("oud_token", out string token))
            {
                _logger.LogDebug("Token obtenido de caché");
                return token;
            }

            try
            {
                token = await FetchTokenAsync(ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "No fue posible obtener token técnico PIP");
                return string.Empty;
            }

            if (string.IsNullOrWhiteSpace(token))
            {
                _logger.LogWarning("Token técnico PIP vacío; no se almacena en caché");
                return string.Empty;
            }

            var cacheOptions = new MemoryCacheEntryOptions()
                .SetAbsoluteExpiration(TimeSpan.FromMinutes(25))
                .RegisterPostEvictionCallback((key, value, reason, state) =>
                {
                    _logger.LogInformation("Token expirado del caché: {Reason}", reason);
                });

            _cache.Set("oud_token", token, cacheOptions);
            _cache.Set("oud_token_expiry", DateTime.UtcNow.AddMinutes(25));

            _logger.LogInformation("Token guardado en caché por 25 minutos");

            return token;
        }

        private async Task<string> FetchTokenAsync(CancellationToken ct)
        {
            var client = _factory.CreateClient("AuthClient");

            // ✅ URL correcta desde config
            var url = _cfg["ApiSettings:PostPipToken"]?.Trim();
            var usuario = _cfg["ApiSettings:UsuarioPip"];
            var clave = _cfg["ApiSettings:ClavePip"];

            if (string.IsNullOrEmpty(url))
            {
                _logger.LogError("PostPipToken no configurado");
                return string.Empty;
            }

            _logger.LogInformation("Obteniendo token de: {Url}", url);

            var payload = new
            {
                usuario = usuario,
                clave = clave
            };

            var json = JsonSerializer.Serialize(payload);
            using var content = new StringContent(json, Encoding.UTF8, "application/json");

            using var resp = await client.PostAsync(url, content, ct);

            if (!resp.IsSuccessStatusCode)
            {
                var error = await resp.Content.ReadAsStringAsync(ct);
                _logger.LogError("Error {StatusCode}: {Error}", resp.StatusCode, error);
                return string.Empty;
            }

            var responseJson = await resp.Content.ReadAsStringAsync(ct);
            var result = JsonSerializer.Deserialize<DtoRespuesta<string>>(responseJson,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (result?.Codigo != 1 || string.IsNullOrEmpty(result.Respuesta))
            {
                _logger.LogError("Respuesta de token inválida. Codigo: {Codigo}, Mensaje: {Mensaje}", result?.Codigo, result?.Mensaje);
                return string.Empty;
            }

            _logger.LogInformation("Token obtenido exitosamente");
            return result.Respuesta!;
        }
    }
}
