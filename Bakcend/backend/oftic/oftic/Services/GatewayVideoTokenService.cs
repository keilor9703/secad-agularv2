using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace Api.Services
{
    /// <summary>
    /// Token que autoriza a ver UNA cámara por el gateway de medios del nodo
    /// edge, durante un rato corto.
    ///
    /// ── Por qué hace falta ──────────────────────────────────────────────────
    /// El gateway (MediaMTX) publica el video por WebRTC en la red de la sede.
    /// Sin autorización, cualquiera que alcance ese puerto podría ver cualquier
    /// cámara registrada: el control de acceso que SECAD hace en
    /// ObtenerStreamAsync —la cámara tiene que ser de este CAD, estar operativa,
    /// y quedar auditada— se saltaría por completo.
    ///
    /// MediaMTX puede delegar la autorización por HTTP: por cada lectura
    /// pregunta a una URL. Ese es el mecanismo que usamos, y la URL es de SECAD.
    /// Así las reglas siguen viviendo donde ya están, y la lectura del video
    /// también queda auditada.
    ///
    /// El token va firmado y lleva la ruta, el usuario y la caducidad. Es
    /// autocontenido y no se guarda: igual que VideoSessionTokenService, la
    /// validez la da la firma. Corto a propósito —minutos—, porque a diferencia
    /// de la URL que entrega HikCentral, que no caduca nunca, esta sí tiene que
    /// caducar.
    /// </summary>
    public class GatewayVideoTokenService
    {
        private readonly SymmetricSecurityKey _key;
        private readonly int _minutos;
        private const string Issuer   = "secad.gateway.video";
        private const string Audience = "secad.gateway.video";

        public GatewayVideoTokenService(IConfiguration cfg)
        {
            var clave = cfg["Jwt:GatewayVideoKey"]
                     ?? cfg["Jwt:Key"]
                     ?? throw new InvalidOperationException("Jwt:Key no configurada.");
            if (clave.Length < 32) clave = clave.PadRight(32, '#');

            _key     = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(clave));
            // 30 minutos por defecto: suficiente para un turno de observación de
            // una cámara sin que el token sirva al día siguiente. El visor pide
            // uno nuevo cada vez que se abre la cámara.
            _minutos = int.TryParse(cfg["Vms:GatewayTokenMinutos"], out var m) ? m : 30;
        }

        public record Datos(
            string Ruta, string CamaraCodigo, string Usuario, int SitioGraba, string CodDane);

        public string Crear(Datos d)
        {
            var jwt = new JwtSecurityToken(
                issuer:   Issuer,
                audience: Audience,
                claims: new[]
                {
                    new Claim("ruta",        d.Ruta),
                    new Claim("camara",      d.CamaraCodigo),
                    new Claim("usuario",     d.Usuario),
                    // El CAD va DENTRO del token porque quien presenta el token
                    // —el gateway— no está autenticado: una cabecera con el CAD
                    // la pondría él, y entonces no valdría nada.
                    new Claim("cod_dane",    d.CodDane),
                    new Claim("sitio_graba", d.SitioGraba.ToString()),
                },
                expires:            DateTime.UtcNow.AddMinutes(_minutos),
                signingCredentials: new SigningCredentials(_key, SecurityAlgorithms.HmacSha256));

            return new JwtSecurityTokenHandler().WriteToken(jwt);
        }

        /// <summary>
        /// Valida el token y devuelve lo que lleva dentro, o null si no sirve.
        /// </summary>
        public Datos? Validar(string? token)
        {
            if (string.IsNullOrWhiteSpace(token)) return null;

            // El gateway puede mandarlo tal cual o con el prefijo Bearer, según
            // por dónde lo reciba del navegador. Se aceptan las dos formas.
            token = token.Trim();
            if (token.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
                token = token[7..].Trim();

            try
            {
                var principal = new JwtSecurityTokenHandler().ValidateToken(token,
                    new TokenValidationParameters
                    {
                        ValidateIssuer           = true,
                        ValidIssuer              = Issuer,
                        ValidateAudience         = true,
                        ValidAudience            = Audience,
                        ValidateIssuerSigningKey = true,
                        IssuerSigningKey         = _key,
                        ValidateLifetime         = true,
                        ClockSkew                = TimeSpan.FromSeconds(30),
                    }, out _);

                var ruta    = principal.FindFirst("ruta")?.Value;
                var camara  = principal.FindFirst("camara")?.Value;
                var usuario = principal.FindFirst("usuario")?.Value;
                if (string.IsNullOrWhiteSpace(ruta) || string.IsNullOrWhiteSpace(usuario))
                    return null;

                _ = int.TryParse(principal.FindFirst("sitio_graba")?.Value, out var sg);
                return new Datos(ruta, camara ?? "", usuario, sg,
                                 principal.FindFirst("cod_dane")?.Value ?? "");
            }
            catch
            {
                // Firma mala, caducado, emisor distinto: todo es «no».
                return null;
            }
        }
    }
}
