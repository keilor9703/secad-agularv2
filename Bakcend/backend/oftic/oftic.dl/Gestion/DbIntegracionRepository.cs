using Comun.Dtos.Integraciones;
using Comun.Snowflake;
using Datos.Interfaz;
using Datos.Tenant;
using Microsoft.Extensions.Logging;

namespace Datos.Gestion
{
    public class DbIntegracionRepository : IDbIntegracionRepository
    {
        /// <summary>
        /// «relation does not exist». El despliegue arranca la API ANTES de
        /// correr las migraciones, así que todo lo que V74 añade tiene que
        /// tolerar la base todavía sin migrar: sin canales configurados el
        /// sistema se comporta como antes —el caso entra sin despachar— en
        /// lugar de reventar en cada petición.
        /// </summary>
        private const string TablaInexistente = "42P01";

        private readonly TenantContext                    _tenant;
        private readonly ISnowflakeGenerator              _snowflake;
        private readonly ILogger<DbIntegracionRepository> _logger;

        public DbIntegracionRepository(
            TenantContext tenant,
            ISnowflakeGenerator snowflake,
            ILogger<DbIntegracionRepository> logger)
        {
            _tenant    = tenant;
            _snowflake = snowflake;
            _logger    = logger;
        }

        // ════════════════════════════════════════════════════════════════════════
        // INTEGRACIONES ENTRANTES
        // ════════════════════════════════════════════════════════════════════════

        public async Task<List<DtoIntegracionEntrante>> GetEntrantesAsync(CancellationToken ct)
        {
            var list = new List<DtoIntegracionEntrante>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            // to_jsonb(e) ->> 'api_key_id' en vez de e.api_key_id: la columna la
            // añade V74 y la API arranca antes que las migraciones. Nombrarla
            // directamente rompería la pantalla entera en ese hueco.
            cmd.CommandText = """
                SELECT e.id, e.nombre, e.descripcion, e.tipo_canal,
                       e.endpoint_relativo,
                       e.headers_requeridos::text, e.ejemplo_payload::text,
                       e.sitio_graba_defecto, e.activa, e.notas,
                       TO_CHAR(e.fecha_creacion AT TIME ZONE 'America/Bogota','DD/MM/YYYY HH24:MI') AS fc,
                       TO_CHAR(e.fecha_modificacion AT TIME ZONE 'America/Bogota','DD/MM/YYYY HH24:MI') AS fm,
                       (to_jsonb(e) ->> 'api_key_id')::bigint AS api_key_id
                FROM   cad_integraciones_entrantes e
                ORDER  BY e.tipo_canal, e.nombre
                """;
            await using (var rdr = await cmd.ExecuteReaderAsync(ct))
            {
                while (await rdr.ReadAsync(ct))
                    list.Add(MapEntrante(rdr));
            }

            // Los canales en una sola consulta para toda la lista: una por fila
            // convertiría la pantalla en N+1 viajes contra la base.
            var porIntegracion = await CanalesDeTodasAsync(conn, ct);
            foreach (var e in list)
                if (porIntegracion.TryGetValue(e.Id, out var canales))
                    e.Canales = canales;

            return list;
        }

        public async Task<DtoIntegracionEntrante?> GetEntranteByIdAsync(long id, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = """
                SELECT e.id, e.nombre, e.descripcion, e.tipo_canal,
                       e.endpoint_relativo,
                       e.headers_requeridos::text, e.ejemplo_payload::text,
                       e.sitio_graba_defecto, e.activa, e.notas,
                       TO_CHAR(e.fecha_creacion AT TIME ZONE 'America/Bogota','DD/MM/YYYY HH24:MI'),
                       TO_CHAR(e.fecha_modificacion AT TIME ZONE 'America/Bogota','DD/MM/YYYY HH24:MI'),
                       (to_jsonb(e) ->> 'api_key_id')::bigint
                FROM   cad_integraciones_entrantes e
                WHERE  e.id = @id
                """;
            cmd.Parameters.AddWithValue("@id", id);

            DtoIntegracionEntrante? dto;
            await using (var rdr = await cmd.ExecuteReaderAsync(ct))
                dto = await rdr.ReadAsync(ct) ? MapEntrante(rdr) : null;

            if (dto is not null)
                dto.Canales = await CanalesDeAsync(conn, id, ct);
            return dto;
        }

