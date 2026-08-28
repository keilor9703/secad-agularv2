using Comun.Dtos;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using Servicios.ApiInterfaz;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace Api.Controllers
{
    [ApiController]
    [Route("api/auth-test")]
    [AllowAnonymous]
    public class AuthTestController : ControllerBase
    {
        private readonly ITokenProvider _tokenProvider;
        private readonly IMemoryCache _cache;
        private readonly ILogger<AuthTestController> _logger;

        public AuthTestController(
            ITokenProvider tokenProvider,
            IMemoryCache cache,
            ILogger<AuthTestController> logger)
        {
            _tokenProvider = tokenProvider;
            _cache = cache;
            _logger = logger;
        }

        /// <summary>
        /// Obtiene token de la API externa (con caché)
        /// </summary>
        [HttpGet("token")]
        public async Task<IActionResult> GetToken(CancellationToken ct)
        {
            try
            {
                _logger.LogInformation("Solicitando token...");

                var token = await _tokenProvider.GetTokenAsync(ct);

                _logger.LogInformation("Token obtenido exitosamente");

                return Ok(new
                {
                    Success = true,
                    Token = token,
                    TokenPreview = $"{token.Substring(0, Math.Min(20, token.Length))}...",
                    ExpiresAt = _cache.Get("oud_token_expiry")
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener token");
                return StatusCode(500, new
                {
                    Success = false,
                    Error = ex.Message,
                    Type = ex.GetType().Name
                });
            }
        }

        /// <summary>
        /// Verifica si hay token en caché
        /// </summary>
        [HttpGet("cache-status")]
        public IActionResult GetCacheStatus()
        {
            var hasToken = _cache.TryGetValue("oud_token", out string token);

            return Ok(new
            {
                HasTokenInCache = hasToken,
                TokenPreview = hasToken ? $"{token.Substring(0, Math.Min(20, token.Length))}..." : null,
                CacheKeys = _cache.GetType().GetProperties()
                    .Select(p => p.Name)
                    .ToList()
            });
        }

        /// <summary>
        /// Limpia el caché de token
        /// </summary>
        [HttpDelete("cache")]
        public IActionResult ClearCache()
        {
            _cache.Remove("oud_token");
            _logger.LogInformation("Caché de token limpiado");

            return Ok(new { Message = "Caché limpiado" });
        }
    }
}
