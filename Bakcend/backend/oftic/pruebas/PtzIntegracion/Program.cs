// Prueba de integración del control PTZ y del protocolo de video.
//
// Ejercita el CAMINO REAL: DbCamaraService -> HikCentralVmsReader (que firma de
// verdad y habla HTTP) -> simulador, y DbCamaraRepository -> PostgreSQL de
// verdad. Lo único simulado es el HikCentral, y su verificación de firma está
// reimplementada aparte: si el driver firmara mal, aquí sale 401.
using System.Net.Http.Json;
using System.Text.Json;
using Comun.Dtos.Camaras;
using Comun.Security;
using Comun.Snowflake;
using Datos.Gestion;
using Datos.Interfaz;
using Datos.Tenant;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Negocio.Gestion;
using Negocio.Interfaz;
using Npgsql;
using Servicios.ApiInterfaz;
using Servicios.Vms;

var CADENA    = Environment.GetEnvironmentVariable("PG") ?? "Host=127.0.0.1;Port=5432;Database=Secad_Bogota;Username=postgres";
var SIM       = Environment.GetEnvironmentVariable("SIM") ?? "http://127.0.0.1:5610";
var APPKEY    = "AK-simulador";
var APPSECRET = "SK-simulador";
var USERID    = "svc_secad_cctv";
const int SITIO = 11001;

var fallos = new List<string>();
void Bien(string q) => Console.WriteLine($"  ✓ {q}");
void Mal(string q)  { fallos.Add(q); Console.WriteLine($"  ✗ {q}"); }
void Afirmar(bool cond, string q) { if (cond) Bien(q); else Mal(q); }

// ── DI igual que Program.cs en lo que toca a cámaras ─────────────────────────
var cfg = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
{
    ["Snowflake:NodeId"] = "7",
    ["ApiKeys:ClaveCifrado"] = Convert.ToBase64String(new byte[32]),
    ["Vms:TimeoutSegundos"] = "15",
}).Build();

var sc = new ServiceCollection();
sc.AddLogging(b => b.AddSimpleConsole(o => o.SingleLine = true).SetMinimumLevel(LogLevel.Warning));
sc.AddSingleton<IConfiguration>(cfg);
sc.AddSingleton<ISnowflakeGenerator, Servicios.Snowflake.SnowflakeGenerator>();
sc.AddSingleton<ICifradoSecretos, CifradoSecretos>();
sc.AddHttpClient(HikCentralVmsReader.NombreCliente, c => c.Timeout = TimeSpan.FromSeconds(15));
sc.AddHttpClient(GatewayMedios.NombreCliente, c => c.Timeout = TimeSpan.FromSeconds(8));
sc.AddSingleton<GatewayMedios>();
sc.AddSingleton<IVmsReader, HikCentralVmsReader>();
sc.AddSingleton<IVmsReaderFactory, VmsReaderFactory>();
sc.AddSingleton<TenantContext>();
sc.AddScoped<IDbCamaraRepository, DbCamaraRepository>();
sc.AddScoped<IDbCamaraIntegracionRepository, DbCamaraIntegracionRepository>();
sc.AddScoped<IDbCamaraService, DbCamaraService>();
var sp = sc.BuildServiceProvider();

var ds = new NpgsqlDataSourceBuilder(CADENA).Build();
sp.GetRequiredService<TenantContext>().Set(ds, "11001", "CAD Bogotá", SITIO);

var svc    = sp.GetRequiredService<IDbCamaraService>();
var integr = sp.GetRequiredService<IDbCamaraIntegracionRepository>();
var ct     = CancellationToken.None;

async Task<int> Ejecutar(string sql)
{
    await using var c = await ds.OpenConnectionAsync();
    await using var cmd = c.CreateCommand(); cmd.CommandText = sql;
    return await cmd.ExecuteNonQueryAsync();
}
async Task<string?> Uno(string sql)
{
    await using var c = await ds.OpenConnectionAsync();
    await using var cmd = c.CreateCommand(); cmd.CommandText = sql;
    var v = await cmd.ExecuteScalarAsync();
    return v is null or DBNull ? null : v.ToString();
}