        public async Task<long> CreateEntranteAsync(
            DtoIntegracionEntranteRequest req, string usuario, CancellationToken ct)
        {
            var id = _snowflake.NextId();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            var conLlave = await TieneColumnaApiKeyAsync(conn, ct);

            // La ficha y sus canales se guardan juntos o no se guardan: una
            // integración a medias despacharía a un canal que el CAD no eligió.
            await using var tx = await conn.BeginTransactionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = $"""
                INSERT INTO cad_integraciones_entrantes
                    (id, nombre, descripcion, tipo_canal, endpoint_relativo,
                     headers_requeridos, ejemplo_payload, sitio_graba_defecto,
                     activa, notas, usuario_creacion, fecha_creacion
                     {(conLlave ? ", api_key_id" : "")})
                VALUES
                    (@id, @nom, @desc, @tipo, @ep,
                     @hdr::jsonb, @ej::jsonb, @sg,
                     @act, @notas, @usr, NOW()
                     {(conLlave ? ", @llave" : "")})
                """;
            if (conLlave)
                cmd.Parameters.AddWithValue("@llave", (object?)req.ApiKeyId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@id",    id);
            cmd.Parameters.AddWithValue("@nom",   req.Nombre);
            cmd.Parameters.AddWithValue("@desc",  (object?)req.Descripcion ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@tipo",  req.TipoCanal);
            cmd.Parameters.AddWithValue("@ep",    req.EndpointRelativo);
            cmd.Parameters.AddWithValue("@hdr",   string.IsNullOrWhiteSpace(req.HeadersRequeridos) ? (object)DBNull.Value : req.HeadersRequeridos);
            cmd.Parameters.AddWithValue("@ej",    string.IsNullOrWhiteSpace(req.EjemploPayload) ? (object)DBNull.Value : req.EjemploPayload);
            cmd.Parameters.AddWithValue("@sg",    req.SitioGrabaDefecto);
            cmd.Parameters.AddWithValue("@act",   req.Activa);
            cmd.Parameters.AddWithValue("@notas", (object?)req.Notas ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@usr",   usuario);
            await cmd.ExecuteNonQueryAsync(ct);

            await GuardarCanalesAsync(conn, tx, id, req.Canales, ct);
            await tx.CommitAsync(ct);
            return id;
        }

        public async Task<bool> UpdateEntranteAsync(
            long id, DtoIntegracionEntranteRequest req, string usuario, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            var conLlave = await TieneColumnaApiKeyAsync(conn, ct);

            await using var tx = await conn.BeginTransactionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = $"""
                UPDATE cad_integraciones_entrantes
                SET    nombre             = @nom,
                       descripcion        = @desc,
                       tipo_canal         = @tipo,
                       endpoint_relativo  = @ep,
                       headers_requeridos = @hdr::jsonb,
                       ejemplo_payload    = @ej::jsonb,
                       sitio_graba_defecto= @sg,
                       activa             = @act,
                       notas              = @notas,
                       fecha_modificacion = NOW()
                       {(conLlave ? ", api_key_id = @llave" : "")}
                WHERE  id = @id
                """;
            if (conLlave)
                cmd.Parameters.AddWithValue("@llave", (object?)req.ApiKeyId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@id",    id);
            cmd.Parameters.AddWithValue("@nom",   req.Nombre);
            cmd.Parameters.AddWithValue("@desc",  (object?)req.Descripcion ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@tipo",  req.TipoCanal);
            cmd.Parameters.AddWithValue("@ep",    req.EndpointRelativo);
            cmd.Parameters.AddWithValue("@hdr",   string.IsNullOrWhiteSpace(req.HeadersRequeridos) ? (object)DBNull.Value : req.HeadersRequeridos);
            cmd.Parameters.AddWithValue("@ej",    string.IsNullOrWhiteSpace(req.EjemploPayload) ? (object)DBNull.Value : req.EjemploPayload);
            cmd.Parameters.AddWithValue("@sg",    req.SitioGrabaDefecto);
            cmd.Parameters.AddWithValue("@act",   req.Activa);
            cmd.Parameters.AddWithValue("@notas", (object?)req.Notas ?? DBNull.Value);
            if (await cmd.ExecuteNonQueryAsync(ct) == 0)
            {
                await tx.RollbackAsync(ct);
                return false;
            }

            await GuardarCanalesAsync(conn, tx, id, req.Canales, ct);
            await tx.CommitAsync(ct);
            return true;
        }

        public async Task<bool> ToggleEntranteAsync(long id, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = """
                UPDATE cad_integraciones_entrantes
                SET    activa = NOT activa, fecha_modificacion = NOW()
                WHERE  id = @id
                """;
            cmd.Parameters.AddWithValue("@id", id);
            return await cmd.ExecuteNonQueryAsync(ct) > 0;
        }

        // ════════════════════════════════════════════════════════════════════════
        // AUDITORÍA — SALIENTES (cad_despachos_externos)
        // ════════════════════════════════════════════════════════════════════════

        public async Task<List<DtoDespachoAuditoria>> GetDespachoAuditoriaAsync(
            int limit, string? agenciaId, CancellationToken ct)
        {
            var list = new List<DtoDespachoAuditoria>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();

            var where = agenciaId is not null ? "AND d.agencia_id = @aid" : "";
            cmd.CommandText = $"""
                SELECT d.id, d.pedido_id, d.sitio_graba,
                       COALESCE(a.nombre,'Desconocida') AS agencia_nombre,
                       COALESCE(a.tipo_agencia,'OTRA')  AS agencia_tipo,
                       d.payload_enviado::text,
                       d.http_status, d.respuesta_api,
                       d.enviado_por, d.exitoso,
                       TO_CHAR(d.fecha_envio AT TIME ZONE 'America/Bogota','DD/MM/YYYY HH24:MI:SS') AS fe
                FROM   cad_despachos_externos d
                LEFT   JOIN cad_agencias_externas a ON a.id = d.agencia_id
                WHERE  1=1 {where}
                ORDER  BY d.fecha_envio DESC
                LIMIT  @lim
                """;
            if (agenciaId is not null)
                cmd.Parameters.AddWithValue("@aid", long.Parse(agenciaId));
            cmd.Parameters.AddWithValue("@lim", limit > 0 ? limit : 100);

            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            while (await rdr.ReadAsync(ct))
                list.Add(new DtoDespachoAuditoria
                {
                    Id            = rdr.GetInt64(0),
                    PedidoId      = rdr.GetInt64(1),
                    SitioGraba    = rdr.GetInt32(2),
                    AgenciaNombre = rdr.GetString(3),
                    AgenciaTipo   = rdr.GetString(4),
                    PayloadEnviado= rdr.IsDBNull(5) ? null : rdr.GetString(5),
                    HttpStatus    = rdr.IsDBNull(6) ? null : (int?)rdr.GetInt16(6),
                    RespuestaApi  = rdr.IsDBNull(7) ? null : rdr.GetString(7),
                    EnviadoPor    = rdr.IsDBNull(8) ? "" : rdr.GetString(8),
                    Exitoso       = rdr.GetBoolean(9),
                    FechaEnvio    = rdr.IsDBNull(10) ? "" : rdr.GetString(10)
                });
            return list;
        }

        // ════════════════════════════════════════════════════════════════════════
        // AUDITORÍA — ENTRANTES (cad_recepciones_externas)
        // ════════════════════════════════════════════════════════════════════════

        public async Task<List<DtoRecepcionAuditoria>> GetRecepcionAuditoriaAsync(
            int limit, string? canal, CancellationToken ct)
        {
            var list = new List<DtoRecepcionAuditoria>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();

            var where = !string.IsNullOrEmpty(canal) ? "AND canal = @canal" : "";
            cmd.CommandText = $"""
                SELECT id, canal, payload_crudo::text, pedido_id,
                       procesado, error, ip_origen,
                       TO_CHAR(fecha_recepcion AT TIME ZONE 'America/Bogota','DD/MM/YYYY HH24:MI:SS') AS fr
                FROM   cad_recepciones_externas
                WHERE  1=1 {where}
                ORDER  BY fecha_recepcion DESC
                LIMIT  @lim
                """;
            if (!string.IsNullOrEmpty(canal))
                cmd.Parameters.AddWithValue("@canal", canal);
            cmd.Parameters.AddWithValue("@lim", limit > 0 ? limit : 100);

            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            while (await rdr.ReadAsync(ct))
                list.Add(new DtoRecepcionAuditoria
                {
                    Id             = rdr.GetInt64(0),
                    Canal          = rdr.GetString(1),
                    PayloadCrudo   = rdr.IsDBNull(2) ? "" : rdr.GetString(2),
                    PedidoId       = rdr.IsDBNull(3) ? null : rdr.GetInt64(3),
                    Procesado      = rdr.GetBoolean(4),
                    Error          = rdr.IsDBNull(5) ? null : rdr.GetString(5),
                    IpOrigen       = rdr.IsDBNull(6) ? null : rdr.GetString(6),
                    FechaRecepcion = rdr.IsDBNull(7) ? "" : rdr.GetString(7)
                });
            return list;
        }

        // ════════════════════════════════════════════════════════════════════════
        // CANALES DESTINO DE UNA INTEGRACIÓN ENTRANTE (V74)
        // ════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// A qué canales va un caso que entra por este tipo de canal.
        ///
        /// El emparejamiento correcto es por LLAVE: cada proveedor autentica con
        /// la suya y la ficha guarda cuál es. El respaldo por tipo de canal solo
        /// desempata cuando hay una única ficha activa —el caso normal de un CAD
        /// con un solo proveedor de chat—; con varias no se adivina, porque
        /// acertar por casualidad es peor que dejarlo sin despachar.
        /// </summary>
        public async Task<DtoDestinoIntegracion> ResolverDestinoAsync(
            string tipoCanal, long? apiKeyId, CancellationToken ct)
        {
            var destino = new DtoDestinoIntegracion();
            try
            {
                await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);

                long? integracionId = null;
                string nombre = string.Empty;

                if (apiKeyId is > 0 && await TieneColumnaApiKeyAsync(conn, ct))
                {
                    await using var porLlave = conn.CreateCommand();
                    porLlave.CommandText = """
                        SELECT e.id, e.nombre
                        FROM   cad_integraciones_entrantes e
                        WHERE  e.activa
                          AND  e.tipo_canal = @tipo
                          AND  (to_jsonb(e) ->> 'api_key_id')::bigint = @llave
                        LIMIT  1
                        """;
                    porLlave.Parameters.AddWithValue("@tipo",  tipoCanal);
                    porLlave.Parameters.AddWithValue("@llave", apiKeyId.Value);
                    await using var r = await porLlave.ExecuteReaderAsync(ct);
                    if (await r.ReadAsync(ct))
                    {
                        integracionId = r.GetInt64(0);
                        nombre        = r.GetString(1);
                    }
                }

                if (integracionId is null)
                {
                    await using var porTipo = conn.CreateCommand();
                    porTipo.CommandText = """
                        SELECT id, nombre, COUNT(*) OVER () AS total
                        FROM   cad_integraciones_entrantes
                        WHERE  activa AND tipo_canal = @tipo
                        ORDER  BY id
                        LIMIT  2
                        """;
                    porTipo.Parameters.AddWithValue("@tipo", tipoCanal);
                    await using var r = await porTipo.ExecuteReaderAsync(ct);
                    if (await r.ReadAsync(ct))
                    {
                        if (r.GetInt64(2) > 1) { destino.Ambiguo = true; return destino; }
                        integracionId = r.GetInt64(0);
                        nombre        = r.GetString(1);
                    }
                }

                if (integracionId is null) return destino;

                destino.IntegracionId = integracionId;
                destino.Nombre        = nombre;
                destino.Canales       = await CanalesDeAsync(conn, integracionId.Value, ct);
                return destino;
            }
            catch (Npgsql.PostgresException ex) when (ex.SqlState == TablaInexistente)
            {
                // Base sin migrar: se comporta como antes de V74.
                _logger.LogWarning("ResolverDestinoAsync: falta una tabla de V74 ({Tabla}).", ex.TableName);
                return destino;
            }
        }

        private static async Task<List<DtoCanalIntegracion>> CanalesDeAsync(
            Npgsql.NpgsqlConnection conn, long integracionId, CancellationToken ct)
        {
            var list = new List<DtoCanalIntegracion>();
            try
            {
                await using var cmd = conn.CreateCommand();
                cmd.CommandText = """
                    SELECT c.cadfuerz_id, c.canal_codigo,
                           f.descripcion, ca.descripcion, COALESCE(f.sitio_graba, 0)
                    FROM   cad_integraciones_entrantes_canales c
                    LEFT   JOIN cad_fuerzas f  ON f.id = c.cadfuerz_id
                    LEFT   JOIN cad_canales ca ON ca.codigo = c.canal_codigo
                                              AND ca.cadfuerz_id = c.cadfuerz_id
                    WHERE  c.integracion_id = @id
                    ORDER  BY f.descripcion, ca.descripcion
                    """;
                cmd.Parameters.AddWithValue("@id", integracionId);
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                    list.Add(new DtoCanalIntegracion
                    {
                        FuerzaId          = r.GetInt32(0),
                        Codigo            = r.GetInt32(1),
                        FuerzaDescripcion = r.IsDBNull(2) ? null : r.GetString(2),
                        CanalDescripcion  = r.IsDBNull(3) ? null : r.GetString(3),
                        SitioGraba        = r.GetInt32(4),
                    });
            }
            catch (Npgsql.PostgresException ex) when (ex.SqlState == TablaInexistente)
            {
                // Todavía sin V74: ninguna integración tiene canales configurados.
            }
            return list;
        }

        private static async Task<Dictionary<long, List<DtoCanalIntegracion>>> CanalesDeTodasAsync(
            Npgsql.NpgsqlConnection conn, CancellationToken ct)
        {
            var mapa = new Dictionary<long, List<DtoCanalIntegracion>>();
            try
            {
                await using var cmd = conn.CreateCommand();
                cmd.CommandText = """
                    SELECT c.integracion_id, c.cadfuerz_id, c.canal_codigo,
                           f.descripcion, ca.descripcion, COALESCE(f.sitio_graba, 0)
                    FROM   cad_integraciones_entrantes_canales c
                    LEFT   JOIN cad_fuerzas f  ON f.id = c.cadfuerz_id
                    LEFT   JOIN cad_canales ca ON ca.codigo = c.canal_codigo
                                              AND ca.cadfuerz_id = c.cadfuerz_id
                    ORDER  BY f.descripcion, ca.descripcion
                    """;
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                {
                    var id = r.GetInt64(0);
                    if (!mapa.TryGetValue(id, out var lista))
                        mapa[id] = lista = new List<DtoCanalIntegracion>();
                    lista.Add(new DtoCanalIntegracion
                    {
                        FuerzaId          = r.GetInt32(1),
                        Codigo            = r.GetInt32(2),
                        FuerzaDescripcion = r.IsDBNull(3) ? null : r.GetString(3),
                        CanalDescripcion  = r.IsDBNull(4) ? null : r.GetString(4),
                        SitioGraba        = r.GetInt32(5),
                    });
                }
            }
            catch (Npgsql.PostgresException ex) when (ex.SqlState == TablaInexistente)
            {
            }
            return mapa;
        }

        /// <summary>Reemplaza los canales de la ficha por los que llegan del formulario.</summary>
        private async Task GuardarCanalesAsync(
            Npgsql.NpgsqlConnection conn, Npgsql.NpgsqlTransaction tx,
            long integracionId, List<DtoCanalIntegracion> canales, CancellationToken ct)
        {
            try
            {
                await using (var del = conn.CreateCommand())
                {
                    del.Transaction = tx;
                    del.CommandText = "DELETE FROM cad_integraciones_entrantes_canales WHERE integracion_id = @id";
                    del.Parameters.AddWithValue("@id", integracionId);
                    await del.ExecuteNonQueryAsync(ct);
                }

                // Distinct: el formulario impide repetir, pero un cliente de API
                // no, y la PK compuesta lo rechazaría abortando la transacción.
                foreach (var c in canales
                             .Where(c => c.FuerzaId > 0 && c.Codigo > 0)
                             .DistinctBy(c => (c.FuerzaId, c.Codigo)))
                {
                    await using var ins = conn.CreateCommand();
                    ins.Transaction = tx;
                    ins.CommandText = """
                        INSERT INTO cad_integraciones_entrantes_canales
                            (integracion_id, cadfuerz_id, canal_codigo)
                        VALUES (@id, @f, @c)
                        ON CONFLICT DO NOTHING
                        """;
                    ins.Parameters.AddWithValue("@id", integracionId);
                    ins.Parameters.AddWithValue("@f",  c.FuerzaId);
                    ins.Parameters.AddWithValue("@c",  c.Codigo);
                    await ins.ExecuteNonQueryAsync(ct);
                }
            }
            catch (Npgsql.PostgresException ex) when (ex.SqlState == TablaInexistente)
            {
                // Sin V74 no hay dónde guardarlos. Se avisa y la ficha se guarda
                // igual: bloquear la administración entera por una migración
                // pendiente sería peor que quedarse sin el dato nuevo.
                _logger.LogWarning(
                    "No se guardaron los canales de la integración {Id}: falta la tabla de V74.",
                    integracionId);
            }
        }

        /// <summary>
        /// ¿Ya corrió V74 en esta base? El despliegue levanta la API antes que
        /// las migraciones, así que nombrar la columna sin comprobarlo rompería
        /// el alta de integraciones durante ese hueco.
        /// </summary>
        private static async Task<bool> TieneColumnaApiKeyAsync(
            Npgsql.NpgsqlConnection conn, CancellationToken ct)
        {
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = """
                SELECT 1 FROM information_schema.columns
                WHERE  table_name = 'cad_integraciones_entrantes'
                  AND  column_name = 'api_key_id'
                """;
            return await cmd.ExecuteScalarAsync(ct) is not null;
        }

        // ── Helpers ───────────────────────────────────────────────────────────────

        private static DtoIntegracionEntrante MapEntrante(Npgsql.NpgsqlDataReader r) => new()
        {
            Id                = r.GetInt64(0),
            Nombre            = r.GetString(1),
            Descripcion       = r.IsDBNull(2) ? null : r.GetString(2),
            TipoCanal         = r.GetString(3),
            EndpointRelativo  = r.GetString(4),
            HeadersRequeridos = r.IsDBNull(5) ? null : r.GetString(5),
            EjemploPayload    = r.IsDBNull(6) ? null : r.GetString(6),
            SitioGrabaDefecto = r.GetInt32(7),
            Activa            = r.GetBoolean(8),
            Notas             = r.IsDBNull(9) ? null : r.GetString(9),
            FechaCreacion     = r.IsDBNull(10) ? null : r.GetString(10),
            FechaModificacion = r.IsDBNull(11) ? null : r.GetString(11),
            ApiKeyId          = r.IsDBNull(12) ? null : r.GetInt64(12)
        };
    }
}
