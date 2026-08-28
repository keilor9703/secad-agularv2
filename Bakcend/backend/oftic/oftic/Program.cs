using Api.BackgroundServices;
using Api.Converters;
using Api.Hubs;
using Api.Services;
using Servicios.Api;
using Servicios.ApiInterfaz;
using Api.Middleware;
using Comun.Interfaces;
using Comun.Snowflake;
using Datos.Gestion;
using Datos.Gestion.GestionDocumental;
using Datos.Interfaz;
using Datos.Interfaz.GestionDocumental;
using Datos.Tenant;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Negocio.Gestion;
using Negocio.Gestion.GestionDocumental;
using Negocio.Interfaz;
using Npgsql;
using Servicios.Api;
using Servicios.ApiInterfaz;
using Servicios.Snowflake;
using System.IO;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

// Config local opcional, SIEMPRE cargada sin importar el ambiente
// (ASPNETCORE_ENVIRONMENT) — para secretos que no deben ir al repo
// (ej. GespoOracle:ConnectionString) sin depender de si se corre en modo
// Development o Production. Se carga al final para que gane sobre
// appsettings.json y appsettings.{Environment}.json. Ignorado en git
// (ver .gitignore) — cada quien lo crea localmente, nunca se commitea.
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: true);

// Kestrel: aumentar límite para videos (150 MB)
builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = 150 * 1024 * 1024;
});

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNameCaseInsensitive = true;
        // Serializar respuestas en camelCase para que Angular las consuma directamente.
        options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
        // Serializar long / long? como cadena JSON para evitar pérdida de precisión
        // en JavaScript (Number.MAX_SAFE_INTEGER ≈ 9 × 10^15; Snowflake IDs ≈ 10^18).
        options.JsonSerializerOptions.Converters.Add(new LongToStringJsonConverter());
        options.JsonSerializerOptions.Converters.Add(new NullableLongToStringJsonConverter());
    });

// CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("DevCors", p =>
        p.WithOrigins("http://localhost:4200", "https://localhost:4200", "http://localhost:4300", "https://localhost:4300")
         .AllowAnyHeader().AllowAnyMethod().AllowCredentials());

    options.AddPolicy("PublicCors", p =>
        p.SetIsOriginAllowed(_ => true)
         .AllowAnyHeader().AllowAnyMethod().AllowCredentials());
});

// JWT Authentication
var jwtKey = builder.Configuration["Jwt:Key"];
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "oftic.api";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? jwtIssuer;

if (string.IsNullOrWhiteSpace(jwtKey) || jwtKey.Length < 32)
    throw new InvalidOperationException(
        "Jwt:Key no configurada o demasiado corta (mínimo 32 caracteres).");

builder.Services.AddAuthentication("Bearer")
    .AddJwtBearer("Bearer", options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };

        // SignalR: el navegador no puede poner cabecera Authorization en el
        // handshake WebSocket, así que el cliente manda el JWT como
        // ?access_token=... — solo se acepta así para las rutas del hub,
        // el resto de la API sigue exigiendo la cabecera Authorization normal.
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                var accessToken = ctx.Request.Query["access_token"];
                var path = ctx.HttpContext.Request.Path;
                if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/api/hubs"))
                    ctx.Token = accessToken;
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization(options =>
{
    // Any user with es_admin=true (role 1 or role 2 or SuperUserIds list)
    options.AddPolicy("Administrador", policy =>
        policy.RequireAssertion(ctx =>
            ctx.User.FindFirst("es_admin")?.Value == "true"));

    // Only users with es_super_admin=true (role 2 or SuperUserIds list)
    options.AddPolicy("SuperAdministrador", policy =>
        policy.RequireAssertion(ctx =>
            ctx.User.FindFirst("es_super_admin")?.Value == "true"));
});
builder.Services.AddMemoryCache();

