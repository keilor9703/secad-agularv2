// Prueba de integración del driver genérico por RTSP.
//
// Habla con un servidor RTSP DE VERDAD (el MediaMTX del banco, que sirve un
// stream real con video real) y con la API de control del gateway. Lo que se
// comprueba es justo lo que no se puede comprobar leyendo el código: que la
// sonda RTSP distingue «esto entrega video» de «esto no existe», y que el
// catálogo refleja la realidad del equipo en vez de suponerla.
//
// Ver pruebas/gateway-medios/README.md para montar el banco.
using Comun.Dtos.Camaras;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Servicios.ApiInterfaz;
using Servicios.Vms;

var RTSP_HOST = Environment.GetEnvironmentVariable("RTSP_HOST") ?? "127.0.0.1";
var GATEWAY   = Environment.GetEnvironmentVariable("GATEWAY")   ?? "http://127.0.0.1:8889";
var API_GW    = Environment.GetEnvironmentVariable("API_GW")     ?? "http://127.0.0.1:9997";

var fallos = new List<string>();
void Afirmar(bool ok, string q)
{
    Console.WriteLine($"  {(ok ? "✓" : "✗")} {q}");
    if (!ok) fallos.Add(q);
}

var sc = new ServiceCollection();
sc.AddLogging(b => b.AddSimpleConsole(o => o.SingleLine = true).SetMinimumLevel(LogLevel.Warning));
sc.AddHttpClient(GatewayMedios.NombreCliente, c => c.Timeout = TimeSpan.FromSeconds(8));
sc.AddSingleton<GatewayMedios>();
sc.AddSingleton<RtspSonda>();
sc.AddSingleton<IVmsReader, OnvifRtspVmsReader>();
var sp = sc.BuildServiceProvider();

var driver = sp.GetServices<IVmsReader>().First(d => d.Driver == VmsDrivers.OnvifRtsp);
var sonda  = sp.GetRequiredService<RtspSonda>();
var ct     = CancellationToken.None;

// El banco publica «origen» (H264) y «origen-vp8». Se usan como si fueran dos
// canales de un NVR: la plantilla los nombra por {canal}.
DtoVmsConexion Conexion(string canales) => new()
{
    Driver  = VmsDrivers.OnvifRtsp,
    BaseUrl = RTSP_HOST,
    Config  = new()
    {
        ["host"]          = RTSP_HOST,
        ["puerto"]        = "8554",
        ["canales"]       = canales,
        ["rtspPlantilla"] = "rtsp://{host}:{puerto}/{canal}",
        ["gatewayUrl"]    = GATEWAY,
        ["gatewayApiUrl"] = API_GW,
    },
};

Console.WriteLine($"RTSP     : rtsp://{RTSP_HOST}:8554/…");
Console.WriteLine($"Gateway  : {GATEWAY}\n");

// ═════════════════════════════════════════════════════════════════════════════
Console.WriteLine("1) La sonda RTSP distingue lo que existe de lo que no");
var bueno = await sonda.DescribirAsync($"rtsp://{RTSP_HOST}:8554/origen", ct);
Afirmar(bueno.Ok, $"un canal que emite: {bueno.Mensaje}");
Afirmar(bueno.Codec == "H264", $"y reconoce el códec: {bueno.Codec ?? "(ninguno)"}");

var inexistente = await sonda.DescribirAsync($"rtsp://{RTSP_HOST}:8554/no-existe", ct);
Afirmar(!inexistente.Ok, $"un canal que no existe: {inexistente.Mensaje}");

var apagado = await sonda.DescribirAsync($"rtsp://{RTSP_HOST}:9999/origen", ct, timeoutMs: 1500);
Afirmar(!apagado.Ok, $"un equipo que no responde: {apagado.Mensaje}");

var vp8 = await sonda.DescribirAsync($"rtsp://{RTSP_HOST}:8554/origen-vp8", ct);
Afirmar(vp8.Ok, $"el otro canal también: {vp8.Mensaje}");

// ═════════════════════════════════════════════════════════════════════════════
Console.WriteLine("\n2) Probar conexión dice la verdad");
var ok = await driver.ProbarAsync(Conexion("origen,origen-vp8"), ct);
Afirmar(ok.Ok, $"con plantilla y canal correctos: {ok.Mensaje}");
Afirmar(ok.Datos == 2, $"y cuenta los canales declarados: {ok.Datos}");

var mal = await driver.ProbarAsync(Conexion("canal-que-no-existe"), ct);
Afirmar(!mal.Ok, $"con un canal inexistente NO dice que está bien: {mal.Mensaje}");

var sinCanales = await driver.ProbarAsync(Conexion(""), ct);
Afirmar(!sinCanales.Ok, $"sin canales declarados: {sinCanales.Mensaje}");

