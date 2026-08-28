using Comun.Dtos.Turnos;
using Comun.Snowflake;
using Datos.Interfaz;
using Datos.Tenant;
using Microsoft.Extensions.Logging;
using Npgsql;
using Oracle.ManagedDataAccess.Client;

namespace Datos.Gestion
{
    public class DbTurnoRepository : IDbTurnoRepository
    {
        private readonly TenantContext               _tenant;
        private readonly ILogger<DbTurnoRepository> _logger;
        private readonly ISnowflakeGenerator         _snowflake;
        private readonly IGespoMinutaReader          _gespoMinuta;
        private readonly IGespoOracleReader          _gespoGps;
        private readonly GespoSyncCooldown           _gespoCooldown;

        private const string TsFormat  = "DD/MM/YYYY HH24:MI";
        private const string DateFormat = "DD/MM/YYYY";
        private const string TsParse   = "dd/MM/yyyy HH:mm";

        public DbTurnoRepository(
            TenantContext tenant,
            ILogger<DbTurnoRepository> logger,
            ISnowflakeGenerator snowflake,
            IGespoMinutaReader gespoMinuta,
            IGespoOracleReader gespoGps,
            GespoSyncCooldown gespoCooldown)
        {
            _tenant        = tenant;
            _logger        = logger;
            _snowflake     = snowflake;
            _gespoMinuta   = gespoMinuta;
            _gespoGps      = gespoGps;
            _gespoCooldown = gespoCooldown;
        }

        // ════════════════════════════════════════════════════════════════════════
        // LISTA DE TURNOS POR FECHA Y FUERZA
        // ════════════════════════════════════════════════════════════════════════

        public async Task<List<DtoTurnoListItem>> G_GetTurnosAsync(
            int fuerzaId, string fechaTurno, int sitioGraba, CancellationToken ct)
        {
            var result = new List<DtoTurnoListItem>();
            string[] formatosValidos = { DateFormat, "dd/MM/yyyy", "yyyy-MM-dd" };

            if (!DateTime.TryParseExact(fechaTurno, formatosValidos,
                    System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.None, out var fecha))
            {
                // Solo caerá aquí si llega algo completamente ilegible
                fecha = DateTime.Today;
            }

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = $@"
SELECT t.id,
       t.clase_turno,
       t.estado,
       COALESCE(f.descripcion,'')                                    AS fuerza_desc,
       TO_CHAR(t.hora_inicia  AT TIME ZONE 'America/Bogota','{TsFormat}') AS hora_inicia,
       TO_CHAR(t.hora_termina AT TIME ZONE 'America/Bogota','{TsFormat}') AS hora_termina,
       (SELECT COUNT(*) FROM cad_turnos_unidades u WHERE u.turno_id = t.id)  AS total_unidades,
       (SELECT COUNT(*) FROM cad_medios_disponibles m WHERE m.turno_id = t.id) AS total_medios,
       t.sivicc_sincronizado
FROM   cad_turnos t
LEFT   JOIN cad_fuerzas f ON f.id = t.fuerza_id
WHERE  t.fuerza_id  = @fuerza
 AND  t.dia_inicia::date = @fecha
  AND  (t.sitio_graba = @sg OR @sg = 0)
ORDER  BY t.hora_inicia ASC";
            cmd.Parameters.AddWithValue("fuerza", fuerzaId);
            var pFecha = cmd.CreateParameter();
            pFecha.ParameterName = "fecha";
            pFecha.NpgsqlDbType = NpgsqlTypes.NpgsqlDbType.Date;
            pFecha.Value = fecha.Date;
            cmd.Parameters.Add(pFecha);
            cmd.Parameters.AddWithValue("sg",     sitioGraba);

            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            while (await rdr.ReadAsync(ct))
                result.Add(new DtoTurnoListItem
                {
                    Id             = rdr.GetInt64(0),
                    ClaseTurno     = rdr.GetInt16(1),
                    ClaseTurnoDesc = ClaseTurno.Descripcion(rdr.GetInt16(1)),
                    Estado         = rdr.IsDBNull(2) ? "" : rdr.GetString(2),
                    FuerzaDesc     = rdr.IsDBNull(3) ? "" : rdr.GetString(3),
                    HoraInicia     = rdr.IsDBNull(4) ? "" : rdr.GetString(4),
                    HoraTermina    = rdr.IsDBNull(5) ? "" : rdr.GetString(5),
                    TotalUnidades  = rdr.IsDBNull(6) ? 0  : (int)rdr.GetInt64(6),
                    TotalMedios    = rdr.IsDBNull(7) ? 0  : (int)rdr.GetInt64(7),
                    SiviccSync     = !rdr.IsDBNull(8) && rdr.GetBoolean(8)
                });
                return result;
        }

        // ════════════════════════════════════════════════════════════════════════
        // DETALLE COMPLETO DE UN TURNO
        // ════════════════════════════════════════════════════════════════════════

        public async Task<DtoTurno?> G_GetTurnoPorIdAsync(long turnoId, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = $@"
SELECT t.id, t.sitio_graba, t.fuerza_id,
       COALESCE(f.descripcion,'')                                          AS fuerza_desc,
       t.clase_turno, t.tipo_turno,
       TO_CHAR(t.hora_inicia  AT TIME ZONE 'America/Bogota','{TsFormat}') AS hora_inicia,
       TO_CHAR(t.hora_termina AT TIME ZONE 'America/Bogota','{TsFormat}') AS hora_termina,
       TO_CHAR(t.dia_inicia, '{DateFormat}')                               AS dia_inicia,
       t.consignas, t.estado, t.sivicc_sincronizado,
       TO_CHAR(t.sivicc_fecha_sync AT TIME ZONE 'America/Bogota','{TsFormat}') AS sivicc_fecha,
       TO_CHAR(t.fecha_creacion    AT TIME ZONE 'America/Bogota','{TsFormat}') AS fecha_crea,
       t.usuario_crea,
       (SELECT COUNT(*) FROM cad_turnos_unidades u WHERE u.turno_id = t.id)    AS total_uni,
       (SELECT COUNT(*) FROM cad_medios_disponibles m WHERE m.turno_id = t.id) AS total_med
FROM   cad_turnos t
LEFT   JOIN cad_fuerzas f ON f.id = t.fuerza_id
WHERE  t.id = @id";
            cmd.Parameters.AddWithValue("id", turnoId);

            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            if (!await rdr.ReadAsync(ct)) return null;

            return new DtoTurno
            {
                Id                 = rdr.GetInt64(0),
                SitioGraba         = rdr.GetInt32(1),
                FuerzaId           = rdr.GetInt32(2),
                FuerzaDescripcion  = rdr.IsDBNull(3)  ? "" : rdr.GetString(3),
                ClaseTurno         = rdr.GetInt16(4),
                ClaseTurnoDesc     = ClaseTurno.Descripcion(rdr.GetInt16(4)),
                TipoTurno          = rdr.IsDBNull(5)  ? null : rdr.GetInt32(5),
                HoraInicia         = rdr.IsDBNull(6)  ? "" : rdr.GetString(6),
                HoraTermina        = rdr.IsDBNull(7)  ? "" : rdr.GetString(7),
                DiaInicia          = rdr.IsDBNull(8)  ? "" : rdr.GetString(8),
                Consignas          = rdr.IsDBNull(9)  ? null : rdr.GetString(9),
                Estado             = rdr.IsDBNull(10) ? "" : rdr.GetString(10),
                SiviccSincronizado = !rdr.IsDBNull(11) && rdr.GetBoolean(11),
                SiviccFechaSync    = rdr.IsDBNull(12) ? null : rdr.GetString(12),
                FechaCreacion      = rdr.IsDBNull(13) ? "" : rdr.GetString(13),
                UsuarioCrea        = rdr.IsDBNull(14) ? null : rdr.GetString(14),
                TotalUnidades      = rdr.IsDBNull(15) ? 0  : (int)rdr.GetInt64(15),
                TotalMedios        = rdr.IsDBNull(16) ? 0  : (int)rdr.GetInt64(16)
            };
        }

        // ════════════════════════════════════════════════════════════════════════
        // UNIDADES DE UN TURNO
        // ════════════════════════════════════════════════════════════════════════

        public async Task<List<DtoTurnoUnidad>> G_GetUnidadesTurnoAsync(
            long turnoId, CancellationToken ct)
        {
            var result = new List<DtoTurnoUnidad>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
SELECT u.id, u.turno_id, u.unidad_codigo, u.unidad_desc,
       u.fuerza_id, u.consignas, u.origen,
       u.sivicc_minuta_id, u.sivicc_consecutivo,
       (SELECT COUNT(*) FROM cad_medios_disponibles m WHERE m.turno_unidad_id = u.id) AS total_medios
FROM   cad_turnos_unidades u
WHERE  u.turno_id = @tid
ORDER  BY u.id";
            cmd.Parameters.AddWithValue("tid", turnoId);

            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            while (await rdr.ReadAsync(ct))
                result.Add(new DtoTurnoUnidad
                {
                    Id               = rdr.GetInt64(0),
                    TurnoId          = rdr.GetInt64(1),
                    UnidadCodigo     = rdr.IsDBNull(2) ? "" : rdr.GetString(2),
                    UnidadDesc       = rdr.IsDBNull(3) ? "" : rdr.GetString(3),
                    FuerzaId         = rdr.IsDBNull(4) ? null : rdr.GetInt32(4),
                    Consignas        = rdr.IsDBNull(5) ? null : rdr.GetString(5),
                    Origen           = rdr.IsDBNull(6) ? "MANUAL" : rdr.GetString(6),
                    SiviccMinutaId   = rdr.IsDBNull(7) ? null : rdr.GetInt32(7),
                    SiviccConsecutivo= rdr.IsDBNull(8) ? null : rdr.GetInt32(8),
                    TotalMedios      = rdr.IsDBNull(9) ? 0  : (int)rdr.GetInt64(9)
                });
            return result;
        }

        // ════════════════════════════════════════════════════════════════════════
        // MEDIOS DE UN TURNO / UNIDAD
        // ════════════════════════════════════════════════════════════════════════

        public async Task<List<DtoMedioDisponible>> G_GetMediosTurnoAsync(
            long turnoId, long? turnoUnidadId, CancellationToken ct)
        {
            var result = new List<DtoMedioDisponible>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = $@"
SELECT m.id, m.sitio_graba, m.turno_id, m.turno_unidad_id,
       m.unidad_codigo, m.fuerza_id,
       m.canal_fuerza_id, m.canal_codigo,
       COALESCE(m.canal_desc, c.descripcion, '')            AS canal_desc,
       m.patrulla_codigo, m.patrulla_desc,
       m.tipo_medio, m.estado,
       m.latitud, m.longitud, m.velocidad_kmh, m.rumbo_grados,
       TO_CHAR(m.fecha_ubicacion AT TIME ZONE 'America/Bogota','{TsFormat}'),
       m.evento_id, m.actuacion_id,
       -- Personal agrupado (máx 2 registros)
       COALESCE(
           (SELECT STRING_AGG(p.cedu_empleado || '|' ||
                              COALESCE(p.nombre_policial,'') || '|' ||
                              COALESCE(p.desc_cargo,''), '~')
            FROM cad_personal_disponible p WHERE p.medio_id = m.id),
           ''
       ) AS personal_raw,
       -- Calculado en SQL comparando timestamptz contra timestamptz (instante
       -- absoluto, no depende de la zona horaria del servidor .NET) — antes se
       -- recalculaba en C# comparando la hora ya convertida a Bogotá contra
       -- DateTime.Now del servidor, que en un contenedor típico corre en UTC,
       -- dejando el indicador de GPS prácticamente siempre en falso.
       (m.fecha_ubicacion IS NOT NULL
        AND NOW() - m.fecha_ubicacion < INTERVAL '10 minutes')  AS gps_activo
FROM   cad_medios_disponibles m
LEFT   JOIN cad_canales c ON c.codigo = m.canal_codigo AND c.cadfuerz_id = m.canal_fuerza_id
WHERE  m.turno_id = @tid
  AND  (@uid::BIGINT IS NULL OR m.turno_unidad_id = @uid)
ORDER  BY m.estado ASC, m.patrulla_codigo ASC";
            cmd.Parameters.AddWithValue("tid", turnoId);
            cmd.Parameters.AddWithValue("uid", turnoUnidadId.HasValue
                ? (object)turnoUnidadId.Value : DBNull.Value);

            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            while (await rdr.ReadAsync(ct))
                result.Add(MapMedioFromReader(rdr));
            return result;
        }

