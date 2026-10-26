using Microsoft.Extensions.Configuration;
using ofic.Security;
using Xunit;

namespace Api.Tests;

/// <summary>
/// La guardia existe porque un secreto que conserva el valor del repositorio no
/// da ningún síntoma: la aplicación funciona igual, y todo el que tenga el
/// repositorio conoce la clave. Estas pruebas comprueban DOS cosas: que la
/// guardia detecta los marcadores que de verdad trae el appsettings.json, y que
/// no protesta por una configuración correcta —una guardia que grita siempre
/// se ignora en la primera semana.
/// </summary>
public class ConfiguracionSeguraTests
{
    // Valores plausibles de un despliegue real: aleatorios, de largo suficiente.
    private const string JwtReal = "k7Qm2xVb9TnLr4WpZs8YdJf3HcAe6UgN1oXiB5vE";
    private const string ApiKeyReal = "p3Zr8WqYt1NvLc6HsBd9KmXe4JgUa7FoTi2VnQy5";
    // 32 bytes en base64 (nada que ver con el texto del marcador).
    private static readonly string CifradoReal = Convert.ToBase64String(
        Enumerable.Range(0, 32).Select(i => (byte)(i * 7 + 13)).ToArray());

    private static IConfiguration Config(Dictionary<string, string?> valores) =>
        new ConfigurationBuilder().AddInMemoryCollection(valores).Build();

    private static Dictionary<string, string?> Correcta() => new()
    {
        ["Jwt:Key"] = JwtReal,
        ["RecepcionExterna:ApiKey"] = ApiKeyReal,
        ["ApiKeys:ClaveCifrado"] = CifradoReal,
    };

    private static string[] Claves(IConfiguration cfg) =>
        ConfiguracionSegura.Revisar(cfg).Select(h => h.Clave).ToArray();

    private static IConfiguration Repositorio() =>
        new ConfigurationBuilder()
            .AddJsonFile(Path.Combine(AppContext.BaseDirectory, "appsettings.repo.json"), optional: false)
            .Build();

    // ── Lo que trae el repositorio ───────────────────────────────────────────

    [Fact]
    public void El_appsettings_del_repositorio_se_detecta_entero()
    {
        var claves = Claves(Repositorio());

        Assert.Contains("Jwt:Key", claves);
        Assert.Contains("RecepcionExterna:ApiKey", claves);
        // El de las llaves de API es texto en base64: solo se detecta si se
        // mira lo que esconde, no la cadena tal cual.
        Assert.Contains("ApiKeys:ClaveCifrado", claves);
    }

    [Fact]
    public void Con_el_doble_factor_apagado_su_secreto_de_relleno_no_es_un_hallazgo()
    {
        // Mfa:Enabled es false en el repositorio: pedir un secreto que no se usa
        // obligaría a inventar uno para poder arrancar.
        Assert.DoesNotContain("Mfa:HmacSecret", Claves(Repositorio()));
    }

    // ── La configuración correcta no protesta ────────────────────────────────

    [Fact]
    public void Una_configuracion_real_no_produce_hallazgos()
    {
        Assert.Empty(ConfiguracionSegura.Revisar(Config(Correcta())));
    }

    [Fact]
    public void Sin_ClaveCifrado_no_es_hallazgo_porque_la_autenticacion_no_depende_de_ella()
    {
        var cfg = Correcta();
        cfg.Remove("ApiKeys:ClaveCifrado");

        Assert.Empty(ConfiguracionSegura.Revisar(Config(cfg)));
    }

    // ── Lo que sí es un hallazgo ─────────────────────────────────────────────

    [Theory]
    [InlineData("CAMBIAR_EN_PRODUCCION_ClaveSeguraMinimo32Caracteres_2026")]
    [InlineData("cambiar_en_produccion_clave_de_largo_suficiente_xx")]   // minúsculas
    [InlineData("xxxxxxxxxxChangeMexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")]
    [InlineData("xxxxxxxxxxxxxxxx_PLACEHOLDER_xxxxxxxxxxxxxxxxxxxxxx")]
    public void Un_marcador_se_detecta_sin_importar_mayusculas(string valor)
    {
        var cfg = Correcta();
        cfg["Jwt:Key"] = valor;

        Assert.Equal(new[] { "Jwt:Key" }, Claves(Config(cfg)));
    }

