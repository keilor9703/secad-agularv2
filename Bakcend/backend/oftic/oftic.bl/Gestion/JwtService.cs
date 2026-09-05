using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Negocio.Interfaz;

using Comun.Security;

namespace Negocio.Gestion
{
    public class JwtService : IJwtService
    {
        private readonly IConfiguration _cfg;

        public JwtService(IConfiguration cfg)
        {
            _cfg = cfg;
        }

        /// <param name="esSuperAdmin">
        /// Lo decide quien llama consultando secad_super_admins en la base
        /// MAESTRA, y solo eso. Antes se deducía aquí de dos sitios, los dos
        /// equivocados:
        ///
        ///   · roles.Contains(2) — un rol de la base de UN tenant otorgando
        ///     autoridad sobre TODOS.
        ///   · Menu:SuperUserIds del appsettings, que daba el privilegio a los
        ///     id_usuario 1 y 2 de CUALQUIER tenant. Como ctr_usuarios.id_usuario
        ///     es BIGSERIAL y V2 siembra «admin» sin id explícito, ese admin
        ///     recibe el 1 en cada CAD nuevo: el administrador sembrado de
        ///     cualquier tenant era superadministrador de todo el sistema.
        ///
        /// Este método ya no decide quién manda; solo firma lo que le dicen.
        /// </param>
        public string CreateToken(long idUsuario, string usuario, List<long> roles, string codDane, string? nombreCad,
                                  int sitioGraba = 0, int acd = 0, int fuerzaId = 0, int canalId = 0,
                                  string? homeCodDane = null, string? identificacion = null,
                                  bool esSuperAdmin = false, bool esAdminCad = false)
        {
            var issuer   = _cfg["Jwt:Issuer"]   ?? "oftic.api";
            var audience = _cfg["Jwt:Audience"] ?? issuer;
            var key      = _cfg["Jwt:Key"]!;
            var minutes  = int.Parse(_cfg["Jwt:Minutes"] ?? "480");

            // Administrador del CAD: lo declara el propio CAD marcando el rol en
            // ctr_roles.es_admin (V69). Aquí se comparaba con el id 1 escrito a
            // mano, y ese id es LOCAL a cada tenant: en un CAD cuyo rol
            // «Administrador» tuviera otro id —14, por ejemplo— el claim salía
            // false y las pantallas de administración devolvían 403.
            bool esAdmin = esSuperAdmin || esAdminCad;

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