        // ════════════════════════════════════════════════════════════════════════
        // MEDIOS ACTIVOS POR CANAL (panel de despacho — Módulo Eventos)
        // ════════════════════════════════════════════════════════════════════════

        public async Task<List<DtoMedioDisponible>> G_GetMediosActivosPorCanalAsync(
            int canalCodigo, int canalFuerzaId, int sitioGraba, CancellationToken ct)
        {
            var result = new List<DtoMedioDisponible>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = $@"
SELECT m.id, m.sitio_graba, m.turno_id, m.turno_unidad_id,
       m.unidad_codigo, m.fuerza_id,
       m.canal_fuerza_id, m.canal_codigo,
       COALESCE(m.canal_desc, c.descripcion, '')  AS canal_desc,
       m.patrulla_codigo, m.patrulla_desc,
       m.tipo_medio, m.estado,
       m.latitud, m.longitud, m.velocidad_kmh, m.rumbo_grados,
       TO_CHAR(m.fecha_ubicacion AT TIME ZONE 'America/Bogota','{TsFormat}'),
       m.evento_id, m.actuacion_id,
       COALESCE(
           (SELECT STRING_AGG(p.cedu_empleado || '|' ||
                              COALESCE(p.nombre_policial,'') || '|' ||
                              COALESCE(p.desc_cargo,''), '~')
            FROM cad_personal_disponible p WHERE p.medio_id = m.id),
           ''
       ) AS personal_raw,
       (m.fecha_ubicacion IS NOT NULL
        AND NOW() - m.fecha_ubicacion < INTERVAL '10 minutes')  AS gps_activo
FROM   cad_medios_disponibles m
JOIN   cad_turnos t ON t.id = m.turno_id
LEFT   JOIN cad_canales c ON c.codigo = m.canal_codigo AND c.cadfuerz_id = m.canal_fuerza_id
WHERE  m.canal_codigo     = @canal
  -- cad_canales.codigo no es único por sí solo — cada fuerza numera sus canales
  -- desde 1, así que sin esta condición un canal 5 de una fuerza traía también
  -- las patrullas, GPS y personal del canal 5 de OTRA fuerza.
  AND  (m.canal_fuerza_id = @canalFuerza OR @canalFuerza = 0)
  AND  t.estado       = 'A'
  AND  t.hora_inicia  <= (NOW() AT TIME ZONE 'America/Bogota')
  AND  t.hora_termina >= (NOW() AT TIME ZONE 'America/Bogota')
  AND  (m.sitio_graba = @sg OR m.sitio_graba = 0 OR @sg = 0)
ORDER  BY m.estado ASC, m.patrulla_codigo ASC";
            cmd.Parameters.AddWithValue("canal",       canalCodigo);
            cmd.Parameters.AddWithValue("canalFuerza", canalFuerzaId);
            cmd.Parameters.AddWithValue("sg",          sitioGraba);

            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            while (await rdr.ReadAsync(ct))
                result.Add(MapMedioFromReader(rdr));
            return result;
        }

        public async Task<List<DtoMedioDisponibleResumen>> G_GetResumenMediosCanalAsync(
            int canalCodigo, int canalFuerzaId, int sitioGraba, CancellationToken ct)
        {
            var full = await G_GetMediosActivosPorCanalAsync(canalCodigo, canalFuerzaId, sitioGraba, ct);
            return full.Select(m => new DtoMedioDisponibleResumen
            {
                Id             = m.Id,
                PatrullaCodigo = m.PatrullaCodigo,
                PatrullaDesc   = m.PatrullaDesc,
                TipoMedio      = m.TipoMedio,
                Estado         = m.Estado,
                EstadoDesc     = m.EstadoDesc,
                CanalDesc      = m.CanalDesc,
                Lat            = m.Latitud,
                Lng            = m.Longitud,
                GpsActivo      = m.GpsActivo,
                EventoId       = m.EventoId,
                // Nombre del funcionario, no la cédula — la lista de recursos del
                // despachador debe identificar personas, no números de identificación.
                PersonalResumen = string.Join(" / ",
                    m.Personal.Select(p => !string.IsNullOrWhiteSpace(p.NombrePolicial)
                        ? p.NombrePolicial : p.CeduEmpleado))
            }).ToList();
        }

        // ════════════════════════════════════════════════════════════════════════
        // CREAR TURNO
        // ════════════════════════════════════════════════════════════════════════

