using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Servicios.ApiInterfaz;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Servicios.Api
{
    /// <summary>
    /// Cliente HTTP para el Api2FA centralizado de la Policía Nacional.
    ///
    /// Autenticación de sistema:
    ///   1. Genera firma HMAC-SHA256 del canonical: usuario|identificacion|sistema|fechaUtc|nonce
    ///   2. Llama POST /api/Token/TokenSistema → JWT de sistema (vida: 5 min, cacheado 4 min)
    ///   3. Reutiliza el JWT en todas las llamadas a /api/ApiMfa/*
    ///
    /// Uso de DTOs tipados con PropertyNameCaseInsensitive=true para no depender
    /// del casing exacto (PascalCase o camelCase) del Api2FA.
    /// </summary>
    public class MfaCentralService : IMfaCentralService
    {
        private readonly HttpClient              _http;
        private readonly IMemoryCache            _cache;
        private readonly IConfiguration          _cfg;
        private readonly ILogger<MfaCentralService> _log;

        private readonly string _baseUrl;
        private readonly string _sistema;
        private readonly string _hmacSecret;

        // ── Opciones JSON: acepta PascalCase, camelCase o cualquier combinación ─
        private static readonly JsonSerializerOptions _jOpts = new()
        {
            PropertyNameCaseInsensitive = true,
            DefaultIgnoreCondition      = JsonIgnoreCondition.WhenWritingNull
        };

        // ── DTOs internos para deserializar respuestas de Api2FA ─────────────────
        // No se exponen fuera del servicio.

        private class Resp<T>
        {
            public int     CodigoExito { get; set; }
            public int     CodigoError { get; set; }
            public string  Mensaje     { get; set; } = "";
            public T?      Data        { get; set; }
        }

        private class TokenData        { public string? Data  { get; set; } }   // /api/Token/TokenSistema
        private class StateData
        {
            public int       MfaHabilitado    { get; set; }
            public int       RequireReenroll  { get; set; }
            public int       IntentosFallidos { get; set; }
            public DateTime? BloqueoHasta     { get; set; }
        }
        private class EnrollData
        {
            public string? QrBase64    { get; set; }
            public string? ManualKey   { get; set; }
            public string? EnrollToken { get; set; }
        }
        private class VerifyData
        {
            public bool      Ok          { get; set; }
            public DateTime? BloqueoHasta{ get; set; }
        }
        private class ResetConfirmData  { public DateTime? AvailableAt { get; set; } }
        private class IntData           { public int Data { get; set; } }

        public MfaCentralService(
            HttpClient http,
            IMemoryCache cache,
            IConfiguration cfg,
            ILogger<MfaCentralService> log)
        {
            _http       = http;
            _cache      = cache;
            _cfg        = cfg;
            _log        = log;
            _baseUrl    = cfg["Mfa:ApiBaseUrl"]?.TrimEnd('/') ?? "http://localhost:5100";
            _sistema    = cfg["Mfa:Sistema"]    ?? "SECAD";
            _hmacSecret = cfg["Mfa:HmacSecret"] ?? throw new InvalidOperationException("Mfa:HmacSecret no configurado.");
        }

        // ════════════════════════════════════════════════════════════════════════
        // Bearer token de sistema  (cacheado 4 min — Api2FA emite tokens de 5 min)
        // ════════════════════════════════════════════════════════════════════════

        private async Task<string?> GetBearerAsync(long identificacion, string usuario, CancellationToken ct)
        {
            var cacheKey = $"MFA_BEARER::{_sistema}::{identificacion}::{usuario.Trim().ToUpperInvariant()}";
            if (_cache.TryGetValue(cacheKey, out string? cached) && !string.IsNullOrWhiteSpace(cached))
                return cached;

            var fechaUtc  = DateTimeOffset.UtcNow;
            var nonce     = Guid.NewGuid().ToString("N");
            var canonical = $"{usuario.Trim()}|{identificacion}|{_sistema}|{fechaUtc:O}|{nonce}";
            var sig       = ComputeHmacSha256Hex(_hmacSecret, canonical);

            var reqBody = new
            {
                Usuario        = usuario.Trim(),
                Identificacion = identificacion,
                Sistema        = _sistema,
                FechaUtc       = fechaUtc,
                Nonce          = nonce,
                Signature      = sig
            };

            using var httpResp = await _http.PostAsync(
                $"{_baseUrl}/api/Token/TokenSistema",
                Json(reqBody), ct);

            if (!httpResp.IsSuccessStatusCode) return null;

            // La respuesta del TokenSistema tiene la forma { CodigoExito:1, Data:"<jwt>" }
            // Usamos deserialización con PropertyNameCaseInsensitive para tolerar cualquier casing
            var body = await httpResp.Content.ReadAsStringAsync(ct);
            var resp = JsonSerializer.Deserialize<Resp<string>>(body, _jOpts);

            if (resp?.CodigoExito != 1 || string.IsNullOrWhiteSpace(resp.Data)) return null;

            _cache.Set(cacheKey, resp.Data, TimeSpan.FromMinutes(4));
            return resp.Data;
        }

        // ════════════════════════════════════════════════════════════════════════
        // Helpers HTTP — devuelven string? (body crudo) para deserializar con _jOpts
        // ════════════════════════════════════════════════════════════════════════

        private async Task<string?> GetRawAsync(string url, long id, string u, CancellationToken ct)
        {
            var bearer = await GetBearerAsync(id, u, ct);
            if (bearer is null) return null;

            using var req = new HttpRequestMessage(HttpMethod.Get, url);
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearer);
            using var resp = await _http.SendAsync(req, ct);
            if (!resp.IsSuccessStatusCode) return null;
            return await resp.Content.ReadAsStringAsync(ct);
        }

        private async Task<string?> PostRawAsync(string url, object body, long id, string u, CancellationToken ct)
        {
            var bearer = await GetBearerAsync(id, u, ct);
            if (bearer is null) return null;

            using var req = new HttpRequestMessage(HttpMethod.Post, url) { Content = Json(body) };
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearer);
            using var resp = await _http.SendAsync(req, ct);
            if (!resp.IsSuccessStatusCode) return null;
            return await resp.Content.ReadAsStringAsync(ct);
        }

        private static StringContent Json(object o) =>
            new(JsonSerializer.Serialize(o, _jOpts), Encoding.UTF8, "application/json");

        private static bool IsDown(Exception ex)
            => ex is HttpRequestException || ex is TaskCanceledException
            || (ex.InnerException is not null && IsDown(ex.InnerException));

        // ════════════════════════════════════════════════════════════════════════
        // Métodos de negocio — todos deserializan con _jOpts (case-insensitive)
        // ════════════════════════════════════════════════════════════════════════

        public async Task<MfaStateResult> GetStateAsync(long identificacion, string usuario, CancellationToken ct = default)
        {
            try
            {
                var url  = $"{_baseUrl}/api/ApiMfa/State?identificacion={identificacion}&usuario={Uri.EscapeDataString(usuario)}";
                var body = await GetRawAsync(url, identificacion, usuario, ct);

                if (body is null)
                    return new MfaStateResult { ServiceDown = true, Mensaje = "Servicio 2FA no disponible." };

                var resp = JsonSerializer.Deserialize<Resp<StateData>>(body, _jOpts);
                if (resp is null)
                    return new MfaStateResult { ServiceDown = true, Mensaje = "Respuesta inválida del servicio 2FA." };

                if (resp.CodigoExito != 1)
                    return new MfaStateResult { Ok = false, Mensaje = resp.Mensaje };

                var d = resp.Data ?? new StateData();
                return new MfaStateResult
                {
                    Ok               = true,
                    MfaHabilitado    = d.MfaHabilitado,
                    RequireReenroll  = d.RequireReenroll,
                    IntentosFallidos = d.IntentosFallidos,
                    BloqueoHasta     = d.BloqueoHasta,
                    Mensaje          = resp.Mensaje
                };
            }
            catch (Exception ex) when (IsDown(ex))
            {
                _log.LogWarning(ex, "[MFA] Servicio caído al consultar State");
                return new MfaStateResult { ServiceDown = true, Mensaje = "Servicio 2FA no disponible." };
            }
        }

        public async Task<MfaEnrollResult> EnrollStartAsync(long identificacion, string usuario, CancellationToken ct = default)
        {
            try
            {
                var body = await PostRawAsync(
                    $"{_baseUrl}/api/ApiMfa/EnrollStart",
                    new { Identificacion = identificacion, Usuario = usuario },
                    identificacion, usuario, ct);

                if (body is null) return new MfaEnrollResult { ServiceDown = true, Mensaje = "Servicio 2FA no disponible." };

                var resp = JsonSerializer.Deserialize<Resp<EnrollData>>(body, _jOpts);
                if (resp is null) return new MfaEnrollResult { ServiceDown = true, Mensaje = "Respuesta inválida del servicio 2FA." };

                if (resp.CodigoExito != 1)
                    return new MfaEnrollResult { Mensaje = resp.Mensaje };

                var d = resp.Data ?? new EnrollData();
                return new MfaEnrollResult
                {
                    Ok          = true,
                    QrBase64    = d.QrBase64,
                    ManualKey   = d.ManualKey,
                    EnrollToken = d.EnrollToken,
                    Mensaje     = resp.Mensaje
                };
            }
            catch (Exception ex) when (IsDown(ex))
            {
                _log.LogWarning(ex, "[MFA] Servicio caído en EnrollStart");
                return new MfaEnrollResult { ServiceDown = true, Mensaje = "Servicio 2FA no disponible." };
            }
        }

        public async Task<MfaVerifyResult> EnrollConfirmAsync(long identificacion, string usuario, string enrollToken, string code, string ip, CancellationToken ct = default)
        {
            try
            {
                var body = await PostRawAsync(
                    $"{_baseUrl}/api/ApiMfa/EnrollConfirm",
                    new { Identificacion = identificacion, Usuario = usuario, EnrollToken = enrollToken, Code = code, IpMaquina = ip },
                    identificacion, usuario, ct);

                return ParseVerifyResult(body);
            }
            catch (Exception ex) when (IsDown(ex))
            {
                _log.LogWarning(ex, "[MFA] Servicio caído en EnrollConfirm");
                return new MfaVerifyResult { ServiceDown = true, Mensaje = "Servicio 2FA no disponible." };
            }
        }

        public async Task<MfaVerifyResult> VerifyAsync(long identificacion, string usuario, string code, bool rememberDevice, string? deviceId, string ip, CancellationToken ct = default)
        {
            try
            {
                var body = await PostRawAsync(
                    $"{_baseUrl}/api/ApiMfa/Verify",
                    new { Identificacion = identificacion, Usuario = usuario, Code = code, RememberDevice = rememberDevice, DeviceId = deviceId, IpMaquina = ip },
                    identificacion, usuario, ct);

                return ParseVerifyResult(body);
            }
            catch (Exception ex) when (IsDown(ex))
            {
                _log.LogWarning(ex, "[MFA] Servicio caído en Verify");
                return new MfaVerifyResult { ServiceDown = true, Mensaje = "Servicio 2FA no disponible." };
            }
        }

        public async Task<bool> IsTrustedAsync(long identificacion, string usuario, string deviceId, CancellationToken ct = default)
        {
            try
            {
                var url  = $"{_baseUrl}/api/ApiMfa/IsTrusted?identificacion={identificacion}&usuario={Uri.EscapeDataString(usuario)}&deviceId={Uri.EscapeDataString(deviceId)}";
                var body = await GetRawAsync(url, identificacion, usuario, ct);
                if (body is null) return false;

                var resp = JsonSerializer.Deserialize<Resp<int>>(body, _jOpts);
                return resp?.CodigoExito == 1 && resp.Data == 1;
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "[MFA] Error en IsTrusted");
                return false;
            }
        }

        public async Task<MfaResetRequestResult> ResetRequestAsync(long identificacion, string usuario, string ip, CancellationToken ct = default)
        {
            try
            {
                var body = await PostRawAsync(
                    $"{_baseUrl}/api/ApiMfa/ResetRequest",
                    new { Identificacion = identificacion, Usuario = usuario, IpMaquina = ip, Sistema = _sistema },
                    identificacion, usuario, ct);

                if (body is null) return new MfaResetRequestResult { ServiceDown = true, Mensaje = "Servicio 2FA no disponible." };

                var resp = JsonSerializer.Deserialize<Resp<int>>(body, _jOpts);
                return new MfaResetRequestResult
                {
                    Ok      = resp?.CodigoExito == 1,
                    Mensaje = resp?.Mensaje ?? ""
                };
            }
            catch (Exception ex) when (IsDown(ex))
            {
                _log.LogWarning(ex, "[MFA] Servicio caído en ResetRequest");
                return new MfaResetRequestResult { ServiceDown = true, Mensaje = "Servicio 2FA no disponible." };
            }
        }

        public async Task<MfaResetConfirmResult> ResetConfirmAsync(long identificacion, string usuario, string code, string ip, CancellationToken ct = default)
        {
            try
            {
                var body = await PostRawAsync(
                    $"{_baseUrl}/api/ApiMfa/ResetConfirm",
                    new { Identificacion = identificacion, Usuario = usuario, Code = code, IpMaquina = ip, Sistema = _sistema },
                    identificacion, usuario, ct);

                if (body is null) return new MfaResetConfirmResult { ServiceDown = true, Mensaje = "Servicio 2FA no disponible." };

                var resp = JsonSerializer.Deserialize<Resp<ResetConfirmData>>(body, _jOpts);
                return new MfaResetConfirmResult
                {
                    Ok          = resp?.CodigoExito == 1,
                    Mensaje     = resp?.Mensaje ?? "",
                    AvailableAt = resp?.Data?.AvailableAt
                };
            }
            catch (Exception ex) when (IsDown(ex))
            {
                _log.LogWarning(ex, "[MFA] Servicio caído en ResetConfirm");
                return new MfaResetConfirmResult { ServiceDown = true, Mensaje = "Servicio 2FA no disponible." };
            }
        }

        public async Task<MfaResetRequestResult> ResetExecuteAsync(long identificacion, string usuario, string ip, CancellationToken ct = default)
        {
            try
            {
                var body = await PostRawAsync(
                    $"{_baseUrl}/api/ApiMfa/ResetExecute",
                    new { Identificacion = identificacion, Usuario = usuario, IpMaquina = ip, Sistema = _sistema },
                    identificacion, usuario, ct);

                if (body is null) return new MfaResetRequestResult { ServiceDown = true, Mensaje = "Servicio 2FA no disponible." };

                var resp = JsonSerializer.Deserialize<Resp<int>>(body, _jOpts);
                return new MfaResetRequestResult
                {
                    Ok      = resp?.CodigoExito == 1,
                    Mensaje = resp?.Mensaje ?? ""
                };
            }
            catch (Exception ex) when (IsDown(ex))
            {
                _log.LogWarning(ex, "[MFA] Servicio caído en ResetExecute");
                return new MfaResetRequestResult { ServiceDown = true, Mensaje = "Servicio 2FA no disponible." };
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // Helpers privados
        // ════════════════════════════════════════════════════════════════════════

        private static MfaVerifyResult ParseVerifyResult(string? body)
        {
            if (body is null)
                return new MfaVerifyResult { ServiceDown = true, Mensaje = "Servicio 2FA no disponible." };

            var resp = JsonSerializer.Deserialize<Resp<VerifyData>>(body, _jOpts);
            if (resp is null)
                return new MfaVerifyResult { ServiceDown = true, Mensaje = "Respuesta inválida del servicio 2FA." };

            var ok         = resp.CodigoExito == 1 && (resp.Data?.Ok ?? false);
            var codigoErr  = resp.CodigoError;
            var bloqueo    = resp.Data?.BloqueoHasta;
            var blocked    = codigoErr == 9 || (bloqueo.HasValue && bloqueo.Value > DateTime.Now && !ok);

            return new MfaVerifyResult
            {
                Ok           = ok,
                Blocked      = blocked,
                BloqueoHasta = bloqueo,
                Mensaje      = resp.Mensaje,
                CodigoError  = codigoErr
            };
        }

        private static string ComputeHmacSha256Hex(string secret, string message)
        {
            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
            return Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(message)));
        }
    }
}
