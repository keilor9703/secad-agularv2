using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Net.Http.Headers;
using Servicios.ApiInterfaz;
using Microsoft.Extensions.Logging;

namespace Servicios.Api
{
    public class AuthHeaderHandler : DelegatingHandler
    {
        private readonly ITokenProvider _tokenProvider;
        private readonly ILogger<AuthHeaderHandler> _logger;

        public AuthHeaderHandler(ITokenProvider tokenProvider, ILogger<AuthHeaderHandler> logger)
        {
            _tokenProvider = tokenProvider;
            _logger = logger;
        }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken ct)
        {
            var token = await _tokenProvider.GetTokenAsync(ct);
            if (!string.IsNullOrWhiteSpace(token))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            }
            else
            {
                _logger.LogWarning("No se agregó Authorization header por token técnico vacío");
            }

            return await base.SendAsync(request, ct);
        }
    }
}
