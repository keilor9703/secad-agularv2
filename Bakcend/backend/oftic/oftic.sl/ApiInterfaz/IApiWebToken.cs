using Comun.Dtos;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Servicios.ApiInterfaz
{
    public interface IApiWebToken
    {
        Task<DtoRespuesta<string>> ObtenerTokenSeviciosAsync(DtoUsuarioPip usuario);
        Task<DtoRespuesta<string>> ObtenerTokenPipAsync(CancellationToken ct);
        Task<string> GetTokenAsync(string usuario, string contrasena);
        Task<DtoFuncionario> GetFuncionarioAsync(string token, string identificacion);
        Task<string> GetFotoFuncionarioAsync(string token, string identificacion);
    }
}
