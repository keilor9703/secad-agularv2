using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Comun.Security
{
    /// <summary>
    /// Cifrado reversible de secretos que el sistema tiene que poder volver a
    /// usar: la clave de firma del VMS, el secreto de una llave de API, y lo
    /// que venga después.
    ///
    /// Reversible y no un hash porque el backend necesita el valor original
    /// para firmar peticiones contra el sistema externo. La clave vive en la
    /// configuración del servidor y NO en la base: quien tenga solo una de las
    /// dos cosas no puede recuperar nada.
    /// </summary>
    public interface ICifradoSecretos
    {
        /// <summary>true = hay clave configurada y se puede cifrar.</summary>
        bool Disponible { get; }

        /// <summary>Texto cifrado en base64 (nonce + etiqueta + criptograma).</summary>
        string? Cifrar(string? texto);

        /// <summary>
        /// Devuelve el texto original. Tolera recibir algo que NO esté cifrado
        /// —lo escrito en claro antes de que existiera el cifrado— y en ese
        /// caso lo devuelve tal cual, para que la migración pueda ser en
        /// caliente en vez de un corte.
        /// </summary>
        string? Descifrar(string? guardado);

        /// <summary>¿Este valor tiene pinta de haber salido de <see cref="Cifrar"/>?</summary>
        bool EstaCifrado(string? guardado);
    }

    public class CifradoSecretos : ICifradoSecretos
    {
        /// <summary>
        /// Marca al frente del base64. Sin ella no habría forma de distinguir
        /// un secreto cifrado de uno viejo en claro que casualmente sea base64
        /// válido, y descifrar a ciegas devolvería basura.
        /// </summary>
        private const string Marca = "gcm:";

        private readonly byte[]? _clave;
        private readonly ILogger<CifradoSecretos> _logger;

        public CifradoSecretos(IConfiguration configuration, ILogger<CifradoSecretos> logger)
        {
            _logger = logger;

            // Se comparte la clave con las llaves de API (V73): es el mismo
            // secreto del mismo servidor y tener dos multiplicaría las formas
            // de perder el acceso sin ganar nada.
            var b64 = configuration["ApiKeys:ClaveCifrado"];
            if (string.IsNullOrWhiteSpace(b64))
            {
                _logger.LogWarning(
                    "ApiKeys:ClaveCifrado no está configurada: los secretos de integración se " +
                    "guardarán en claro. Genere una con: openssl rand -base64 32");
                return;
            }

            try
            {
                var bytes = Convert.FromBase64String(b64);
                if (bytes.Length == 32) _clave = bytes;
                else _logger.LogError(
                    "ApiKeys:ClaveCifrado debe tener 32 bytes (256 bits); tiene {N}.", bytes.Length);
            }
            catch (FormatException)
            {
                _logger.LogError("ApiKeys:ClaveCifrado no es base64 válido.");
            }
        }

        public bool Disponible => _clave is not null;

        public bool EstaCifrado(string? guardado) =>
            !string.IsNullOrEmpty(guardado) && guardado.StartsWith(Marca, StringComparison.Ordinal);

        public string? Cifrar(string? texto)
        {
            if (texto is null) return null;
            if (_clave is null) return texto;   // sin clave, se guarda como estaba

            var plano = Encoding.UTF8.GetBytes(texto);
            var nonce = RandomNumberGenerator.GetBytes(AesGcm.NonceByteSizes.MaxSize);
            var cifra = new byte[plano.Length];
            var tag   = new byte[AesGcm.TagByteSizes.MaxSize];

            using var aes = new AesGcm(_clave, AesGcm.TagByteSizes.MaxSize);
            aes.Encrypt(nonce, plano, cifra, tag);

            var salida = new byte[nonce.Length + tag.Length + cifra.Length];
            Buffer.BlockCopy(nonce, 0, salida, 0, nonce.Length);
            Buffer.BlockCopy(tag,   0, salida, nonce.Length, tag.Length);
            Buffer.BlockCopy(cifra, 0, salida, nonce.Length + tag.Length, cifra.Length);
            return Marca + Convert.ToBase64String(salida);
        }

        public string? Descifrar(string? guardado)
        {
            if (string.IsNullOrEmpty(guardado)) return guardado;
            if (!EstaCifrado(guardado)) return guardado;   // valor antiguo en claro
            if (_clave is null)
            {
                _logger.LogError(
                    "Hay un secreto cifrado pero falta ApiKeys:ClaveCifrado: no se puede recuperar.");
                return null;
            }

            try
            {
                var todo   = Convert.FromBase64String(guardado[Marca.Length..]);
                var nonceN = AesGcm.NonceByteSizes.MaxSize;
                var tagN   = AesGcm.TagByteSizes.MaxSize;

                var nonce = todo.AsSpan(0, nonceN).ToArray();
                var tag   = todo.AsSpan(nonceN, tagN).ToArray();
                var cifra = todo.AsSpan(nonceN + tagN).ToArray();
                var plano = new byte[cifra.Length];

                using var aes = new AesGcm(_clave, tagN);
                aes.Decrypt(nonce, cifra, tag, plano);
                return Encoding.UTF8.GetString(plano);
            }
            catch (CryptographicException)
            {
                _logger.LogError(
                    "No se pudo descifrar un secreto de integración: ¿cambió ApiKeys:ClaveCifrado? " +
                    "Hay que volver a escribirlo desde la pantalla.");
                return null;
            }
        }
    }
}
