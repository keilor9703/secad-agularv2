using Comun.Dtos.Agencias;
using Comun.Interfaces;
using Comun.Snowflake;
using Datos.Interfaz;
using Datos.Tenant;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Npgsql;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Datos.Gestion
{
    public class DbAgenciaExternaRepository : IDbAgenciaExternaRepository
    {
        private readonly TenantContext                       _tenant;
        private readonly ISnowflakeGenerator                 _snowflake;
        private readonly IHttpClientFactory                  _httpFactory;
        private readonly IPipTokenProvider                   _pipTokenProvider;
        private readonly IConfiguration                      _cfg;
        private readonly ILogger<DbAgenciaExternaRepository> _logger;

        // Opciones de serialización: camelCase, sin null, fechas ISO 8601
        private static readonly JsonSerializerOptions _jsonOpts = new()
        {
            PropertyNamingPolicy        = JsonNamingPolicy.CamelCase,
            DefaultIgnoreCondition      = JsonIgnoreCondition.WhenWritingNull,
            WriteIndented               = false
        };

        public DbAgenciaExternaRepository(
            TenantContext tenant,
            ISnowflakeGenerator snowflake,
            IHttpClientFactory httpFactory,
            IPipTokenProvider pipTokenProvider,
            IConfiguration cfg,
            ILogger<DbAgenciaExternaRepository> logger)
        {
            _tenant           = tenant;
            _snowflake        = snowflake;
            _httpFactory      = httpFactory;
            _pipTokenProvider = pipTokenProvider;
            _cfg              = cfg;
            _logger           = logger;
        }

        // ════════════════════════════════════════════════════════════════════════
        // CRUD
        // ════════════════════════════════════════════════════════════════════════

        private const string SelectCols = @"
            SELECT id, nombre, descripcion, tipo_agencia,
                   api_url, api_metodo,
                   tipo_auth,
                   (api_token IS NOT NULL AND api_token <> '')
                   OR (api_password IS NOT NULL AND api_password <> '') AS tiene_credencial,
                   api_usuario,
                   auth_extra::text,
                   api_cabeceras::text, campo_mapeo::text,
                   activa, fecha_creacion, fecha_modificacion,
                   COALESCE(formato_payload, 'PLANO') AS formato_payload
            FROM   cad_agencias_externas";

        public async Task<List<DtoAgenciaExterna>> GetAllAsync(CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = SelectCols + "\nORDER BY nombre ASC";
            var list = new List<DtoAgenciaExterna>();
            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            while (await rdr.ReadAsync(ct))
                list.Add(MapAgencia(rdr));
            return list;
        }

        public async Task<DtoAgenciaExterna?> GetByIdAsync(long id, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = SelectCols + "\nWHERE id = @id";
            cmd.Parameters.AddWithValue("id", id);
            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            return await rdr.ReadAsync(ct) ? MapAgencia(rdr) : null;
        }

        public async Task<(bool success, string message, string? id)> CreateAsync(
            DtoAgenciaExternaRequest req, CancellationToken ct)
        {
            try
            {
                var newId = _snowflake.NextId();
                await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
                await using var cmd  = conn.CreateCommand();
                cmd.CommandText = @"
                    INSERT INTO cad_agencias_externas
                        (id, nombre, descripcion, tipo_agencia,
                         api_url, api_metodo,
                         tipo_auth, api_token, api_usuario, api_password, auth_extra,
                         api_cabeceras, campo_mapeo, formato_payload, activa)
                    VALUES
                        (@id, @nombre, @descripcion, @tipo,
                         @url, @metodo,
                         @tipoAuth, @token, @usuario, @password, @authExtra::jsonb,
                         @cabeceras::jsonb, @mapeo::jsonb, @formato, @activa)";

                cmd.Parameters.AddWithValue("id",          newId);
                cmd.Parameters.AddWithValue("nombre",      req.Nombre.Trim());
                cmd.Parameters.AddWithValue("descripcion", (object?)req.Descripcion ?? DBNull.Value);
                cmd.Parameters.AddWithValue("tipo",        req.TipoAgencia.Trim());
                cmd.Parameters.AddWithValue("url",         (object?)req.ApiUrl?.Trim()       ?? DBNull.Value);
                cmd.Parameters.AddWithValue("metodo",      req.ApiMetodo.Trim().ToUpperInvariant());
                cmd.Parameters.AddWithValue("tipoAuth",    req.TipoAuth.Trim().ToUpperInvariant());
                cmd.Parameters.AddWithValue("token",       (object?)req.ApiToken?.Trim()     ?? DBNull.Value);
                cmd.Parameters.AddWithValue("usuario",     (object?)req.ApiUsuario?.Trim()   ?? DBNull.Value);
                cmd.Parameters.AddWithValue("password",    (object?)req.ApiPassword?.Trim()  ?? DBNull.Value);
                cmd.Parameters.AddWithValue("authExtra",   (object?)req.AuthExtra?.Trim()    ?? DBNull.Value);
                cmd.Parameters.AddWithValue("cabeceras",   (object?)req.ApiCabeceras?.Trim() ?? DBNull.Value);
                cmd.Parameters.AddWithValue("mapeo",       (object?)req.CampoMapeo?.Trim()   ?? DBNull.Value);
                cmd.Parameters.AddWithValue("formato",     req.FormatoPayload.Trim().ToUpperInvariant());
                cmd.Parameters.AddWithValue("activa",      req.Activa);

                await cmd.ExecuteNonQueryAsync(ct);
                return (true, "Agencia externa creada correctamente.", newId.ToString());
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creando agencia externa");
                return (false, $"Error al crear agencia: {ex.Message}", null);
            }
        }

        public async Task<(bool success, string message)> UpdateAsync(
            long id, DtoAgenciaExternaRequest req, CancellationToken ct)
        {
            try
            {
                await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
                await using var cmd  = conn.CreateCommand();

                // Solo actualiza credencial si se envió un valor nuevo
                var updateToken    = !string.IsNullOrWhiteSpace(req.ApiToken);
                var updatePassword = !string.IsNullOrWhiteSpace(req.ApiPassword);

                var sql = @"
                    UPDATE cad_agencias_externas SET
                        nombre             = @nombre,
                        descripcion        = @descripcion,
                        tipo_agencia       = @tipo,
                        api_url            = @url,
                        api_metodo         = @metodo,
                        tipo_auth          = @tipoAuth,
                        api_usuario        = @usuario,
                        auth_extra         = @authExtra::jsonb,
                        api_cabeceras      = @cabeceras::jsonb,
                        campo_mapeo        = @mapeo::jsonb,
                        formato_payload    = @formato,
                        activa             = @activa,
                        fecha_modificacion = NOW()"
                    + (updateToken    ? ", api_token    = @token"    : "")
                    + (updatePassword ? ", api_password = @password" : "")
                    + " WHERE id = @id";

                cmd.CommandText = sql;
                cmd.Parameters.AddWithValue("id",          id);
                cmd.Parameters.AddWithValue("nombre",      req.Nombre.Trim());
                cmd.Parameters.AddWithValue("descripcion", (object?)req.Descripcion ?? DBNull.Value);
                cmd.Parameters.AddWithValue("tipo",        req.TipoAgencia.Trim());
                cmd.Parameters.AddWithValue("url",         (object?)req.ApiUrl?.Trim()       ?? DBNull.Value);
                cmd.Parameters.AddWithValue("metodo",      req.ApiMetodo.Trim().ToUpperInvariant());
                cmd.Parameters.AddWithValue("tipoAuth",    req.TipoAuth.Trim().ToUpperInvariant());
                cmd.Parameters.AddWithValue("usuario",     (object?)req.ApiUsuario?.Trim()   ?? DBNull.Value);
                cmd.Parameters.AddWithValue("authExtra",   (object?)req.AuthExtra?.Trim()    ?? DBNull.Value);
                cmd.Parameters.AddWithValue("cabeceras",   (object?)req.ApiCabeceras?.Trim() ?? DBNull.Value);
                cmd.Parameters.AddWithValue("mapeo",       (object?)req.CampoMapeo?.Trim()   ?? DBNull.Value);
                cmd.Parameters.AddWithValue("activa",      req.Activa);
                cmd.Parameters.AddWithValue("formato",    req.FormatoPayload.Trim().ToUpperInvariant());
                if (updateToken)    cmd.Parameters.AddWithValue("token",    req.ApiToken!.Trim());
                if (updatePassword) cmd.Parameters.AddWithValue("password", req.ApiPassword!.Trim());

                var rows = await cmd.ExecuteNonQueryAsync(ct);
                return rows > 0
                    ? (true,  "Agencia actualizada correctamente.")
                    : (false, "Agencia no encontrada.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error actualizando agencia id={Id}", id);
                return (false, $"Error al actualizar: {ex.Message}");
            }
        }

        public async Task<(bool success, string message)> ToggleAsync(long id, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
                UPDATE cad_agencias_externas
                   SET activa = NOT activa, fecha_modificacion = NOW()
                 WHERE id = @id
                RETURNING activa";
            cmd.Parameters.AddWithValue("id", id);
            var result = await cmd.ExecuteScalarAsync(ct);
            if (result is null) return (false, "Agencia no encontrada.");
            return (true, (bool)result ? "Agencia activada." : "Agencia desactivada.");
        }

        // ════════════════════════════════════════════════════════════════════════
        // DISPATCH — envío a API externa con soporte de 6 modos de auth
        // ════════════════════════════════════════════════════════════════════════

        public async Task<DtoDespachoExternoResult> DespacharAsync(
            DtoDespachoExternoRequest req, string usuario, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);

            // 1. Cargar agencia con credenciales completas (privado, nunca expuesto)
            DtoAgenciaConToken? agencia = null;
            await using (var cmdAg = conn.CreateCommand())
            {
                cmdAg.CommandText = @"
                    SELECT id, nombre, api_url, api_metodo,
                           tipo_auth, api_token, api_usuario, api_password, auth_extra::text,
                           api_cabeceras::text, campo_mapeo::text,
                           COALESCE(formato_payload, 'PLANO') AS formato_payload
                    FROM   cad_agencias_externas
                    WHERE  id = @id AND activa = TRUE";
                cmdAg.Parameters.AddWithValue("id", req.AgenciaId);
                await using var rdr = await cmdAg.ExecuteReaderAsync(ct);
                if (await rdr.ReadAsync(ct))
                    agencia = new DtoAgenciaConToken
                    {
                        Id             = rdr.GetInt64(0),
                        Nombre         = rdr.GetString(1),
                        ApiUrl         = rdr.IsDBNull(2)  ? null : rdr.GetString(2),
                        ApiMetodo      = rdr.IsDBNull(3)  ? "POST" : rdr.GetString(3),
                        TipoAuth       = rdr.IsDBNull(4)  ? AgenciaAuthMode.Bearer : rdr.GetString(4),
                        ApiToken       = rdr.IsDBNull(5)  ? null : rdr.GetString(5),
                        ApiUsuario     = rdr.IsDBNull(6)  ? null : rdr.GetString(6),
                        ApiPassword    = rdr.IsDBNull(7)  ? null : rdr.GetString(7),
                        AuthExtra      = rdr.IsDBNull(8)  ? null : rdr.GetString(8),
                        Cabeceras      = rdr.IsDBNull(9)  ? null : rdr.GetString(9),
                        CampoMapeo     = rdr.IsDBNull(10) ? null : rdr.GetString(10),
                        FormatoPayload = rdr.IsDBNull(11) ? AgenciaPayloadFormato.Plano : rdr.GetString(11),
                    };
            }

            if (agencia is null)
                return Fail("Agencia no encontrada o inactiva.");
            if (string.IsNullOrWhiteSpace(agencia.ApiUrl))
                return Fail("La agencia no tiene URL de API configurada.");

            // ── 2. PEDIDO: todos los campos del incidente ──────────────────────────
            Dictionary<string, object?> casoFlat;   // plano, para campo_mapeo
            object? seccionCaso, seccionUbicacion, seccionReportante;

            await using (var cmdPed = conn.CreateCommand())
            {
                cmdPed.CommandText = @"
                    SELECT p.id::text,   p.sitio_graba,       p.hora_caso,
                           p.fecha_creacion,  p.fecha_primer_acceso,
                           p.codi_pedido,     p.codi_pedido2,
                           p.tipo_pedido,     p.cali_pedido,    p.importancia,
                           p.prioridad,       p.estado,         p.comentario,
                           p.nomb_llamante,   p.nume_telefono::text,  p.prop_telefono,
                           p.dire_llamante,   p.barrio,         p.ciudad,
                           p.dire_caso,       p.latitud_caso,   p.longitud_caso,
                           p.cordx,           p.cordy,
                           p.disp_telefonico, p.celda_marcacion,
                           COALESCE(c.descripcion, p.codi_pedido) AS desc_caso
                    FROM   cad_pedidos p
                    LEFT   JOIN cad_casos c
                           ON TRIM(UPPER(c.codigo)) = TRIM(UPPER(p.codi_pedido))
                    WHERE  p.id = @id AND p.sitio_graba = @sg";
                cmdPed.Parameters.AddWithValue("id", req.PedidoId);
                cmdPed.Parameters.AddWithValue("sg", req.SitioGraba);

                await using var rdrP = await cmdPed.ExecuteReaderAsync(ct);
                if (!await rdrP.ReadAsync(ct))
                    return Fail("Pedido no encontrado.");

                string S(int i)   => rdrP.IsDBNull(i) ? null! : rdrP.GetString(i);
                string? Sn(int i) => rdrP.IsDBNull(i) ? null  : rdrP.GetString(i);
                string? Ts(int i) => rdrP.IsDBNull(i) ? null  : rdrP.GetDateTime(i).ToString("O");

                casoFlat = new Dictionary<string, object?>
                {
                    // ── plano para campo_mapeo (backward-compat) ─────────────
                    ["id"]              = S(0),
                    ["sitioGraba"]      = rdrP.IsDBNull(1)  ? (int?)null : rdrP.GetInt32(1),
                    ["horaCaso"]        = Ts(2),
                    ["fechaCreacion"]   = Ts(3),
                    ["fechaPrimerAcceso"] = Ts(4),
                    ["codiPedido"]      = Sn(5),
                    ["codiPedido2"]     = Sn(6),
                    ["tipoPedido"]      = Sn(7),
                    ["caliPedido"]      = Sn(8),
                    ["importancia"]     = Sn(9),
                    ["prioridad"]       = Sn(10),
                    ["estado"]          = Sn(11),
                    ["descripcion"]     = Sn(12),
                    ["nombLlamante"]    = Sn(13),
                    ["numeTelefono"]    = Sn(14),
                    ["propTelefono"]    = Sn(15),
                    ["direLlamante"]    = Sn(16),
                    ["barrio"]          = Sn(17),
                    ["ciudad"]          = Sn(18),
                    ["direCaso"]        = Sn(19),
                    ["latitudCaso"]     = Sn(20),
                    ["longitudCaso"]    = Sn(21),
                    ["cordX"]           = Sn(22),
                    ["cordY"]           = Sn(23),
                    ["dispTelefonico"]  = Sn(24),
                    ["celdaMarcacion"]  = Sn(25),
                    ["descCaso"]        = Sn(26),
                };

                // ── secciones estructuradas para el payload rico ─────────────
                seccionCaso = new
                {
                    id              = S(0),
                    sitioGraba      = rdrP.IsDBNull(1) ? (int?)null : rdrP.GetInt32(1),
                    codigoCaso      = Sn(5),
                    codigoCaso2     = Sn(6),
                    descripcionCaso = Sn(26),
                    tipoCaso        = Sn(7),
                    prioridad       = Sn(10),
                    calidad         = Sn(8),
                    importancia     = Sn(9),
                    estado          = Sn(11),
                    horaCaso        = Ts(2),
                    fechaCreacion   = Ts(3),
                    fechaPrimerAcceso = Ts(4),
                    descripcion     = Sn(12),
                    dispTelefonico  = Sn(24),
                    celdaMarcacion  = Sn(25),
                };

                seccionUbicacion = new
                {
                    direccion  = Sn(19),
                    barrio     = Sn(17),
                    ciudad     = Sn(18),
                    latitud    = Sn(20),
                    longitud   = Sn(21),
                    coordX     = Sn(22),
                    coordY     = Sn(23),
                };

                seccionReportante = new
                {
                    nombre             = Sn(13),
                    telefono           = Sn(14),
                    propietarioTelefono= Sn(15),
                    direccion          = Sn(16),
                };
            }

            // ── 3. EVENTO: último despacho registrado ──────────────────────────────
            object? seccionDespacho = null;
            long?   eventoId        = null;

            await using (var cmdEv = conn.CreateCommand())
            {
                cmdEv.CommandText = @"
                    SELECT e.id::text,   e.origen,     e.estado,
                           e.fuerza_id,  f.descripcion AS fuerza_nombre,
                           e.usuario_genera,  e.tipo_despachador,
                           e.fecha_creacion,  e.fecha_despacho,
                           e.fecha_llegada,   e.fecha_cierre,
                           e.codigo_cierre_primario, e.clasif_cierre, e.observacion_cierre
                    FROM   cad_eventos e
                    LEFT   JOIN cad_fuerzas f ON f.id = e.fuerza_id
                    WHERE  e.pedido_id = @id
                    ORDER  BY e.fecha_creacion DESC
                    LIMIT  1";
                cmdEv.Parameters.AddWithValue("id", req.PedidoId);

                await using var rdrEv = await cmdEv.ExecuteReaderAsync(ct);
                if (await rdrEv.ReadAsync(ct))
                {
                    string? Sev(int i) => rdrEv.IsDBNull(i) ? null : rdrEv.GetString(i);
                    string? Tev(int i) => rdrEv.IsDBNull(i) ? null : rdrEv.GetDateTime(i).ToString("O");

                    if (!rdrEv.IsDBNull(0) && long.TryParse(rdrEv.GetString(0), out var eid))
                        eventoId = eid;

                    seccionDespacho = new
                    {
                        eventoId         = Sev(0),
                        origen           = Sev(1),
                        estado           = Sev(2),
                        fuerzaId         = rdrEv.IsDBNull(3) ? (int?)null : rdrEv.GetInt32(3),
                        fuerza           = Sev(4),
                        despachador      = Sev(5),
                        tipoDespachador  = Sev(6),
                        fechaDespacho    = Tev(8),
                        fechaLlegada     = Tev(9),
                        fechaCierre      = Tev(10),
                        codigoCierre     = Sev(11),
                        clasifCierre     = Sev(12),
                        observacionCierre= Sev(13),
                    };
                }
            }

            // ── 4. ACTUACIONES: todas las agencias/canales del evento ──────────────
            var actuaciones = new List<object>();

            if (eventoId.HasValue)
            {
                await using var cmdAct = conn.CreateCommand();
                cmdAct.CommandText = @"
                    SELECT a.id::text,
                           a.fuerza_id,    a.fuerza_descripcion,
                           a.canal_codigo, a.canal_descripcion,
                           a.despachador_usuario, a.tipo_despachador,
                           a.unidad_asignada,     a.placa_unidad,
                           a.estado,
                           a.fecha_despacho,  a.fecha_llegada,    a.fecha_cierre,
                           a.codigo_cierre_primario, a.clasif_cierre, a.observacion_cierre,
                           a.cali_pedido
                    FROM   cad_actuaciones a
                    WHERE  a.evento_id = @evId
                    ORDER  BY a.fecha_creacion";
                cmdAct.Parameters.AddWithValue("evId", eventoId.Value);

                await using var rdrAct = await cmdAct.ExecuteReaderAsync(ct);
                while (await rdrAct.ReadAsync(ct))
                {
                    string? Sa(int i) => rdrAct.IsDBNull(i) ? null : rdrAct.GetString(i);
                    string? Ta(int i) => rdrAct.IsDBNull(i) ? null : rdrAct.GetDateTime(i).ToString("O");

                    actuaciones.Add(new
                    {
                        id               = Sa(0),
                        fuerzaId         = rdrAct.IsDBNull(1) ? (int?)null : rdrAct.GetInt32(1),
                        fuerza           = Sa(2),
                        canalCodigo      = rdrAct.IsDBNull(3) ? (int?)null : rdrAct.GetInt32(3),
                        canal            = Sa(4),
                        despachador      = Sa(5),
                        tipoDespachador  = Sa(6),
                        unidad           = Sa(7),
                        placa            = Sa(8),
                        estado           = Sa(9),
                        fechaDespacho    = Ta(10),
                        fechaLlegada     = Ta(11),
                        fechaCierre      = Ta(12),
                        codigoCierre     = Sa(13),
                        clasifCierre     = Sa(14),
                        observacionCierre= Sa(15),
                        calidad          = Sa(16),
                    });
                }
            }

            // ── 5. CONSTRUIR PAYLOAD FINAL ─────────────────────────────────────────
            //    Estructura en secciones + sección plana con campo_mapeo aplicado
            //    para compatibilidad con agencias que esperan el formato anterior.
            var callbackBase = _cfg["ApiSettings:SecadBaseUrl"]?.TrimEnd('/');

            // callbackUrl autocontenida: lleva ?codDane= para que la agencia externa
            // pueda hacer POST de vuelta sin conocer nada del multi-tenancy de SECAD.
            // El TenantMiddleware lee codDane del query string cuando no hay JWT ni header.
            var codDane     = _tenant.CodDane;
            var callbackUrl = callbackBase is not null
                ? (codDane is not null
                    ? $"{callbackBase}/api/ActualizacionExterna/{casoFlat["id"]}?codDane={codDane}"
                    : $"{callbackBase}/api/ActualizacionExterna/{casoFlat["id"]}")
                : null;

            // Seleccionar formato según la configuración de la agencia
            object payloadFinal;
            if (agencia.FormatoPayload.Equals(AgenciaPayloadFormato.Estructurado, StringComparison.OrdinalIgnoreCase))
            {
                // ESTRUCTURADO: body jerárquico completo con _secad, caso, ubicacion, etc.
                // Las secciones anónimas ya omiten nulos por WhenWritingNull;
                // camposMapeados se filtra explícitamente porque es un Dictionary.
                var payloadEstructurado = new Dictionary<string, object?>
                {
                    ["_secad"] = new
                    {
                        version       = "2.0",
                        sistemaOrigen = "SECAD",
                        timestamp     = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(-5)).ToString("O"),
                        callbackUrl,
                    },
                    ["caso"]           = seccionCaso,
                    ["ubicacion"]      = seccionUbicacion,
                    ["reportante"]     = seccionReportante,
                    ["despacho"]       = seccionDespacho,
                    ["actuaciones"]    = actuaciones.Count > 0 ? (object)actuaciones : null,
                    ["camposMapeados"] = FiltrarNulos(AplicarMapeo(casoFlat, agencia.CampoMapeo)),
                };
                if (agencia.TipoAuth.Equals(AgenciaAuthMode.CredsBody, StringComparison.OrdinalIgnoreCase))
                {
                    var userField = AuthExtra(agencia.AuthExtra, "bodyUserField") ?? "usuario";
                    var passField = AuthExtra(agencia.AuthExtra, "bodyPassField") ?? "contrasena";
                    payloadEstructurado[userField] = agencia.ApiUsuario;
                    payloadEstructurado[passField] = agencia.ApiPassword;
                }
                payloadFinal = payloadEstructurado;
            }
            else
            {
                // PLANO (default): _secad para callback bidireccional + campos del caso
                // sin secciones redundantes y sin nulos.
                var camposBase = FiltrarNulos(AplicarMapeo(casoFlat, agencia.CampoMapeo));

                // _secad encabeza el payload: contiene la callbackUrl autocontenida.
                // La agencia recibe esta URL y la usa tal cual — no necesita saber
                // nada del cod_dane ni del multi-tenancy de SECAD.
                var camposPlanos = new Dictionary<string, object?>
                {
                    ["_secad"] = new
                    {
                        version       = "2.0",
                        sistemaOrigen = "SECAD",
                        timestamp     = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(-5)).ToString("O"),
                        callbackUrl,
                    }
                };
                foreach (var (k, v) in camposBase) camposPlanos[k] = v;

                if (agencia.TipoAuth.Equals(AgenciaAuthMode.CredsBody, StringComparison.OrdinalIgnoreCase))
                {
                    var userField = AuthExtra(agencia.AuthExtra, "bodyUserField") ?? "usuario";
                    var passField = AuthExtra(agencia.AuthExtra, "bodyPassField") ?? "contrasena";
                    camposPlanos[userField] = agencia.ApiUsuario;
                    camposPlanos[passField] = agencia.ApiPassword;
                }
                payloadFinal = camposPlanos;
            }

            var payloadJson = JsonSerializer.Serialize(payloadFinal, _jsonOpts);

            // 5. Construir request HTTP
            int    httpStatus   = 0;
            string responseBody = "";
            bool   exitoso      = false;

            try
            {
                var client = _httpFactory.CreateClient("AgenciaExterna");
                client.Timeout = TimeSpan.FromSeconds(15);

                var httpRequest = new HttpRequestMessage(
                    agencia.ApiMetodo.Equals("PUT", StringComparison.OrdinalIgnoreCase)
                        ? HttpMethod.Put : HttpMethod.Post,
                    agencia.ApiUrl);

                // ── Aplicar modo de autenticación ─────────────────────────────
                await AplicarAuthAsync(httpRequest, agencia, client, ct);

                // ── Cabeceras HTTP adicionales ────────────────────────────────
                if (!string.IsNullOrWhiteSpace(agencia.Cabeceras))
                {
                    try
                    {
                        var headers = JsonSerializer.Deserialize<Dictionary<string, string>>(agencia.Cabeceras);
                        if (headers != null)
                            foreach (var (k, v) in headers)
                                httpRequest.Headers.TryAddWithoutValidation(k, v);
                    }
                    catch { /* Cabeceras malformadas — ignorar */ }
                }

                httpRequest.Content = new StringContent(payloadJson, Encoding.UTF8, "application/json");

                var response = await client.SendAsync(httpRequest, ct);
                httpStatus   = (int)response.StatusCode;
                responseBody = await response.Content.ReadAsStringAsync(ct);
                exitoso      = response.IsSuccessStatusCode;
            }
            catch (TaskCanceledException)
            {
                httpStatus   = 408;
                responseBody = "Timeout al contactar la API externa.";
            }
            catch (Exception ex)
            {
                httpStatus   = 0;
                responseBody = $"Error de red: {ex.Message}";
                _logger.LogWarning(ex, "[Despacho] Error API agencia {AgenciaId}", req.AgenciaId);
            }

            // 6. Registrar auditoría
            var despachoId = _snowflake.NextId();
            await using (var cmdAud = conn.CreateCommand())
            {
                cmdAud.CommandText = @"
                    INSERT INTO cad_despachos_externos
                        (id, pedido_id, sitio_graba, agencia_id,
                         payload_enviado, http_status, respuesta_api, enviado_por, exitoso)
                    VALUES
                        (@id, @pedido, @sg, @agencia,
                         @payload::jsonb, @status, @resp, @usuario, @ok)";
                cmdAud.Parameters.AddWithValue("id",      despachoId);
                cmdAud.Parameters.AddWithValue("pedido",  req.PedidoId);
                cmdAud.Parameters.AddWithValue("sg",      req.SitioGraba);
                cmdAud.Parameters.AddWithValue("agencia", req.AgenciaId);
                cmdAud.Parameters.AddWithValue("payload", payloadJson);
                cmdAud.Parameters.AddWithValue("status",  httpStatus);
                cmdAud.Parameters.AddWithValue("resp",    (object?)responseBody ?? DBNull.Value);
                cmdAud.Parameters.AddWithValue("usuario", usuario);
                cmdAud.Parameters.AddWithValue("ok",      exitoso);
                await cmdAud.ExecuteNonQueryAsync(ct);
            }

            var msg = exitoso
                ? $"Caso enviado correctamente a {agencia.Nombre} (HTTP {httpStatus})."
                : $"Error al enviar a {agencia.Nombre} (HTTP {httpStatus}): {responseBody[..Math.Min(200, responseBody.Length)]}";

            return new DtoDespachoExternoResult
            {
                Success    = exitoso,
                Message    = msg,
                HttpStatus = httpStatus,
                Response   = responseBody.Length > 500 ? responseBody[..500] : responseBody
            };
        }

        // ════════════════════════════════════════════════════════════════════════
        // Auth helpers — aplica el modo de autenticación al HttpRequestMessage
        // ════════════════════════════════════════════════════════════════════════

        private async Task AplicarAuthAsync(
            HttpRequestMessage request, DtoAgenciaConToken agencia,
            HttpClient client, CancellationToken ct)
        {
            switch (agencia.TipoAuth.ToUpperInvariant())
            {
                // ── Sin autenticación ──────────────────────────────────────────
                case AgenciaAuthMode.None:
                    break;

                // ── Bearer token estático ──────────────────────────────────────
                case AgenciaAuthMode.Bearer:
                    if (!string.IsNullOrWhiteSpace(agencia.ApiToken))
                        request.Headers.Authorization =
                            new AuthenticationHeaderValue("Bearer", agencia.ApiToken);
                    break;

                // ── HTTP Basic Auth: Authorization: Basic base64(user:pass) ───
                case AgenciaAuthMode.Basic:
                    if (!string.IsNullOrWhiteSpace(agencia.ApiUsuario))
                    {
                        var creds = $"{agencia.ApiUsuario}:{agencia.ApiPassword ?? ""}";
                        var b64   = Convert.ToBase64String(Encoding.UTF8.GetBytes(creds));
                        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", b64);
                    }
                    break;

                // ── OAuth2 Client Credentials: pedir token a tokenUrl ─────────
                case AgenciaAuthMode.OAuth2:
                    var oauthToken = await ObtenerTokenOAuth2Async(agencia, client, ct);
                    if (oauthToken != null)
                        request.Headers.Authorization =
                            new AuthenticationHeaderValue("Bearer", oauthToken);
                    else
                        _logger.LogWarning("[Auth] No se pudo obtener token OAuth2 para agencia {Id}", agencia.Id);
                    break;

                // ── API Key en cabecera personalizada ─────────────────────────
                case AgenciaAuthMode.ApiKey:
                    var keyHeader = AuthExtra(agencia.AuthExtra, "keyHeader") ?? "X-Api-Key";
                    if (!string.IsNullOrWhiteSpace(agencia.ApiToken))
                        request.Headers.TryAddWithoutValidation(keyHeader, agencia.ApiToken);
                    break;

                // ── CREDS_BODY: ya inyectado en el payload, nada en headers ──
                case AgenciaAuthMode.CredsBody:
                    break;

                // ── PIP_TOKEN: canal institucional Policía Nacional ────────────
                // Mismo patrón que UsuarioController.GetTechnicalTokenAsync:
                // 1. ObtenerTokenPipAsync (credenciales técnicas de appsettings)
                // 2. Fallback: GetTokenAsync con UsuarioPip/ClavePip de config
                case AgenciaAuthMode.PipToken:
                    var pipToken = await ObtenerTokenPipAsync(ct);
                    if (!string.IsNullOrWhiteSpace(pipToken))
                        request.Headers.Authorization =
                            new AuthenticationHeaderValue("Bearer", pipToken);
                    else
                        _logger.LogWarning("[PIP] No se pudo obtener token técnico PIP para agencia {Id}", agencia.Id);
                    break;

                default:
                    _logger.LogWarning("[Auth] Modo desconocido '{Mode}' para agencia {Id}",
                        agencia.TipoAuth, agencia.Id);
                    break;
            }
        }

        /// <summary>
        /// Obtiene el token técnico institucional de PIP.
        /// Delega a IPipTokenProvider (implementado por TokenProvider en oftic.sl),
        /// que ya gestiona el caché de 25 min y el fallback con credenciales.
        /// </summary>
        private Task<string> ObtenerTokenPipAsync(CancellationToken ct)
            => _pipTokenProvider.GetPipTokenAsync(ct);

        /// <summary>
        /// OAuth2 Client Credentials Grant: POST a tokenUrl con client_id / client_secret,
        /// retorna el access_token o null si falla.
        /// </summary>
        private async Task<string?> ObtenerTokenOAuth2Async(
            DtoAgenciaConToken agencia, HttpClient client, CancellationToken ct)
        {
            var tokenUrl = AuthExtra(agencia.AuthExtra, "tokenUrl");
            if (string.IsNullOrWhiteSpace(tokenUrl) || string.IsNullOrWhiteSpace(agencia.ApiUsuario))
                return null;

            try
            {
                var grantType = AuthExtra(agencia.AuthExtra, "grantType") ?? "client_credentials";
                var form = new FormUrlEncodedContent(new[]
                {
                    new KeyValuePair<string,string>("grant_type",    grantType),
                    new KeyValuePair<string,string>("client_id",     agencia.ApiUsuario),
                    new KeyValuePair<string,string>("client_secret", agencia.ApiPassword ?? ""),
                });

                var resp = await client.PostAsync(tokenUrl, form, ct);
                if (!resp.IsSuccessStatusCode)
                {
                    _logger.LogWarning("[OAuth2] tokenUrl respondió {Status}", (int)resp.StatusCode);
                    return null;
                }

                var json = await resp.Content.ReadAsStringAsync(ct);
                using var doc = JsonDocument.Parse(json);
                return doc.RootElement.TryGetProperty("access_token", out var tk)
                    ? tk.GetString() : null;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[OAuth2] Error al pedir token a {Url}", tokenUrl);
                return null;
            }
        }

        /// <summary>Extrae un campo del JSON de auth_extra.</summary>
        private static string? AuthExtra(string? extraJson, string key)
        {
            if (string.IsNullOrWhiteSpace(extraJson)) return null;
            try
            {
                using var doc = JsonDocument.Parse(extraJson);
                return doc.RootElement.TryGetProperty(key, out var v) ? v.GetString() : null;
            }
            catch { return null; }
        }

        // ════════════════════════════════════════════════════════════════════════
        // Mapeo de campos del pedido → nombres que espera la agencia
        // ════════════════════════════════════════════════════════════════════════

        /// <summary>Elimina las entradas con valor null del diccionario de campos.</summary>
        private static Dictionary<string, object?> FiltrarNulos(Dictionary<string, object?> d) =>
            d.Where(kv => kv.Value is not null)
             .ToDictionary(kv => kv.Key, kv => kv.Value);

        private static Dictionary<string, object?> AplicarMapeo(
            Dictionary<string, object?> origen, string? mapeoJson)
        {
            if (string.IsNullOrWhiteSpace(mapeoJson)) return origen;
            try
            {
                var mapeo = JsonSerializer.Deserialize<Dictionary<string, string>>(mapeoJson);
                if (mapeo is null) return origen;
                var result = new Dictionary<string, object?>();
                foreach (var (k, v) in origen)
                {
                    var dest = mapeo.TryGetValue(k, out var mapped) && !string.IsNullOrWhiteSpace(mapped)
                        ? mapped : k;
                    result[dest] = v;
                }
                return result;
            }
            catch { return origen; }
        }

        // ════════════════════════════════════════════════════════════════════════
        // Private helpers
        // ════════════════════════════════════════════════════════════════════════

        // Columnas (0-15): id, nombre, descripcion, tipo_agencia,
        //   api_url, api_metodo, tipo_auth, tiene_credencial, api_usuario,
        //   auth_extra, api_cabeceras, campo_mapeo,
        //   activa, fecha_creacion, fecha_modificacion, formato_payload
        private static DtoAgenciaExterna MapAgencia(NpgsqlDataReader r) => new()
        {
            Id                 = r.GetInt64(0).ToString(),
            Nombre             = r.GetString(1),
            Descripcion        = r.IsDBNull(2)  ? null : r.GetString(2),
            TipoAgencia        = r.IsDBNull(3)  ? TiposAgencia.Otra : r.GetString(3),
            ApiUrl             = r.IsDBNull(4)  ? null : r.GetString(4),
            ApiMetodo          = r.IsDBNull(5)  ? "POST" : r.GetString(5),
            TipoAuth           = r.IsDBNull(6)  ? AgenciaAuthMode.Bearer : r.GetString(6),
            TieneCredencial    = !r.IsDBNull(7) && r.GetBoolean(7),
            ApiUsuario         = r.IsDBNull(8)  ? null : r.GetString(8),
            AuthExtra          = r.IsDBNull(9)  ? null : r.GetString(9),
            ApiCabeceras       = r.IsDBNull(10) ? null : r.GetString(10),
            CampoMapeo         = r.IsDBNull(11) ? null : r.GetString(11),
            Activa             = r.GetBoolean(12),
            FechaCreacion      = r.IsDBNull(13) ? null : r.GetDateTime(13),
            FechaModificacion  = r.IsDBNull(14) ? null : r.GetDateTime(14),
            FormatoPayload     = r.IsDBNull(15) ? AgenciaPayloadFormato.Plano : r.GetString(15),
        };

        private static DtoDespachoExternoResult Fail(string msg) =>
            new() { Success = false, Message = msg };

        /// <summary>DTO interno con credenciales completas. Nunca sale del repositorio.</summary>
        private class DtoAgenciaConToken
        {
            public long    Id             { get; init; }
            public string  Nombre         { get; init; } = "";
            public string? ApiUrl         { get; init; }
            public string  ApiMetodo      { get; init; } = "POST";
            public string  TipoAuth       { get; init; } = AgenciaAuthMode.Bearer;
            public string? ApiToken       { get; init; }
            public string? ApiUsuario     { get; init; }
            public string? ApiPassword    { get; init; }
            public string? AuthExtra      { get; init; }
            public string? Cabeceras      { get; init; }
            public string? CampoMapeo     { get; init; }
            public string  FormatoPayload { get; init; } = AgenciaPayloadFormato.Plano;
        }
    }
}