// Master DB (PostgreSQL): NpgsqlDataSource singleton
// Se agrega Timezone=America/Bogota para que las sesiones PostgreSQL
// usen hora Colombia por defecto (afecta NOW(), CURRENT_TIMESTAMP, etc.).
var masterConnStr = builder.Configuration.GetConnectionString("MasterDb")
    ?? throw new InvalidOperationException("ConnectionStrings:MasterDb no configurada.");
var masterConnStrWithTz = masterConnStr.TrimEnd(';') + ";Timezone=America/Bogota";
builder.Services.AddSingleton(NpgsqlDataSource.Create(masterConnStrWithTz));

// Tenant infrastructure
builder.Services.AddSingleton<ConnectionPoolManager>();
builder.Services.AddScoped<TenantContext>();

// Snowflake ID generator — singleton: one instance per process, shared across all requests.
// NodeId is read from appsettings.json "Snowflake:NodeId".
// Main node = 1, Edge node = 2. Never share the same NodeId between two live nodes.
builder.Services.AddSingleton<ISnowflakeGenerator, SnowflakeGenerator>();

// HTTP clients for external APIs
builder.Services.AddHttpClient("AuthClient");
builder.Services.AddScoped<ITokenProvider, TokenProvider>();
// IPipTokenProvider: interfaz mínima en Comun, accesible desde la capa de datos.
// La misma instancia de TokenProvider la implementa (comparte caché).
builder.Services.AddScoped<IPipTokenProvider>(sp => (IPipTokenProvider)sp.GetRequiredService<ITokenProvider>());
builder.Services.AddTransient<AuthHeaderHandler>();

builder.Services.AddHttpClient<IApiWebOud, ApiWebOud>(c =>
    c.Timeout = TimeSpan.FromSeconds(15))
    .AddHttpMessageHandler<AuthHeaderHandler>();

builder.Services.AddScoped<IApiWebToken, ApiWebToken>();

// ── MFA / 2FA (servicio centralizado Api2FA Policía Nacional) ─────────────────
// MfaCentralService: cliente HTTP hacia Api2FA — necesita IMemoryCache (ya registrado arriba).
// MfaSessionTokenService: singleton (sin estado mutable, solo lee config).
builder.Services.AddHttpClient<IMfaCentralService, MfaCentralService>(c =>
    c.Timeout = TimeSpan.FromSeconds(10));
builder.Services.AddSingleton<MfaSessionTokenService>();

// ── Videollamada en vivo con el ciudadano (WebRTC señalizado por VideoSignalingHub) ──
// VideoSessionTokenService: singleton, mismo criterio que MfaSessionTokenService.
// IProveedorSms → DbConfigProveedorSms, que lee el proveedor activo y sus
// credenciales de ctr_config_sms (Administración → Proveedor SMS) y despacha
// al cliente correspondiente. Cambiar de proveedor (Infobip ⇄ Inalambria
// Express) es editar esa tabla desde la UI, sin redeploy.
builder.Services.AddSingleton<VideoSessionTokenService>();
builder.Services.AddHttpClient<IInfobipSmsSender, InfobipSmsSender>(c =>
    c.Timeout = TimeSpan.FromSeconds(15));
builder.Services.AddHttpClient<IInalambriaExpressSmsSender, InalambriaExpressSmsSender>(c =>
    c.Timeout = TimeSpan.FromSeconds(15));
builder.Services.AddScoped<IDbConfigSmsRepository, DbConfigSmsRepository>();
builder.Services.AddScoped<IDbConfigSmsService, DbConfigSmsService>();
builder.Services.AddScoped<IProveedorSms, DbConfigProveedorSms>();
builder.Services.AddScoped<IDbVideoLlamadaRepository, DbVideoLlamadaRepository>();
builder.Services.AddScoped<IDbVideoLlamadaService, DbVideoLlamadaService>();
// Grabación resiliente: el navegador sube el video por trozos mientras graba, así
// la evidencia queda en el servidor desde el primer trozo aunque el puesto del
// despachador muera. El store es singleton (solo maneja rutas y archivos); el
// finalizador es scoped porque toca la BD del tenant del scope.
builder.Services.AddSingleton<GrabacionVideoStore>();
builder.Services.AddScoped<GrabacionFinalizador>();
builder.Services.AddSignalR();

