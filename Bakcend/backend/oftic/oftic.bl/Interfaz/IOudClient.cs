using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Comun.Dtos.Auth;

namespace Negocio.Interfaz
{
    public interface IOudClient
    {
        Task<bool> ValidarAsync(string usuario, string password, CancellationToken ct);
    }
}
