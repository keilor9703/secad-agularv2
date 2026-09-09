using System.Security.Cryptography;
using System.Text;

namespace Comun.Dtos.Integraciones
{
    /// <summary>
    /// La huella de una llave de API: SHA-256 en hexadecimal.
    ///
    /// Vive en Comun porque la calculan dos capas distintas por dos motivos
    /// distintos: el middleware, para resolver en cada petición entrante quién
    /// llama; y la capa de negocio, al emitir o rotar una llave. Que las dos
    /// usen exactamente la misma función es justamente lo que hace que una
    /// llave emitida se pueda volver a encontrar.
    /// </summary>
    public static class HuellaApiKey
    {
        public static string Calcular(string clave) =>
            Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(clave))).ToLowerInvariant();
    }
}
