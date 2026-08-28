using Comun.Dtos.Recepcion;
using Comun.Snowflake;
using Datos.Interfaz;
using Datos.Tenant;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace Datos.Gestion
{
    public class DbAdjuntoRepository : IDbAdjuntoRepository
    {
        private readonly TenantContext                   _tenant;
        private readonly ILogger<DbAdjuntoRepository>   _logger;
        private readonly ISnowflakeGenerator             _snowflake;

        public DbAdjuntoRepository(
            TenantContext tenant,
            ILogger<DbAdjuntoRepository> logger,
            ISnowflakeGenerator snowflake)
        {
            _tenant    = tenant;
            _logger    = logger;
            _snowflake = snowflake;
        }

        // ── Save adjunto ─────────────────────────────────────────────────────────

        public async Task<long> SaveAdjuntoAsync(DtoAdjunto adjunto, CancellationToken ct)
        {
            var id = _snowflake.NextId();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = """
                INSERT INTO cad_adjuntos
                    (id, pedido_id, sitio_graba, tipo_adjunto, nombre_original,
                     nombre_guardado, ruta_relativa, mime_type, tamanio_bytes,
                     descripcion, canal_origen, subido_por, fecha_subida)
                VALUES
                    (@id, @pid, @sg, @tipo, @orig,
                     @grd, @ruta, @mime, @tam,
                     @desc, @canal, @usr, NOW())
                """;
            cmd.Parameters.AddWithValue("@id",    id);
            cmd.Parameters.AddWithValue("@pid",   adjunto.PedidoId);
            cmd.Parameters.AddWithValue("@sg",    adjunto.SitioGraba);
            cmd.Parameters.AddWithValue("@tipo",  adjunto.TipoAdjunto);
            cmd.Parameters.AddWithValue("@orig",  adjunto.NombreOriginal);
            cmd.Parameters.AddWithValue("@grd",   adjunto.NombreGuardado);
            cmd.Parameters.AddWithValue("@ruta",  adjunto.RutaRelativa);
            cmd.Parameters.AddWithValue("@mime",  adjunto.MimeType);
            cmd.Parameters.AddWithValue("@tam",   adjunto.TamanioBytes);
            cmd.Parameters.AddWithValue("@desc",  (object?)adjunto.Descripcion ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@canal", adjunto.CanalOrigen);
            cmd.Parameters.AddWithValue("@usr",   adjunto.SubidoPor);
            await cmd.ExecuteNonQueryAsync(ct);
            return id;
        }

        // ── List adjuntos by pedido ──────────────────────────────────────────────

        public async Task<List<DtoAdjunto>> GetAdjuntosByPedidoAsync(
            long pedidoId, CancellationToken ct)
        {
            var list = new List<DtoAdjunto>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            // pedido_id es Snowflake (globalmente único) — no se filtra por sitio_graba
            // para que cualquier despachador/supervisor pueda ver las fotos sin importar su sitio.
            cmd.CommandText = """
                SELECT a.id, a.pedido_id, a.sitio_graba, a.tipo_adjunto, a.nombre_original,
                       a.nombre_guardado, a.ruta_relativa, a.mime_type, a.tamanio_bytes,
                       a.descripcion, a.canal_origen, a.subido_por,
                       TO_CHAR(a.fecha_subida AT TIME ZONE 'America/Bogota', 'DD/MM/YYYY HH24:MI:SS') AS fecha_subida,
                       vs.numero_telefono,
                       TO_CHAR(vs.fecha_conectado AT TIME ZONE 'America/Bogota', 'DD/MM/YYYY HH24:MI:SS') AS fecha_inicio_llamada,
                       CASE WHEN vs.fecha_conectado IS NOT NULL AND vs.fecha_finalizado IS NOT NULL
                            THEN EXTRACT(EPOCH FROM (vs.fecha_finalizado - vs.fecha_conectado))::INT
                       END AS duracion_segundos
                FROM   cad_adjuntos a
                LEFT   JOIN cad_video_sesiones vs ON vs.adjunto_grabacion_id = a.id
                WHERE  a.pedido_id = @pid
                ORDER  BY a.fecha_subida DESC
                """;
            cmd.Parameters.AddWithValue("@pid", pedidoId);
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                list.Add(new DtoAdjunto
                {
                    Id                    = reader.GetInt64(0),
                    PedidoId              = reader.GetInt64(1),
                    SitioGraba            = reader.GetInt32(2),
                    TipoAdjunto           = reader.GetString(3),
                    NombreOriginal        = reader.GetString(4),
                    NombreGuardado        = reader.GetString(5),
                    RutaRelativa          = reader.GetString(6),
                    MimeType              = reader.GetString(7),
                    TamanioBytes          = reader.GetInt64(8),
                    Descripcion           = reader.IsDBNull(9)  ? null : reader.GetString(9),
                    CanalOrigen           = reader.GetString(10),
                    SubidoPor             = reader.GetString(11),
                    FechaSubida           = reader.IsDBNull(12) ? "" : reader.GetString(12),
                    NumeroTelefonoLlamada = reader.IsDBNull(13) ? null : reader.GetString(13),
                    FechaInicioLlamada    = reader.IsDBNull(14) ? null : reader.GetString(14),
                    DuracionSegundos      = reader.IsDBNull(15) ? null : reader.GetInt32(15),
                    UrlPublica            = "/" + reader.GetString(6).Replace('\\', '/')
                });
            }
            return list;
        }

        // ── Get ruta relativa (para borrar del disco) ────────────────────────────

        public async Task<string?> GetRutaRelativaAsync(long adjuntoId, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = "SELECT ruta_relativa FROM cad_adjuntos WHERE id = @id";
            cmd.Parameters.AddWithValue("@id", adjuntoId);
            var val = await cmd.ExecuteScalarAsync(ct);
            return val as string;
        }

        // ── Delete adjunto ───────────────────────────────────────────────────────

        public async Task<bool> DeleteAdjuntoAsync(long adjuntoId, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = "DELETE FROM cad_adjuntos WHERE id = @id";
            cmd.Parameters.AddWithValue("@id", adjuntoId);
            var rows = await cmd.ExecuteNonQueryAsync(ct);
            return rows > 0;
        }

        // ── Auditoría recepciones externas ───────────────────────────────────────

        public async Task SaveAuditoriaAsync(DtoAuditoriaRecepcionExterna auditoria, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = """
                INSERT INTO cad_recepciones_externas
                    (id, canal, payload_crudo, pedido_id, procesado, error, ip_origen, fecha_recepcion)
                VALUES
                    (@id, @canal, @payload::jsonb, @pedido, @proc, @error, @ip, NOW())
                """;
            cmd.Parameters.AddWithValue("@id",      auditoria.Id);
            cmd.Parameters.AddWithValue("@canal",   auditoria.Canal);
            cmd.Parameters.AddWithValue("@payload", auditoria.PayloadCrudo);
            cmd.Parameters.AddWithValue("@pedido",  (object?)auditoria.PedidoId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@proc",    auditoria.Procesado);
            cmd.Parameters.AddWithValue("@error",   (object?)auditoria.Error ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@ip",      (object?)auditoria.IpOrigen ?? DBNull.Value);
            await cmd.ExecuteNonQueryAsync(ct);
        }

        public async Task UpdateAuditoriaProcesadaAsync(long auditoriaId, long pedidoId, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = """
                UPDATE cad_recepciones_externas
                SET    procesado = TRUE, pedido_id = @pid, error = NULL
                WHERE  id = @id
                """;
            cmd.Parameters.AddWithValue("@pid", pedidoId);
            cmd.Parameters.AddWithValue("@id",  auditoriaId);
            await cmd.ExecuteNonQueryAsync(ct);
        }

        public async Task UpdateAuditoriaErrorAsync(long auditoriaId, string error, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = """
                UPDATE cad_recepciones_externas
                SET    procesado = FALSE, error = @err
                WHERE  id = @id
                """;
            cmd.Parameters.AddWithValue("@err", error);
            cmd.Parameters.AddWithValue("@id",  auditoriaId);
            await cmd.ExecuteNonQueryAsync(ct);
        }
    }
}
