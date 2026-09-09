using System.Security.Cryptography;
using System.Text;
using Comun.Dtos.Integraciones;
using Comun.Snowflake;
using Datos.Interfaz;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Negocio.Interfaz;

namespace Negocio.Gestion
{
    /// <summary>
    /// Genera, cifra, revela y rota las llaves de API de las integraciones.
    ///
    /// De cada llave se guardan dos cosas distintas y por motivos distintos:
    ///
    ///   · la HUELLA (SHA-256) es lo que se busca en cada petición entrante.
    ///     Va indexada; descifrar fila por fila para encontrar una coincidencia
    ///     no escalaría.
    ///   · la COPIA CIFRADA (AES-GCM) solo se descifra cuando un administrador
    ///     pulsa «Ver», y ese acto queda en la bitácora.
    ///
    /// Consecuencia buena de esa separación: la AUTENTICACIÓN no depende de la
    /// clave de cifrado. Si esa clave falta o está mal, las integraciones
    /// siguen funcionando y lo único que falla es el botón de revelar.
    /// </summary>
    public class ApiKeyService : IApiKeyService
    {
        /// <summary>Longitud del secreto aleatorio, en bytes, antes de codificar.</summary>
        private const int BytesSecreto = 32;

        private readonly IDbApiKeyRepository  _repo;
        private readonly ISnowflakeGenerator  _snowflake;
        private readonly ILogger<ApiKeyService> _logger;
        private readonly byte[]?              _claveCifrado;

        public ApiKeyService(
            IDbApiKeyRepository repo,
            ISnowflakeGenerator snowflake,
            IConfiguration configuration,
            ILogger<ApiKeyService> logger)
        {
            _repo      = repo;
            _snowflake = snowflake;
            _logger    = logger;

            var b64 = configuration["ApiKeys:ClaveCifrado"];
            if (!string.IsNullOrWhiteSpace(b64))
            {
                try
                {
                    var bytes = Convert.FromBase64String(b64);
                    if (bytes.Length == 32) _claveCifrado = bytes;
                    else _logger.LogError("ApiKeys:ClaveCifrado debe tener 32 bytes (256 bits); tiene {N}.", bytes.Length);
                }
                catch (FormatException)
                {
                    _logger.LogError("ApiKeys:ClaveCifrado no es base64 válido.");
                }
            }
            else
            {
                _logger.LogWarning(
                    "ApiKeys:ClaveCifrado no está configurada: se podrán crear llaves y se podrán " +
                    "usar, pero no se podrán volver a ver desde la pantalla.");
            }
        }

        // ── Listado ──────────────────────────────────────────────────────────

        public Task<List<DtoApiKey>> ListarAsync(string codDane, CancellationToken ct)
            => _repo.ListarAsync(codDane, ct);

        public Task<List<DtoApiKeyAuditoria>> ListarAuditoriaAsync(string codDane, int limite, CancellationToken ct)
            => _repo.ListarAuditoriaAsync(codDane, limite, ct);

        // ── Alta ─────────────────────────────────────────────────────────────

        public async Task<(DtoApiKeyConSecreto? datos, string? error)> CrearAsync(
            string codDane, DtoApiKeyRequest request, string? usuario, string? ip, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(request.Nombre))
                return (null, "Póngale un nombre que diga de quién es la llave, por ejemplo «Planta Avaya».");
            if (!AlcanceApiKey.EsValido(request.Alcance))
                return (null, "Alcance no válido.");
            if (_claveCifrado is null)
                return (null, "Falta configurar ApiKeys:ClaveCifrado en el servidor. Sin ella la llave no se podría volver a consultar.");

            var clave  = GenerarClave(request.Alcance);
            var id     = _snowflake.NextId();

            var res = await _repo.CrearAsync(new DtoApiKeyPersistencia
            {
                Id                = id,
                CodDane           = codDane,
                Nombre            = request.Nombre.Trim(),
                Alcance           = request.Alcance,
                Prefijo           = Prefijo(clave),
                Huella            = Huella(clave),
                ClaveCifrada      = Cifrar(clave),
                SitioGrabaDefecto = request.SitioGrabaDefecto,
                Notas             = request.Notas,
                UsuarioCreacion   = usuario,
            }, ct);

            if (!res.success) return (null, res.message);

            await _repo.AuditarAsync(id, codDane, "CREADA", usuario, ip,
                $"Alcance {request.Alcance} · {request.Nombre.Trim()}", ct);

            var llave = await _repo.ObtenerAsync(id, codDane, ct);
            return (new DtoApiKeyConSecreto
            {
                Llave = llave ?? new DtoApiKey { Id = id, CodDane = codDane },
                Clave = clave,
            }, null);
        }

        // ── Revelado ─────────────────────────────────────────────────────────

        public async Task<(string? clave, string? error)> RevelarAsync(
            long id, string codDane, string? usuario, string? ip, CancellationToken ct)
        {
            if (_claveCifrado is null)
                return (null, "Falta configurar ApiKeys:ClaveCifrado en el servidor.");

            var cifrada = await _repo.ObtenerClaveCifradaAsync(id, codDane, ct);
            if (cifrada is null) return (null, "La llave no existe en este CAD.");

            string clave;
            try { clave = Descifrar(cifrada); }
            catch (Exception ex)
            {
                _logger.LogError(ex, "No se pudo descifrar la llave {Id}", id);
                return (null, "No se pudo descifrar la llave: ¿cambió ApiKeys:ClaveCifrado? Regenérela.");
            }

            // Se audita ANTES de devolverla: si algo falla después, el intento
            // de revelado ya quedó registrado igual.
            await _repo.AuditarAsync(id, codDane, "REVELADA", usuario, ip, null, ct);
            return (clave, null);
        }