// ═════════════════════════════════════════════════════════════════════════════
Console.WriteLine("\n3) El catálogo refleja el equipo, no lo supone");
var cat = await driver.ListarCamarasAsync(Conexion("origen,origen-vp8,fantasma"), 1, 50, ct);
Afirmar(cat.Ok, "se listó el catálogo");
Afirmar(cat.Datos!.Total == 3, $"tres canales declarados, tres reportados: {cat.Datos.Total}");
var porCodigo = cat.Datos.Camaras.ToDictionary(c => c.Codigo);
Afirmar(porCodigo["origen"].Estado == 1, $"«origen» sale EN LÍNEA ({porCodigo["origen"].Estado})");
Afirmar(porCodigo["fantasma"].Estado == 2,
    $"«fantasma» sale FUERA DE LÍNEA ({porCodigo["fantasma"].Estado}) — no se inventa que funciona");

// ═════════════════════════════════════════════════════════════════════════════
Console.WriteLine("\n4) Los rangos se expanden y no se duplican");
var rangos = await driver.ListarCamarasAsync(Conexion("1-4,3,7"), 1, 50, ct);
var codigos = rangos.Datos!.Camaras.Select(c => c.Codigo).ToList();
Afirmar(string.Join(",", codigos) == "1,2,3,4,7",
    $"«1-4,3,7» da 1,2,3,4,7 sin repetir el 3 → {string.Join(",", codigos)}");
Afirmar(rangos.Datos.Camaras.All(c => c.Estado == 2),
    "y esos canales, que no existen en el banco, salen fuera de línea");

// ═════════════════════════════════════════════════════════════════════════════
Console.WriteLine("\n5) Paginación");
var p1 = await driver.ListarCamarasAsync(Conexion("1-10"), 1, 4, ct);
var p3 = await driver.ListarCamarasAsync(Conexion("1-10"), 3, 4, ct);
Afirmar(p1.Datos!.Camaras.Count == 4 && p1.Datos.HayMas, "la primera página trae 4 y avisa que hay más");
Afirmar(p3.Datos!.Camaras.Count == 2 && !p3.Datos.HayMas, "la última trae 2 y ya no hay más");

// ═════════════════════════════════════════════════════════════════════════════
Console.WriteLine("\n6) El video sale por el gateway, con la contraseña a salvo");
var cx = Conexion("origen");
cx.Config["rtspPlantilla"] = "rtsp://{usuario}:{clave}@{host}:{puerto}/{canal}";
cx.Config["usuario"] = "operador";
cx.Secretos["clave"] = "ClaveDelNvr123";

var stream = await driver.ObtenerStreamAsync(cx, "origen", ct);
Afirmar(stream.Ok, $"se obtuvo el stream: {stream.Mensaje}");
Afirmar(stream.Datos!.Reproductor == VmsProtocolos.ReproductorWebrtc,
    $"el navegador recibe WebRTC ({stream.Datos.Reproductor})");
Afirmar(stream.Datos.Url.StartsWith(GATEWAY) && stream.Datos.Url.EndsWith("/whep"),
    $"y la URL es la del gateway: {stream.Datos.Url}");
// Lo más importante de este bloque: la contraseña del NVR no puede salir hacia
// el navegador. Si apareciera aquí, quedaría en el historial del puesto.
Afirmar(!stream.Datos.Url.Contains("ClaveDelNvr123")
     && (stream.Datos.Autenticacion ?? "").Contains("ClaveDelNvr123") == false,
    "la contraseña del equipo NO viaja al navegador");

// Y sí llegó al gateway, que es quien la necesita.
using var http = new HttpClient();
var ruta = GatewayMedios.RutaDeCamara("origen");
var conf = await http.GetStringAsync($"{API_GW}/v3/config/paths/get/{ruta}", ct);
Afirmar(conf.Contains("ClaveDelNvr123"), "y sí quedó registrada en el gateway, que es quien la usa");
Afirmar(conf.Contains("\"sourceOnDemand\":true"),
    "la ruta es por demanda: solo se conecta al equipo cuando alguien mira");

// ═════════════════════════════════════════════════════════════════════════════
Console.WriteLine("\n7) Sin gateway configurado se dice claro, no se entrega un RTSP");
var sinGw = Conexion("origen");
sinGw.Config.Remove("gatewayUrl");
var r7 = await driver.ObtenerStreamAsync(sinGw, "origen", ct);
Afirmar(!r7.Ok && r7.Mensaje.Contains("gateway"),
    $"se explica que falta el gateway: {r7.Mensaje}");

Console.WriteLine(fallos.Count == 0
    ? "\n────────── TODO EN VERDE ──────────"
    : $"\n────────── {fallos.Count} FALLO(S) ──────────\n  - " + string.Join("\n  - ", fallos));
return fallos.Count == 0 ? 0 : 1;