        public async Task<DtoTurnoResult> P_CrearTurnoAsync(
            DtoCrearTurnoRequest req, string usuario, CancellationToken ct)
        {
            // Parsear fechas
            if (!DateTime.TryParseExact(req.HoraInicia, TsParse,
                    System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.None, out var inicia))
                return Fail("Formato de HoraInicia inválido. Use dd/MM/yyyy HH:mm");

            if (!DateTime.TryParseExact(req.HoraTermina, TsParse,
                    System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.None, out var termina))
                return Fail("Formato de HoraTermina inválido. Use dd/MM/yyyy HH:mm");

            // Validaciones de negocio (equivalente al Oracle SP)
            if (inicia >= termina)
                return Fail("La hora de inicio debe ser anterior a la hora de fin.");

            var duracion = (termina - inicia).TotalHours;
            if (duracion < 6 || duracion > 9)
                return Fail($"La duración del turno debe estar entre 6 y 9 horas (actual: {duracion:F1}h).");

            if (req.ClaseTurno < 1 || req.ClaseTurno > 3)
                return Fail("Clase de turno inválida. Use 1=Primer, 2=Segundo, 3=Tercer.");

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx   = await conn.BeginTransactionAsync(ct);

            try
            {
                // ── Verificar que no existe el mismo clase_turno en el mismo día ──
                await using (var chk = conn.CreateCommand())
                {
                    chk.Transaction = tx;
                    chk.CommandText = @"
SELECT COUNT(*) FROM cad_turnos
WHERE  fuerza_id    = @fuerza
  AND  clase_turno  = @clase
  AND  dia_inicia   = @dia
  AND  estado       <> 'V'";
                    chk.Parameters.AddWithValue("fuerza", req.FuerzaId);
                    chk.Parameters.AddWithValue("clase",  req.ClaseTurno);
                    chk.Parameters.AddWithValue("dia",    inicia.Date);
                    var existe = Convert.ToInt64(await chk.ExecuteScalarAsync(ct));
                    if (existe > 0)
                    {
                        await tx.RollbackAsync(ct);
                        return Fail($"Ya existe un {ClaseTurno.Descripcion(req.ClaseTurno)} " +
                                    $"para esta fuerza en la fecha {inicia:dd/MM/yyyy}.");
                    }
                }

                // ── Verificar solapamiento de franja horaria ──────────────────
                // Comparación de intervalos semi-abiertos [ini,fin): dos franjas se
                // solapan solo si @ini es antes de hora_termina Y @fin es después de
                // hora_inicia. El BETWEEN inclusivo anterior rechazaba turnos
                // consecutivos que comparten el límite (06-14h seguido de 14-22h se
                // marcaba como solapado porque 14:00 BETWEEN 06:00 AND 14:00 es
                // verdadero) — hacía imposible armar un día completo de 3 turnos.
                await using (var chkSol = conn.CreateCommand())
                {
                    chkSol.Transaction = tx;
                    chkSol.CommandText = @"
SELECT COUNT(*) FROM cad_turnos
WHERE  fuerza_id   = @fuerza
  AND  sitio_graba = @sg
  AND  estado      <> 'V'
  AND  @ini < hora_termina
  AND  @fin > hora_inicia";
                    chkSol.Parameters.AddWithValue("fuerza", req.FuerzaId);
                    chkSol.Parameters.AddWithValue("sg",     req.SitioGraba);
                    chkSol.Parameters.AddWithValue("ini",    inicia);
                    chkSol.Parameters.AddWithValue("fin",    termina);
                    var solape = Convert.ToInt64(await chkSol.ExecuteScalarAsync(ct));
                    if (solape > 0)
                    {
                        await tx.RollbackAsync(ct);
                        return Fail("Ya existe un turno que se solapa con esta franja horaria.");
                    }
                }

                // ── INSERT cad_turnos ─────────────────────────────────────────
                long turnoId = _snowflake.NextId();
                await using (var ins = conn.CreateCommand())
                {
                    ins.Transaction = tx;
                    ins.CommandText = @"
INSERT INTO cad_turnos
    (id, sitio_graba, fuerza_id, clase_turno, tipo_turno,
     hora_inicia, hora_termina, consignas, estado,
     fecha_creacion, usuario_crea)
VALUES
    (@id, @sg, @fuerza, @clase, @tipo,
     @ini, @fin, @cons, 'A',
     NOW(), @usuario)";
                    ins.Parameters.AddWithValue("id",      turnoId);
                    ins.Parameters.AddWithValue("sg",      req.SitioGraba);
                    ins.Parameters.AddWithValue("fuerza",  req.FuerzaId);
                    ins.Parameters.AddWithValue("clase",   req.ClaseTurno);
                    ins.Parameters.AddWithValue("tipo",    req.TipoTurno.HasValue
                                                           ? (object)req.TipoTurno.Value : DBNull.Value);
                    ins.Parameters.AddWithValue("ini",     inicia);
                    ins.Parameters.AddWithValue("fin",     termina);
                    ins.Parameters.AddWithValue("cons",    NullOrString(req.Consignas));
                    ins.Parameters.AddWithValue("usuario", usuario);
                    await ins.ExecuteNonQueryAsync(ct);
                }

                await tx.CommitAsync(ct);
                return new DtoTurnoResult
                {
                    Success = true,
                    Id      = turnoId,
                    Message = $"Turno creado exitosamente. ID: {turnoId}"
                };
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync(ct);
                _logger.LogError(ex, "P_CrearTurno error");
                return Fail($"Error al crear el turno: {ex.Message}");
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // COPIAR TURNO (duplica unidades + medios + personal)
        // ════════════════════════════════════════════════════════════════════════

        public async Task<DtoTurnoResult> P_CopiarTurnoAsync(
            DtoCopiarTurnoRequest req, int fuerzaId, string usuario, CancellationToken ct)
        {
            if (!DateTime.TryParseExact(req.HoraInicia, TsParse,
                    System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.None, out var inicia) ||
                !DateTime.TryParseExact(req.HoraTermina, TsParse,
                    System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.None, out var termina))
                return Fail("Formato de hora inválido. Use dd/MM/yyyy HH:mm");

            var duracion = (termina - inicia).TotalHours;
            if (duracion < 6 || duracion > 9)
                return Fail($"Duración inválida: {duracion:F1}h. Debe ser entre 6 y 9h.");

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx   = await conn.BeginTransactionAsync(ct);

            try
            {
                // Obtener datos del turno origen
                int fuerzaOrigen = 0, sitioOrigen = 0;
                string? consignasOrigen = null;

                await using (var qOrig = conn.CreateCommand())
                {
                    qOrig.Transaction = tx;
                    qOrig.CommandText = @"
SELECT fuerza_id, sitio_graba, consignas
FROM   cad_turnos WHERE id = @id";
                    qOrig.Parameters.AddWithValue("id", req.TurnoOrigenId);
                    await using var rdr = await qOrig.ExecuteReaderAsync(ct);
                    if (!await rdr.ReadAsync(ct))
                    {
                        await tx.RollbackAsync(ct);
                        return Fail($"Turno origen {req.TurnoOrigenId} no encontrado.");
                    }
                    fuerzaOrigen   = rdr.GetInt32(0);
                    sitioOrigen    = rdr.GetInt32(1);
                    consignasOrigen = rdr.IsDBNull(2) ? null : rdr.GetString(2);
                }

                // El turno origen debe pertenecer a la fuerza del usuario autenticado.
                if (fuerzaId != 0 && fuerzaOrigen != fuerzaId)
                {
                    await tx.RollbackAsync(ct);
                    return Fail($"Turno origen {req.TurnoOrigenId} no encontrado.");
                }

                // Crear el nuevo turno
                long nuevoTurnoId = _snowflake.NextId();
                await using (var insT = conn.CreateCommand())
                {
                    insT.Transaction = tx;
                    insT.CommandText = @"
INSERT INTO cad_turnos
    (id, sitio_graba, fuerza_id, clase_turno, tipo_turno,
     hora_inicia, hora_termina, consignas, estado,
     fecha_creacion, usuario_crea)
VALUES
    (@id, @sg, @fuerza, @clase, @tipo,
     @ini, @fin, @cons, 'A',
     NOW(), @usuario)";
                    insT.Parameters.AddWithValue("id",      nuevoTurnoId);
                    insT.Parameters.AddWithValue("sg",      sitioOrigen);
                    insT.Parameters.AddWithValue("fuerza",  fuerzaOrigen);
                    insT.Parameters.AddWithValue("clase",   req.ClaseTurno);
                    insT.Parameters.AddWithValue("tipo",    req.TipoTurno.HasValue
                                                            ? (object)req.TipoTurno.Value : DBNull.Value);
                    insT.Parameters.AddWithValue("ini",     inicia);
                    insT.Parameters.AddWithValue("fin",     termina);
                    insT.Parameters.AddWithValue("cons",    NullOrString(consignasOrigen));
                    insT.Parameters.AddWithValue("usuario", usuario);
                    await insT.ExecuteNonQueryAsync(ct);
                }

                // Copiar unidades del turno origen.
                // IMPORTANTE: se lee TODO el reader primero (buffer en memoria) y se
                // cierra ese bloque antes de ejecutar cualquier INSERT sobre la misma
                // conexión — Npgsql no soporta MARS, así que intercalar un segundo
                // comando mientras el reader sigue abierto lanza
                // "An operation is already in progress" y aborta la transacción
                // (esto dejaba "Copiar turno" roto para cualquier turno con contenido).
                var unidadesOrigen = new List<(long id, string cod, string? desc, int? fuerza,
                                                string? cons, string origen, int? min, int? sivicc)>();
                await using (var qUni = conn.CreateCommand())
                {
                    qUni.Transaction = tx;
                    qUni.CommandText = @"
SELECT id, unidad_codigo, unidad_desc, fuerza_id, consignas, origen,
       sivicc_minuta_id, sivicc_consecutivo
FROM   cad_turnos_unidades WHERE turno_id = @tid";
                    qUni.Parameters.AddWithValue("tid", req.TurnoOrigenId);
                    await using var rdr = await qUni.ExecuteReaderAsync(ct);
                    while (await rdr.ReadAsync(ct))
                    {
                        unidadesOrigen.Add((
                            rdr.GetInt64(0),
                            rdr.IsDBNull(1) ? "" : rdr.GetString(1),
                            rdr.IsDBNull(2) ? null : rdr.GetString(2),
                            rdr.IsDBNull(3) ? null : rdr.GetInt32(3),
                            rdr.IsDBNull(4) ? null : rdr.GetString(4),
                            rdr.IsDBNull(5) ? "MANUAL" : rdr.GetString(5),
                            rdr.IsDBNull(6) ? null : rdr.GetInt32(6),
                            rdr.IsDBNull(7) ? null : rdr.GetInt32(7)));
                    }
                }

                var mapUnidades = new Dictionary<long, long>();  // origId → newId
                foreach (var u in unidadesOrigen)
                {
                    await using var insU = conn.CreateCommand();
                    insU.Transaction = tx;
                    insU.CommandText = @"
INSERT INTO cad_turnos_unidades
    (turno_id, unidad_codigo, unidad_desc, fuerza_id, consignas, origen,
     sivicc_minuta_id, sivicc_consecutivo, fecha_creacion)
VALUES (@tid, @cod, @desc, @fuerza, @cons, @origen, @min, @sivicc, NOW())
RETURNING id";
                    insU.Parameters.AddWithValue("tid",    nuevoTurnoId);
                    insU.Parameters.AddWithValue("cod",    u.cod);
                    insU.Parameters.AddWithValue("desc",   NullOrString(u.desc));
                    insU.Parameters.AddWithValue("fuerza", u.fuerza.HasValue ? (object)u.fuerza.Value : DBNull.Value);
                    insU.Parameters.AddWithValue("cons",   NullOrString(u.cons));
                    insU.Parameters.AddWithValue("origen", u.origen);
                    insU.Parameters.AddWithValue("min",    u.min.HasValue    ? (object)u.min.Value    : DBNull.Value);
                    insU.Parameters.AddWithValue("sivicc", u.sivicc.HasValue ? (object)u.sivicc.Value : DBNull.Value);
                    var newUniId = Convert.ToInt64(await insU.ExecuteScalarAsync(ct));
                    mapUnidades[u.id] = newUniId;
                }

                // Copiar medios del turno origen (sin estado/ubicación/evento — arrancan limpios)
                var mediosOrigen = new List<(long id, long? uniId, string? ucod, int? fuerza,
                                              int? cfuerza, int? canal, string? canalDesc,
                                              string patcod, string? patdesc, short tipo)>();
                await using (var qMed = conn.CreateCommand())
                {
                    qMed.Transaction = tx;
                    qMed.CommandText = @"
SELECT id, turno_unidad_id, unidad_codigo, fuerza_id,
       canal_fuerza_id, canal_codigo, canal_desc,
       patrulla_codigo, patrulla_desc, tipo_medio
FROM   cad_medios_disponibles WHERE turno_id = @tid";
                    qMed.Parameters.AddWithValue("tid", req.TurnoOrigenId);
                    await using var rdr = await qMed.ExecuteReaderAsync(ct);
                    while (await rdr.ReadAsync(ct))
                    {
                        mediosOrigen.Add((
                            rdr.GetInt64(0),
                            rdr.IsDBNull(1) ? null : rdr.GetInt64(1),
                            rdr.IsDBNull(2) ? null : rdr.GetString(2),
                            rdr.IsDBNull(3) ? null : rdr.GetInt32(3),
                            rdr.IsDBNull(4) ? null : rdr.GetInt32(4),
                            rdr.IsDBNull(5) ? null : rdr.GetInt32(5),
                            rdr.IsDBNull(6) ? null : rdr.GetString(6),
                            rdr.IsDBNull(7) ? "" : rdr.GetString(7),
                            rdr.IsDBNull(8) ? null : rdr.GetString(8),
                            rdr.IsDBNull(9) ? (short)TipoMedio.Patrulla : rdr.GetInt16(9)));
                    }
                }

                var mapMedios = new Dictionary<long, long>();
                foreach (var m in mediosOrigen)
                {
                    long? newUniId = m.uniId.HasValue && mapUnidades.TryGetValue(m.uniId.Value, out var nu)
                                    ? nu : null;

                    long newMedId = _snowflake.NextId();
                    await using var insM = conn.CreateCommand();
                    insM.Transaction = tx;
                    insM.CommandText = @"
INSERT INTO cad_medios_disponibles
    (id, sitio_graba, turno_id, turno_unidad_id,
     unidad_codigo, fuerza_id,
     canal_fuerza_id, canal_codigo, canal_desc,
     patrulla_codigo, patrulla_desc, tipo_medio,
     estado, fecha_creacion)
VALUES
    (@id, @sg, @tid, @uid,
     @ucod, @fuerza,
     @cfuerza, @canal, @canalDesc,
     @patcod, @patdesc, @tipo,
     27, NOW())";
                    insM.Parameters.AddWithValue("id",        newMedId);
                    insM.Parameters.AddWithValue("sg",        sitioOrigen);
                    insM.Parameters.AddWithValue("tid",       nuevoTurnoId);
                    insM.Parameters.AddWithValue("uid",       newUniId.HasValue ? (object)newUniId.Value : DBNull.Value);
                    insM.Parameters.AddWithValue("ucod",      NullOrString(m.ucod));
                    insM.Parameters.AddWithValue("fuerza",    m.fuerza.HasValue  ? (object)m.fuerza.Value  : DBNull.Value);
                    insM.Parameters.AddWithValue("cfuerza",   m.cfuerza.HasValue ? (object)m.cfuerza.Value : DBNull.Value);
                    insM.Parameters.AddWithValue("canal",     m.canal.HasValue   ? (object)m.canal.Value   : DBNull.Value);
                    insM.Parameters.AddWithValue("canalDesc", NullOrString(m.canalDesc));
                    insM.Parameters.AddWithValue("patcod",    m.patcod);
                    insM.Parameters.AddWithValue("patdesc",   NullOrString(m.patdesc));
                    insM.Parameters.AddWithValue("tipo",      m.tipo);
                    await insM.ExecuteNonQueryAsync(ct);
                    mapMedios[m.id] = newMedId;
                }

                // Copiar personal de cada medio — misma precaución: bufferear antes de insertar.
                foreach (var (origMedId, newMedId) in mapMedios)
                {
                    var personalOrigen = new List<(int? sg, string cedu, string? nomb, string? cargo, string? obs)>();
                    await using (var qPer = conn.CreateCommand())
                    {
                        qPer.Transaction = tx;
                        qPer.CommandText = @"
SELECT sitio_graba, cedu_empleado, nombre_policial, desc_cargo, observacion
FROM   cad_personal_disponible WHERE medio_id = @mid";
                        qPer.Parameters.AddWithValue("mid", origMedId);
                        await using var rdr = await qPer.ExecuteReaderAsync(ct);
                        while (await rdr.ReadAsync(ct))
                        {
                            personalOrigen.Add((
                                rdr.IsDBNull(0) ? null : rdr.GetInt32(0),
                                rdr.IsDBNull(1) ? "" : rdr.GetString(1),
                                rdr.IsDBNull(2) ? null : rdr.GetString(2),
                                rdr.IsDBNull(3) ? null : rdr.GetString(3),
                                rdr.IsDBNull(4) ? null : rdr.GetString(4)));
                        }
                    }

                    foreach (var p in personalOrigen)
                    {
                        await using var insPer = conn.CreateCommand();
                        insPer.Transaction = tx;
                        insPer.CommandText = @"
INSERT INTO cad_personal_disponible
    (sitio_graba, turno_id, medio_id, cedu_empleado,
     nombre_policial, desc_cargo, observacion, fecha_creacion)
VALUES (@sg, @tid, @mid, @cedu, @nomb, @cargo, @obs, NOW())";
                        insPer.Parameters.AddWithValue("sg",    p.sg ?? sitioOrigen);
                        insPer.Parameters.AddWithValue("tid",   nuevoTurnoId);
                        insPer.Parameters.AddWithValue("mid",   newMedId);
                        insPer.Parameters.AddWithValue("cedu",  p.cedu);
                        insPer.Parameters.AddWithValue("nomb",  NullOrString(p.nomb));
                        insPer.Parameters.AddWithValue("cargo", NullOrString(p.cargo));
                        insPer.Parameters.AddWithValue("obs",   NullOrString(p.obs));
                        await insPer.ExecuteNonQueryAsync(ct);
                    }
                }

                await tx.CommitAsync(ct);
                return new DtoTurnoResult
                {
                    Success = true,
                    Id      = nuevoTurnoId,
                    Message = $"Turno copiado exitosamente. Nuevo ID: {nuevoTurnoId}. " +
                              $"Unidades: {mapUnidades.Count}, Medios: {mapMedios.Count}."
                };
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync(ct);
                _logger.LogError(ex, "P_CopiarTurno error origenId={Id}", req.TurnoOrigenId);
                return Fail($"Error al copiar el turno: {ex.Message}");
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // AGREGAR UNIDAD AL TURNO
        // ════════════════════════════════════════════════════════════════════════

        public async Task<DtoTurnoResult> P_AgregarUnidadAsync(
            DtoAgregarUnidadRequest req, int fuerzaId, string usuario, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(req.UnidadCodigo))
                return Fail("El código de unidad es obligatorio.");

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);

            if (!await VerificarTurnoFuerzaAsync(conn, req.TurnoId, fuerzaId, null, ct))
                return Fail($"Turno {req.TurnoId} no encontrado.");

            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
INSERT INTO cad_turnos_unidades
    (turno_id, unidad_codigo, unidad_desc, fuerza_id, consignas, origen,
     sivicc_minuta_id, sivicc_consecutivo, fecha_creacion)
VALUES (@tid, @cod, @desc, @fuerza, @cons, @origen, @min, @sivicc, NOW())
ON CONFLICT (turno_id, unidad_codigo) DO NOTHING
RETURNING id";
            cmd.Parameters.AddWithValue("tid",    req.TurnoId);
            cmd.Parameters.AddWithValue("cod",    req.UnidadCodigo);
            cmd.Parameters.AddWithValue("desc",   NullOrString(req.UnidadDesc));
            cmd.Parameters.AddWithValue("fuerza", req.FuerzaId.HasValue
                                                  ? (object)req.FuerzaId.Value : DBNull.Value);
            cmd.Parameters.AddWithValue("cons",   NullOrString(req.Consignas));
            cmd.Parameters.AddWithValue("origen", req.Origen is "SIVICC" ? "SIVICC" : "MANUAL");
            cmd.Parameters.AddWithValue("min",    req.SiviccMinutaId.HasValue
                                                  ? (object)req.SiviccMinutaId.Value : DBNull.Value);
            cmd.Parameters.AddWithValue("sivicc", req.SiviccConsecutivo.HasValue
                                                  ? (object)req.SiviccConsecutivo.Value : DBNull.Value);

            var newId = await cmd.ExecuteScalarAsync(ct);
            if (newId is null or DBNull)
                return new DtoTurnoResult { Success = true, Message = "La unidad ya estaba registrada en este turno." };

            return new DtoTurnoResult
            {
                Success = true,
                Id      = Convert.ToInt64(newId),
                Message = $"Unidad '{req.UnidadCodigo}' registrada."
            };
        }

        // ════════════════════════════════════════════════════════════════════════
        // AGREGAR MEDIO AL TURNO
        // ════════════════════════════════════════════════════════════════════════

        public async Task<DtoTurnoResult> P_AgregarMedioAsync(
            DtoAgregarMedioRequest req, int fuerzaId, string usuario, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(req.PatrullaCodigo))
                return Fail("El código de patrulla es obligatorio.");

            // Normalizar igual que P_ActualizarMedioAsync, para que el chequeo de
            // duplicados y el ON CONFLICT (turno_id, patrulla_codigo) comparen
            // siempre el mismo formato (evita duplicados por mayúsculas/espacios).
            req.PatrullaCodigo = req.PatrullaCodigo.Trim().ToUpper();

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx   = await conn.BeginTransactionAsync(ct);

            try
            {
                if (!await VerificarTurnoFuerzaAsync(conn, req.TurnoId, fuerzaId, tx, ct))
                {
                    await tx.RollbackAsync(ct);
                    return Fail($"Turno {req.TurnoId} no encontrado.");
                }

                // Verificar que la patrulla no esté en otro turno activo
                await using (var chk = conn.CreateCommand())
                {
                    chk.Transaction = tx;
                    chk.CommandText = @"
SELECT COUNT(*) FROM cad_medios_disponibles m
JOIN   cad_turnos t ON t.id = m.turno_id
WHERE  m.patrulla_codigo = @pat
  AND  t.estado = 'A'
  AND  t.hora_inicia  <= NOW()
  AND  t.hora_termina >= NOW()
  AND  m.turno_id <> @tid";
                    chk.Parameters.AddWithValue("pat", req.PatrullaCodigo);
                    chk.Parameters.AddWithValue("tid", req.TurnoId);
                    var duplicado = Convert.ToInt64(await chk.ExecuteScalarAsync(ct));
                    if (duplicado > 0)
                    {
                        await tx.RollbackAsync(ct);
                        return Fail($"La patrulla '{req.PatrullaCodigo}' ya está activa en otro turno vigente.");
                    }
                }

                // Leer sitio_graba del turno para propagarlo al medio y personal
                int sitioGrabaT = 0;
                await using (var qSg = conn.CreateCommand())
                {
                    qSg.Transaction = tx;
                    qSg.CommandText = "SELECT sitio_graba FROM cad_turnos WHERE id = @tid LIMIT 1";
                    qSg.Parameters.AddWithValue("tid", req.TurnoId);
                    var rawSg = await qSg.ExecuteScalarAsync(ct);
                    if (rawSg is not null and not DBNull) sitioGrabaT = Convert.ToInt32(rawSg);
                }

                // Obtener snapshot del canal.
                // cad_canales.codigo NO es único por sí solo (PK compuesta con
                // cadfuerz_id: cada fuerza numera sus canales desde 1) — hay que
                // filtrar también por canal_fuerza_id o se puede traer el canal
                // de otra fuerza que reutiliza el mismo código.
                string canalDesc = "";
                if (req.CanalCodigo.HasValue && req.CanalFuerzaId.HasValue)
                {
                    await using var qCan = conn.CreateCommand();
                    qCan.Transaction = tx;
                    qCan.CommandText = "SELECT descripcion FROM cad_canales WHERE codigo = @c AND cadfuerz_id = @cf LIMIT 1";
                    qCan.Parameters.AddWithValue("c",  req.CanalCodigo.Value);
                    qCan.Parameters.AddWithValue("cf", req.CanalFuerzaId.Value);
                    var raw = await qCan.ExecuteScalarAsync(ct);
                    if (raw is not null and not DBNull) canalDesc = raw.ToString()!;
                }

                long medioId = _snowflake.NextId();
                await using (var ins = conn.CreateCommand())
                {
                    ins.Transaction = tx;
                    ins.CommandText = @"
INSERT INTO cad_medios_disponibles
    (id, sitio_graba, turno_id, turno_unidad_id,
     unidad_codigo, fuerza_id,
     canal_fuerza_id, canal_codigo, canal_desc,
     patrulla_codigo, patrulla_desc, tipo_medio,
     estado, fecha_creacion)
VALUES
    (@id, @sg, @tid, @uid,
     @ucod, @fuerza,
     @cfuerza, @canal, @canalDesc,
     @patcod, @patdesc, @tipo,
     27, NOW())
ON CONFLICT (turno_id, patrulla_codigo) DO NOTHING
RETURNING id";
                    ins.Parameters.AddWithValue("id",        medioId);
                    ins.Parameters.AddWithValue("sg",        sitioGrabaT);
                    ins.Parameters.AddWithValue("tid",       req.TurnoId);
                    ins.Parameters.AddWithValue("uid",       req.TurnoUnidadId.HasValue
                                                             ? (object)req.TurnoUnidadId.Value : DBNull.Value);
                    ins.Parameters.AddWithValue("ucod",      NullOrString(req.UnidadCodigo));
                    ins.Parameters.AddWithValue("fuerza",    req.FuerzaId.HasValue
                                                             ? (object)req.FuerzaId.Value : DBNull.Value);
                    ins.Parameters.AddWithValue("cfuerza",   req.CanalFuerzaId.HasValue
                                                             ? (object)req.CanalFuerzaId.Value : DBNull.Value);
                    ins.Parameters.AddWithValue("canal",     req.CanalCodigo.HasValue
                                                             ? (object)req.CanalCodigo.Value : DBNull.Value);
                    ins.Parameters.AddWithValue("canalDesc", NullOrString(canalDesc));
                    ins.Parameters.AddWithValue("patcod",   req.PatrullaCodigo);
                    ins.Parameters.AddWithValue("patdesc",  NullOrString(req.PatrullaDesc));
                    ins.Parameters.AddWithValue("tipo",     req.TipoMedio);
                    var retId = await ins.ExecuteScalarAsync(ct);
                    if (retId is null or DBNull)
                    {
                        await tx.RollbackAsync(ct);
                        return new DtoTurnoResult
                        {
                            Success = true,
                            Id      = 0,
                            Message = "La patrulla ya estaba registrada en este turno."
                        };
                    }
                    medioId = Convert.ToInt64(retId);
                }

                // Insertar personal
                foreach (var p in req.Personal.Take(2))  // máx 2 por patrulla
                {
                    if (string.IsNullOrWhiteSpace(p.CeduEmpleado)) continue;
                    await using var insPer = conn.CreateCommand();
                    insPer.Transaction = tx;
                    insPer.CommandText = @"
INSERT INTO cad_personal_disponible
    (sitio_graba, turno_id, medio_id, cedu_empleado,
     nombre_policial, desc_cargo, fecha_creacion)
VALUES (@sg, @tid, @mid, @cedu, @nomb, @cargo, NOW())";
                    insPer.Parameters.AddWithValue("sg",    sitioGrabaT);
                    insPer.Parameters.AddWithValue("tid",   req.TurnoId);
                    insPer.Parameters.AddWithValue("mid",   medioId);
                    insPer.Parameters.AddWithValue("cedu",  p.CeduEmpleado);
                    insPer.Parameters.AddWithValue("nomb",  NullOrString(p.NombrePolicial));
                    insPer.Parameters.AddWithValue("cargo", NullOrString(p.DescCargo));
                    await insPer.ExecuteNonQueryAsync(ct);
                }

                await tx.CommitAsync(ct);
                return new DtoTurnoResult
                {
                    Success = true,
                    Id      = medioId,
                    Message = $"Medio '{req.PatrullaCodigo}' registrado exitosamente."
                };
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync(ct);
                _logger.LogError(ex, "P_AgregarMedio error");
                return Fail($"Error al agregar el medio: {ex.Message}");
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // CONSULTAR UNIDADES EN GESPO  (Paso 1 del wizard de importación)
        // Lee VM_MINUTAS_ACTIVAS directo en Oracle (sin FDW) vía IGespoMinutaReader.
        // ════════════════════════════════════════════════════════════════════════

        public async Task<List<DtoUnidadSivicc>> G_GetUnidadesSiviccAsync(
            long turnoId, CancellationToken ct)
        {
            var result = new List<DtoUnidadSivicc>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);

            // ── 1. Obtener clase_turno, fuerza_id y dia_inicia del turno ──────
            int    claseTurno = 0;
            int    fuerzaId   = 0;
            DateTime diaInicia = DateTime.Today;

            await using (var q = conn.CreateCommand())
            {
                q.CommandText = @"
SELECT t.clase_turno, t.fuerza_id, t.dia_inicia
FROM   cad_turnos t
WHERE  t.id = @tid";
                q.Parameters.AddWithValue("tid", turnoId);
                await using var rdr = await q.ExecuteReaderAsync(ct);
                if (!await rdr.ReadAsync(ct))
                {
                    _logger.LogWarning("G_GetUnidadesSivicc: turno {Id} no encontrado", turnoId);
                    return result;
                }
                claseTurno = rdr.GetInt16(0);
                fuerzaId   = rdr.IsDBNull(1) ? 0 : rdr.GetInt32(1);
                diaInicia  = rdr.GetDateTime(2);
            }

            // ── 2. Obtener la abreviatura (sigla física) de la fuerza ─────────
            // Debe coincidir con SIGLA_FISICA en GESPO (VM_MINUTAS_ACTIVAS).
            string siglaFisica = "";
            await using (var qF = conn.CreateCommand())
            {
                qF.CommandText = @"
SELECT COALESCE(f.abreviatura, '')
FROM   cad_fuerzas f
WHERE  f.id = @fid";
                qF.Parameters.AddWithValue("fid", fuerzaId);
                var raw = await qF.ExecuteScalarAsync(ct);
                siglaFisica = raw is DBNull or null ? "" : raw.ToString()!;
            }

            if (string.IsNullOrWhiteSpace(siglaFisica))
            {
                _logger.LogWarning(
                    "G_GetUnidadesSivicc: fuerza {F} sin abreviatura — sin resultados", fuerzaId);
                return result;
            }

            // ── 3. Consultar las unidades activas directo en Oracle GESPO ─────
            // claseTurno se envía tal cual como GESPO.TURNO (1/2/3) — mismo esquema
            // canónico que cad_turnos.clase_turno, sin conversión de texto necesaria.
            var unidades = await _gespoMinuta.LeerUnidadesActivasAsync(siglaFisica, claseTurno, diaInicia, ct);
            if (unidades.Count == 0) return result;

            // ── 4. Marcar cuáles ya tienen medios importados en este turno ────
            var codigos = unidades.Select(u => u.UnidadCodigo).ToArray();
            var existentes = new HashSet<string>();
            await using (var qE = conn.CreateCommand())
            {
                qE.CommandText = @"
SELECT DISTINCT unidad_codigo
FROM   cad_medios_disponibles
WHERE  turno_id = @tid AND unidad_codigo = ANY(@codigos)";
                qE.Parameters.AddWithValue("tid", turnoId);
                qE.Parameters.AddWithValue("codigos", codigos);
                await using var rdr = await qE.ExecuteReaderAsync(ct);
                while (await rdr.ReadAsync(ct))
                    existentes.Add(rdr.GetString(0));
            }

            foreach (var u in unidades)
                u.ExisteEnCadMedios = existentes.Contains(u.UnidadCodigo);

            return unidades;
        }

        // ════════════════════════════════════════════════════════════════════════
        // IMPORTAR DESDE GESPO  (Paso 3: importar medios/personal)
        // Lee MINUTA_EMPLEADO/VM_CUADRANTE/VM_PERSONAL_AGRUPADO directo en Oracle
        // (sin FDW) vía IGespoMinutaReader.
        // ════════════════════════════════════════════════════════════════════════

        public async Task<DtoTurnoResult> P_ImportarDesdeSiviccAsync(
            DtoImportarSiviccRequest req, int fuerzaId, string usuario, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx   = await conn.BeginTransactionAsync(ct);

            try
            {
                if (!await VerificarTurnoFuerzaAsync(conn, req.TurnoId, fuerzaId, tx, ct))
                {
                    await tx.RollbackAsync(ct);
                    return Fail($"Turno {req.TurnoId} no encontrado.");
                }

                int insertados   = 0;
                int actualizados = 0;

                // ── Determinar qué unidades importar ─────────────────────────
                // Si req.Unidades está vacía → auto-consultar todas las del turno
                var unidades = req.Unidades;
                if (unidades == null || unidades.Count == 0)
                {
                    // Sin transacción (solo lectura de GESPO)
                    var todas = await G_GetUnidadesSiviccAsync(req.TurnoId, ct);
                    if (todas.Count == 0)
                    {
                        await tx.RollbackAsync(ct);
                        return Fail("No se encontraron unidades en GESPO para este turno. " +
                                    "Verifique la sigla de la fuerza y el turno seleccionado.");
                    }
                    unidades = todas.Select(u => new DtoUnidadSiviccSeleccionada
                    {
                        MinutaId    = u.MinutaId,
                        Consecutivo = u.Consecutivo,
                        Descripcion = u.Descripcion
                    }).ToList();
                }

                // ── Procesar cada unidad seleccionada ─────────────────────────
                foreach (var unidad in unidades)
                {
                    // Crear/actualizar la unidad en cad_turnos_unidades (origen SIVICC)
                    // — sin esto, los medios importados quedaban sin turno_unidad_id y
                    // no aparecían al navegar por unidad en la pantalla de Turnos.
                    long turnoUnidadId;
                    await using (var upsertUnidad = conn.CreateCommand())
                    {
                        upsertUnidad.Transaction = tx;
                        upsertUnidad.CommandText = @"
INSERT INTO cad_turnos_unidades
    (turno_id, unidad_codigo, unidad_desc, fuerza_id, origen,
     sivicc_minuta_id, sivicc_consecutivo, fecha_creacion)
VALUES (@tid, @cod, @desc, @fuerza, 'SIVICC', @minuta, @consec, NOW())
ON CONFLICT (turno_id, unidad_codigo) DO UPDATE
    SET unidad_desc         = COALESCE(EXCLUDED.unidad_desc, cad_turnos_unidades.unidad_desc),
        sivicc_minuta_id    = EXCLUDED.sivicc_minuta_id,
        sivicc_consecutivo  = EXCLUDED.sivicc_consecutivo
RETURNING id";
                        upsertUnidad.Parameters.AddWithValue("tid",    req.TurnoId);
                        upsertUnidad.Parameters.AddWithValue("cod",    unidad.Consecutivo.ToString());
                        upsertUnidad.Parameters.AddWithValue("desc",   NullOrString(unidad.Descripcion));
                        upsertUnidad.Parameters.AddWithValue("fuerza", req.FuerzaId == 0
                                                                       ? (object)DBNull.Value : req.FuerzaId);
                        upsertUnidad.Parameters.AddWithValue("minuta", unidad.MinutaId);
                        upsertUnidad.Parameters.AddWithValue("consec", unidad.Consecutivo);
                        turnoUnidadId = Convert.ToInt64(await upsertUnidad.ExecuteScalarAsync(ct));
                    }

                    // Canal efectivo de esta unidad: el propio si vino, si no el de
                    // defecto del request — cada unidad puede necesitar uno distinto.
                    int? canalCodigo   = unidad.CanalCodigo   ?? req.CanalCodigo;
                    int? canalFuerzaId = unidad.CanalFuerzaId ?? req.CanalFuerzaId;

                    // Leer personal/patrullas de la minuta directo en Oracle GESPO
                    var filas = await _gespoMinuta.LeerMediosDeMinutaAsync(unidad.MinutaId, ct);
                    if (filas.Count == 0)
                    {
                        _logger.LogWarning(
                            "P_ImportarSivicc: sin personal en minuta {M} consec {C}",
                            unidad.MinutaId, unidad.Consecutivo);
                        continue; // Pasar a la siguiente unidad
                    }

                    // Agrupar por cuadrante (=patrulla) y procesar
                    var porCuadrante = filas.GroupBy(f => f.CuadranteId).ToList();

                    foreach (var grupo in porCuadrante)
                    {
                        var patCod = grupo.Key;
                        if (string.IsNullOrWhiteSpace(patCod)) continue;
                        var patDesc = grupo.First().PatrullaDesc;

                        // Verificar si ya existe
                        long medioExistenteId = 0;
                        await using (var chk = conn.CreateCommand())
                        {
                            chk.Transaction = tx;
                            chk.CommandText = @"
SELECT id FROM cad_medios_disponibles
WHERE  turno_id = @tid AND patrulla_codigo = @pat LIMIT 1";
                            chk.Parameters.AddWithValue("tid", req.TurnoId);
                            chk.Parameters.AddWithValue("pat", patCod);
                            var raw = await chk.ExecuteScalarAsync(ct);
                            if (raw is not null and not DBNull)
                                medioExistenteId = Convert.ToInt64(raw);
                        }

                        if (medioExistenteId > 0)
                        {
                            // Reimportar: refresca canal (si vino), origen, y el
                            // turno_unidad_id si estaba huérfano de una importación
                            // previa al fix (COALESCE no pisa una asignación manual
                            // ya existente). También refresca el personal completo,
                            // a diferencia del comportamiento anterior que solo
                            // tocaba el canal y dejaba el personal desactualizado.
                            await using (var upd = conn.CreateCommand())
                            {
                                upd.Transaction = tx;
                                upd.CommandText = @"
UPDATE cad_medios_disponibles
SET    canal_codigo     = COALESCE(@canal, canal_codigo),
       canal_fuerza_id   = COALESCE(@cfuerza, canal_fuerza_id),
       turno_unidad_id   = COALESCE(turno_unidad_id, @uid),
       origen            = 'SIVICC',
       fecha_modificacion = NOW(), usuario_modifica = @usuario
WHERE  id = @mid";
                                upd.Parameters.AddWithValue("canal",    canalCodigo.HasValue
                                                                        ? (object)canalCodigo.Value : DBNull.Value);
                                upd.Parameters.AddWithValue("cfuerza",  canalFuerzaId.HasValue
                                                                        ? (object)canalFuerzaId.Value : DBNull.Value);
                                upd.Parameters.AddWithValue("uid",      turnoUnidadId);
                                upd.Parameters.AddWithValue("usuario",  usuario);
                                upd.Parameters.AddWithValue("mid",      medioExistenteId);
                                await upd.ExecuteNonQueryAsync(ct);
                            }

                            await using (var delPer = conn.CreateCommand())
                            {
                                delPer.Transaction = tx;
                                delPer.CommandText = "DELETE FROM cad_personal_disponible WHERE medio_id = @mid";
                                delPer.Parameters.AddWithValue("mid", medioExistenteId);
                                await delPer.ExecuteNonQueryAsync(ct);
                            }

                            foreach (var persona in grupo.Take(2))
                            {
                                if (string.IsNullOrWhiteSpace(persona.Identificacion)) continue;
                                await using var insPer = conn.CreateCommand();
                                insPer.Transaction = tx;
                                insPer.CommandText = @"
INSERT INTO cad_personal_disponible
    (sitio_graba, turno_id, medio_id, cedu_empleado,
     nombre_policial, desc_cargo, fecha_creacion)
VALUES (@sg, @tid, @mid, @cedu, @nomb, @cargo, NOW())";
                                insPer.Parameters.AddWithValue("sg",    req.SitioGraba);
                                insPer.Parameters.AddWithValue("tid",   req.TurnoId);
                                insPer.Parameters.AddWithValue("mid",   medioExistenteId);
                                insPer.Parameters.AddWithValue("cedu",  persona.Identificacion);
                                insPer.Parameters.AddWithValue("nomb",  NullOrString(persona.NombreCompleto));
                                insPer.Parameters.AddWithValue("cargo", NullOrString(persona.Cargo));
                                await insPer.ExecuteNonQueryAsync(ct);
                            }

                            actualizados++;
                        }
                        else
                        {
                            // Insertar nuevo medio
                            long nuevoMedioId = _snowflake.NextId();
                            await using (var ins = conn.CreateCommand())
                            {
                                ins.Transaction = tx;
                                ins.CommandText = @"
INSERT INTO cad_medios_disponibles
    (id, sitio_graba, turno_id, turno_unidad_id, unidad_codigo, fuerza_id,
     canal_fuerza_id, canal_codigo,
     patrulla_codigo, patrulla_desc, tipo_medio,
     estado, origen, fecha_creacion)
VALUES
    (@id, @sg, @tid, @uid, @ucod, @fuerza,
     @cfuerza, @canal,
     @patcod, @patdesc, 20,
     27, 'SIVICC', NOW())";
                                ins.Parameters.AddWithValue("id",      nuevoMedioId);
                                ins.Parameters.AddWithValue("sg",      req.SitioGraba);
                                ins.Parameters.AddWithValue("tid",     req.TurnoId);
                                ins.Parameters.AddWithValue("uid",     turnoUnidadId);
                                ins.Parameters.AddWithValue("ucod",    unidad.Consecutivo.ToString());
                                ins.Parameters.AddWithValue("fuerza",  req.FuerzaId == 0
                                                                       ? (object)DBNull.Value : req.FuerzaId);
                                ins.Parameters.AddWithValue("cfuerza", canalFuerzaId.HasValue
                                                                       ? (object)canalFuerzaId.Value : DBNull.Value);
                                ins.Parameters.AddWithValue("canal",   canalCodigo.HasValue
                                                                       ? (object)canalCodigo.Value : DBNull.Value);
                                ins.Parameters.AddWithValue("patcod",  patCod);
                                ins.Parameters.AddWithValue("patdesc", NullOrString(patDesc));
                                await ins.ExecuteNonQueryAsync(ct);
                            }

                            // Insertar personal (máx 2)
                            foreach (var persona in grupo.Take(2))
                            {
                                if (string.IsNullOrWhiteSpace(persona.Identificacion)) continue;
                                await using var insPer = conn.CreateCommand();
                                insPer.Transaction = tx;
                                insPer.CommandText = @"
INSERT INTO cad_personal_disponible
    (sitio_graba, turno_id, medio_id, cedu_empleado,
     nombre_policial, desc_cargo, fecha_creacion)
VALUES (@sg, @tid, @mid, @cedu, @nomb, @cargo, NOW())";
                                insPer.Parameters.AddWithValue("sg",    req.SitioGraba);
                                insPer.Parameters.AddWithValue("tid",   req.TurnoId);
                                insPer.Parameters.AddWithValue("mid",   nuevoMedioId);
                                insPer.Parameters.AddWithValue("cedu",  persona.Identificacion);
                                insPer.Parameters.AddWithValue("nomb",  NullOrString(persona.NombreCompleto));
                                insPer.Parameters.AddWithValue("cargo", NullOrString(persona.Cargo));
                                await insPer.ExecuteNonQueryAsync(ct);
                            }

                            insertados++;
                        }
                    } // foreach porCuadrante
                } // foreach unidades

                // Marcar turno como sincronizado con GESPO
                await using (var updTurno = conn.CreateCommand())
                {
                    updTurno.Transaction = tx;
                    updTurno.CommandText = @"
UPDATE cad_turnos
SET    sivicc_sincronizado = TRUE, sivicc_fecha_sync = NOW()
WHERE  id = @tid";
                    updTurno.Parameters.AddWithValue("tid", req.TurnoId);
                    await updTurno.ExecuteNonQueryAsync(ct);
                }

                await tx.CommitAsync(ct);

                var msg = insertados > 0 && actualizados > 0
                    ? $"{insertados} medio(s) importado(s), {actualizados} actualizado(s)."
                    : insertados > 0
                        ? $"{insertados} medio(s) importado(s) desde GESPO."
                        : actualizados > 0
                            ? $"{actualizados} medio(s) actualizado(s) desde GESPO."
                            : "Los medios ya estaban registrados.";

                return new DtoTurnoResult { Success = true, Id = req.TurnoId, Message = msg };
            }
            catch (OracleException ex)
            {
                await tx.RollbackAsync(ct);
                _logger.LogWarning(ex, "P_ImportarDesdeSivicc: error consultando GESPO turnoId={Id}", req.TurnoId);
                return Fail("GESPO no está disponible en este momento. Intente más tarde o registre el medio manualmente.");
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync(ct);
                _logger.LogError(ex, "P_ImportarDesdeSivicc error turnoId={Id}", req.TurnoId);
                return Fail($"Error al importar desde GESPO: {ex.Message}");
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // CAMBIAR ESTADO DE UN MEDIO (libre ↔ en ruta ↔ ocupado ↔ fuera)
        // ════════════════════════════════════════════════════════════════════════

        public async Task<DtoTurnoResult> P_CambiarEstadoMedioAsync(
            long medioId,
            DtoCambiarEstadoMedioRequest req,
            int fuerzaId,
            string usuario,
            CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);

            if (!await VerificarMedioFuerzaAsync(conn, medioId, fuerzaId, null, ct))
                return Fail($"Medio {medioId} no encontrado.");

            await using var cmd  = conn.CreateCommand();
            // Usamos la función PostgreSQL que ya creamos en V9
            cmd.CommandText = @"
SELECT fn_cambiar_estado_medio(
    @medioId, @estado, @eventoId, @actuacionId, @usuario, @obs
)";
            cmd.Parameters.AddWithValue("medioId",     medioId);
            cmd.Parameters.AddWithValue("estado",      (short)req.NuevoEstado);
            cmd.Parameters.AddWithValue("eventoId",    req.EventoId.HasValue
                                                       ? (object)req.EventoId.Value : DBNull.Value);
            cmd.Parameters.AddWithValue("actuacionId", req.ActuacionId.HasValue
                                                       ? (object)req.ActuacionId.Value : DBNull.Value);
            cmd.Parameters.AddWithValue("usuario",     usuario);
            cmd.Parameters.AddWithValue("obs",         NullOrString(req.Observacion));

            try
            {
                await cmd.ExecuteNonQueryAsync(ct);
                return new DtoTurnoResult
                {
                    Success = true,
                    Id      = medioId,
                    Message = $"Medio {medioId} → {EstadoMedio.Descripcion(req.NuevoEstado)}."
                };
            }
            catch (PostgresException px) when (px.MessageText.Contains("no encontrado"))
            {
                return Fail($"Medio {medioId} no encontrado.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "P_CambiarEstadoMedio error medioId={Id}", medioId);
                return Fail(ex.Message);
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // ACTUALIZAR UBICACIONES GPS DESDE GESPO (lote)
        // Usado tanto por el endpoint de push como por
        // P_SincronizarGpsBajoDemandaAsync (lee Oracle directo vía
        // IGespoOracleReader y llama a este mismo método).
        // ════════════════════════════════════════════════════════════════════════

        public async Task<int> P_ActualizarUbicacionesGespoAsync(
            IEnumerable<DtoGespoUbicacion> ubicaciones,
            int canalCodigo, int canalFuerzaId,
            CancellationToken ct)
        {
            // Filtra valores fuera del rango físico real (y del rango que las
            // columnas NUMERIC pueden almacenar: latitud/longitud NUMERIC(10,7),
            // velocidad_kmh NUMERIC(6,2)) — un solo fix GPS corrupto/absurdo no
            // debe tumbar el UPDATE en lote de TODAS las patrullas con "22003:
            // desbordamiento de campo numeric". Se descarta esa fila puntual y se
            // sigue con el resto.
            var lista = ubicaciones
                .Where(u => !string.IsNullOrWhiteSpace(u.PatrullaCodigo))
                .Where(u =>
                {
                    var valido = Math.Abs(u.Latitud) <= 90 && Math.Abs(u.Longitud) <= 180
                              && (u.VelocidadKmh is null || Math.Abs(u.VelocidadKmh.Value) < 9999.99)
                              && (u.RumboGrados  is null || Math.Abs(u.RumboGrados.Value)  < 999.99);
                    if (!valido)
                        _logger.LogWarning(
                            "P_ActualizarUbicacionesGespo: descartando fix GPS fuera de rango — " +
                            "patrulla={Pat} lat={Lat} lng={Lng} vel={Vel} rumbo={Rumbo}",
                            u.PatrullaCodigo, u.Latitud, u.Longitud, u.VelocidadKmh, u.RumboGrados);
                    return valido;
                })
                .ToList();
            if (lista.Count == 0) return 0;

            // Antes: un UPDATE por posición GPS (N round-trips por lote de GESPO).
            // Ahora: un solo UPDATE con unnest() de los N valores.
            var patcods = new string[lista.Count];
            var lats    = new double[lista.Count];
            var lngs    = new double[lista.Count];
            var vels    = new double?[lista.Count];
            var rums    = new double?[lista.Count];
            var fechas  = new DateTimeOffset[lista.Count];
            for (int i = 0; i < lista.Count; i++)
            {
                var u = lista[i];
                patcods[i] = u.PatrullaCodigo;
                lats[i]    = u.Latitud;
                lngs[i]    = u.Longitud;
                vels[i]    = u.VelocidadKmh;
                rums[i]    = u.RumboGrados;
                // DateTimeOffset.TryParse (no DateTime.TryParse) — u.FechaGps trae un
                // offset explícito (ej. "-05:00" desde GespoOracleReader). Con
                // DateTime.TryParse, RoundtripKind convierte ese valor a Kind=Local
                // usando la zona horaria DEL SERVIDOR .NET, no la que trae el string —
                // en un servidor configurado en hora Colombia el resultado
                // "coincidencialmente" queda en -05:00, pero Npgsql exige offset=0
                // (UTC) para escribir en timestamptz y siempre falla:
                // "Cannot write DateTimeOffset with Offset=-05:00:00...". Parseando
                // como DateTimeOffset se preserva el instante exacto sin depender de
                // la zona horaria del servidor, y ToUniversalTime() deja offset=0.
                fechas[i]  = DateTimeOffset.TryParse(u.FechaGps, null,
                                 System.Globalization.DateTimeStyles.RoundtripKind, out var dto)
                             ? dto.ToUniversalTime() : DateTimeOffset.UtcNow;
            }

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            // ⚠️ patrulla_codigo NO es único globalmente (solo lo es dentro de un
            // mismo turno: UNIQUE(turno_id, patrulla_codigo)) — el payload de GESPO
            // (DtoGespoUbicacion) tampoco trae fuerza_id ni sitio_graba. Antes esta
            // actualización solo exigía "algún turno activo", así que una reutilización
            // del mismo código de patrulla entre dos fuerzas/canales activos al mismo
            // tiempo escribía la posición en ambas filas. Ahora, como el llamador
            // (P_SincronizarGpsBajoDemandaAsync) ya resolvió qué canal/unidad pidió esta
            // sincronización, se añade ese mismo filtro acá — así el UPDATE solo puede
            // tocar medios de ese canal/fuerza puntual, no cualquier medio del tenant
            // cuyo patrulla_codigo coincida. canalCodigo=0 (usado por el endpoint de
            // push, que no tiene contexto de canal) deshabilita el filtro, igual que en
            // G_GetMediosActivosPorCanalAsync.
            cmd.CommandText = @"
UPDATE cad_medios_disponibles m
SET    latitud         = v.lat,
       longitud        = v.lng,
       velocidad_kmh   = v.vel,
       rumbo_grados    = v.rum,
       fecha_ubicacion = v.fecha
FROM   unnest(@patcods, @lats, @lngs, @vels, @rums, @fechas)
       AS v(patcod, lat, lng, vel, rum, fecha)
WHERE  m.patrulla_codigo = v.patcod
  AND  (m.canal_codigo    = @canal       OR @canal       = 0)
  AND  (m.canal_fuerza_id = @canalFuerza OR @canalFuerza = 0)
  AND  m.turno_id IN (
      SELECT id FROM cad_turnos
      WHERE  estado = 'A'
        AND  hora_inicia  <= NOW()
        AND  hora_termina >= NOW()
  )";
            cmd.Parameters.AddWithValue("patcods",     patcods);
            cmd.Parameters.AddWithValue("lats",        lats);
            cmd.Parameters.AddWithValue("lngs",        lngs);
            cmd.Parameters.AddWithValue("vels",        vels);
            cmd.Parameters.AddWithValue("rums",        rums);
            cmd.Parameters.AddWithValue("fechas",      fechas);
            cmd.Parameters.AddWithValue("canal",       canalCodigo);
            cmd.Parameters.AddWithValue("canalFuerza", canalFuerzaId);

            return await cmd.ExecuteNonQueryAsync(ct);
        }

        // ════════════════════════════════════════════════════════════════════════
        // PATRULLA_CODIGO ACTIVOS DE UN CANAL (helper interno de la sincronización GPS)
        // Mismo alcance que G_GetMediosActivosPorCanalAsync (canal+fuerza+turno
        // activo), pero solo trae la columna que hace falta para pedirle a Oracle
        // exactamente esas patrullas — nunca las de todo el canal general/fuerza.
        // ════════════════════════════════════════════════════════════════════════

        private async Task<List<string>> G_GetPatrullaCodigosPorCanalAsync(
            int canalCodigo, int canalFuerzaId, CancellationToken ct)
        {
            var result = new List<string>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
SELECT DISTINCT m.patrulla_codigo
FROM   cad_medios_disponibles m
JOIN   cad_turnos t ON t.id = m.turno_id
WHERE  m.canal_codigo     = @canal
  AND  (m.canal_fuerza_id = @canalFuerza OR @canalFuerza = 0)
  AND  t.estado       = 'A'
  AND  t.hora_inicia  <= (NOW() AT TIME ZONE 'America/Bogota')
  AND  t.hora_termina >= (NOW() AT TIME ZONE 'America/Bogota')";
            cmd.Parameters.AddWithValue("canal",       canalCodigo);
            cmd.Parameters.AddWithValue("canalFuerza", canalFuerzaId);

            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            while (await rdr.ReadAsync(ct))
                result.Add(rdr.GetString(0));
            return result;
        }

        // ════════════════════════════════════════════════════════════════════════
        // SINCRONIZAR GPS BAJO DEMANDA (sin BackgroundService/polling permanente)
        //
        // Se llama desde el mismo tick de polling que YA existe en el frontend de
        // Eventos (recursos del canal, cada 8s) mientras el operador tiene un canal
        // seleccionado — nunca corre si no hay canal abierto, y se detiene solo
        // cuando el operador cambia de canal o sale de la pantalla (Angular cancela
        // la suscripción). No hay ningún proceso en segundo plano consultando
        // Oracle de forma indefinida, y Turnos ya no dispara esta sincronización en
        // absoluto (ese módulo solo administra turnos/unidades/medios, no
        // georreferenciación).
        //
        // Se resuelve primero el conjunto de patrulla_codigo de ESE canal/fuerza en
        // turno activo, y solo esas se piden a Oracle — nunca las de toda la fuerza
        // ni las de otro canal/unidad, que era el comportamiento anterior (filtraba
        // por sigla_papa_unidad = fuerza completa).
        //
        // GespoSyncCooldown evita que varios operadores del mismo canal, con la
        // pantalla abierta al mismo tiempo, disparen consultas a Oracle repetidas
        // o simultáneas.
        // ════════════════════════════════════════════════════════════════════════

        public async Task<int> P_SincronizarGpsBajoDemandaAsync(
            int canalCodigo, int canalFuerzaId, CancellationToken ct)
        {
            if (canalCodigo <= 0 || string.IsNullOrWhiteSpace(_tenant.CodDane))
            {
                _logger.LogInformation(
                    "P_SincronizarGpsBajoDemanda: canalCodigo inválido ({Canal}) o tenant sin resolver " +
                    "(tenant={CodDane}) — no se sincroniza.", canalCodigo, _tenant.CodDane ?? "?");
                return 0;
            }

            var cooldownKey = $"{_tenant.CodDane}:{canalFuerzaId}:{canalCodigo}";
            if (!_gespoCooldown.TryEntrar(cooldownKey, TimeSpan.FromSeconds(6)))
            {
                _logger.LogDebug(
                    "P_SincronizarGpsBajoDemanda: canal {Canal}/{Fuerza} (tenant {CodDane}) — " +
                    "sincronización omitida (cooldown).", canalCodigo, canalFuerzaId, _tenant.CodDane);
                return 0; // Otra sincronización de este mismo canal corrió hace muy poco.
            }

            var patrullas = await G_GetPatrullaCodigosPorCanalAsync(canalCodigo, canalFuerzaId, ct);
            if (patrullas.Count == 0)
            {
                _logger.LogInformation(
                    "P_SincronizarGpsBajoDemanda: canal {Canal}/{Fuerza} (tenant {CodDane}) sin medios " +
                    "activos en turno — no se sincroniza.", canalCodigo, canalFuerzaId, _tenant.CodDane);
                return 0;
            }

            List<DtoGespoUbicacion> ubicaciones;
            try
            {
                ubicaciones = await _gespoGps.LeerUbicacionesActualesAsync(patrullas, ct);
            }
            catch (OracleException ex)
            {
                // Degradación silenciosa — es un tick de polling en segundo plano del
                // frontend, no debe mostrarle un error intrusivo al operador solo
                // porque Oracle GESPO esté lento/caído en este momento puntual.
                _logger.LogWarning(ex,
                    "P_SincronizarGpsBajoDemanda: error consultando Oracle GESPO (tenant={CodDane}, canal={Canal}).",
                    _tenant.CodDane, canalCodigo);
                return 0;
            }

            if (ubicaciones.Count == 0)
            {
                _logger.LogInformation(
                    "P_SincronizarGpsBajoDemanda: tenant {CodDane} canal {Canal}/{Fuerza} — Oracle no " +
                    "devolvió ubicaciones para {N} patrulla(s) solicitada(s).",
                    _tenant.CodDane, canalCodigo, canalFuerzaId, patrullas.Count);
                return 0;
            }

            int actualizados;
            try
            {
                actualizados = await P_ActualizarUbicacionesGespoAsync(ubicaciones, canalCodigo, canalFuerzaId, ct);
            }
            catch (Exception ex)
            {
                // Igual que con Oracle: es un tick de fondo, no una acción que el
                // usuario disparó a propósito — un problema puntual escribiendo en
                // Postgres (ej. un valor fuera de rango que igual se filtra en
                // P_ActualizarUbicacionesGespoAsync, pero por si acaso) no debe
                // mostrarle un error 500 crudo al operador.
                _logger.LogWarning(ex,
                    "P_SincronizarGpsBajoDemanda: error escribiendo ubicaciones en Postgres (tenant={CodDane}, canal={Canal}).",
                    _tenant.CodDane, canalCodigo);
                return 0;
            }

            if (actualizados == 0)
                _logger.LogInformation(
                    "P_SincronizarGpsBajoDemanda: tenant {CodDane} canal {Canal}/{Fuerza} — Oracle devolvió " +
                    "{N} cuadrante(s) pero 0 medios se actualizaron.",
                    _tenant.CodDane, canalCodigo, canalFuerzaId, ubicaciones.Count);

            return actualizados;
        }

        // ════════════════════════════════════════════════════════════════════════
        // SUGERENCIA: RECURSO LIBRE MÁS CERCANO (Haversine en SQL plano)
        // ════════════════════════════════════════════════════════════════════════

        public async Task<List<DtoRecursoCercano>> G_GetRecursoMasCercanoAsync(
            int canalCodigo, int canalFuerzaId, int sitioGraba,
            double lat, double lng, int top, bool prioridadAlta, CancellationToken ct)
        {
            top = Math.Clamp(top, 1, 20);

            var result = new List<DtoRecursoCercano>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            // Distancia calculada con la fórmula de Haversine directamente sobre
            // latitud/longitud — sin PostGIS (no instalable a nivel de SO en todos los
            // servidores de los tenants). A esta escala (decenas de medios por canal) un
            // recorrido completo con ORDER BY es perfectamente suficiente, no hace falta
            // índice espacial. Mismo alcance canal+fuerza+sitio+turno-activo que
            // G_GetMediosActivosPorCanalAsync (ver nota sobre cad_canales.codigo no ser
            // único por sí solo ahí). Solo medios Libres (27) con GPS reciente (<10 min,
            // mismo umbral que gps_activo) — un medio con GPS desactualizado podría ya
            // no estar donde dice la última posición conocida.
            //
            // Asignación inteligente — heurística de desempate: para incidentes de
            // prioridad alta (@prioridadAlta), se le suma una "penalización" de 1500m
            // a motos/bicicletas (20/21) al ordenar — no las descarta ni las bloquea,
            // solo hace que un vehículo de más capacidad (patrulla/ambulancia) gane el
            // primer lugar cuando está razonablemente cerca, aunque una moto esté un
            // poco más cerca en línea recta. Si la moto está MUY cerca (la diferencia
            // supera los 1500m), sigue ganando ella — la distancia real nunca deja de
            // pesar. Para prioridad normal, se ordena únicamente por distancia, como antes.
            cmd.CommandText = @"
SELECT m.id::text, m.patrulla_codigo, m.patrulla_desc, m.tipo_medio, m.estado,
       m.latitud, m.longitud,
       ROUND((6371000 * 2 * ASIN(SQRT(
           POWER(SIN(RADIANS((m.latitud - @lat) / 2.0)), 2) +
           COS(RADIANS(@lat)) * COS(RADIANS(m.latitud)) *
           POWER(SIN(RADIANS((m.longitud - @lng) / 2.0)), 2)
       )))::numeric, 0) AS distancia_m
FROM   cad_medios_disponibles m
JOIN   cad_turnos t ON t.id = m.turno_id
WHERE  m.canal_codigo    = @canal
  AND  (m.canal_fuerza_id = @canalFuerza OR @canalFuerza = 0)
  AND  t.estado           = 'A'
  AND  t.hora_inicia     <= (NOW() AT TIME ZONE 'America/Bogota')
  AND  t.hora_termina    >= (NOW() AT TIME ZONE 'America/Bogota')
  AND  (m.sitio_graba = @sg OR m.sitio_graba = 0 OR @sg = 0)
  AND  m.estado           = 27
  AND  m.latitud          IS NOT NULL
  AND  m.longitud         IS NOT NULL
  AND  m.fecha_ubicacion  IS NOT NULL
  AND  NOW() - m.fecha_ubicacion < INTERVAL '10 minutes'
ORDER  BY
    6371000 * 2 * ASIN(SQRT(
           POWER(SIN(RADIANS((m.latitud - @lat) / 2.0)), 2) +
           COS(RADIANS(@lat)) * COS(RADIANS(m.latitud)) *
           POWER(SIN(RADIANS((m.longitud - @lng) / 2.0)), 2)
       ))
    + (CASE WHEN @prioridadAlta AND m.tipo_medio IN (20,21) THEN 1500.0 ELSE 0.0 END)
LIMIT  @top";
            cmd.Parameters.AddWithValue("canal",         canalCodigo);
            cmd.Parameters.AddWithValue("canalFuerza",   canalFuerzaId);
            cmd.Parameters.AddWithValue("sg",            sitioGraba);
            cmd.Parameters.AddWithValue("lat",           lat);
            cmd.Parameters.AddWithValue("lng",           lng);
            cmd.Parameters.AddWithValue("top",           top);
            cmd.Parameters.AddWithValue("prioridadAlta", prioridadAlta);

            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            while (await rdr.ReadAsync(ct))
            {
                var estado = rdr.GetInt16(4);
                result.Add(new DtoRecursoCercano
                {
                    MedioId        = rdr.GetString(0),
                    PatrullaCodigo = rdr.GetString(1),
                    PatrullaDesc   = rdr.IsDBNull(2) ? "" : rdr.GetString(2),
                    TipoMedio      = rdr.GetInt16(3),
                    Estado         = estado,
                    EstadoDesc     = EstadoMedio.Descripcion(estado),
                    Latitud        = Convert.ToDouble(rdr.GetValue(5)),
                    Longitud       = Convert.ToDouble(rdr.GetValue(6)),
                    DistanciaM     = Convert.ToDouble(rdr.GetValue(7)),
                });
            }
            return result;
        }

        // ════════════════════════════════════════════════════════════════════════
        // PRIVATE HELPERS
        // ════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// Verifica que el turno exista y pertenezca a la fuerza del usuario autenticado.
        /// fuerzaId = 0 (claim ausente) omite la verificación, igual que el patrón ya
        /// usado en G_GetMediosActivosPorCanalAsync (@canalFuerza = 0).
        /// </summary>
        private static async Task<bool> VerificarTurnoFuerzaAsync(
            NpgsqlConnection conn, long turnoId, int fuerzaId, NpgsqlTransaction? tx, CancellationToken ct)
        {
            await using var cmd = conn.CreateCommand();
            if (tx is not null) cmd.Transaction = tx;
            cmd.CommandText = "SELECT fuerza_id FROM cad_turnos WHERE id = @tid";
            cmd.Parameters.AddWithValue("tid", turnoId);
            var raw = await cmd.ExecuteScalarAsync(ct);
            if (raw is null or DBNull) return false;
            return fuerzaId == 0 || Convert.ToInt32(raw) == fuerzaId;
        }

        /// <summary>Igual que VerificarTurnoFuerzaAsync, pero resuelve el turno a partir del medio.</summary>
        private static async Task<bool> VerificarMedioFuerzaAsync(
            NpgsqlConnection conn, long medioId, int fuerzaId, NpgsqlTransaction? tx, CancellationToken ct)
        {
            await using var cmd = conn.CreateCommand();
            if (tx is not null) cmd.Transaction = tx;
            cmd.CommandText = @"
SELECT t.fuerza_id
FROM   cad_medios_disponibles m
JOIN   cad_turnos t ON t.id = m.turno_id
WHERE  m.id = @mid";
            cmd.Parameters.AddWithValue("mid", medioId);
            var raw = await cmd.ExecuteScalarAsync(ct);
            if (raw is null or DBNull) return false;
            return fuerzaId == 0 || Convert.ToInt32(raw) == fuerzaId;
        }

        private static DtoMedioDisponible MapMedioFromReader(NpgsqlDataReader rdr)
        {
            var estado   = rdr.IsDBNull(12) ? EstadoMedio.Libre : rdr.GetInt16(12);
            var tipoMed  = rdr.IsDBNull(11) ? TipoMedio.Patrulla : rdr.GetInt16(11);

            // Parsear personal del campo concatenado "cedu|nomb|cargo~cedu|nomb|cargo"
            var personal = new List<DtoPersonalMedio>();
            var rawPer   = rdr.IsDBNull(20) ? "" : rdr.GetString(20);
            if (!string.IsNullOrWhiteSpace(rawPer))
            {
                foreach (var entry in rawPer.Split('~', StringSplitOptions.RemoveEmptyEntries))
                {
                    var parts = entry.Split('|');
                    personal.Add(new DtoPersonalMedio
                    {
                        CeduEmpleado   = parts.Length > 0 ? parts[0] : "",
                        NombrePolicial = parts.Length > 1 ? NullIfEmpty(parts[1]) : null,
                        DescCargo      = parts.Length > 2 ? NullIfEmpty(parts[2]) : null
                    });
                }
            }

            // GPS activo: calculado en SQL comparando timestamptz contra timestamptz
            // (instante absoluto, columna gps_activo en índice 21 de ambas consultas).
            string? fechaUbi = rdr.IsDBNull(17) ? null : rdr.GetString(17);
            bool gpsActivo   = !rdr.IsDBNull(21) && rdr.GetBoolean(21);

            return new DtoMedioDisponible
            {
                Id               = rdr.GetInt64(0),
                SitioGraba       = rdr.GetInt32(1),
                TurnoId          = rdr.GetInt64(2),
                TurnoUnidadId    = rdr.IsDBNull(3)  ? null : rdr.GetInt64(3),
                UnidadCodigo     = rdr.IsDBNull(4)  ? null : rdr.GetString(4),
                FuerzaId         = rdr.IsDBNull(5)  ? null : rdr.GetInt32(5),
                CanalFuerzaId    = rdr.IsDBNull(6)  ? null : rdr.GetInt32(6),
                CanalCodigo      = rdr.IsDBNull(7)  ? null : rdr.GetInt32(7),
                CanalDesc        = rdr.IsDBNull(8)  ? "" : rdr.GetString(8),
                PatrullaCodigo   = rdr.IsDBNull(9)  ? "" : rdr.GetString(9),
                PatrullaDesc     = rdr.IsDBNull(10) ? "" : rdr.GetString(10),
                TipoMedio        = tipoMed,
                TipoMedioDesc    = TipoMedioDescripcion(tipoMed),
                Estado           = estado,
                EstadoDesc       = EstadoMedio.Descripcion(estado),
                Latitud          = rdr.IsDBNull(13) ? null : (double?)rdr.GetDouble(13),
                Longitud         = rdr.IsDBNull(14) ? null : (double?)rdr.GetDouble(14),
                VelocidadKmh     = rdr.IsDBNull(15) ? null : (double?)rdr.GetDouble(15),
                RumboGrados      = rdr.IsDBNull(16) ? null : (double?)rdr.GetDouble(16),
                FechaUbicacion   = fechaUbi,
                GpsActivo        = gpsActivo,
                EventoId         = rdr.IsDBNull(18) ? null : rdr.GetInt64(18),
                ActuacionId      = rdr.IsDBNull(19) ? null : rdr.GetInt64(19),
                Personal         = personal
            };
        }

        private static string TipoMedioDescripcion(int tipo) => tipo switch
        {
            20 => "Motocicleta",
            21 => "Bicicleta",
            22 => "Patrulla",
            23 => "Ambulancia",
            24 => "Camión Bomberos",
            25 => "Helicóptero",
            26 => "Lancha",
            _  => $"Tipo {tipo}"
        };

        // ════════════════════════════════════════════════════════════════════════
        // ACTUALIZAR MEDIO (edición posterior al alta)
        // ════════════════════════════════════════════════════════════════════════

        public async Task<DtoTurnoResult> P_ActualizarMedioAsync(
            long medioId, DtoActualizarMedioRequest req, int fuerzaId, string usuario, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(req.PatrullaCodigo))
                return Fail("El código de patrulla es obligatorio.");

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx   = await conn.BeginTransactionAsync(ct);

            try
            {
                // 1. Verificar existencia, pertenencia a la fuerza del usuario y obtener
                //    turnoId + sitio_graba del turno padre.
                long turnoId;
                int  sitioGrabaT;
                await using (var qMed = conn.CreateCommand())
                {
                    qMed.Transaction = tx;
                    qMed.CommandText = @"
SELECT m.turno_id, COALESCE(t.sitio_graba, 0), t.fuerza_id
FROM   cad_medios_disponibles m
JOIN   cad_turnos t ON t.id = m.turno_id
WHERE  m.id = @mid";
                    qMed.Parameters.AddWithValue("mid", medioId);
                    await using var rMed = await qMed.ExecuteReaderAsync(ct);
                    if (!await rMed.ReadAsync(ct))
                    {
                        await tx.RollbackAsync(ct);
                        return Fail($"Medio {medioId} no encontrado.");
                    }
                    turnoId     = rMed.GetInt64(0);
                    sitioGrabaT = rMed.GetInt32(1);
                    var turnoFuerza = rMed.GetInt32(2);
                    if (fuerzaId != 0 && turnoFuerza != fuerzaId)
                    {
                        await tx.RollbackAsync(ct);
                        return Fail($"Medio {medioId} no encontrado.");
                    }
                }

                // 2. Verificar que el código de patrulla no colisione con OTRO medio del mismo turno
                await using (var chk = conn.CreateCommand())
                {
                    chk.Transaction = tx;
                    chk.CommandText = @"
SELECT COUNT(*) FROM cad_medios_disponibles
WHERE  turno_id = @tid AND patrulla_codigo = @pat AND id <> @mid";
                    chk.Parameters.AddWithValue("tid", turnoId);
                    chk.Parameters.AddWithValue("pat", req.PatrullaCodigo.Trim().ToUpper());
                    chk.Parameters.AddWithValue("mid", medioId);
                    var dup = Convert.ToInt64(await chk.ExecuteScalarAsync(ct));
                    if (dup > 0)
                    {
                        await tx.RollbackAsync(ct);
                        return Fail($"La patrulla '{req.PatrullaCodigo}' ya está registrada en este turno.");
                    }
                }

                // 3. Snapshot de descripción del canal (si aplica).
                //    cad_canales.codigo se numera por fuerza (no es único por sí
                //    solo) — filtrar también por cadfuerz_id o se trae el canal
                //    de otra fuerza que reutiliza el mismo código.
                string canalDesc = "";
                if (req.CanalCodigo.HasValue && req.CanalFuerzaId.HasValue)
                {
                    await using var qCan = conn.CreateCommand();
                    qCan.Transaction = tx;
                    qCan.CommandText = "SELECT descripcion FROM cad_canales WHERE codigo = @c AND cadfuerz_id = @cf LIMIT 1";
                    qCan.Parameters.AddWithValue("c",  req.CanalCodigo.Value);
                    qCan.Parameters.AddWithValue("cf", req.CanalFuerzaId.Value);
                    var desc = await qCan.ExecuteScalarAsync(ct);
                    if (desc is not null and not DBNull) canalDesc = desc.ToString()!;
                }

                // 4. Actualizar campos editables del medio
                //    (incluye sitio_graba para corregir medios guardados con 0)
                await using (var upd = conn.CreateCommand())
                {
                    upd.Transaction = tx;
                    upd.CommandText = @"
UPDATE cad_medios_disponibles SET
    sitio_graba     = @sg,
    canal_fuerza_id = @cfuerza,
    canal_codigo    = @canal,
    canal_desc      = @canalDesc,
    patrulla_codigo = @patcod,
    patrulla_desc   = @patdesc,
    tipo_medio      = @tipo
WHERE id = @mid";
                    upd.Parameters.AddWithValue("sg",        sitioGrabaT);
                    upd.Parameters.AddWithValue("cfuerza",   req.CanalFuerzaId.HasValue
                                                              ? (object)req.CanalFuerzaId.Value : DBNull.Value);
                    upd.Parameters.AddWithValue("canal",     req.CanalCodigo.HasValue
                                                              ? (object)req.CanalCodigo.Value   : DBNull.Value);
                    upd.Parameters.AddWithValue("canalDesc", NullOrString(canalDesc));
                    upd.Parameters.AddWithValue("patcod",    req.PatrullaCodigo.Trim().ToUpper());
                    upd.Parameters.AddWithValue("patdesc",   NullOrString(req.PatrullaDesc));
                    upd.Parameters.AddWithValue("tipo",      req.TipoMedio);
                    upd.Parameters.AddWithValue("mid",       medioId);
                    await upd.ExecuteNonQueryAsync(ct);
                }

                // 5. Reemplazar personal: borrar todos los anteriores e insertar los nuevos
                await using (var delPer = conn.CreateCommand())
                {
                    delPer.Transaction = tx;
                    delPer.CommandText = "DELETE FROM cad_personal_disponible WHERE medio_id = @mid";
                    delPer.Parameters.AddWithValue("mid", medioId);
                    await delPer.ExecuteNonQueryAsync(ct);
                }

                foreach (var p in req.Personal.Take(2))
                {
                    if (string.IsNullOrWhiteSpace(p.CeduEmpleado)) continue;
                    await using var insPer = conn.CreateCommand();
                    insPer.Transaction = tx;
                    insPer.CommandText = @"
INSERT INTO cad_personal_disponible
    (sitio_graba, turno_id, medio_id, cedu_empleado,
     nombre_policial, desc_cargo, fecha_creacion)
VALUES (@sg, @tid, @mid, @cedu, @nomb, @cargo, NOW())";
                    insPer.Parameters.AddWithValue("sg",    sitioGrabaT);
                    insPer.Parameters.AddWithValue("tid",   turnoId);
                    insPer.Parameters.AddWithValue("mid",   medioId);
                    insPer.Parameters.AddWithValue("cedu",  p.CeduEmpleado.Trim());
                    insPer.Parameters.AddWithValue("nomb",  NullOrString(p.NombrePolicial));
                    insPer.Parameters.AddWithValue("cargo", NullOrString(p.DescCargo));
                    await insPer.ExecuteNonQueryAsync(ct);
                }

                await tx.CommitAsync(ct);
                _logger.LogInformation("Medio {Id} actualizado por {U}", medioId, usuario);
                return new DtoTurnoResult { Success = true, Id = medioId, Message = "Medio actualizado." };
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync(ct);
                _logger.LogError(ex, "P_ActualizarMedioAsync error medioId={Id}", medioId);
                throw;
            }
        }

        private static object NullOrString(string? value) =>
            string.IsNullOrWhiteSpace(value) ? DBNull.Value : value;

        private static string? NullIfEmpty(string? value) =>
            string.IsNullOrWhiteSpace(value) ? null : value;

        private static DtoTurnoResult Fail(string msg) =>
            new() { Success = false, Message = msg };
    }
}