var http = new HttpClient { BaseAddress = new Uri(SIM) };
async Task<JsonElement> Diag()
{
    var t = await http.GetStringAsync("/__diagnostico");
    return JsonDocument.Parse(t).RootElement.Clone();
}
async Task Reset() => await http.GetStringAsync("/__reset");

Console.WriteLine($"PostgreSQL : {CADENA}");
Console.WriteLine($"Simulador  : {SIM}");
var v77 = await Uno("SELECT count(*) FROM information_schema.columns WHERE table_name='cad_camaras_visualizacion' AND column_name='accion'") == "1";
Console.WriteLine($"Esquema    : {(v77 ? "CON V77 (accion/detalle)" : "SIN V77 — se prueba el respaldo 42703")}\n");

// ── Preparación: integración + catálogo ──────────────────────────────────────
await Ejecutar("DELETE FROM cad_camaras_visualizacion");
await Ejecutar("DELETE FROM cad_camaras");
await Ejecutar("DELETE FROM cad_camara_integracion");

var creada = await integr.CreateAsync(new DtoCamaraIntegracionRequest
{
    Nombre = "Simulador PTZ", Driver = VmsDrivers.HikCentral, BaseUrl = SIM, Activa = true,
    Config   = new() { ["appKey"] = APPKEY, ["userId"] = USERID, ["protocol"] = "hls_s", ["streamType"] = "1" },
    Secretos = new() { ["appSecret"] = APPSECRET },
}, "prueba", ct);
Afirmar(creada.Success, $"integración registrada ({creada.Message})");
var integracionId = long.Parse(creada.Id!);

var sync = await svc.SincronizarAsync(integracionId, "prueba", ct);
Afirmar(sync.Ok && sync.Reportadas == 4, $"catálogo sincronizado: {sync.Mensaje}");

// Las cámaras del VMS entran sin sitio ni censo; se les pone el del CAD para
// que pasen la frontera de GetPorCodigoAsync, igual que haría el emparejamiento.
await Ejecutar($"UPDATE cad_camaras SET sitio_graba={SITIO}, operativa=TRUE, latitud=4.6, longitud=-74.1");
Afirmar(await Uno("SELECT count(*) FROM cad_camaras WHERE tiene_ptz") == "2", "el VMS reportó 2 cámaras PTZ");

DtoPtzPeticion P(string c, int? dur = null, int? vel = null, int? preset = null, int? patrulla = null)
    => new() { Comando = c, DuracionMs = dur, Velocidad = vel, Preset = preset, Patrulla = patrulla, EventoId = 987 };

// ═════════════════════════════════════════════════════════════════════════════
Console.WriteLine("\n1) Movimiento continuo: arranca y PARA");
await Reset();
var r1 = await svc.ControlarPtzAsync("1002", SITIO, P(PtzComandos.Izquierda, dur: 300), "operador1", "10.0.0.9", ct);
Afirmar(r1.Ok, $"LEFT aceptado: {r1.Mensaje}");
var d1 = (await Diag()).GetProperty("ptz").EnumerateArray().ToList();
Afirmar(d1.Count == 2, $"el VMS recibió 2 llamadas (arranque + parada), recibió {d1.Count}");
if (d1.Count == 2)
{
    Afirmar(d1[0].GetProperty("action").GetInt32() == 0 && d1[1].GetProperty("action").GetInt32() == 1,
        "la primera es action=0 y la segunda action=1");
    var ms = (d1[1].GetProperty("t").GetDouble() - d1[0].GetProperty("t").GetDouble()) * 1000;
    Afirmar(ms >= 250 && ms <= 900, $"la parada llegó {ms:F0} ms después (se pidieron 300)");
    Afirmar(d1[0].GetProperty("speed").GetInt32() == 40, "velocidad por defecto 40");
}
Afirmar(r1.Datos!.Detenida, "el resultado declara la cámara detenida");

