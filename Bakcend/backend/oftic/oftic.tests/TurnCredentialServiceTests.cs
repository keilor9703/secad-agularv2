using Api.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Api.Tests;

/// <summary>
/// Reloj fijo: sin él no se podría comprobar la expiración sin esperar.
/// </summary>
internal sealed class RelojFijo : TimeProvider
{
    private readonly DateTimeOffset _ahora;
    public RelojFijo(long unix) => _ahora = DateTimeOffset.FromUnixTimeSeconds(unix);
    public override DateTimeOffset GetUtcNow() => _ahora;
}

public class TurnCredentialServiceTests
{
    // Instante fijo y secreto de prueba. Los valores esperados de abajo se
    // calcularon con Python (hmac + sha1 + base64), NO con este código: si el
    // servicio y la prueba compartieran la misma implementación, un error en
    // el algoritmo pasaría inadvertido en los dos.
    private const long Ahora = 1_700_000_000;
    private const string Secreto = "secreto-de-prueba-0123456789";

    private static TurnCredentialService Crear(Dictionary<string, string?> valores) =>
        new(new ConfigurationBuilder().AddInMemoryCollection(valores).Build(),
            NullLogger<TurnCredentialService>.Instance,
            new RelojFijo(Ahora));

    private static Dictionary<string, string?> ConTurn(string? ttl = null) => new()
    {
        ["Turn:Urls"] = "turn:turn.ejemplo.test:3478?transport=udp,turn:turn.ejemplo.test:3478?transport=tcp",
        ["Turn:Secret"] = Secreto,
        ["Turn:TtlSeconds"] = ttl,
    };

    [Fact]
    public void La_credencial_es_el_HMAC_SHA1_en_base64_del_usuario()
    {
        var turn = Crear(ConTurn()).Generar("despachador1").Single(s => s.Username is not null);

        Assert.Equal("1700003600:despachador1", turn.Username);
        Assert.Equal("vReQYx8Pw1oWmvZEIEHgbFysGeI=", turn.Credential);
    }

    [Fact]
    public void Otro_sujeto_produce_otra_credencial()
    {
        var servicio = Crear(ConTurn());

        var a = servicio.Generar("despachador1").Single(s => s.Username is not null);
        var b = servicio.Generar("ciudadano-42").Single(s => s.Username is not null);

        Assert.Equal("NJalfMgDwSG03a0opPhz8qxrXl4=", b.Credential);
        Assert.NotEqual(a.Credential, b.Credential);
    }

    [Fact]
    public void Un_secreto_distinto_produce_una_credencial_distinta()
    {
        // Es lo que impide fabricar credenciales sin conocer el secreto.
        var distinto = ConTurn();
        distinto["Turn:Secret"] = "otro-secreto-completamente-distinto";

        var original = Crear(ConTurn()).Generar("despachador1").Single(s => s.Username is not null);
        var otra = Crear(distinto).Generar("despachador1").Single(s => s.Username is not null);

        Assert.NotEqual(original.Credential, otra.Credential);
    }

    [Theory]
    [InlineData(null, 3600)]      // sin configurar: una hora
    [InlineData("5", 60)]         // por debajo del mínimo: se sube
    [InlineData("999999", 86400)] // por encima del máximo: se baja
    [InlineData("900", 900)]
    public void La_expiracion_respeta_el_TTL_acotado(string? ttl, int esperado)
    {
        var turn = Crear(ConTurn(ttl)).Generar("x").Single(s => s.Username is not null);

        Assert.StartsWith($"{Ahora + esperado}:", turn.Username);
    }

    [Fact]
    public void Entrega_STUN_sin_credenciales_y_TURN_con_ellas()
    {
        var servidores = Crear(ConTurn()).Generar("x");

        var stun = servidores.First();
        Assert.Null(stun.Username);
        Assert.Null(stun.Credential);
        Assert.All(stun.Urls, u => Assert.StartsWith("stun:", u));

        var turn = servidores.Last();
        Assert.Equal(2, turn.Urls.Length);
        Assert.All(turn.Urls, u => Assert.StartsWith("turn:", u));
        Assert.False(string.IsNullOrEmpty(turn.Credential));
    }

    [Fact]
    public void Sin_secreto_entrega_solo_STUN_y_nunca_una_credencial()
    {
        // Preferible a fallar: la llamada abre donde no hace falta TURN.
        var sinSecreto = ConTurn();
        sinSecreto["Turn:Secret"] = "  ";

        var servidores = Crear(sinSecreto).Generar("x");

        Assert.All(servidores, s => Assert.Null(s.Credential));
        Assert.All(servidores, s => Assert.DoesNotContain(s.Urls, u => u.StartsWith("turn:")));
    }

    [Fact]
    public void Sin_URLs_de_TURN_entrega_solo_STUN_aunque_haya_secreto()
    {
        var servidores = Crear(new() { ["Turn:Secret"] = Secreto }).Generar("x");

        var unico = Assert.Single(servidores);
        Assert.All(unico.Urls, u => Assert.StartsWith("stun:", u));
    }

    [Fact]
    public void Las_URLs_se_separan_por_coma_punto_y_coma_o_espacio()
    {
        var valores = ConTurn();
        valores["Turn:Urls"] = "turn:a.test:3478 ; turn:b.test:3478,turn:c.test:3478";

        var turn = Crear(valores).Generar("x").Single(s => s.Username is not null);

        Assert.Equal(new[] { "turn:a.test:3478", "turn:b.test:3478", "turn:c.test:3478" }, turn.Urls);
    }

    [Theory]
    [InlineData("juan:perez", "juanperez")]            // el ':' no puede colarse
    [InlineData("a b/c\\d", "abcd")]
    [InlineData("ciudadano-42", "ciudadano-42")]
    [InlineData("", "anonimo")]
    [InlineData(null, "anonimo")]
    public void El_sujeto_se_sanea(string? sujeto, string esperado)
    {
        var turn = Crear(ConTurn()).Generar(sujeto!).Single(s => s.Username is not null);

        Assert.Equal($"{Ahora + 3600}:{esperado}", turn.Username);
        // Exactamente un ':' — coturn parte por el primero.
        Assert.Equal(1, turn.Username!.Count(c => c == ':'));
    }

    [Fact]
    public void El_sujeto_se_recorta_a_40_caracteres()
    {
        var turn = Crear(ConTurn()).Generar(new string('a', 200)).Single(s => s.Username is not null);

        Assert.Equal(40, turn.Username!.Split(':')[1].Length);
    }

    [Fact]
    public void El_STUN_se_puede_cambiar_o_quitar()
    {
        var propio = ConTurn();
        propio["Turn:StunUrls"] = "stun:stun.interno.test:3478";
        Assert.Equal(new[] { "stun:stun.interno.test:3478" }, Crear(propio).Generar("x").First().Urls);

        var ninguno = ConTurn();
        ninguno["Turn:StunUrls"] = "";
        // Vacío significa «sin STUN»: el primer servidor ya es el TURN.
        Assert.NotNull(Crear(ninguno).Generar("x").First().Username);
    }
}
