using Microsoft.Extensions.Configuration;
using Negocio.Interfaz;
using Comun.Dtos.Auth;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http.Json;
using System.Text;
using System.Threading.Tasks;

namespace Negocio.Gestion
{
    public class OudClient : IOudClient
    {
        private readonly HttpClient _http;
        private readonly string _loginUrl;


        public OudClient(HttpClient http, IConfiguration cfg)
        {
            _http = http;
            _loginUrl = cfg["Oud:LoginUrl"]!;
        }


        public async Task<bool> ValidarAsync(string usuario, string password, CancellationToken ct)
        {
            var payload = new { usuario, password };

            using var resp = await _http.PostAsJsonAsync(_loginUrl, payload, ct);

            if (!resp.IsSuccessStatusCode) return false;

            return true;
        }
    }
}
