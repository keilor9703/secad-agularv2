using Npgsql;

// ════════════════════════════════════════════════════════════════════════
// Edge PlantaTel Service — Nivel 3 (Offline)
//
// Microservicio mínimo desplegado en la sede local de cada CAD. Recibe el
// mismo payload que api/RecepcionExterna/plantatel del backend central, pero
// escribe directo en la BD PostgreSQL local (réplica promovida a primaria
// durante el corte de WAN), sin depender de la resolución de tenant ni del
// resto del backend central.
//
// La PBX debe apuntar aquí SOLO como destino de fallback cuando
// https://secad.polired.gov.co no responde (ver docs/PLANTATEL_PBX_INTEGRACION.md).
//
// Fuera de alcance de este servicio: promoción de réplica, reconciliación
// con la BD central al restaurar el enlace. Ver
// backend/docs/RESILIENCIA_ESTADO_ACTUAL.md — Componentes A/B/C.
// ════════════════════════════════════════════════════════════════════════

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("LocalDb")
    ?? throw new InvalidOperationException("ConnectionStrings:LocalDb no configurado.");
builder.Services.AddSingleton(NpgsqlDataSource.Create(connectionString));

var app = builder.Build();

var apiKey            = app.Configuration["EdgePlantaTel:ApiKey"] ?? "";
var sitioGrabaDefault = app.Configuration.GetValue<int>("EdgePlantaTel:SitioGraba");

app.MapGet("/health", () => Results.Ok(new { status = "ok", modo = "edge-offline" }));

app.MapPost("/api/plantatel", async (PlantaTelEntradaRequest req, NpgsqlDataSource db, HttpContext ctx) =>
{
    if (string.IsNullOrWhiteSpace(apiKey))
        return Results.Json(new { success = false, message = "Servicio edge no configurado." }, statusCode: 503);

    var headerKey = ctx.Request.Headers["X-Api-Key"].FirstOrDefault() ?? "";
    if (!string.Equals(headerKey, apiKey, StringComparison.Ordinal))
        return Results.Json(new { success = false, message = "API key inválida." }, statusCode: 401);

    if (!int.TryParse(req.Acd, out var acd) || acd <= 0)
        return Results.BadRequest(new { success = false, message = "Acd inválido." });

    var telefonoLimpio = (req.NumTelefono ?? "").Replace("+", "").Replace(" ", "");
    if (!long.TryParse(telefonoLimpio, out var numeTelefono) || numeTelefono <= 0)
        return Results.BadRequest(new { success = false, message = "NumTelefono inválido." });

    var sitioGraba = req.SitioGraba > 0 ? req.SitioGraba : sitioGrabaDefault;
    if (sitioGraba <= 0)
        return Results.BadRequest(new { success = false, message = "SitioGraba requerido." });

    await using var conn = await db.OpenConnectionAsync(ctx.RequestAborted);
    await using var cmd  = conn.CreateCommand();
    cmd.CommandText = @"
        INSERT INTO cad_plantatel (sitio_graba, acd, nume_telefono, registrada, fecha_registro)
        VALUES (@sg, @acd, @tel, 'N', NOW())
        RETURNING id";
    cmd.Parameters.AddWithValue("sg",  sitioGraba);
    cmd.Parameters.AddWithValue("acd", acd);
    cmd.Parameters.AddWithValue("tel", numeTelefono);

    var id = (long)(await cmd.ExecuteScalarAsync(ctx.RequestAborted))!;

    return Results.Ok(new
    {
        success = true,
        message = "Llamada PlantaTel registrada en el nodo edge (modo offline).",
        id      = id.ToString()
    });
});

app.Run();

record PlantaTelEntradaRequest(string Acd, string NumTelefono, int SitioGraba);