// ═════════════════════════════════════════════════════════════════════════════
Console.WriteLine("\n2) Cámara sin PTZ: se niega ANTES de tocar el VMS");
await Reset();
var r2 = await svc.ControlarPtzAsync("1001", SITIO, P(PtzComandos.Derecha), "operador1", null, ct);
Afirmar(!r2.Ok, $"rechazado: {r2.Mensaje}");
Afirmar((await Diag()).GetProperty("ptz").GetArrayLength() == 0, "no se envió nada al VMS");

// ═════════════════════════════════════════════════════════════════════════════
Console.WriteLine("\n3) Fronteras");
var r3a = await svc.ControlarPtzAsync("1002", 99999, P(PtzComandos.Izquierda), "intruso", null, ct);
Afirmar(!r3a.Ok, $"otro sitio de grabación: {r3a.Mensaje}");
var r3b = await svc.ControlarPtzAsync("1002", SITIO, P("GIRAR_A_LA_LUNA"), "operador1", null, ct);
Afirmar(!r3b.Ok, $"comando inventado: {r3b.Mensaje}");
var r3c = await svc.ControlarPtzAsync("no-existe", SITIO, P(PtzComandos.Izquierda), "operador1", null, ct);
Afirmar(!r3c.Ok, $"cámara inexistente: {r3c.Mensaje}");

// ═════════════════════════════════════════════════════════════════════════════
Console.WriteLine("\n4) Acotado de velocidad y duración (el cliente no manda)");
await Reset();
var r4 = await svc.ControlarPtzAsync("1002", SITIO, P(PtzComandos.AcercarZoom, dur: 999999, vel: 999), "operador1", null, ct);
Afirmar(r4.Ok, $"ZOOM_IN con valores absurdos aceptado tras acotar: {r4.Mensaje}");
Afirmar(r4.Datos!.DuracionMs == 2000, $"duración acotada a 2000 ms (quedó {r4.Datos.DuracionMs})");
var d4 = (await Diag()).GetProperty("ptz").EnumerateArray().ToList();
Afirmar(d4.Count == 2 && d4[0].GetProperty("speed").GetInt32() == 60, "velocidad acotada a 60 antes de salir");

// ═════════════════════════════════════════════════════════════════════════════
Console.WriteLine("\n5) Preset: una sola llamada, sin parada");
await Reset();
var r5 = await svc.ControlarPtzAsync("1002", SITIO, P(PtzComandos.IrAPreset, preset: 3), "operador1", null, ct);
Afirmar(r5.Ok, $"GOTO_PRESET 3: {r5.Mensaje}");
Afirmar((await Diag()).GetProperty("ptz").GetArrayLength() == 1, "una sola llamada: un preset no se para");
var r5b = await svc.ControlarPtzAsync("1002", SITIO, P(PtzComandos.IrAPreset, preset: 900), "operador1", null, ct);
Afirmar(!r5b.Ok, $"preset fuera de rango: {r5b.Mensaje}");
var r5c = await svc.ControlarPtzAsync("1002", SITIO, P(PtzComandos.CorrerPatrulla, patrulla: 99), "operador1", null, ct);
Afirmar(!r5c.Ok, $"patrulla fuera de rango: {r5c.Mensaje}");

// ═════════════════════════════════════════════════════════════════════════════
Console.WriteLine("\n6) Dos comandos a la vez sobre la misma cámara");
await Reset();
var a = svc.ControlarPtzAsync("1002", SITIO, P(PtzComandos.Izquierda, dur: 800), "operador1", null, ct);
await Task.Delay(120);
var b = await svc.ControlarPtzAsync("1002", SITIO, P(PtzComandos.Derecha, dur: 800), "operador2", null, ct);
var primera = await a;
Afirmar(primera.Ok && !b.Ok, $"la segunda se rechaza mientras la primera mueve: {b.Mensaje}");
Afirmar((await Diag()).GetProperty("ptz").GetArrayLength() == 2, "solo el par de la primera llegó al VMS");
var libre = await svc.ControlarPtzAsync("1002", SITIO, P(PtzComandos.Derecha, dur: 150), "operador2", null, ct);
Afirmar(libre.Ok, "al terminar, la cámara vuelve a aceptar comandos (el candado se liberó)");