// Data repositories
builder.Services.AddScoped<IDbMasterRepository, DbMasterRepository>();
builder.Services.AddScoped<IDbAuthRepository, DbAuthRepository>();
builder.Services.AddScoped<IDbMenuRepository, DbMenuRepository>();
builder.Services.AddScoped<IDbMenuService, DbMenuService>();
builder.Services.AddScoped<IDbUsuarioRepository, DbUsuarioRepository>();
builder.Services.AddScoped<IDbHomeRepository, DbHomeRepository>();
builder.Services.AddScoped<IDbDominioRepository, DbDominioRepository>();
builder.Services.AddScoped<IDbDominioService, DbDominioService>();
builder.Services.AddScoped<IDbCasoRepository, DbCasoRepository>();
builder.Services.AddScoped<IDbCasoService, DbCasoService>();
builder.Services.AddScoped<IDbVideoRepository, DbVideoRepository>();
builder.Services.AddScoped<IDbVideoService, DbVideoService>();
builder.Services.AddScoped<IDbLineaMandoRepository, DbLineaMandoRepository>();
builder.Services.AddScoped<IDbLineaMandoService, DbLineaMandoService>();
builder.Services.AddScoped<IDbPedidoRepository, DbPedidoRepository>();
builder.Services.AddScoped<IDbPedidoService, DbPedidoService>();
builder.Services.AddScoped<IDbRecepcionRepository, DbRecepcionRepository>();
builder.Services.AddScoped<IDbRecepcionService, DbRecepcionService>();
builder.Services.AddScoped<IDbActuacionRepository, DbActuacionRepository>();
builder.Services.AddScoped<IDbActuacionService, DbActuacionService>();
builder.Services.AddScoped<IDbTurnoRepository, DbTurnoRepository>();
builder.Services.AddScoped<IDbTurnoService, DbTurnoService>();

// Business services
builder.Services.AddScoped<IJwtService, JwtService>();

// Módulo de Correos / Gestión Documental
builder.Services.AddScoped<IDbCuentaEmailRepository, DbCuentaEmailRepository>();
builder.Services.AddScoped<IDbGestionCorreosRepository, DbGestionCorreosRepository>();
builder.Services.AddScoped<IEmailService, EmailService>();

// Módulo §6.15 — Bitácora de Turno (Anotaciones Generales)
builder.Services.AddScoped<IDbAnotacionTurnoRepository, DbAnotacionTurnoRepository>();

// Módulo §6.17 — Asistente Inteligente (preguntas orientadoras por tipo de incidente)
builder.Services.AddScoped<IDbAsistenteRepository, DbAsistenteRepository>();

// Módulo Entidades/Fuerzas — gestión de fuerzas, canales y datos operacionales de usuarios
builder.Services.AddScoped<IDbFuerzaRepository, DbFuerzaRepository>();

// Módulo §6.1 — Agencias externas (despacho interagencial por API)
builder.Services.AddScoped<IDbAgenciaExternaRepository, DbAgenciaExternaRepository>();
builder.Services.AddScoped<IDbAgenciaExternaService,    DbAgenciaExternaService>();

// Módulo Recepción multicanal — adjuntos (fotos) + Chat/SMS API REST
builder.Services.AddScoped<IDbAdjuntoRepository, DbAdjuntoRepository>();
builder.Services.AddScoped<IDbAdjuntoService,    DbAdjuntoService>();

// Hub de Integraciones — integraciones entrantes + auditoría unificada
builder.Services.AddScoped<IDbIntegracionRepository, DbIntegracionRepository>();
builder.Services.AddScoped<IDbIntegracionService,    DbIntegracionService>();

// Integración de Cámaras (VMS) — configurable por el administrador
builder.Services.AddScoped<IDbCamaraIntegracionRepository, DbCamaraIntegracionRepository>();
builder.Services.AddScoped<IDbCamaraIntegracionService,    DbCamaraIntegracionService>();

