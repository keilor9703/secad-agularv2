using Comun.Dtos.Integraciones;
using Comun.Snowflake;
using Datos.Interfaz;
using Datos.Tenant;
using Microsoft.Extensions.Logging;

namespace Datos.Gestion
{
    public class DbIntegracionRepository : IDbIntegracionRepository
    {
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
            cmd.CommandText = """
                SELECT id, nombre, descripcion, tipo_canal,
                       endpoint_relativo,
                       headers_requeridos::text, ejemplo_payload::text,
                       sitio_graba_defecto, activa, notas,
                       TO_CHAR(fecha_creacion AT TIME ZONE 'America/Bogota','DD/MM/YYYY HH24:MI') AS fc,
                       TO_CHAR(fecha_modificacion AT TIME ZONE 'America/Bogota','DD/MM/YYYY HH24:MI') AS fm
                FROM   cad_integraciones_entrantes
                ORDER  BY tipo_canal, nombre
                """;
            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            while (await rdr.ReadAsync(ct))
                list.Add(MapEntrante(rdr));
            return list;
        }

        public async Task<DtoIntegracionEntrante?> GetEntranteByIdAsync(long id, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = """
                SELECT id, nombre, descripcion, tipo_canal,
                       endpoint_relativo,
                       headers_requeridos::text, ejemplo_payload::text,
                       sitio_graba_defecto, activa, notas,
                       TO_CHAR(fecha_creacion AT TIME ZONE 'America/Bogota','DD/MM/YYYY HH24:MI'),
                       TO_CHAR(fecha_modificacion AT TIME ZONE 'America/Bogota','DD/MM/YYYY HH24:MI')
                FROM   cad_integraciones_entrantes
                WHERE  id = @id
                """;
            cmd.Parameters.AddWithValue("@id", id);
            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            return await rdr.ReadAsync(ct) ? MapEntrante(rdr) : null;
        }

        public async Task<long> CreateEntranteAsync(
            DtoIntegracionEntranteRequest req, string usuario, CancellationToken ct)
        {
            var id = _snowflake.NextId();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = """
                INSERT INTO cad_integraciones_entrantes
                    (id, nombre, descripcion, tipo_canal, endpoint_relativo,
                     headers_requeridos, ejemplo_payload, sitio_graba_defecto,
                     activa, notas, usuario_creacion, fecha_creacion)
                VALUES
                    (@id, @nom, @desc, @tipo, @ep,
                     @hdr::jsonb, @ej::jsonb, @sg,
                     @act, @notas, @usr, NOW())
                """;
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
            return id;
        }

        public async Task<bool> UpdateEntranteAsync(
            long id, DtoIntegracionEntranteRequest req, string usuario, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = """
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
                WHERE  id = @id
                """;
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
            return await cmd.ExecuteNonQueryAsync(ct) > 0;
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
            FechaModificacion = r.IsDBNull(11) ? null : r.GetString(11)
        };
    }
}
