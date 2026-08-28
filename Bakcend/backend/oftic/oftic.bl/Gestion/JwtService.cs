using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Negocio.Interfaz;

namespace Negocio.Gestion
{
    public class JwtService : IJwtService
    {
        private readonly IConfiguration _cfg;

        public JwtService(IConfiguration cfg)
        {
            _cfg = cfg;
        }

        public string CreateToken(long idUsuario, string usuario, List<long> roles, string codDane, string? nombreCad,
                                  int sitioGraba = 0, int acd = 0, int fuerzaId = 0, int canalId = 0,
                                  string? homeCodDane = null, string? identificacion = null)
        {
            var issuer   = _cfg["Jwt:Issuer"]   ?? "oftic.api";
            var audience = _cfg["Jwt:Audience"] ?? issuer;
            var key      = _cfg["Jwt:Key"]!;
            var minutes  = int.Parse(_cfg["Jwt:Minutes"] ?? "480");

            // Admin si tiene id_rol=1 (Administrador) o id_rol=2 (SuperAdministrador)
            // o su ID está en Menu:SuperUserIds del appsettings.
            var superUserIds = (_cfg["Menu:SuperUserIds"] ?? "")
                .Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(s => long.TryParse(s.Trim(), out var v) ? v : -1L)
                .ToHashSet();

            bool esSuperAdmin = roles.Contains(2L) || superUserIds.Contains(idUsuario);
            bool esAdmin      = esSuperAdmin || roles.Contains(1L);

            var claims = new List<Claim>
            {
                new("id_usuario",      idUsuario.ToString()),
                new(ClaimTypes.NameIdentifier, idUsuario.ToString()),
                new(ClaimTypes.Name,   usuario ?? ""),
                new("cod_dane",        codDane),
                new("nombre_cad",      nombreCad ?? ""),
                new("sitio_graba",     sitioGraba.ToString()),
                new("acd",             acd.ToString()),
                new("fuerza_id",       fuerzaId.ToString()),
                new("canal_id",        canalId.ToString()),
                new("es_admin",        esAdmin      ? "true" : "false"),
                new("es_super_admin",  esSuperAdmin ? "true" : "false"),
                new("home_cod_dane",   homeCodDane ?? codDane),
                // Cédula/identificación del empleado (de ctr_usuarios.identificacion).
                // Usada por RecepcionController para guardar cedu_empleado en cad_eventos.
                new("identificacion",  identificacion ?? "")
            };

            foreach (var r in roles)
                claims.Add(new Claim(ClaimTypes.Role, r.ToString()));

            var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
            var creds      = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);

            var token = new JwtSecurityToken(
                issuer:             issuer,
                audience:           audience,
                claims:             claims,
                expires:            DateTime.UtcNow.AddMinutes(minutes),
                signingCredentials: creds);

            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        public string GenerateToken(string usuario)
        {
            var key     = _cfg["Jwt:Key"]!;
            var minutes = 60;

            var claims = new List<Claim>
            {
                new(ClaimTypes.Name, usuario ?? ""),
                new(JwtRegisteredClaimNames.Sub, usuario ?? "")
            };

            var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
            var creds      = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);

            var token = new JwtSecurityToken(
                issuer:             _cfg["Jwt:Issuer"]   ?? "oftic.api",
                audience:           _cfg["Jwt:Audience"] ?? "oftic.api",
                claims:             claims,
                expires:            DateTime.UtcNow.AddMinutes(minutes),
                signingCredentials: creds);

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }
}