        // ── Rotación ─────────────────────────────────────────────────────────

        public async Task<(DtoApiKeyConSecreto? datos, string? error)> RegenerarAsync(
            long id, string codDane, int horasGracia, string? usuario, string? ip, CancellationToken ct)
        {
            if (_claveCifrado is null)
                return (null, "Falta configurar ApiKeys:ClaveCifrado en el servidor.");

            var actual = await _repo.ObtenerAsync(id, codDane, ct);
            if (actual is null) return (null, "La llave no existe en este CAD.");

            // Entre 0 y una semana. 0 = corte inmediato, para el caso en que la
            // llave se filtró y lo que se quiere es justamente que deje de servir.
            var horas   = Math.Clamp(horasGracia, 0, 168);
            var expira  = DateTime.UtcNow.AddHours(horas);
            var nueva   = GenerarClave(actual.Alcance);

            var res = await _repo.RegenerarAsync(
                id, codDane, Prefijo(nueva), Huella(nueva), Cifrar(nueva), expira, usuario, ct);
            if (!res.success) return (null, res.message);

            await _repo.AuditarAsync(id, codDane, "REGENERADA", usuario, ip,
                horas > 0 ? $"La anterior sigue válida {horas} h" : "Sin periodo de gracia", ct);

            var llave = await _repo.ObtenerAsync(id, codDane, ct);
            return (new DtoApiKeyConSecreto
            {
                Llave   = llave ?? actual,
                Clave   = nueva,
                Mensaje = horas > 0
                    ? $"La llave anterior seguirá funcionando {horas} hora(s), hasta que el proveedor actualice su configuración."
                    : "La llave anterior dejó de funcionar de inmediato.",
            }, null);
        }

        // ── Estado y edición ─────────────────────────────────────────────────

        public async Task<DtoApiKeyResult> CambiarEstadoAsync(long id, string codDane, bool activa, string? usuario, string? ip, CancellationToken ct)
        {
            var res = await _repo.CambiarEstadoAsync(id, codDane, activa, usuario, ct);
            if (res.success)
                await _repo.AuditarAsync(id, codDane, activa ? "REACTIVADA" : "REVOCADA", usuario, ip, null, ct);
            return res;
        }

        public Task<DtoApiKeyResult> ActualizarAsync(long id, string codDane, DtoApiKeyRequest request, string? usuario, string? ip, CancellationToken ct)
            => _repo.ActualizarAsync(id, codDane, request, usuario, ct);

        // ── Criptografía ─────────────────────────────────────────────────────

        /// <summary>
        /// «sk_pbx_<43 caracteres aleatorios>». El alcance va en el texto para
        /// que quien la recibe sepa de un vistazo para qué es; no es un dato
        /// secreto y no se usa para autorizar (eso sale de la base).
        /// </summary>
        private static string GenerarClave(string alcance)
        {
            var bytes = RandomNumberGenerator.GetBytes(BytesSecreto);
            var cuerpo = Convert.ToBase64String(bytes)
                                .Replace("+", "-").Replace("/", "_").TrimEnd('=');
            return $"sk_{alcance.ToLowerInvariant()}_{cuerpo}";
        }

        /// <summary>Los primeros caracteres, para reconocerla en la lista sin revelarla.</summary>
        private static string Prefijo(string clave) =>
            clave.Length <= 16 ? clave : clave[..16];

        /// <summary>La misma que usa el middleware al resolver — ver HuellaApiKey.</summary>
        private static string Huella(string clave) => HuellaApiKey.Calcular(clave);

        /// <summary>AES-GCM. El nonce y la etiqueta viajan junto al texto cifrado.</summary>
        private string Cifrar(string texto)
        {
            var plano  = Encoding.UTF8.GetBytes(texto);
            var nonce  = RandomNumberGenerator.GetBytes(AesGcm.NonceByteSizes.MaxSize);
            var cifra  = new byte[plano.Length];
            var tag    = new byte[AesGcm.TagByteSizes.MaxSize];

            using var aes = new AesGcm(_claveCifrado!, AesGcm.TagByteSizes.MaxSize);
            aes.Encrypt(nonce, plano, cifra, tag);

            var salida = new byte[nonce.Length + tag.Length + cifra.Length];
            Buffer.BlockCopy(nonce, 0, salida, 0, nonce.Length);
            Buffer.BlockCopy(tag,   0, salida, nonce.Length, tag.Length);
            Buffer.BlockCopy(cifra, 0, salida, nonce.Length + tag.Length, cifra.Length);
            return Convert.ToBase64String(salida);
        }

        private string Descifrar(string base64)
        {
            var todo   = Convert.FromBase64String(base64);
            var nonceN = AesGcm.NonceByteSizes.MaxSize;
            var tagN   = AesGcm.TagByteSizes.MaxSize;

            var nonce = todo.AsSpan(0, nonceN).ToArray();
            var tag   = todo.AsSpan(nonceN, tagN).ToArray();
            var cifra = todo.AsSpan(nonceN + tagN).ToArray();
            var plano = new byte[cifra.Length];

            using var aes = new AesGcm(_claveCifrado!, tagN);
            aes.Decrypt(nonce, cifra, tag, plano);
            return Encoding.UTF8.GetString(plano);
        }
    }
}