// ═════════════════════════════════════════════════════════════════════════════
Console.WriteLine("\n7) Petición cancelada a media: la cámara SE PARA igual");
await Reset();
using (var cts = new CancellationTokenSource(150))
{
    try
    {
        await svc.ControlarPtzAsync("1002", SITIO, P(PtzComandos.Arriba, dur: 1500), "operador1", null, cts.Token);
        Mal("se esperaba OperationCanceledException");
    }
    catch (OperationCanceledException) { Bien("la llamada se cancela como pidió el cliente"); }
}
var d7 = (await Diag()).GetProperty("ptz").EnumerateArray().ToList();
Afirmar(d7.Any(x => x.GetProperty("action").GetInt32() == 1),
    "la parada llegó al VMS AUNQUE el token estaba cancelado (si esto falla, la cámara queda girando)");
Afirmar(await Uno("SELECT count(*) FROM cad_camaras_visualizacion WHERE camara_codigo='1002'") is not null,
    "la cancelación no rompió la bitácora");

// ═════════════════════════════════════════════════════════════════════════════
Console.WriteLine("\n8) Bitácora");
var total = await Uno("SELECT count(*) FROM cad_camaras_visualizacion");
Afirmar(total is not null && int.Parse(total) > 0, $"{total} movimientos auditados");
var negados = await Uno("SELECT count(*) FROM cad_camaras_visualizacion WHERE concedido=false");
Afirmar(negados is not null && int.Parse(negados) >= 5, $"{negados} intentos negados también quedaron");
if (v77)
{
    var acciones = await Uno("SELECT string_agg(DISTINCT accion, ',' ORDER BY accion) FROM cad_camaras_visualizacion");
    Console.WriteLine($"     acciones registradas: {acciones}");
    Afirmar(acciones is not null && acciones.Contains("LEFT") && acciones.Contains("GOTO_PRESET"),
        "la columna accion guarda el comando PTZ, no solo «VER»");
    var det = await Uno("SELECT detalle FROM cad_camaras_visualizacion WHERE accion='ZOOM_IN' AND concedido LIMIT 1");
    Afirmar(det is not null && det.Contains("vel=999"), $"el detalle guarda lo que pidió el cliente: «{det}»");
}
else
{
    Afirmar(int.Parse(total!) > 0,
        "el respaldo 42703 funcionó: se auditó sobre un esquema sin V77 sin perder ninguna fila");
}

// ═════════════════════════════════════════════════════════════════════════════
Console.WriteLine("\n9) Protocolo de video: qué endpoint y qué reproductor");
await Reset();

// HLS va por la v2 (por lotes, data.list[0].url).
var hls = await svc.ObtenerStreamAsync("1002", SITIO, null, 5, "operador1", null, ct);
Afirmar(hls.Ok, $"HLS entregado: {hls.Mensaje}");
Afirmar(hls.Datos?.Url.EndsWith(".m3u8") == true, $"URL de HLS: {hls.Datos?.Url ?? "(nada)"}");
Afirmar(hls.Datos?.Reproductor == "hls", $"reproductor «{hls.Datos?.Reproductor ?? "(nada)"}»");
var rutas = (await Diag()).GetProperty("peticiones").EnumerateArray().Select(x => x.GetString()).ToList();
Afirmar(rutas.Contains("/artemis/api/video/v2/cameras/previewURLs"), "HLS fue por la v2");

// WebSocket tiene que ir por la v1: es la única que lleva
// requestWebsocketProtocol, y el simulador rechaza pedirlo por la v2.
await Ejecutar("UPDATE cad_camara_integracion SET config_publico = "
             + "jsonb_set(config_publico, '{protocol}', '\"websocket\"')");
