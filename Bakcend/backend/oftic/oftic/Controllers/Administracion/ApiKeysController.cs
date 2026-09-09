using Comun.Dtos.Integraciones;
using Datos.Tenant;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Negocio.Interfaz;
using System.Security.Claims;

namespace ofic.Controllers.Administracion
{
    /// <summary>
    /// Llaves de API y contratos de las integraciones entrantes.
    ///
    /// Todo aquí es del CAD de quien pregunta: el cod_dane sale del JWT, nunca
    /// de un parámetro. Un administrador de Bogotá no puede listar, revelar ni
    /// rotar las llaves de Cali aunque conozca sus identificadores.
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Policy = "Administrador")]
    public class ApiKeysController : ControllerBase
    {
        private readonly IApiKeyService      _svc;
        private readonly TenantContext       _tenant;
        private readonly IHttpClientFactory  _http;
        private readonly IServer             _server;
        private readonly ILogger<ApiKeysController> _logger;

        public ApiKeysController(
            IApiKeyService svc,
            TenantContext tenant,
            IHttpClientFactory http,
            IServer server,
            ILogger<ApiKeysController> logger)
        {
            _svc    = svc;
            _tenant = tenant;
            _http   = http;
            _server = server;
            _logger = logger;
        }

        private string CodDane => User.FindFirstValue("cod_dane") ?? "";
        private string Usuario => User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue("id_usuario") ?? "?";
        private string Ip      => HttpContext.Connection.RemoteIpAddress?.ToString() ?? "desconocida";

        /// <summary>Host público con el que se arman las URL que se le entregan al proveedor.</summary>
        private string BaseUrl => $"{Request.Scheme}://{Request.Host}";

        // ── GET /api/ApiKeys ──────────────────────────────────────────────────
        [HttpGet]
        public async Task<IActionResult> Listar(CancellationToken ct)
            => Ok(new { success = true, data = await _svc.ListarAsync(CodDane, ct) });

        // ── POST /api/ApiKeys ─────────────────────────────────────────────────
        /// <summary>Emite una llave. Es la única respuesta donde viaja el secreto completo.</summary>
        [HttpPost]
        public async Task<IActionResult> Crear([FromBody] DtoApiKeyRequest request, CancellationToken ct)
        {
            var (datos, error) = await _svc.CrearAsync(CodDane, request, Usuario, Ip, ct);
            return error is null
                ? Ok(new { success = true, data = datos })
                : BadRequest(new { success = false, message = error });
        }

        // ── PUT /api/ApiKeys/{id} ─────────────────────────────────────────────
        [HttpPut("{id:long}")]
        public async Task<IActionResult> Actualizar(long id, [FromBody] DtoApiKeyRequest request, CancellationToken ct)
        {
            var res = await _svc.ActualizarAsync(id, CodDane, request, Usuario, Ip, ct);
            return res.success ? Ok(res) : BadRequest(res);
        }

        // ── GET /api/ApiKeys/{id}/revelar ─────────────────────────────────────
        /// <summary>
        /// Devuelve la llave en claro. Queda registrado quién la vio, desde qué
        /// IP y cuándo: es lo que hace defendible guardarla de forma recuperable
        /// en vez de enseñarla una sola vez.
        /// </summary>
        [HttpGet("{id:long}/revelar")]
        public async Task<IActionResult> Revelar(long id, CancellationToken ct)
        {
            var (clave, error) = await _svc.RevelarAsync(id, CodDane, Usuario, Ip, ct);
            return error is null
                ? Ok(new { success = true, data = new { clave } })
                : BadRequest(new { success = false, message = error });
        }

        // ── POST /api/ApiKeys/{id}/regenerar ──────────────────────────────────
        /// <param name="horasGracia">
        /// Cuánto sigue sirviendo la llave anterior. Por defecto 24 h, para que
        /// al proveedor externo le dé tiempo de reconfigurar su equipo. 0 corta
        /// de inmediato, que es lo que se quiere si la llave se filtró.
        /// </param>
        [HttpPost("{id:long}/regenerar")]
        public async Task<IActionResult> Regenerar(long id, [FromQuery] int horasGracia = 24, CancellationToken ct = default)
        {
            var (datos, error) = await _svc.RegenerarAsync(id, CodDane, horasGracia, Usuario, Ip, ct);
            return error is null
                ? Ok(new { success = true, data = datos })
                : BadRequest(new { success = false, message = error });
        }

        // ── PUT /api/ApiKeys/{id}/estado ──────────────────────────────────────
        [HttpPut("{id:long}/estado")]
        public async Task<IActionResult> CambiarEstado(long id, [FromQuery] bool activa, CancellationToken ct)
        {
            var res = await _svc.CambiarEstadoAsync(id, CodDane, activa, Usuario, Ip, ct);
            return res.success ? Ok(res) : BadRequest(res);
        }

        // ── GET /api/ApiKeys/auditoria ────────────────────────────────────────
        [HttpGet("auditoria")]
        public async Task<IActionResult> Auditoria([FromQuery] int limite = 100, CancellationToken ct = default)
            => Ok(new { success = true, data = await _svc.ListarAuditoriaAsync(CodDane, Math.Clamp(limite, 1, 500), ct) });

        // ── GET /api/ApiKeys/contrato/{canal} ─────────────────────────────────
        /// <summary>
        /// El contrato del canal, listo para entregárselo a quien integra: URL
        /// absoluta con el host real, cabeceras, cuerpo, campos y ejemplos.
        ///
        /// Sale del código, no de un campo de texto: el «endpoint relativo» que
        /// se escribía a mano no enrutaba nada y solo servía para documentar mal.
        /// </summary>
        /// <param name="llaveId">
        /// Opcional. Si se indica, el contrato sale con esa llave ya puesta en la
        /// cabecera y en el curl — y ese revelado se audita como cualquier otro.
        /// </param>
        [HttpGet("contrato/{canal}")]
        public async Task<IActionResult> Contrato(string canal, [FromQuery] long? llaveId, CancellationToken ct)
        {
            string? clave = null;
            if (llaveId is > 0)
            {
                var (c, _) = await _svc.RevelarAsync(llaveId.Value, CodDane, Usuario, Ip, ct);
                clave = c;
            }

            var sitio = _tenant.SitioGraba is > 0 ? _tenant.SitioGraba!.Value : 1;
            var contrato = ContratosIntegracion.Obtener(canal, BaseUrl, clave, sitio);

            return contrato is null
                ? NotFound(new { success = false, message = $"No hay contrato para el canal «{canal}»." })
                : Ok(new { success = true, data = contrato });
        }

        // ── POST /api/ApiKeys/{id}/probar ─────────────────────────────────────
        /// <summary>
        /// Prueba la llave contra el endpoint real, desde fuera.
        ///
        /// La llamada NO se puede hacer desde el navegador: el interceptor del
        /// frontend le pega el JWT del administrador a cada petición, y con un
        /// JWT presente el middleware resuelve el tenant por el token y nunca
        /// mira la llave — la prueba saldría verde sin haber probado nada. Así
        /// que la dispara el propio servidor contra su dirección de escucha,
        /// sin token, exactamente como lo hará el proveedor externo.
        ///
        /// No escribe nada: /verificar solo responde qué reconoció.
        /// </summary>
        [HttpPost("{id:long}/probar")]
        public async Task<IActionResult> Probar(long id, CancellationToken ct)
        {
            var (clave, error) = await _svc.RevelarAsync(id, CodDane, Usuario, Ip, ct);
            if (clave is null) return BadRequest(new { success = false, message = error });

            var destino = $"{DireccionLocal()}/api/RecepcionExterna/verificar";

            try
            {
                var cliente = _http.CreateClient();
                cliente.Timeout = TimeSpan.FromSeconds(10);

                using var peticion = new HttpRequestMessage(HttpMethod.Post, destino);
                peticion.Headers.TryAddWithoutValidation("X-Api-Key", clave);
                peticion.Content = new StringContent("{}", System.Text.Encoding.UTF8, "application/json");

                using var respuesta = await cliente.SendAsync(peticion, ct);
                var cuerpo = await respuesta.Content.ReadAsStringAsync(ct);

                return Ok(new
                {
                    success = true,
                    data = new
                    {
                        estado = (int)respuesta.StatusCode,
                        ok     = respuesta.IsSuccessStatusCode,
                        url    = destino,
                        cuerpo,
                    }
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Fallo probando la llave {Id} contra {Destino}", id, destino);
                return Ok(new
                {
                    success = true,
                    data = new { estado = 0, ok = false, url = destino, cuerpo = $"No se pudo conectar: {ex.Message}" }
                });
            }
        }

        /// <summary>
        /// Dirección por la que el propio proceso se puede llamar. Se prefiere la
        /// que Kestrel dice estar escuchando: dentro de un contenedor, el host
        /// público de la petición puede no resolverse desde adentro.
        /// </summary>
        private string DireccionLocal()
        {
            var direcciones = _server.Features.Get<IServerAddressesFeature>()?.Addresses;
            var local = direcciones?.FirstOrDefault(a => a.StartsWith("http://"))
                     ?? direcciones?.FirstOrDefault();

            if (string.IsNullOrWhiteSpace(local)) return BaseUrl;

            // Kestrel publica comodines que no son direcciones de destino válidas.
            return local.Replace("://+", "://127.0.0.1")
                        .Replace("://*", "://127.0.0.1")
                        .Replace("://[::]", "://127.0.0.1")
                        .Replace("://0.0.0.0", "://127.0.0.1")
                        .TrimEnd('/');
        }

        // ── GET /api/ApiKeys/contratos ────────────────────────────────────────
        [HttpGet("contratos")]
        public IActionResult Contratos()
        {
            var sitio = _tenant.SitioGraba is > 0 ? _tenant.SitioGraba!.Value : 1;
            var lista = ContratosIntegracion.Canales
                .Select(c => ContratosIntegracion.Obtener(c, BaseUrl, null, sitio))
                .Where(c => c is not null)
                .ToList();
            return Ok(new { success = true, data = lista });
        }
    }
}
