using Comun.Dtos.Operacion;
using Comun.Snowflake;
using Datos.Interfaz;
using Datos.Tenant;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace Datos.Gestion
{
    public class DbVideoLlamadaRepository : IDbVideoLlamadaRepository
    {
        private readonly TenantContext _tenant;
        private readonly ILogger<DbVideoLlamadaRepository> _logger;
        private readonly ISnowflakeGenerator _snowflake;

        public DbVideoLlamadaRepository(
            TenantContext tenant, ILogger<DbVideoLlamadaRepository> logger, ISnowflakeGenerator snowflake)
        {
            _tenant    = tenant;
            _logger    = logger;
            _snowflake = snowflake;
        }

        public async Task<long> CrearSesionAsync(
            long pedidoId, int sitioGraba, string usuarioDespachador,
            DateTime fechaExpira, string? numeroTelefono, CancellationToken ct)
        {
            var id = _snowflake.NextId();

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
INSERT INTO cad_video_sesiones
    (id, pedido_id, sitio_graba, estado, usuario_despachador, fecha_creacion, fecha_expira, numero_telefono)
VALUES
    (@id, @pedidoId, @sg, 'PENDIENTE', @usuario, NOW(), @fechaExpira, @numeroTelefono)";
            cmd.Parameters.AddWithValue("id",          id);
            cmd.Parameters.AddWithValue("pedidoId",    pedidoId);
            cmd.Parameters.AddWithValue("sg",          sitioGraba);
            cmd.Parameters.AddWithValue("usuario",     usuarioDespachador);
            cmd.Parameters.AddWithValue("fechaExpira", fechaExpira);
            cmd.Parameters.AddWithValue("numeroTelefono", (object?)numeroTelefono ?? DBNull.Value);
            await cmd.ExecuteNonQueryAsync(ct);

            return id;
        }

        public async Task<DtoVideoSesionEstado?> GetPorIdAsync(long sesionId, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
SELECT id, sitio_graba, estado, fecha_creacion, fecha_expira, fecha_conectado, fecha_finalizado,
       ultima_lat, ultima_lng, ultima_precision, ultima_ubicacion_fecha
FROM   cad_video_sesiones
WHERE  id = @id";
            cmd.Parameters.AddWithValue("id", sesionId);

            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            if (!await rdr.ReadAsync(ct)) return null;

            return new DtoVideoSesionEstado
            {
                SesionId             = rdr.GetInt64(0),
                SitioGraba           = rdr.GetInt32(1),
                Estado               = rdr.GetString(2),
                FechaCreacion        = rdr.GetDateTime(3),
                FechaExpira          = rdr.GetDateTime(4),
                FechaConectado       = rdr.IsDBNull(5) ? null : rdr.GetDateTime(5),
                FechaFinalizado      = rdr.IsDBNull(6) ? null : rdr.GetDateTime(6),
                UltimaLat            = rdr.IsDBNull(7) ? null : rdr.GetDouble(7),
                UltimaLng            = rdr.IsDBNull(8) ? null : rdr.GetDouble(8),
                UltimaPrecision      = rdr.IsDBNull(9) ? null : rdr.GetDouble(9),
                UltimaUbicacionFecha = rdr.IsDBNull(10) ? null : rdr.GetDateTime(10)
            };
        }

        public async Task MarcarConectadaAsync(long sesionId, string? ipCiudadano, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
UPDATE cad_video_sesiones
SET    estado          = 'CONECTADA',
       fecha_conectado = COALESCE(fecha_conectado, NOW()),
       ip_ciudadano    = COALESCE(ip_ciudadano, @ip)
WHERE  id     = @id
  AND  estado = 'PENDIENTE'";
            cmd.Parameters.AddWithValue("id", sesionId);
            cmd.Parameters.AddWithValue("ip", (object?)ipCiudadano ?? DBNull.Value);
            await cmd.ExecuteNonQueryAsync(ct);
        }

        public async Task MarcarFinalizadaAsync(long sesionId, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
UPDATE cad_video_sesiones
SET    estado           = 'FINALIZADA',
       fecha_finalizado = NOW()
WHERE  id     = @id
  AND  estado IN ('PENDIENTE','CONECTADA')";
            cmd.Parameters.AddWithValue("id", sesionId);
            await cmd.ExecuteNonQueryAsync(ct);
        }

        public async Task VincularGrabacionAsync(long sesionId, long adjuntoId, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
UPDATE cad_video_sesiones
SET    adjunto_grabacion_id = @adjuntoId
WHERE  id = @id";
            cmd.Parameters.AddWithValue("id", sesionId);
            cmd.Parameters.AddWithValue("adjuntoId", adjuntoId);
            await cmd.ExecuteNonQueryAsync(ct);
        }

        public async Task ActualizarUbicacionAsync(long sesionId, double lat, double lng, double? precision, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
UPDATE cad_video_sesiones
SET    ultima_lat              = @lat,
       ultima_lng              = @lng,
       ultima_precision        = @precision,
       ultima_ubicacion_fecha  = NOW()
WHERE  id = @id";
            cmd.Parameters.AddWithValue("id", sesionId);
            cmd.Parameters.AddWithValue("lat", lat);
            cmd.Parameters.AddWithValue("lng", lng);
            cmd.Parameters.AddWithValue("precision", (object?)precision ?? DBNull.Value);
            await cmd.ExecuteNonQueryAsync(ct);
        }

        // ══════════════════════════════════════════════════════════════════════
        //  Reconexión
        // ══════════════════════════════════════════════════════════════════════

        public async Task<DtoVideoSesionEstado?> GetActivaPorPedidoAsync(long pedidoId, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            // La más reciente: si por alguna razón quedaran dos abiertas, manda la última.
            cmd.CommandText = @"
SELECT id, sitio_graba, estado, fecha_creacion, fecha_expira, fecha_conectado, fecha_finalizado,
       ultima_lat, ultima_lng, ultima_precision, ultima_ubicacion_fecha
FROM   cad_video_sesiones
WHERE  pedido_id = @pid
  AND  estado IN ('PENDIENTE','CONECTADA')
  AND  fecha_expira > NOW()
ORDER  BY fecha_creacion DESC
LIMIT  1";
            cmd.Parameters.AddWithValue("pid", pedidoId);

            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            if (!await rdr.ReadAsync(ct)) return null;

            return new DtoVideoSesionEstado
            {
                SesionId             = rdr.GetInt64(0),
                SitioGraba           = rdr.GetInt32(1),
                Estado               = rdr.GetString(2),
                FechaCreacion        = rdr.GetDateTime(3),
                FechaExpira          = rdr.GetDateTime(4),
                FechaConectado       = rdr.IsDBNull(5) ? null : rdr.GetDateTime(5),
                FechaFinalizado      = rdr.IsDBNull(6) ? null : rdr.GetDateTime(6),
                UltimaLat            = rdr.IsDBNull(7) ? null : rdr.GetDouble(7),
                UltimaLng            = rdr.IsDBNull(8) ? null : rdr.GetDouble(8),
                UltimaPrecision      = rdr.IsDBNull(9) ? null : rdr.GetDouble(9),
                UltimaUbicacionFecha = rdr.IsDBNull(10) ? null : rdr.GetDateTime(10)
            };
        }

        // ══════════════════════════════════════════════════════════════════════
        //  Grabación resiliente (por trozos)
        // ══════════════════════════════════════════════════════════════════════

        public async Task IniciarGrabacionAsync(long sesionId, string archivoTemp, string usuario, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            // IS DISTINCT FROM 'FINALIZADA': nunca se reabre una grabación ya cerrada
            // y registrada como evidencia del caso.
            cmd.CommandText = @"
UPDATE cad_video_sesiones
SET    grabacion_estado       = 'GRABANDO',
       grabacion_archivo_temp = @archivo,
       grabacion_usuario      = @usuario,
       grabacion_bytes        = 0,
       grabacion_inicio       = NOW(),
       grabacion_ultimo_chunk = NOW()
WHERE  id = @id
  AND  grabacion_estado IS DISTINCT FROM 'FINALIZADA'";
            cmd.Parameters.AddWithValue("id",      sesionId);
            cmd.Parameters.AddWithValue("archivo", archivoTemp);
            cmd.Parameters.AddWithValue("usuario", usuario);
            await cmd.ExecuteNonQueryAsync(ct);
        }

        public async Task RegistrarChunkAsync(long sesionId, long bytes, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
UPDATE cad_video_sesiones
SET    grabacion_bytes        = grabacion_bytes + @bytes,
       grabacion_ultimo_chunk = NOW()
WHERE  id = @id
  AND  grabacion_estado = 'GRABANDO'";
            cmd.Parameters.AddWithValue("id",    sesionId);
            cmd.Parameters.AddWithValue("bytes", bytes);
            await cmd.ExecuteNonQueryAsync(ct);
        }

        public async Task<DtoVideoGrabacion?> GetGrabacionAsync(long sesionId, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
SELECT id, pedido_id, sitio_graba, grabacion_estado, grabacion_archivo_temp,
       grabacion_bytes, grabacion_inicio, grabacion_ultimo_chunk, grabacion_usuario
FROM   cad_video_sesiones
WHERE  id = @id";
            cmd.Parameters.AddWithValue("id", sesionId);

            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            if (!await rdr.ReadAsync(ct)) return null;
            return LeerGrabacion(rdr);
        }

        public async Task FinalizarGrabacionAsync(long sesionId, long adjuntoId, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
UPDATE cad_video_sesiones
SET    grabacion_estado     = 'FINALIZADA',
       adjunto_grabacion_id = @adjuntoId
WHERE  id = @id";
            cmd.Parameters.AddWithValue("id",        sesionId);
            cmd.Parameters.AddWithValue("adjuntoId", adjuntoId);
            await cmd.ExecuteNonQueryAsync(ct);
        }

        public async Task CerrarGrabacionSinAdjuntoAsync(long sesionId, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
UPDATE cad_video_sesiones
SET    grabacion_estado = 'FINALIZADA'
WHERE  id = @id
  AND  grabacion_estado = 'GRABANDO'";
            cmd.Parameters.AddWithValue("id", sesionId);
            await cmd.ExecuteNonQueryAsync(ct);
        }

        public async Task<List<DtoVideoGrabacion>> GetGrabacionesHuerfanasAsync(int minutosInactividad, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
SELECT id, pedido_id, sitio_graba, grabacion_estado, grabacion_archivo_temp,
       grabacion_bytes, grabacion_inicio, grabacion_ultimo_chunk, grabacion_usuario
FROM   cad_video_sesiones
WHERE  grabacion_estado = 'GRABANDO'
  AND  grabacion_ultimo_chunk < NOW() - make_interval(mins => @mins)
ORDER  BY grabacion_ultimo_chunk";
            cmd.Parameters.AddWithValue("mins", minutosInactividad);

            var lista = new List<DtoVideoGrabacion>();
            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            while (await rdr.ReadAsync(ct)) lista.Add(LeerGrabacion(rdr));
            return lista;
        }

        private static DtoVideoGrabacion LeerGrabacion(NpgsqlDataReader rdr) => new()
        {
            SesionId    = rdr.GetInt64(0),
            PedidoId    = rdr.GetInt64(1),
            SitioGraba  = rdr.GetInt32(2),
            Estado      = rdr.IsDBNull(3) ? null : rdr.GetString(3),
            ArchivoTemp = rdr.IsDBNull(4) ? null : rdr.GetString(4),
            Bytes       = rdr.GetInt64(5),
            Inicio      = rdr.IsDBNull(6) ? null : rdr.GetDateTime(6),
            UltimoChunk = rdr.IsDBNull(7) ? null : rdr.GetDateTime(7),
            Usuario     = rdr.IsDBNull(8) ? null : rdr.GetString(8)
        };

        // ══════════════════════════════════════════════════════════════════════
        //  Chat persistido y trazabilidad del caso (V55)
        // ══════════════════════════════════════════════════════════════════════

        public async Task<DtoVideoChatMensaje?> GuardarMensajeChatAsync(
            long sesionId, string emisor, string texto, string? usuario, CancellationToken ct)
        {
            var id = _snowflake.NextId();

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            // El pedido_id sale de la propia sesión: el Hub no lo conoce y no debe
            // confiar en que el cliente se lo mande. Si la sesión no existe, el
            // SELECT no produce filas y el INSERT no inserta nada (RETURNING vacío).
            cmd.CommandText = @"
INSERT INTO cad_video_chat_mensajes (id, sesion_id, pedido_id, emisor, texto, usuario, fecha)
SELECT @id, s.id, s.pedido_id, @emisor, @texto, @usuario, NOW()
FROM   cad_video_sesiones s
WHERE  s.id = @sid
RETURNING id, emisor, texto, usuario, fecha";
            cmd.Parameters.AddWithValue("id",      id);
            cmd.Parameters.AddWithValue("sid",     sesionId);
            cmd.Parameters.AddWithValue("emisor",  emisor);
            cmd.Parameters.AddWithValue("texto",   texto);
            cmd.Parameters.AddWithValue("usuario", (object?)usuario ?? DBNull.Value);

            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            if (!await rdr.ReadAsync(ct)) return null;

            return new DtoVideoChatMensaje
            {
                Id      = rdr.GetInt64(0),
                Emisor  = rdr.GetString(1),
                Texto   = rdr.GetString(2),
                Usuario = rdr.IsDBNull(3) ? null : rdr.GetString(3),
                Fecha   = rdr.GetDateTime(4)
            };
        }

        public async Task<List<DtoVideoSesionResumen>> GetSesionesPorPedidoAsync(long pedidoId, CancellationToken ct)
        {
            var sesiones = new List<DtoVideoSesionResumen>();

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);

            // 1) Las sesiones del caso, con la grabación que quedó vinculada (si la hubo).
            await using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"
SELECT s.id, s.estado, s.usuario_despachador, s.numero_telefono,
       s.fecha_creacion, s.fecha_conectado, s.fecha_finalizado,
       CASE WHEN s.fecha_conectado IS NOT NULL AND s.fecha_finalizado IS NOT NULL
            THEN EXTRACT(EPOCH FROM (s.fecha_finalizado - s.fecha_conectado))::INT
       END AS duracion_segundos,
       s.ip_ciudadano, s.adjunto_grabacion_id, s.grabacion_estado,
       a.ruta_relativa, a.nombre_original,
       s.ultima_lat, s.ultima_lng
FROM   cad_video_sesiones s
LEFT   JOIN cad_adjuntos a ON a.id = s.adjunto_grabacion_id
WHERE  s.pedido_id = @pid
ORDER  BY s.fecha_creacion";
                cmd.Parameters.AddWithValue("pid", pedidoId);

                await using var rdr = await cmd.ExecuteReaderAsync(ct);
                while (await rdr.ReadAsync(ct))
                {
                    var ruta = rdr.IsDBNull(11) ? null : rdr.GetString(11);
                    sesiones.Add(new DtoVideoSesionResumen
                    {
                        SesionId           = rdr.GetInt64(0),
                        Estado             = rdr.GetString(1),
                        UsuarioDespachador = rdr.IsDBNull(2) ? "" : rdr.GetString(2),
                        NumeroTelefono     = rdr.IsDBNull(3) ? null : rdr.GetString(3),
                        FechaCreacion      = rdr.GetDateTime(4),
                        FechaConectado     = rdr.IsDBNull(5) ? null : rdr.GetDateTime(5),
                        FechaFinalizado    = rdr.IsDBNull(6) ? null : rdr.GetDateTime(6),
                        DuracionSegundos   = rdr.IsDBNull(7) ? null : rdr.GetInt32(7),
                        IpCiudadano        = rdr.IsDBNull(8) ? null : rdr.GetString(8),
                        AdjuntoGrabacionId = rdr.IsDBNull(9) ? null : rdr.GetInt64(9),
                        GrabacionEstado    = rdr.IsDBNull(10) ? null : rdr.GetString(10),
                        TieneGrabacion     = !rdr.IsDBNull(9) && ruta != null,
                        GrabacionUrl       = ruta == null ? null : "/" + ruta.Replace('\\', '/'),
                        GrabacionNombre    = rdr.IsDBNull(12) ? null : rdr.GetString(12),
                        UltimaLat          = rdr.IsDBNull(13) ? null : rdr.GetDouble(13),
                        UltimaLng          = rdr.IsDBNull(14) ? null : rdr.GetDouble(14)
                    });
                }
            }

            if (sesiones.Count == 0) return sesiones;

            // 2) Toda la transcripción del caso en una sola consulta, repartida
            //    después por sesión — evita N+1 cuando un caso tuvo varias llamadas.
            var porSesion = sesiones.ToDictionary(x => x.SesionId);

            await using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"
SELECT id, sesion_id, emisor, texto, usuario, fecha
FROM   cad_video_chat_mensajes
WHERE  pedido_id = @pid
ORDER  BY fecha, id";
                cmd.Parameters.AddWithValue("pid", pedidoId);

                await using var rdr = await cmd.ExecuteReaderAsync(ct);
                while (await rdr.ReadAsync(ct))
                {
                    var sid = rdr.GetInt64(1);
                    if (!porSesion.TryGetValue(sid, out var sesion)) continue;
                    sesion.Chat.Add(new DtoVideoChatMensaje
                    {
                        Id      = rdr.GetInt64(0),
                        Emisor  = rdr.GetString(2),
                        Texto   = rdr.GetString(3),
                        Usuario = rdr.IsDBNull(4) ? null : rdr.GetString(4),
                        Fecha   = rdr.GetDateTime(5)
                    });
                }
            }

            return sesiones;
        }

        public async Task ExpirarVencidasAsync(CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
UPDATE cad_video_sesiones
SET    estado = 'EXPIRADA'
WHERE  estado = 'PENDIENTE'
  AND  fecha_expira < NOW()";
            var filas = await cmd.ExecuteNonQueryAsync(ct);
            if (filas > 0)
                _logger.LogInformation("[VideoLlamada] {N} sesión(es) marcadas EXPIRADA", filas);
        }
    }
}
