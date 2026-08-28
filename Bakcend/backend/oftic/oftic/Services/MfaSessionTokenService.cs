using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;

namespace Api.Services
{
    /// <summary>
    /// Genera y valida tokens de sesión MFA de corta vida.
    ///
    /// Propósito:
    ///   Después de validar credenciales (OUD/local) pero ANTES de emitir el JWT real,
    ///   se emite un MfaSessionToken que contiene todos los datos del usuario necesarios
    ///   para construir el JWT final una vez completado el segundo factor.
    ///
    ///   Esto previene que un usuario pueda llamar directamente a /MfaVerify o /MfaEnrollConfirm
    ///   sin haber pasado primero por la validación de credenciales.
    ///
    /// Vida útil: 5 minutos (configurable via Jwt:MfaSessionMinutes).
    /// Firma: clave diferente a la del JWT real (Jwt:MfaSessionKey).
    /// </summary>
    public class MfaSessionTokenService
    {
        private readonly SymmetricSecurityKey _key;
        private readonly int                  _minutes;
        private const string Issuer   = "secad.mfa.session";
        private const string Audience = "secad.mfa.session";

        public MfaSessionTokenService(IConfiguration cfg)
        {
            var rawKey = cfg["Jwt:MfaSessionKey"]
                      ?? cfg["Jwt:Key"]   // fallback a la clave principal si no hay clave MFA específica
                      ?? throw new InvalidOperationException("Jwt:Key no configurada.");

            // Asegurar longitud mínima para HS256
            if (rawKey.Length < 32) rawKey = rawKey.PadRight(32, '#');

            _key     = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(rawKey));
            _minutes = int.TryParse(cfg["Jwt:MfaSessionMinutes"], out var m) ? m : 5;
        }

        // ── Datos encapsulados en el token ────────────────────────────────────

        public record MfaSessionData(
            long         IdUsuario,
            string       Usuario,
            string       CodDane,
            string       HomeCodDane,
            string       NombreCad,
            long         Identificacion,   // cedula como long (OUD) o idUsuario (fallback)
            int          SitioGraba,
            int          Acd,
            int          FuerzaId,
            int          CanalCodigo,
            string       RolesJson,        // JSON array de longs
            string       Ip,
            string       IdentificacionStr = "" // cédula real de ctr_usuarios (VARCHAR)
        );

        // ── Crear token ───────────────────────────────────────────────────────

        public string CreateToken(MfaSessionData d)
        {
            var claims = new[]
            {
                new Claim("id_usuario",     d.IdUsuario.ToString()),
                new Claim("usuario",        d.Usuario),
                new Claim("cod_dane",       d.CodDane),
                new Claim("home_cod_dane",  d.HomeCodDane),
                new Claim("nombre_cad",     d.NombreCad),
                new Claim("identificacion", d.Identificacion.ToString()),
                new Claim("sitio_graba",    d.SitioGraba.ToString()),
                new Claim("acd",            d.Acd.ToString()),
                new Claim("fuerza_id",      d.FuerzaId.ToString()),
                new Claim("canal_codigo",   d.CanalCodigo.ToString()),
                new Claim("roles_json",        d.RolesJson),
                new Claim("ip",                d.Ip),
                new Claim("identificacion_str", d.IdentificacionStr ?? ""),
            };

            var jwt = new JwtSecurityToken(
                issuer:             Issuer,
                audience:           Audience,
                claims:             claims,
                expires:            DateTime.UtcNow.AddMinutes(_minutes),
                signingCredentials: new SigningCredentials(_key, SecurityAlgorithms.HmacSha256)
            );

            return new JwtSecurityTokenHandler().WriteToken(jwt);
        }

        // ── Validar y leer token ──────────────────────────────────────────────

        public MfaSessionData? ValidateToken(string token)
        {
            if (string.IsNullOrWhiteSpace(token)) return null;

            try
            {
                var handler = new JwtSecurityTokenHandler();
                var principal = handler.ValidateToken(token, new TokenValidationParameters
                {
                    ValidateIssuer           = true,
                    ValidateAudience         = true,
                    ValidateLifetime         = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer              = Issuer,
                    ValidAudience            = Audience,
                    IssuerSigningKey         = _key,
                    ClockSkew                = TimeSpan.FromSeconds(30)
                }, out _);

                string G(string n) => principal.FindFirstValue(n) ?? "";
                long   L(string n) => long.TryParse(G(n), out var v) ? v : 0;
                int    I(string n) => int.TryParse(G(n), out var v) ? v : 0;

                return new MfaSessionData(
                    IdUsuario:         L("id_usuario"),
                    Usuario:           G("usuario"),
                    CodDane:           G("cod_dane"),
                    HomeCodDane:       G("home_cod_dane"),
                    NombreCad:         G("nombre_cad"),
                    Identificacion:    L("identificacion"),
                    SitioGraba:        I("sitio_graba"),
                    Acd:               I("acd"),
                    FuerzaId:          I("fuerza_id"),
                    CanalCodigo:       I("canal_codigo"),
                    RolesJson:         G("roles_json"),
                    Ip:                G("ip"),
                    IdentificacionStr: G("identificacion_str")
                );
            }
            catch
            {
                return null;
            }
        }
    }
}