// Módulo Reportes y Estadísticas (§6.16)
builder.Services.AddScoped<IDbReporteRepository, DbReporteRepository>();
builder.Services.AddScoped<IDbReporteService,    DbReporteService>();

// Módulo GIS 2D — Mapa de Incidentes (§2.3, §6.12)
builder.Services.AddScoped<IDbMapaRepository, DbMapaRepository>();

// Módulo GIS Estadístico Delincuencial — análisis histórico con heatmap y métricas
builder.Services.AddScoped<IDbMapaEstadisticoRepository, DbMapaEstadisticoRepository>();

// ── Monitor de salud de CADs ──────────────────────────────────────────────────
// BackgroundService que sondea periódicamente la BD de cada CAD y persiste
// métricas en secad_tenants + secad_salud_historial.
// Configuración: sección "HealthMonitor" en appsettings.json.
builder.Services.Configure<CadHealthMonitorOptions>(
    builder.Configuration.GetSection(CadHealthMonitorOptions.Section));
builder.Services.AddHostedService<CadHealthMonitorService>();

// ── Cierre automático de grabaciones huérfanas ────────────────────────────────
// Red de seguridad de la evidencia: si el puesto del despachador murió sin cerrar
// una grabación, este servicio la finaliza y la registra como adjunto del caso.
// Garantiza que una grabación iniciada SIEMPRE termine guardada.
builder.Services.AddHostedService<GrabacionesHuerfanasService>();

// ── Lectura directa de GPS/minuta desde Oracle GESPO (sin FDW) ────────────────
// Oracle.ManagedDataAccess.Core — driver 100% administrado, no requiere instalar
// ninguna extensión de Postgres ni cliente nativo en el servidor de BD.
// Deshabilitado por defecto — habilitar solo tras confirmar ConnectionString/
// Schema/ViewName reales. Configuración: sección "GespoOracle" en appsettings.json.
//
// NO hay ningún BackgroundService consultando Oracle en segundo plano de forma
// permanente — GPS y minuta se consultan bajo demanda: GPS desde
// P_SincronizarGpsBajoDemandaAsync (llamado por TurnosController.SincronizarGps,
// que el frontend de EVENTOS dispara solo mientras el operador tiene un canal
// seleccionado — ver el tick de polling ya existente en eventos.ts — y solo para
// las patrullas de ese canal/fuerza, no las de toda la fuerza. Turnos no hace
// georreferenciación ni llama a este endpoint), y minuta desde el wizard de
// importación SIVICC (un clic del usuario). GespoSyncCooldown evita ráfagas de
// consultas si varios operadores del mismo canal tienen la pantalla abierta a
// la vez.
builder.Services.Configure<GespoOracleOptions>(
    builder.Configuration.GetSection(GespoOracleOptions.Section));
builder.Services.AddSingleton<IGespoOracleReader, GespoOracleReader>();
builder.Services.AddSingleton<IGespoMinutaReader, GespoMinutaReader>();
builder.Services.AddSingleton<GespoSyncCooldown>();

// Swagger
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo { Title = "SECAD API", Version = "v1" });
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Ingrese: Bearer {token}"
    });
    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
            },
            Array.Empty<string>()
        }
    });
});

var app = builder.Build();

app.UseCors("DevCors");

// Serve uploaded files (videos, backgrounds, etc.)
var uploadsDir = Path.Combine(app.Environment.ContentRootPath, "uploads");
Directory.CreateDirectory(uploadsDir);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(uploadsDir),
    RequestPath = "/uploads"
});

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseAuthentication();

// TenantMiddleware: runs after auth, resolves tenant from JWT cod_dane claim
app.UseMiddleware<TenantMiddleware>();

app.UseAuthorization();
app.MapControllers();
app.MapHub<VideoSignalingHub>("/api/hubs/video");
app.MapGet("/health", () => Results.Ok("OK"));

app.Run();
