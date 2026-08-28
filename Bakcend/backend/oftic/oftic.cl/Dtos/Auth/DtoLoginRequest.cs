using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Comun.Dtos.Auth
{
    public class DtoLoginRequest
    {
        public string Usuario { get; set; } = default!;
        public string Password { get; set; } = default!;
    }
    public class DtoLoginResponse
    {
        public string Token { get; set; } = default!;
        public long IdUsuario { get; set; }
        public string Usuario { get; set; } = default!;
        public List<long> Roles { get; set; } = new();
    }
}