    [Theory]
    [InlineData(5)]
    [InlineData(31)]   // a un carácter del mínimo
    public void Una_clave_corta_se_detecta(int largo)
    {
        var cfg = Correcta();
        cfg["RecepcionExterna:ApiKey"] = new string('k', largo - 1) + "Q";

        Assert.Equal(new[] { "RecepcionExterna:ApiKey" }, Claves(Config(cfg)));
    }

    [Fact]
    public void Una_clave_de_exactamente_32_caracteres_pasa()
    {
        var cfg = Correcta();
        cfg["Jwt:Key"] = new string('k', 31) + "Q";

        Assert.Empty(ConfiguracionSegura.Revisar(Config(cfg)));
    }

    [Fact]
    public void Una_clave_ausente_o_en_blanco_se_detecta()
    {
        var cfg = Correcta();
        cfg.Remove("Jwt:Key");
        cfg["RecepcionExterna:ApiKey"] = "   ";

        Assert.Equal(
            new[] { "Jwt:Key", "RecepcionExterna:ApiKey" }.OrderBy(x => x),
            Claves(Config(cfg)).OrderBy(x => x));
    }

    [Theory]
    [InlineData("esto no es base64!!")]
    [InlineData("YWJj")]                                  // base64 válido, 3 bytes
    public void La_clave_de_cifrado_debe_ser_base64_de_32_bytes(string valor)
    {
        var cfg = Correcta();
        cfg["ApiKeys:ClaveCifrado"] = valor;

        Assert.Equal(new[] { "ApiKeys:ClaveCifrado" }, Claves(Config(cfg)));
    }

    [Fact]
    public void El_marcador_escondido_en_base64_se_detecta()
    {
        // "CAMBIAR_EN_PRODUCCION_32_bytes!!" son exactamente 32 bytes.
        var cfg = Correcta();
        cfg["ApiKeys:ClaveCifrado"] = Convert.ToBase64String(
            System.Text.Encoding.UTF8.GetBytes("CAMBIAR_EN_PRODUCCION_32_bytes!!"));

        Assert.Equal(new[] { "ApiKeys:ClaveCifrado" }, Claves(Config(cfg)));
    }

    // ── Los secretos que solo importan si la función está encendida ──────────

    [Fact]
    public void Con_el_doble_factor_encendido_su_secreto_si_se_exige()
    {
        var cfg = Correcta();
        cfg["Mfa:Enabled"] = "true";
        cfg["Mfa:HmacSecret"] = "SECRET_HMAC_SECAD_CAMBIAR_EN_PRODUCCION";

        Assert.Equal(new[] { "Mfa:HmacSecret" }, Claves(Config(cfg)));
    }

    [Fact]
    public void Con_servidores_TURN_el_secreto_de_firma_se_exige()
    {
        var cfg = Correcta();
        cfg["Turn:Urls"] = "turn:turn.ejemplo.test:3478";

        Assert.Equal(new[] { "Turn:Secret" }, Claves(Config(cfg)));

        cfg["Turn:Secret"] = "corto";
        Assert.Equal(new[] { "Turn:Secret" }, Claves(Config(cfg)));

        cfg["Turn:Secret"] = "yN4pQw8ZxL2vKc6TbH9sJd3Re7";   // 26: alcanza
        Assert.Empty(ConfiguracionSegura.Revisar(Config(cfg)));
    }

    [Fact]
    public void Sin_servidores_TURN_su_secreto_no_se_exige()
    {
        Assert.Empty(ConfiguracionSegura.Revisar(Config(Correcta())));
    }

    // ── Lo más importante: el resultado va a un registro ─────────────────────

    [Fact]
    public void El_resultado_nunca_contiene_el_valor_del_secreto()
    {
        const string secreto = "CAMBIAR_secretoUnico_Zq9Wx7Lm3Kd8Vt2Hn5Br4Yc1Pj6Gf0Se";
        var cfg = Correcta();
        cfg["Jwt:Key"] = secreto;
        cfg["Mfa:Enabled"] = "true";
        cfg["Mfa:HmacSecret"] = secreto;
        cfg["Turn:Urls"] = "turn:turn.ejemplo.test:3478";
        cfg["Turn:Secret"] = "corto";

        var hallazgos = ConfiguracionSegura.Revisar(Config(cfg));

        Assert.NotEmpty(hallazgos);   // sin esto, el Assert de abajo pasaría sobre una lista vacía
        Assert.All(hallazgos, h =>
        {
            Assert.DoesNotContain("Zq9Wx7", h.Motivo);
            Assert.DoesNotContain("Zq9Wx7", h.Clave);
        });
    }
}
