using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace Api.Services
{
    /// <summary>
    /// Genera y valida el token de la videollamada — un JWT de corta vida,
    /// autocontenido, que es literalmente el "link" que se le envía al ciudadano
    /// (.../video/{token}). No se guarda en base de datos: la validez la da la
    /// firma + expiración del propio token, igual que MfaSessionTokenService.
    ///
    /// cad_video_sesiones (id decodificado del token) solo guarda estado/auditoría,
    /// nunca se consulta para decidir si el token es válido.
    ///
    /// Vida útil por defecto: 15 minutos (configurable via Jwt:VideoSessionMinutes).
    /// Firma: clave propia (Jwt:VideoSessionKey), con fallback a Jwt:Key si no está.
    /// </summary>
    public class VideoSessionTokenService
    {
        private readonly SymmetricSecurityKey _key;
        private readonly int _minutes;
        private const string Issuer   = "secad.video.session";
        private const string Audience = "secad.video.session";

        public VideoSessionTokenService(IConfiguration cfg)
        {
            var rawKey = cfg["Jwt:VideoSessionKey"]
                      ?? cfg["Jwt:Key"]
                      ?? throw new InvalidOperationException("Jwt:Key no configurada.");

            if (rawKey.Length < 32) rawKey = rawKey.PadRight(32, '#');

            _key     = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(rawKey));
            _minutes = int.TryParse(cfg["Jwt:VideoSessionMinutes"], out var m) ? m : 15;
        }

        public int DefaultMinutes => _minutes;

        // ── Datos encapsulados en el token ────────────────────────────────────

        public record VideoSessionData(
            long   SesionId,
            long   PedidoId,
            int    SitioGraba,
            string CodDane,
            string UsuarioDespachador
        );

        // ── Crear token ───────────────────────────────────────────────────────

        public string CreateToken(VideoSessionData d, DateTime fechaExpiraUtc)
        {
            var claims = new[]
            {
                new Claim("sesion_id",           d.SesionId.ToString()),
                new Claim("pedido_id",           d.PedidoId.ToString()),
                new Claim("sitio_graba",         d.SitioGraba.ToString()),
                new Claim("cod_dane",            d.CodDane),
                new Claim("usuario_despachador", d.UsuarioDespachador),
            };

            var jwt = new JwtSecurityToken(
                issuer:             Issuer,
                audience:           Audience,
                claims:             claims,
                expires:            fechaExpiraUtc,
                signingCredentials: new SigningCredentials(_key, SecurityAlgorithms.HmacSha256)
            );

            return new JwtSecurityTokenHandler().WriteToken(jwt);
        }

        // ── Validar y leer token ──────────────────────────────────────────────

        public VideoSessionData? ValidateToken(string token)
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

                return new VideoSessionData(
                    SesionId:           L("sesion_id"),
                    PedidoId:           L("pedido_id"),
                    SitioGraba:         I("sitio_graba"),
                    CodDane:            G("cod_dane"),
                    UsuarioDespachador: G("usuario_despachador")
                );
            }
            catch
            {
                return null;
            }
        }
    }
}
