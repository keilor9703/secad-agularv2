using Microsoft.Extensions.Configuration;
using System.Text;

namespace ofic.Security;

/// <summary>
/// Revisa que los secretos de la aplicación NO conserven el valor que trae el
/// repositorio.
///
/// <para><b>El problema.</b> <c>appsettings.json</c> lleva marcadores
/// ("CAMBIAR_EN_PRODUCCION…") para que el proyecto arranque en un equipo de
/// desarrollo. Pero ese archivo es público para quien tenga el repositorio, así
/// que un secreto que se queda con su marcador es un secreto que todos
/// conocen: con la clave del JWT cualquiera firma un token de administrador, y
/// con la de las llaves de API cualquiera con acceso a la base las descifra.
/// Y NO hay ningún síntoma: la aplicación funciona exactamente igual.</para>
///
/// <para><b>Qué hace.</b> Devuelve una lista de hallazgos; nunca el valor del
/// secreto, ni parcial, porque el resultado va a un registro.
/// <c>Program.cs</c> los avisa siempre y, si el despliegue lo pide con
/// <c>Seguridad:ExigirSecretos</c>, se niega a arrancar. Es opcional a
/// propósito: apagarlo por defecto evita tumbar un servidor que hoy funciona
/// en el momento de actualizarlo, y se enciende cuando ya están los valores
/// reales.</para>
/// </summary>
public static class ConfiguracionSegura
{
    public sealed record Hallazgo(string Clave, string Motivo);

    /// <summary>Texto que delata un valor de relleno, sin importar mayúsculas.</summary>
    private static readonly string[] Marcadores =
        { "CAMBIAR", "CHANGEME", "CHANGE_ME", "SECRET_HMAC", "PLACEHOLDER" };

    private const int LargoMinimoClave = 32;
    private const int LargoMinimoSecretoTurn = 24;

    public static IReadOnlyList<Hallazgo> Revisar(IConfiguration cfg)
    {
        var hallazgos = new List<Hallazgo>();

        Texto(cfg, "Jwt:Key", LargoMinimoClave, hallazgos);
        Texto(cfg, "RecepcionExterna:ApiKey", LargoMinimoClave, hallazgos);

        // La clave que cifra las llaves de API guardadas. Si falta no es un
        // hallazgo: la autenticación no depende de ella y lo único que se
        // pierde es el botón «Ver» (ver docs/integraciones-llaves-api.md).
        var clave = cfg["ApiKeys:ClaveCifrado"];
        if (!string.IsNullOrWhiteSpace(clave))
            ClaveDeCifrado(clave, hallazgos);

        // El secreto compartido con el servicio de doble factor solo importa
        // si el doble factor está encendido.
        if (cfg.GetValue<bool>("Mfa:Enabled"))
            Texto(cfg, "Mfa:HmacSecret", LargoMinimoClave, hallazgos);

        // Si hay servidores TURN, el secreto con que se firman las
        // credenciales efímeras tiene que ser real: con uno débil se podrían
        // fabricar credenciales válidas.
        if (!string.IsNullOrWhiteSpace(cfg["Turn:Urls"]))
            Texto(cfg, "Turn:Secret", LargoMinimoSecretoTurn, hallazgos);

        return hallazgos;
    }

    private static void Texto(IConfiguration cfg, string clave, int largoMinimo, List<Hallazgo> destino)
    {
        var valor = cfg[clave];
        if (string.IsNullOrWhiteSpace(valor))
        {
            destino.Add(new Hallazgo(clave, "no está definida"));
        }
        else if (EsMarcador(valor))
        {
            destino.Add(new Hallazgo(clave, "conserva el valor de relleno del repositorio"));
        }
        else if (valor.Length < largoMinimo)
        {
            destino.Add(new Hallazgo(clave, $"es demasiado corta (mínimo {largoMinimo} caracteres)"));
        }
    }

    private static void ClaveDeCifrado(string valor, List<Hallazgo> destino)
    {
        const string clave = "ApiKeys:ClaveCifrado";
        byte[] bytes;
        try
        {
            bytes = Convert.FromBase64String(valor);
        }
        catch (FormatException)
        {
            destino.Add(new Hallazgo(clave, "no es base64 válido"));
            return;
        }

        if (bytes.Length != 32)
            destino.Add(new Hallazgo(clave, "debe ser de 32 bytes en base64"));
        // El marcador del repositorio es TEXTO escrito en base64, así que hay
        // que mirar el texto que esconde y no la cadena base64 tal cual.
        else if (EsMarcador(Encoding.UTF8.GetString(bytes)))
            destino.Add(new Hallazgo(clave, "conserva el valor de relleno del repositorio"));
    }

    private static bool EsMarcador(string valor) =>
        Marcadores.Any(m => valor.Contains(m, StringComparison.OrdinalIgnoreCase));
}
