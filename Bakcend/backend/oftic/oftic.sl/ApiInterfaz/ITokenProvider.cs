using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Servicios.ApiInterfaz
{
    public interface ITokenProvider
    {
        Task<string> GetTokenAsync(CancellationToken ct);
    }
}