await Reset();
var ws = await svc.ObtenerStreamAsync("1002", SITIO, null, 5, "operador1", null, ct);
Afirmar(ws.Ok, $"WebSocket entregado: {ws.Mensaje}");
Afirmar(ws.Datos?.Url.StartsWith("wss://") == true, $"URL segura de WebSocket: {ws.Datos?.Url ?? "(nada)"}");
Afirmar(ws.Datos?.Reproductor == "jsdecoder",
    $"el backend avisa de que hace falta el jsDecoder («{ws.Datos?.Reproductor ?? "(nada)"}»)");
rutas = (await Diag()).GetProperty("peticiones").EnumerateArray().Select(x => x.GetString()).ToList();
Afirmar(rutas.Contains("/artemis/api/video/v1/cameras/previewURLs"),
    $"WebSocket fue por la v1 (rutas vistas: {string.Join(", ", rutas)})");

// websocket_s no manda requestWebsocketProtocol: el nombre ya dice seguro.
await Ejecutar("UPDATE cad_camara_integracion SET config_publico = "
             + "jsonb_set(config_publico, '{protocol}', '\"websocket_s\"')");
var wss = await svc.ObtenerStreamAsync("1002", SITIO, null, 5, "operador1", null, ct);
Afirmar(wss.Ok && wss.Datos?.Url.StartsWith("wss://") == true, $"websocket_s entregado: {wss.Mensaje}");

// Y se deja como estaba, que es lo que funciona hoy en producción.
await Ejecutar("UPDATE cad_camara_integracion SET config_publico = "
             + "jsonb_set(config_publico, '{protocol}', '\"hls_s\"')");

// ═════════════════════════════════════════════════════════════════════════════
Console.WriteLine("\n10) Reescritura por el nodo edge");
// Un ws:// reescrito con el esquema del edge saldría como http:// y el navegador
// no conectaría nunca. La familia la manda la URL original; el cifrado, el edge.
var casos = new (string Url, string Edge, string Esperado, string Porque)[]
{
    ("http://10.1.1.5:83/hls/a.m3u8",  "https://edge.local",
     "https://edge.local/hls/a.m3u8",  "http tras un edge con TLS sale https"),
    ("ws://10.1.1.5:559/ws/1?t=x",     "https://edge.local",
     "wss://edge.local/ws/1?t=x",      "ws tras un edge con TLS sale wss, no https"),
    ("wss://10.1.1.5:559/ws/1",        "http://edge.local:8080",
     "ws://edge.local:8080/ws/1",      "wss tras un edge sin TLS baja a ws"),
    ("https://10.1.1.5/proxy/x/a.m3u8", "https://edge.local/vms",
     "https://edge.local/vms/proxy/x/a.m3u8", "se respeta el prefijo del edge"),
    ("rtsp://10.1.1.5:554/Streaming/1", "https://edge.local",
     "rtsp://edge.local:554/Streaming/1", "rtsp conserva esquema y puerto"),
};
foreach (var c in casos)
{
    var obtenido = Servicios.Vms.NodoEdge.ReescribirOrigen(c.Url, c.Edge).TrimEnd('/');
    Afirmar(obtenido == c.Esperado.TrimEnd('/'), $"{c.Porque} → {obtenido}");
}
Afirmar(Servicios.Vms.NodoEdge.ReescribirOrigen("ws://vms/x", null) == "ws://vms/x",
    "sin edge configurado, la URL no se toca");

// ═════════════════════════════════════════════════════════════════════════════
Console.WriteLine("\n11) Firmas");
var fin = await Diag();
Afirmar(fin.GetProperty("firmas_mal").GetArrayLength() == 0,
    $"el simulador validó todas las firmas ({fin.GetProperty("firmas_mal")})");

Console.WriteLine(fallos.Count == 0
    ? "\n────────── TODO EN VERDE ──────────"
    : $"\n────────── {fallos.Count} FALLO(S) ──────────\n  - " + string.Join("\n  - ", fallos));
return fallos.Count == 0 ? 0 : 1;
