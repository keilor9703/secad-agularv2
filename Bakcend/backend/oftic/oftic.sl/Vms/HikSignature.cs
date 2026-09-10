using System.Security.Cryptography;
using System.Text;

namespace Servicios.Vms
{
    /// <summary>
    /// Firma AK/SK de HikCentral Professional OpenAPI (§3.2 del Developer Guide
    /// V3.1.0). Es una función pura y está separada del cliente HTTP a
    /// propósito: es la pieza donde estas integraciones fallan y así se puede
    /// comprobar contra los ejemplos del manual sin levantar nada.
    ///
    /// La cadena a firmar es, en este orden y con «\n» entre partes:
    ///
    ///     MÉTODO \n Accept \n Content-MD5 \n Content-Type \n Date \n
    ///     cabeceras-firmadas
    ///     URI
    ///
    /// Detalles que el manual deja escritos y que son fáciles de perder:
    ///
    ///  · Si Accept, Content-MD5, Content-Type o Date NO se envían, su línea se
    ///    OMITE ENTERA — no se deja una línea vacía. El propio ejemplo del
    ///    manual firma «POST\n*\/*\ntext/plain;charset=UTF-8\n…» sin Date ni
    ///    Content-MD5.
    ///  · Los nombres de las cabeceras firmadas van en minúscula, el valor sin
    ///    espacios a los lados, cada una termina en «\n», y van ordenadas
    ///    alfabéticamente.
    ///  · Hay cabeceras que NUNCA se firman aunque se envíen (Accept,
    ///    Content-Type, Host, Connection…): ya están en la cabecera de la
    ///    cadena o las pone el transporte.
    ///  · El URI incluye la query. Con cuerpo de formulario, el manual mezcla
    ///    además los campos del formulario en esa query, ordenados; aquí no
    ///    aplica porque siempre se manda JSON.
    /// </summary>
    public static class HikSignature
    {
        /// <summary>
        /// Cabeceras que el gateway excluye del cálculo. Firmar una de estas
        /// produce un 401 que no dice por qué.
        /// </summary>
        private static readonly HashSet<string> NoSeFirman = new(StringComparer.OrdinalIgnoreCase)
        {
            "x-ca-signature", "x-ca-signature-headers", "accept", "content-md5",
            "content-type", "date", "content-length", "server", "connection",
            "host", "transfer-encoding", "x-application-context", "content-encoding",
        };

        /// <summary>
        /// Arma la cadena a firmar.
        /// </summary>
        /// <param name="metodo">En mayúsculas: POST, GET…</param>
        /// <param name="accept">Valor de Accept, o null si no se envía.</param>
        /// <param name="contentMd5">Base64(MD5(cuerpo)), o null si no se envía.</param>
        /// <param name="contentType">Valor de Content-Type, o null si no se envía.</param>
        /// <param name="date">Valor de Date, o null si no se envía.</param>
        /// <param name="cabeceras">Todas las cabeceras de la petición; se filtran y ordenan aquí.</param>
        /// <param name="uri">Ruta absoluta con query, ej. /artemis/api/resource/v1/cameras</param>
        public static string CadenaAFirmar(
            string metodo,
            string? accept,
            string? contentMd5,
            string? contentType,
            string? date,
            IEnumerable<KeyValuePair<string, string>> cabeceras,
            string uri)
        {
            var sb = new StringBuilder();
            sb.Append(metodo.ToUpperInvariant()).Append('\n');

            // Ausente = no hay línea. Presente pero vacía sí ocupa su línea.
            if (accept      is not null) sb.Append(accept).Append('\n');
            if (contentMd5  is not null) sb.Append(contentMd5).Append('\n');
            if (contentType is not null) sb.Append(contentType).Append('\n');
            if (date        is not null) sb.Append(date).Append('\n');

            foreach (var h in Firmables(cabeceras))
                sb.Append(h.Key).Append(':').Append(h.Value).Append('\n');

            sb.Append(uri);
            return sb.ToString();
        }

        /// <summary>
        /// Las cabeceras que entran en la firma, ya normalizadas: nombre en
        /// minúscula, valor recortado, ordenadas alfabéticamente.
        /// </summary>
        public static List<KeyValuePair<string, string>> Firmables(
            IEnumerable<KeyValuePair<string, string>> cabeceras) =>
            cabeceras
                .Where(h => !NoSeFirman.Contains(h.Key))
                .Select(h => new KeyValuePair<string, string>(
                    h.Key.ToLowerInvariant(), (h.Value ?? string.Empty).Trim()))
                .OrderBy(h => h.Key, StringComparer.Ordinal)
                .ToList();

        /// <summary>El valor de X-Ca-Signature-Headers: los mismos nombres, separados por coma.</summary>
        public static string ListaDeFirmadas(
            IEnumerable<KeyValuePair<string, string>> cabeceras) =>
            string.Join(",", Firmables(cabeceras).Select(h => h.Key));

        /// <summary>Base64( HmacSHA256(cadena, appSecret) ), en UTF-8.</summary>
        public static string Firmar(string cadenaAFirmar, string appSecret)
        {
            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(appSecret));
            return Convert.ToBase64String(hmac.ComputeHash(Encoding.UTF8.GetBytes(cadenaAFirmar)));
        }

        /// <summary>Base64( MD5(cuerpo) ). Solo para cuerpos que no son formulario.</summary>
        public static string ContentMd5(string cuerpo) =>
            Convert.ToBase64String(MD5.HashData(Encoding.UTF8.GetBytes(cuerpo)));

        /// <summary>Milisegundos desde epoch, que es lo que espera X-Ca-Timestamp.</summary>
        public static string Timestamp() =>
            DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString();
    }
}
