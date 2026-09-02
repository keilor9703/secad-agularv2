using Comun.Dtos.Actuaciones;
using Comun.Dtos.Agencias;
using Comun.Snowflake;
using Datos.Interfaz;
using Datos.Tenant;
using Microsoft.Extensions.Logging;
using Npgsql;
using System.Text.Json;

namespace Datos.Gestion
{
    public class DbActuacionRepository : IDbActuacionRepository
    {
        private readonly TenantContext                   _tenant;
        private readonly ILogger<DbActuacionRepository> _logger;
        private readonly ISnowflakeGenerator             _snowflake;

        // ISO-8601 sin zona horaria (hora Colombia ya aplicada en el AT TIME ZONE).
        // JavaScript new Date("YYYY-MM-DDTHH24:MI:SS") parsea correctamente.
        // No usar "DD/MM/YYYY HH24:MI:SS" — ese formato devuelve Invalid Date en JS.
        private const string TsFormat = "YYYY-MM-DD\"T\"HH24:MI:SS";

        public DbActuacionRepository(
            TenantContext tenant,
            ILogger<DbActuacionRepository> logger,
            ISnowflakeGenerator snowflake)
        {
            _tenant    = tenant;
            _logger    = logger;
            _snowflake = snowflake;
        }

        // ════════════════════════════════════════════════════════════════════════
        // LISTA DE ACTUACIONES DE UN EVENTO
        // ════════════════════════════════════════════════════════════════════════

        public async Task<List<DtoActuacionListItem>> G_GetActuacionesEventoAsync(
            long eventoId, CancellationToken ct)
        {
            var result = new List<DtoActuacionListItem>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = $@"
SELECT a.id, a.evento_id,
       COALESCE(a.fuerza_descripcion,
                f.descripcion, '')                  AS fuerza_desc,
       COALESCE(a.canal_descripcion,
                c.descripcion, '')                  AS canal_desc,
       a.unidad_asignada,
       a.estado,
       TO_CHAR(a.fecha_creacion  AT TIME ZONE 'America/Bogota','{TsFormat}'),
       TO_CHAR(a.fecha_despacho  AT TIME ZONE 'America/Bogota','{TsFormat}'),
       TO_CHAR(a.fecha_llegada   AT TIME ZONE 'America/Bogota','{TsFormat}'),
       TO_CHAR(a.fecha_cierre    AT TIME ZONE 'America/Bogota','{TsFormat}'),
       a.cali_pedido,
       (SELECT COUNT(*) FROM cad_actuaciones_unidades u WHERE u.actuacion_id = a.id) AS total_unidades,
       (SELECT COUNT(*) FROM cad_actuaciones_notas    n WHERE n.actuacion_id = a.id) AS total_notas,
       a.placa_unidad,         -- col 13
       a.despachador_usuario,  -- col 14: quien despachó el recurso
       a.canal_codigo,         -- col 15
       a.fuerza_id,            -- col 16
       a.solicita_apoyo,       -- col 17
       TO_CHAR(a.fecha_solicita_apoyo AT TIME ZONE 'America/Bogota','{TsFormat}'),  -- col 18
       -- col 19: nombre del cuadrante (patrulla_desc) para la unidad asignada —
       -- a.unidad_asignada guarda el código; acá se resuelve el nombre legible.
       (SELECT md.patrulla_desc
          FROM cad_medios_disponibles md
         WHERE md.patrulla_codigo = a.unidad_asignada
           AND (a.fuerza_id IS NULL OR md.fuerza_id = a.fuerza_id)
         ORDER BY md.id DESC
         LIMIT 1)                            AS unidad_desc
FROM   cad_actuaciones a
LEFT   JOIN cad_fuerzas f ON f.id     = a.fuerza_id
LEFT   JOIN cad_canales c ON c.codigo = a.canal_codigo AND c.cadfuerz_id = a.fuerza_id
WHERE  a.pedido_id = @eid
-- Nota: el frontend SIEMPRE envía cad_pedidos.id como eventoId.
-- NO usar a.evento_id aquí porque ese campo almacena cad_eventos.id
-- (tabla distinta con su propio espacio de Snowflake IDs).
ORDER  BY
    -- Solicitud de apoyo urgente siempre primero — seguridad del funcionario.
    a.solicita_apoyo DESC,
    -- Luego activos (P→D→A), luego cerrados (C), anuladas al final (V)
    CASE a.estado
        WHEN 'P' THEN 0
        WHEN 'D' THEN 1
        WHEN 'A' THEN 2
        WHEN 'C' THEN 3
        ELSE          4
    END ASC,
    a.fecha_creacion ASC";
            cmd.Parameters.AddWithValue("eid", eventoId);

            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            while (await rdr.ReadAsync(ct))
                result.Add(new DtoActuacionListItem
                {
                    Id            = rdr.GetInt64(0),
                    EventoId      = rdr.GetInt64(1),
                    FuerzaDesc    = rdr.IsDBNull(2)  ? "" : rdr.GetString(2),
                    CanalDesc     = rdr.IsDBNull(3)  ? "" : rdr.GetString(3),
                    UnidadAsignada= rdr.IsDBNull(4)  ? null : rdr.GetString(4),
                    Estado        = rdr.IsDBNull(5)  ? "" : rdr.GetString(5),
                    FechaCreacion = rdr.IsDBNull(6)  ? "" : rdr.GetString(6),
                    FechaDespacho = rdr.IsDBNull(7)  ? null : rdr.GetString(7),
                    FechaLlegada  = rdr.IsDBNull(8)  ? null : rdr.GetString(8),
                    FechaCierre   = rdr.IsDBNull(9)  ? null : rdr.GetString(9),
                    CaliPedido          = rdr.IsDBNull(10) ? null : rdr.GetString(10),
                    TotalUnidades       = rdr.IsDBNull(11) ? 0   : (int)rdr.GetInt64(11),
                    TotalNotas          = rdr.IsDBNull(12) ? 0   : (int)rdr.GetInt64(12),
                    PlacaUnidad         = rdr.IsDBNull(13) ? null : rdr.GetString(13),
                    DespachadorUsuario  = rdr.IsDBNull(14) ? null : rdr.GetString(14),
                    CanalCodigo         = rdr.IsDBNull(15) ? null : rdr.GetInt32(15),
                    FuerzaId            = rdr.IsDBNull(16) ? null : rdr.GetInt32(16),
                    SolicitaApoyo       = !rdr.IsDBNull(17) && rdr.GetBoolean(17),
                    FechaSolicitaApoyo  = rdr.IsDBNull(18) ? null : rdr.GetString(18),
                    UnidadDesc          = rdr.IsDBNull(19) ? null : rdr.GetString(19)
                });
            return result;
        }

        // ════════════════════════════════════════════════════════════════════════
        // DETALLE COMPLETO DE UNA ACTUACIÓN
        // ════════════════════════════════════════════════════════════════════════

        public async Task<DtoActuacion?> G_GetActuacionAsync(
            long actuacionId, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);

            DtoActuacion? act = null;

            // ── Datos base ───────────────────────────────────────────────────────
            await using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = $@"
SELECT a.id, a.evento_id, a.pedido_id, a.sitio_graba,
       a.fuerza_id, a.canal_codigo,
       COALESCE(a.fuerza_descripcion, f.descripcion, '') AS fuerza_desc,
       COALESCE(a.canal_descripcion,  c.descripcion, '') AS canal_desc,
       a.despachador_usuario, a.tipo_despachador,
       a.unidad_asignada, a.placa_unidad,
       a.estado,
       TO_CHAR(a.fecha_creacion   AT TIME ZONE 'America/Bogota','{TsFormat}'),
       TO_CHAR(a.fecha_despacho   AT TIME ZONE 'America/Bogota','{TsFormat}'),
       TO_CHAR(a.fecha_llegada    AT TIME ZONE 'America/Bogota','{TsFormat}'),
       TO_CHAR(a.fecha_cierre     AT TIME ZONE 'America/Bogota','{TsFormat}'),
       a.codigo_cierre_primario, a.clasif_cierre, a.observacion_cierre,
       a.cali_pedido,
       TO_CHAR(a.fecha_modificacion AT TIME ZONE 'America/Bogota','{TsFormat}'),
       a.usuario_modifica
FROM   cad_actuaciones a
LEFT   JOIN cad_fuerzas f ON f.id     = a.fuerza_id
LEFT   JOIN cad_canales c ON c.codigo = a.canal_codigo AND c.cadfuerz_id = a.fuerza_id
WHERE  a.id = @id";
                cmd.Parameters.AddWithValue("id", actuacionId);

                await using var rdr = await cmd.ExecuteReaderAsync(ct);
                if (!await rdr.ReadAsync(ct)) return null;

                act = new DtoActuacion
                {
                    Id                    = rdr.GetInt64(0),
                    EventoId              = rdr.GetInt64(1),
                    PedidoId              = rdr.IsDBNull(2)  ? null : rdr.GetInt64(2),
                    SitioGraba            = rdr.GetInt32(3),
                    FuerzaId              = rdr.IsDBNull(4)  ? null : rdr.GetInt32(4),
                    CanalCodigo           = rdr.IsDBNull(5)  ? null : rdr.GetInt32(5),
                    FuerzaDescripcion     = rdr.IsDBNull(6)  ? "" : rdr.GetString(6),
                    CanalDescripcion      = rdr.IsDBNull(7)  ? "" : rdr.GetString(7),
                    DespachadorUsuario    = rdr.IsDBNull(8)  ? null : rdr.GetString(8),
                    TipoDespachador       = rdr.IsDBNull(9)  ? null : rdr.GetString(9),
                    UnidadAsignada        = rdr.IsDBNull(10) ? null : rdr.GetString(10),
                    PlacaUnidad           = rdr.IsDBNull(11) ? null : rdr.GetString(11),
                    Estado                = rdr.IsDBNull(12) ? "" : rdr.GetString(12),
                    FechaCreacion         = rdr.IsDBNull(13) ? "" : rdr.GetString(13),
                    FechaDespacho         = rdr.IsDBNull(14) ? null : rdr.GetString(14),
                    FechaLlegada          = rdr.IsDBNull(15) ? null : rdr.GetString(15),
                    FechaCierre           = rdr.IsDBNull(16) ? null : rdr.GetString(16),
                    CodigoCierrePrimario  = rdr.IsDBNull(17) ? null : rdr.GetString(17),
                    ClasifCierre          = rdr.IsDBNull(18) ? null : rdr.GetString(18),
                    ObservacionCierre     = rdr.IsDBNull(19) ? null : rdr.GetString(19),
                    CaliPedido            = rdr.IsDBNull(20) ? null : rdr.GetString(20),
                    FechaModificacion     = rdr.IsDBNull(21) ? null : rdr.GetString(21),
                    UsuarioModifica       = rdr.IsDBNull(22) ? null : rdr.GetString(22)
                };
            }

            // ── Códigos de cierre ────────────────────────────────────────────────
            await using (var cmdCod = conn.CreateCommand())
            {
                cmdCod.CommandText = @"
SELECT orden, codigo_cierre, tipo_codigo, descripcion_libre
FROM   cad_actuaciones_codigos
WHERE  actuacion_id = @id
ORDER  BY orden";
                cmdCod.Parameters.AddWithValue("id", actuacionId);
                await using var rdr = await cmdCod.ExecuteReaderAsync(ct);
                while (await rdr.ReadAsync(ct))
                    act.CodigosCierre.Add(new DtoCodigoCierreActuacion
                    {
                        Orden            = rdr.IsDBNull(0) ? 1  : rdr.GetInt16(0),
                        CodigoCierre     = rdr.IsDBNull(1) ? "" : rdr.GetString(1),
                        TipoCodigo       = rdr.IsDBNull(2) ? "" : rdr.GetString(2),
                        DescripcionLibre = rdr.IsDBNull(3) ? null : rdr.GetString(3)
                    });
            }

            // ── Unidades despachadas ─────────────────────────────────────────────
            await using (var cmdUni = conn.CreateCommand())
            {
                cmdUni.CommandText = $@"
SELECT id, unidad_codigo, placa, tipo_unidad, estado,
       TO_CHAR(fecha_despacho   AT TIME ZONE 'America/Bogota','{TsFormat}'),
       TO_CHAR(fecha_llegada    AT TIME ZONE 'America/Bogota','{TsFormat}'),
       TO_CHAR(fecha_liberacion AT TIME ZONE 'America/Bogota','{TsFormat}'),
       observacion
FROM   cad_actuaciones_unidades
WHERE  actuacion_id = @id
ORDER  BY id";
                cmdUni.Parameters.AddWithValue("id", actuacionId);
                await using var rdr = await cmdUni.ExecuteReaderAsync(ct);
                while (await rdr.ReadAsync(ct))
                    act.Unidades.Add(new DtoActuacionUnidad
                    {
                        Id              = rdr.GetInt64(0),
                        UnidadCodigo    = rdr.IsDBNull(1) ? "" : rdr.GetString(1),
                        Placa           = rdr.IsDBNull(2) ? null : rdr.GetString(2),
                        TipoUnidad      = rdr.IsDBNull(3) ? null : rdr.GetString(3),
                        Estado          = rdr.IsDBNull(4) ? "D" : rdr.GetString(4),
                        FechaDespacho   = rdr.IsDBNull(5) ? null : rdr.GetString(5),
                        FechaLlegada    = rdr.IsDBNull(6) ? null : rdr.GetString(6),
                        FechaLiberacion = rdr.IsDBNull(7) ? null : rdr.GetString(7),
                        Observacion     = rdr.IsDBNull(8) ? null : rdr.GetString(8)
                    });
            }

            // ── Notas de campo ───────────────────────────────────────────────────
            await using (var cmdNot = conn.CreateCommand())
            {
                cmdNot.CommandText = $@"
SELECT id, nota, tipo_nota, usuario_registra,
       TO_CHAR(fecha_registra AT TIME ZONE 'America/Bogota','{TsFormat}')
FROM   cad_actuaciones_notas
WHERE  actuacion_id = @id
ORDER  BY fecha_registra ASC";
                cmdNot.Parameters.AddWithValue("id", actuacionId);
                await using var rdr = await cmdNot.ExecuteReaderAsync(ct);
                while (await rdr.ReadAsync(ct))
                    act.Notas.Add(new DtoActuacionNota
                    {
                        Id              = rdr.GetInt64(0),
                        Nota            = rdr.IsDBNull(1) ? "" : rdr.GetString(1),
                        TipoNota        = rdr.IsDBNull(2) ? "GENERAL" : rdr.GetString(2),
                        UsuarioRegistra = rdr.IsDBNull(3) ? "" : rdr.GetString(3),
                        FechaRegistra   = rdr.IsDBNull(4) ? "" : rdr.GetString(4)
                    });
            }

            return act;
        }

        // ════════════════════════════════════════════════════════════════════════
        // ACTUALIZAR ESTADO OPERATIVO (Despachada → Atendida)
        // ════════════════════════════════════════════════════════════════════════

        public async Task<DtoActuacionResult> P_ActualizarEstadoActuacionAsync(
            long actuacionId,
            DtoActualizarEstadoActuacionRequest req,
            int canalCodigo, int fuerzaId,
            string usuario,
            CancellationToken ct)
        {
            if (req.Estado != EstadoActuacion.Despachada && req.Estado != EstadoActuacion.Atendida)
                return new DtoActuacionResult
                {
                    Success     = false,
                    ActuacionId = actuacionId,
                    Message     = $"Estado inválido para ciclo operativo: '{req.Estado}'. Use D o A."
                };

            var tsCol = req.Estado == EstadoActuacion.Despachada ? "fecha_despacho" : "fecha_llegada";

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);

            var errorCanal = await VerificarCanalPropietarioAsync(conn, null, actuacionId, canalCodigo, fuerzaId, ct);
            if (errorCanal is not null)
                return new DtoActuacionResult { Success = false, ActuacionId = actuacionId, Message = errorCanal };

            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = $@"
UPDATE cad_actuaciones
SET    estado              = @estado,
       {tsCol}             = NOW(),
       unidad_asignada     = COALESCE(@unidad, unidad_asignada),
       placa_unidad        = COALESCE(@placa,  placa_unidad),
       fecha_modificacion  = NOW(),
       usuario_modifica    = @usuario
WHERE  id = @id
  AND  estado NOT IN ('C','V')";  /* -- no se reabre una actuación cerrada*/

            cmd.Parameters.AddWithValue("estado",  req.Estado);
            cmd.Parameters.AddWithValue("unidad",  NullOrString(req.UnidadAsignada));
            cmd.Parameters.AddWithValue("placa",   NullOrString(req.PlacaUnidad));
            cmd.Parameters.AddWithValue("usuario", usuario);
            cmd.Parameters.AddWithValue("id",      actuacionId);

            var rows = await cmd.ExecuteNonQueryAsync(ct);
            if (rows > 0)
            {
                // Actualizar estado operativo del medio vinculado a esta actuación
                // D=Despachada → medio 30 (En ruta) | A=Atendida → medio 28 (En sitio/Ocupado)
                int medioEstado = req.Estado == EstadoActuacion.Despachada ? 30 : 28;
                await using var updMedio = conn.CreateCommand();
                updMedio.CommandText = @"
UPDATE cad_medios_disponibles
SET    estado = @medioEstado
WHERE  actuacion_id = @actId";
                updMedio.Parameters.AddWithValue("medioEstado", medioEstado);
                updMedio.Parameters.AddWithValue("actId",       actuacionId);
                await updMedio.ExecuteNonQueryAsync(ct);
            }
            return new DtoActuacionResult
            {
                Success     = rows > 0,
                ActuacionId = actuacionId,
                Message     = rows > 0
                    ? $"Actuación {actuacionId} → {req.Estado}."
                    : $"Actuación {actuacionId} no encontrada o ya cerrada/anulada."
            };
        }

        // ════════════════════════════════════════════════════════════════════════
        // CERRAR ACTUACIÓN CON CÓDIGOS DE CIERRE
        // UPDATE cad_actuaciones + INSERT cad_actuaciones_codigos
        // + fn_recalcular_estado_evento — todo en una transacción.
        // ════════════════════════════════════════════════════════════════════════

        public async Task<DtoActuacionResult> P_CerrarActuacionAsync(
            DtoCierreActuacionRequest req,
            int canalCodigo, int fuerzaId,
            string usuario,
            CancellationToken ct)
        {
            if (req.ActuacionId <= 0)
                return new DtoActuacionResult
                {
                    Success = false,
                    Message = "ActuacionId inválido."
                };

            var estadoFinal = req.Estado is EstadoActuacion.Cerrada or EstadoActuacion.Anulada
                            ? req.Estado : EstadoActuacion.Cerrada;

            var codigoPrimario = req.CodigosCierre
                .OrderBy(x => x.Orden)
                .FirstOrDefault()?.CodigoCierre ?? "";

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx   = await conn.BeginTransactionAsync(ct);

            try
            {
                var errorCanal = await VerificarCanalPropietarioAsync(conn, tx, req.ActuacionId, canalCodigo, fuerzaId, ct);
                if (errorCanal is not null)
                {
                    await tx.RollbackAsync(ct);
                    return new DtoActuacionResult { Success = false, ActuacionId = req.ActuacionId, Message = errorCanal };
                }

                // ── 1. Obtener evento_id + pedido_id para el recálculo ────────
                long   eventoId          = 0;
                long   pedidoId          = 0;
                string estadoEventoPrevio = "";
                await using (var qEvt = conn.CreateCommand())
                {
                    qEvt.Transaction = tx;
                    // El estado previo del evento hace falta para no «reabrir» uno
                    // que ya estaba cerrado antes de esta operación.
                    qEvt.CommandText = @"
SELECT a.evento_id, a.pedido_id, COALESCE(e.estado, '')
FROM   cad_actuaciones a
LEFT   JOIN cad_eventos e ON e.id = a.evento_id
WHERE  a.id = @id";
                    qEvt.Parameters.AddWithValue("id", req.ActuacionId);
                    await using var rEvt = await qEvt.ExecuteReaderAsync(ct);
                    if (!await rEvt.ReadAsync(ct))
                    {
                        await rEvt.CloseAsync();
                        await tx.RollbackAsync(ct);
                        return new DtoActuacionResult
                        {
                            Success     = false,
                            ActuacionId = req.ActuacionId,
                            Message     = $"Actuación {req.ActuacionId} no encontrada."
                        };
                    }
                    eventoId           = rEvt.GetInt64(0);
                    pedidoId           = rEvt.GetInt64(1);
                    estadoEventoPrevio = rEvt.GetString(2).Trim();  // es CHAR(n): viene rellenado
                }

                // ── 2. UPDATE cad_actuaciones ─────────────────────────────────
                await using (var upd = conn.CreateCommand())
                {
                    upd.Transaction = tx;
                    upd.CommandText = @"
UPDATE cad_actuaciones
SET    estado                 = @estado,
       fecha_cierre           = NOW(),
       codigo_cierre_primario = @codPrimario,
       clasif_cierre          = @clasif,
       observacion_cierre     = @obs,
       fecha_modificacion     = NOW(),
       usuario_modifica       = @usuario
WHERE  id = @id
  AND  estado NOT IN ('C','V')";
                    upd.Parameters.AddWithValue("estado",      estadoFinal);
                    upd.Parameters.AddWithValue("codPrimario", NullOrString(codigoPrimario));
                    upd.Parameters.AddWithValue("clasif",      NullOrString(req.ClasifCierre));
                    upd.Parameters.AddWithValue("obs",         NullOrString(req.ObservacionCierre));
                    upd.Parameters.AddWithValue("usuario",     usuario);
                    upd.Parameters.AddWithValue("id",          req.ActuacionId);
                    var rows = await upd.ExecuteNonQueryAsync(ct);
                    if (rows == 0)
                    {
                        await tx.RollbackAsync(ct);
                        return new DtoActuacionResult
                        {
                            Success     = false,
                            ActuacionId = req.ActuacionId,
                            Message     = $"Actuación {req.ActuacionId} ya cerrada/anulada o no existe."
                        };
                    }
                }

                // ── 3. Limpiar códigos previos (corrección de cierre) ─────────
                await using (var del = conn.CreateCommand())
                {
                    del.Transaction = tx;
                    del.CommandText = "DELETE FROM cad_actuaciones_codigos WHERE actuacion_id = @id";
                    del.Parameters.AddWithValue("id", req.ActuacionId);
                    await del.ExecuteNonQueryAsync(ct);
                }

                // ── 4. INSERT códigos de cierre ───────────────────────────────
                foreach (var cod in req.CodigosCierre.OrderBy(x => x.Orden))
                {
                    await using var insCod = conn.CreateCommand();
                    insCod.Transaction = tx;
                    insCod.CommandText = @"
INSERT INTO cad_actuaciones_codigos
    (actuacion_id, orden, codigo_cierre, tipo_codigo,
     descripcion_libre, usuario_registra, fecha_registra)
VALUES (@actId, @orden, @codigo, @tipo, @desc, @usuario, NOW())";
                    insCod.Parameters.AddWithValue("actId",   req.ActuacionId);
                    insCod.Parameters.AddWithValue("orden",   cod.Orden);
                    insCod.Parameters.AddWithValue("codigo",  cod.CodigoCierre);
                    insCod.Parameters.AddWithValue("tipo",    string.IsNullOrWhiteSpace(cod.TipoCodigo)
                                                              ? "CIERRE" : cod.TipoCodigo);
                    insCod.Parameters.AddWithValue("desc",    NullOrString(cod.DescripcionLibre));
                    insCod.Parameters.AddWithValue("usuario", usuario);
                    await insCod.ExecuteNonQueryAsync(ct);
                }

                // ── 4b. INSERT resultado operativo estructurado (si se informó) ──
                // Requiere migración V12 (cad_actuaciones_resultados).
                if (!string.IsNullOrWhiteSpace(req.ActividadCodigo)
                    || !string.IsNullOrWhiteSpace(req.DelitoArticulo))
                {
                    await using var insRes = conn.CreateCommand();
                    insRes.Transaction = tx;
                    insRes.CommandText = @"
INSERT INTO cad_actuaciones_resultados
    (actuacion_id, actividad_codigo, actividad_tipo, actividad_desc,
     delito_articulo, delito_desc, observacion, usuario_registra, fecha_registra)
VALUES (@actId, @actCod, @actTipo, @actDesc,
        @delitoArt, @delitoDesc, @obs, @usuario, NOW())
ON CONFLICT (actuacion_id) DO UPDATE
  SET actividad_codigo  = EXCLUDED.actividad_codigo,
      actividad_tipo    = EXCLUDED.actividad_tipo,
      actividad_desc    = EXCLUDED.actividad_desc,
      delito_articulo   = EXCLUDED.delito_articulo,
      delito_desc       = EXCLUDED.delito_desc,
      observacion       = EXCLUDED.observacion,
      usuario_registra  = EXCLUDED.usuario_registra,
      fecha_registra    = NOW()";
                    insRes.Parameters.AddWithValue("actId",     req.ActuacionId);
                    insRes.Parameters.AddWithValue("actCod",    NullOrString(req.ActividadCodigo));
                    insRes.Parameters.AddWithValue("actTipo",   NullOrString(req.ActividadTipo));
                    insRes.Parameters.AddWithValue("actDesc",   NullOrString(req.ActividadDesc));
                    insRes.Parameters.AddWithValue("delitoArt", NullOrString(req.DelitoArticulo));
                    insRes.Parameters.AddWithValue("delitoDesc",NullOrString(req.DelitoDesc));
                    insRes.Parameters.AddWithValue("obs",       NullOrString(req.ObservacionCierre));
                    insRes.Parameters.AddWithValue("usuario",   usuario);
                    await insRes.ExecuteNonQueryAsync(ct);
                }

                // ── 5. Recalcular estado global del evento ────────────────────
                // fn_recalcular_estado_evento ya existe en BD (creada en V8).
                // Si esta era la última actuación pendiente, deja cad_eventos.estado
                // en 'C' automáticamente vía esta función (y también vía el trigger
                // trg_actuaciones_estado sobre el UPDATE del paso 2 — es idempotente).
                await using (var fnEvt = conn.CreateCommand())
                {
                    fnEvt.Transaction = tx;
                    fnEvt.CommandText = "SELECT fn_recalcular_estado_evento(@eid)";
                    fnEvt.Parameters.AddWithValue("eid", eventoId);
                    await fnEvt.ExecuteNonQueryAsync(ct);
                }

                // ── 5a. La decisión del despachador manda sobre el recálculo ──
                // fn_recalcular_estado_evento (y el trigger trg_actuaciones_estado)
                // cierran el evento en cuanto TODAS sus actuaciones quedan cerradas.
                // Eso pasaba por encima del «No, solo esta actuación» del modal
                // «Atendió»: cerrar el único recurso asignado cerraba el evento
                // entero. Si el despachador dijo que no, se deshace ese cierre
                // automático —dentro de la misma transacción, así que nadie llega a
                // ver el estado intermedio— y el evento vuelve a quedar pendiente
                // de despacho. Solo aplica si NO venía ya cerrado de antes.
                if (req.CerrarEvento == false && estadoEventoPrevio != "C")
                {
                    await using var reabrir = conn.CreateCommand();
                    reabrir.Transaction = tx;
                    reabrir.CommandText = @"
UPDATE cad_eventos
SET    estado             = 'P',
       fecha_modificacion = NOW()
WHERE  id     = @eventoId
  AND  estado = 'C'";
                    reabrir.Parameters.AddWithValue("eventoId", eventoId);
                    await reabrir.ExecuteNonQueryAsync(ct);
                }

                // ── 5b. Sincronizar cad_pedidos si el recálculo cerró el evento ──
                // fn_recalcular_estado_evento SOLO toca cad_eventos — nunca
                // cad_pedidos. Sin este paso, cerrar la última actuación de un
                // evento dejaba el pedido fantasma en 'En proceso' para siempre,
                // aunque el evento ya estuviera cerrado (mismo patrón de bug ya
                // corregido en los demás flujos de cierre — ver EstadoPedidoHelper).
                // Va DESPUÉS del paso 5a: si el despachador pidió no cerrar el
                // evento, este UPDATE no encuentra el evento en 'C' y no hace nada,
                // que es justo lo que debe pasar.
                await using (var syncPed = conn.CreateCommand())
                {
                    syncPed.Transaction = tx;
                    syncPed.CommandText = @"
UPDATE cad_pedidos p
SET    estado = 'C', fecha_modifica = NOW()
WHERE  p.id = @pedidoId
  AND  p.estado <> 'C'
  AND  EXISTS (SELECT 1 FROM cad_eventos e WHERE e.id = @eventoId AND e.estado = 'C')";
                    syncPed.Parameters.AddWithValue("pedidoId", pedidoId);
                    syncPed.Parameters.AddWithValue("eventoId", eventoId);
                    await syncPed.ExecuteNonQueryAsync(ct);
                }

                // ── 6. Liberar el medio vinculado (estado=27, limpiar vínculos) ──
                await using (var libMedio = conn.CreateCommand())
                {
                    libMedio.Transaction = tx;
                    libMedio.CommandText = @"
UPDATE cad_medios_disponibles
SET    estado      = 27,
       evento_id   = NULL,
       actuacion_id = NULL
WHERE  actuacion_id = @actId";
                    libMedio.Parameters.AddWithValue("actId", req.ActuacionId);
                    await libMedio.ExecuteNonQueryAsync(ct);
                }

                await tx.CommitAsync(ct);
                return new DtoActuacionResult
                {
                    Success     = true,
                    ActuacionId = req.ActuacionId,
                    Message     = $"Actuación {req.ActuacionId} cerrada con " +
                                  $"{req.CodigosCierre.Count} código(s). " +
                                  $"Evento {eventoId} recalculado."
                };
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync(ct);
                _logger.LogError(ex, "P_CerrarActuacion error id={Id}", req.ActuacionId);
                return new DtoActuacionResult
                {
                    Success     = false,
                    ActuacionId = req.ActuacionId,
                    Message     = ex.Message
                };
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // AGREGAR NOTA DE CAMPO
        // ════════════════════════════════════════════════════════════════════════

        public async Task<DtoActuacionResult> P_AgregarNotaActuacionAsync(
            long actuacionId,
            DtoAgregarNotaActuacionRequest req,
            int canalCodigo, int fuerzaId,
            string usuario,
            CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(req.Nota))
                return new DtoActuacionResult
                {
                    Success     = false,
                    ActuacionId = actuacionId,
                    Message     = "El texto de la nota no puede estar vacío."
                };

            var tipoNota = req.TipoNota is "GENERAL" or "NOVEDAD" or "ALERTA" or "CIERRE"
                         ? req.TipoNota : "GENERAL";

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx   = await conn.BeginTransactionAsync(ct);

            var errorCanal = await VerificarCanalPropietarioAsync(conn, tx, actuacionId, canalCodigo, fuerzaId, ct);
            if (errorCanal is not null)
                return new DtoActuacionResult { Success = false, ActuacionId = actuacionId, Message = errorCanal };

            await using var cmd  = conn.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = @"
INSERT INTO cad_actuaciones_notas
    (actuacion_id, nota, tipo_nota, usuario_registra, fecha_registra)
VALUES (@actId, @nota, @tipo, @usuario, NOW())
RETURNING id";
            cmd.Parameters.AddWithValue("actId",   actuacionId);
            cmd.Parameters.AddWithValue("nota",    req.Nota);
            cmd.Parameters.AddWithValue("tipo",    tipoNota);
            cmd.Parameters.AddWithValue("usuario", usuario);

            var newId = await cmd.ExecuteScalarAsync(ct);

            var estadoEventoActual = await EstadoPedidoHelper.PromoverPorActuacionIdAsync(conn, tx, actuacionId, ct);
            await tx.CommitAsync(ct);

            return new DtoActuacionResult
            {
                Success            = true,
                ActuacionId        = actuacionId,
                SubId              = newId is null ? null : Convert.ToInt64(newId),
                Message            = "Nota registrada.",
                EstadoEventoActual = estadoEventoActual
            };
        }

        // ════════════════════════════════════════════════════════════════════════
        // AGREGAR UNIDAD ADICIONAL
        // ════════════════════════════════════════════════════════════════════════

        public async Task<DtoActuacionResult> P_AgregarUnidadActuacionAsync(
            long actuacionId,
            DtoAgregarUnidadActuacionRequest req,
            int canalCodigo, int fuerzaId,
            string usuario,
            CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(req.UnidadCodigo))
                return new DtoActuacionResult
                {
                    Success     = false,
                    ActuacionId = actuacionId,
                    Message     = "El código de unidad es obligatorio."
                };

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx   = await conn.BeginTransactionAsync(ct);

            var errorCanal = await VerificarCanalPropietarioAsync(conn, tx, actuacionId, canalCodigo, fuerzaId, ct);
            if (errorCanal is not null)
                return new DtoActuacionResult { Success = false, ActuacionId = actuacionId, Message = errorCanal };

            await using var cmd  = conn.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = @"
INSERT INTO cad_actuaciones_unidades
    (actuacion_id, unidad_codigo, placa, tipo_unidad,
     fecha_despacho, estado, observacion, fecha_creacion)
VALUES (@actId, @codigo, @placa, @tipo,
        NOW(), 'D', @obs, NOW())
RETURNING id";
            cmd.Parameters.AddWithValue("actId",  actuacionId);
            cmd.Parameters.AddWithValue("codigo", req.UnidadCodigo);
            cmd.Parameters.AddWithValue("placa",  NullOrString(req.Placa));
            cmd.Parameters.AddWithValue("tipo",   NullOrString(req.TipoUnidad));
            cmd.Parameters.AddWithValue("obs",    NullOrString(req.Observacion));

            var newId = await cmd.ExecuteScalarAsync(ct);

            var estadoEventoActual = await EstadoPedidoHelper.PromoverPorActuacionIdAsync(conn, tx, actuacionId, ct);
            await tx.CommitAsync(ct);

            return new DtoActuacionResult
            {
                Success            = true,
                ActuacionId        = actuacionId,
                SubId              = newId is null ? null : Convert.ToInt64(newId),
                Message            = $"Unidad '{req.UnidadCodigo}' despachada.",
                EstadoEventoActual = estadoEventoActual
            };
        }

        // ════════════════════════════════════════════════════════════════════════
        // CREAR ACTUACIÓN  (primer despacho — estado inicial P)
        // Flujo completo: P → D (En ruta) → A (En sitio) → C (Cerrada)
        // ════════════════════════════════════════════════════════════════════════

        public async Task<DtoActuacionResult> P_CrearActuacionAsync(
            DtoCrearActuacionRequest req,
            string usuario,
            CancellationToken ct)
        {
            if (req.EventoId <= 0)
                return new DtoActuacionResult { Success = false, Message = "EventoId inválido." };

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx   = await conn.BeginTransactionAsync(ct);

            try
            {
                // ── Paso 0: Resolver el cad_eventos.id ──────────────────────────
                // req.EventoId contiene cad_pedidos.id (lo que el frontend envía).
                // cad_actuaciones.evento_id → FK → cad_eventos(id), tabla distinta.
                // Buscamos o creamos el registro en cad_eventos para este pedido.
                long realEventoId;
                await using (var qEvt = conn.CreateCommand())
                {
                    qEvt.Transaction = tx;
                    qEvt.CommandText = "SELECT id FROM cad_eventos WHERE pedido_id = @pid LIMIT 1";
                    qEvt.Parameters.AddWithValue("pid", req.EventoId);
                    var rawEvt = await qEvt.ExecuteScalarAsync(ct);

                    if (rawEvt is not null and not DBNull)
                    {
                        // Ya existe un cad_eventos para este pedido
                        realEventoId = Convert.ToInt64(rawEvt);
                    }
                    else
                    {
                        // Crear cad_eventos on-demand (el pedido aún no tiene evento formal)
                        realEventoId = _snowflake.NextId();
                        await using var insEvt = conn.CreateCommand();
                        insEvt.Transaction = tx;
                        insEvt.CommandText = @"
INSERT INTO cad_eventos
    (id, sitio_graba, pedido_id, fuerza_id, canal_codigo,
     origen, usuario_genera, estado, fecha_creacion)
VALUES
    (@id, @sg, @pedidoId, @fuerza, @canal,
     'RECEPCION', @usuario, 'P', NOW())";
                        insEvt.Parameters.AddWithValue("id",       realEventoId);
                        insEvt.Parameters.AddWithValue("sg",       req.SitioGraba);
                        insEvt.Parameters.AddWithValue("pedidoId", req.EventoId);
                        insEvt.Parameters.AddWithValue("fuerza",   req.FuerzaId.HasValue
                                                                    ? (object)req.FuerzaId.Value : DBNull.Value);
                        insEvt.Parameters.AddWithValue("canal",    req.CanalCodigo.HasValue
                                                                    ? (object)req.CanalCodigo.Value : DBNull.Value);
                        insEvt.Parameters.AddWithValue("usuario",  usuario);
                        await insEvt.ExecuteNonQueryAsync(ct);
                        _logger.LogInformation(
                            "cad_eventos {EvId} creado on-demand para pedido {PedId}",
                            realEventoId, req.EventoId);
                    }
                }

                // ── Paso 0b: Verificar que el medio no tenga despacho activo ────
                // Protege contra asignación múltiple del mismo recurso al mismo caso.
                if (!string.IsNullOrWhiteSpace(req.MedioId)
                    && long.TryParse(req.MedioId, out var medioChkId))
                {
                    await using var qMedChk = conn.CreateCommand();
                    qMedChk.Transaction = tx;
                    qMedChk.CommandText = @"
SELECT COUNT(*) FROM cad_medios_disponibles
WHERE  id = @mid AND actuacion_id IS NOT NULL";
                    qMedChk.Parameters.AddWithValue("mid", medioChkId);
                    var yaAsignado = Convert.ToInt64(await qMedChk.ExecuteScalarAsync(ct));
                    if (yaAsignado > 0)
                    {
                        await tx.RollbackAsync(ct);
                        return new DtoActuacionResult
                        {
                            Success     = false,
                            ActuacionId = 0,
                            Message     = "Este recurso ya tiene un despacho activo. " +
                                          "Cierre o desasigne la actuación anterior antes de reasignarlo."
                        };
                    }
                }

                // ── Paso 1: Snapshots de fuerza y canal ─────────────────────────
                string fuerzaDesc = "", canalDesc = "";
                if (req.FuerzaId.HasValue)
                {
                    await using var qF = conn.CreateCommand();
                    qF.Transaction = tx;
                    qF.CommandText = "SELECT descripcion FROM cad_fuerzas WHERE id = @id LIMIT 1";
                    qF.Parameters.AddWithValue("id", req.FuerzaId.Value);
                    var raw = await qF.ExecuteScalarAsync(ct);
                    if (raw is not null and not DBNull) fuerzaDesc = raw.ToString()!;
                }
                // cad_canales.codigo se numera por fuerza (no es único por sí solo)
                // — filtrar también por cadfuerz_id o se trae el canal de otra
                // fuerza que reutiliza el mismo código.
                if (req.CanalCodigo.HasValue && req.FuerzaId.HasValue)
                {
                    await using var qC = conn.CreateCommand();
                    qC.Transaction = tx;
                    qC.CommandText = "SELECT descripcion FROM cad_canales WHERE codigo = @c AND cadfuerz_id = @cf LIMIT 1";
                    qC.Parameters.AddWithValue("c",  req.CanalCodigo.Value);
                    qC.Parameters.AddWithValue("cf", req.FuerzaId.Value);
                    var raw = await qC.ExecuteScalarAsync(ct);
                    if (raw is not null and not DBNull) canalDesc = raw.ToString()!;
                }

                // ── Paso 2: INSERT cad_actuaciones (estado inicial P) ────────────
                long actuacionId = _snowflake.NextId();
                await using (var ins = conn.CreateCommand())
                {
                    ins.Transaction = tx;
                    ins.CommandText = @"
INSERT INTO cad_actuaciones
    (id, evento_id, pedido_id, sitio_graba, fuerza_id, canal_codigo,
     fuerza_descripcion, canal_descripcion,
     despachador_usuario, tipo_despachador,
     unidad_asignada, placa_unidad,
     estado, fecha_creacion)
VALUES
    (@id, @eventoId, @pedidoId, @sg, @fuerza, @canal,
     @fuerzaDesc, @canalDesc,
     @usuario, @tipoDep,
     @unidad, @placa,
     'P', NOW())";
                    ins.Parameters.AddWithValue("id",         actuacionId);
                    ins.Parameters.AddWithValue("eventoId",   realEventoId);   // ← cad_eventos.id
                    ins.Parameters.AddWithValue("pedidoId",   req.EventoId);   // ← cad_pedidos.id
                    ins.Parameters.AddWithValue("sg",         req.SitioGraba);
                    ins.Parameters.AddWithValue("fuerza",     req.FuerzaId.HasValue
                                                              ? (object)req.FuerzaId.Value : DBNull.Value);
                    ins.Parameters.AddWithValue("canal",      req.CanalCodigo.HasValue
                                                              ? (object)req.CanalCodigo.Value : DBNull.Value);
                    ins.Parameters.AddWithValue("fuerzaDesc", NullOrString(fuerzaDesc));
                    ins.Parameters.AddWithValue("canalDesc",  NullOrString(canalDesc));
                    ins.Parameters.AddWithValue("usuario",    usuario);
                    ins.Parameters.AddWithValue("tipoDep",    string.IsNullOrWhiteSpace(req.TipoDespachador)
                                                              ? "D" : req.TipoDespachador);
                    ins.Parameters.AddWithValue("unidad",     NullOrString(req.UnidadAsignada));
                    ins.Parameters.AddWithValue("placa",      NullOrString(req.PlacaUnidad));
                    await ins.ExecuteNonQueryAsync(ct);
                }

                // Vincular el medio al evento y a esta actuación (no cambia estado operativo aún)
                if (!string.IsNullOrWhiteSpace(req.MedioId)
                    && long.TryParse(req.MedioId, out var medioIdLong))
                {
                    await using var updM = conn.CreateCommand();
                    updM.Transaction = tx;
                    updM.CommandText = @"
UPDATE cad_medios_disponibles
SET    evento_id    = @eventoId,
       actuacion_id = @actId
WHERE  id = @medioId
  AND  actuacion_id IS NULL";
                    updM.Parameters.AddWithValue("eventoId", req.EventoId);
                    updM.Parameters.AddWithValue("actId",    actuacionId);
                    updM.Parameters.AddWithValue("medioId",  medioIdLong);
                    var filasMedio = await updM.ExecuteNonQueryAsync(ct);

                    // El UPDATE condicionado a "actuacion_id IS NULL" es lo que realmente
                    // cierra la carrera (el chequeo del Paso 0b solo falla rápido en el caso
                    // sin contención): si otra transacción concurrente ya asignó el medio
                    // entre ese chequeo y este UPDATE, aquí no se afecta ninguna fila.
                    if (filasMedio == 0)
                    {
                        await tx.RollbackAsync(ct);
                        return new DtoActuacionResult
                        {
                            Success     = false,
                            ActuacionId = 0,
                            Message     = "Este recurso ya tiene un despacho activo. " +
                                          "Cierre o desasigne la actuación anterior antes de reasignarlo."
                        };
                    }
                }

                // Red de seguridad: asignar un recurso es una gestión real — promover el
                // pedido a 'En proceso' si por algún motivo seguía en 'P'/'A' (ver EstadoPedidoHelper).
                var estadoEventoActual = await EstadoPedidoHelper.PromoverPorPedidoIdAsync(conn, tx, req.EventoId, ct);

                await tx.CommitAsync(ct);
                _logger.LogInformation(
                    "Actuación {Id} creada por {U} (evento={E}, unidad={Un})",
                    actuacionId, usuario, req.EventoId, req.UnidadAsignada);
                return new DtoActuacionResult
                {
                    Success             = true,
                    ActuacionId         = actuacionId,
                    Message             = $"Recurso '{req.UnidadAsignada}' asignado al evento. " +
                                          $"Presione 'En ruta' cuando salga hacia el lugar.",
                    EstadoEventoActual  = estadoEventoActual
                };
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync(ct);
                _logger.LogError(ex, "P_CrearActuacion error");
                return new DtoActuacionResult { Success = false, Message = ex.Message };
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // DESASIGNAR ACTUACIÓN (solo estado P — aún no salió en ruta)
        // Anula la actuación (→V), libera el medio (estado=27) y recalcula evento.
        // ════════════════════════════════════════════════════════════════════════

        public async Task<DtoActuacionResult> P_DesasignarActuacionAsync(
            long actuacionId,
            string? motivo,
            int canalCodigo, int fuerzaId,
            string usuario,
            CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx   = await conn.BeginTransactionAsync(ct);

            try
            {
                var errorCanal = await VerificarCanalPropietarioAsync(conn, tx, actuacionId, canalCodigo, fuerzaId, ct);
                if (errorCanal is not null)
                {
                    await tx.RollbackAsync(ct);
                    return new DtoActuacionResult { Success = false, ActuacionId = actuacionId, Message = errorCanal };
                }

                // ── 1. Verificar que existe y sigue activa (P/D/A) ─────────────
                // Cancelar en D (en ruta) o A (en sitio) exige motivo explícito —
                // a diferencia de P, donde el recurso nunca llegó a moverse.
                long eventoId = 0;
                string estadoActual;
                await using (var qChk = conn.CreateCommand())
                {
                    qChk.Transaction = tx;
                    qChk.CommandText = @"
SELECT evento_id, estado FROM cad_actuaciones
WHERE  id = @id AND estado IN ('P','D','A')";
                    qChk.Parameters.AddWithValue("id", actuacionId);
                    await using var rChk = await qChk.ExecuteReaderAsync(ct);
                    if (!await rChk.ReadAsync(ct))
                    {
                        await rChk.CloseAsync();
                        await tx.RollbackAsync(ct);
                        return new DtoActuacionResult
                        {
                            Success     = false,
                            ActuacionId = actuacionId,
                            Message     = "La actuación no existe o ya está cerrada/anulada."
                        };
                    }
                    eventoId     = rChk.GetInt64(0);
                    estadoActual = rChk.GetString(1);
                }

                if (estadoActual != "P" && string.IsNullOrWhiteSpace(motivo))
                {
                    await tx.RollbackAsync(ct);
                    return new DtoActuacionResult
                    {
                        Success     = false,
                        ActuacionId = actuacionId,
                        Message     = "Debe indicar el motivo para cancelar un recurso que ya salió en ruta o está en sitio."
                    };
                }

                // ── 2. Anular la actuación ────────────────────────────────────
                await using (var upd = conn.CreateCommand())
                {
                    upd.Transaction = tx;
                    upd.CommandText = @"
UPDATE cad_actuaciones
SET    estado             = 'V',
       fecha_cierre       = NOW(),
       observacion_cierre = @obs,
       fecha_modificacion = NOW(),
       usuario_modifica   = @usuario
WHERE  id = @id";
                    upd.Parameters.AddWithValue("obs",     NullOrString(
                        string.IsNullOrWhiteSpace(motivo) ? "Desasignado por operador" : motivo));
                    upd.Parameters.AddWithValue("usuario", usuario);
                    upd.Parameters.AddWithValue("id",      actuacionId);
                    await upd.ExecuteNonQueryAsync(ct);
                }

                // ── 3. Liberar el medio vinculado ─────────────────────────────
                await using (var libMedio = conn.CreateCommand())
                {
                    libMedio.Transaction = tx;
                    libMedio.CommandText = @"
UPDATE cad_medios_disponibles
SET    estado       = 27,
       evento_id    = NULL,
       actuacion_id = NULL
WHERE  actuacion_id = @actId";
                    libMedio.Parameters.AddWithValue("actId", actuacionId);
                    await libMedio.ExecuteNonQueryAsync(ct);
                }

                // ── 4. Recalcular estado global del evento ────────────────────
                await using (var fnEvt = conn.CreateCommand())
                {
                    fnEvt.Transaction = tx;
                    fnEvt.CommandText = "SELECT fn_recalcular_estado_evento(@eid)";
                    fnEvt.Parameters.AddWithValue("eid", eventoId);
                    await fnEvt.ExecuteNonQueryAsync(ct);
                }

                await tx.CommitAsync(ct);
                _logger.LogInformation(
                    "Actuación {Id} desasignada por {U}. Motivo: {M}",
                    actuacionId, usuario, motivo);
                return new DtoActuacionResult
                {
                    Success     = true,
                    ActuacionId = actuacionId,
                    Message     = "Recurso desasignado correctamente. El medio quedó disponible."
                };
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync(ct);
                _logger.LogError(ex, "P_DesasignarActuacion error id={Id}", actuacionId);
                return new DtoActuacionResult
                {
                    Success     = false,
                    ActuacionId = actuacionId,
                    Message     = ex.Message
                };
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // SOLICITUD DE APOYO URGENTE (seguridad del funcionario)
        // ════════════════════════════════════════════════════════════════════════

        public async Task<DtoActuacionResult> P_SolicitarApoyoActuacionAsync(
            long actuacionId, int canalCodigo, int fuerzaId, string usuario, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);

            var errorCanal = await VerificarCanalPropietarioAsync(conn, null, actuacionId, canalCodigo, fuerzaId, ct);
            if (errorCanal is not null)
                return new DtoActuacionResult { Success = false, ActuacionId = actuacionId, Message = errorCanal };

            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
UPDATE cad_actuaciones
SET    solicita_apoyo       = TRUE,
       fecha_solicita_apoyo = NOW(),
       apoyo_atendido_por   = NULL,
       fecha_apoyo_atendido = NULL
WHERE  id = @id AND estado NOT IN ('C','V')";
            cmd.Parameters.AddWithValue("id", actuacionId);
            var rows = await cmd.ExecuteNonQueryAsync(ct);

            if (rows > 0)
                _logger.LogWarning("⚠ Solicitud de apoyo urgente — actuación {Id}, reportado por {U}.", actuacionId, usuario);

            return new DtoActuacionResult
            {
                Success     = rows > 0,
                ActuacionId = actuacionId,
                Message     = rows > 0
                    ? "Solicitud de apoyo registrada."
                    : "Actuación no encontrada o ya cerrada/anulada."
            };
        }

        public async Task<DtoActuacionResult> P_AtenderApoyoActuacionAsync(
            long actuacionId, int canalCodigo, int fuerzaId, string usuario, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);

            var errorCanal = await VerificarCanalPropietarioAsync(conn, null, actuacionId, canalCodigo, fuerzaId, ct);
            if (errorCanal is not null)
                return new DtoActuacionResult { Success = false, ActuacionId = actuacionId, Message = errorCanal };

            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
UPDATE cad_actuaciones
SET    solicita_apoyo       = FALSE,
       apoyo_atendido_por   = @usuario,
       fecha_apoyo_atendido = NOW()
WHERE  id = @id AND solicita_apoyo = TRUE";
            cmd.Parameters.AddWithValue("id",      actuacionId);
            cmd.Parameters.AddWithValue("usuario", usuario);
            var rows = await cmd.ExecuteNonQueryAsync(ct);

            return new DtoActuacionResult
            {
                Success     = rows > 0,
                ActuacionId = actuacionId,
                Message     = rows > 0
                    ? "Apoyo marcado como atendido."
                    : "No hay una solicitud de apoyo activa para esta actuación."
            };
        }

        // ════════════════════════════════════════════════════════════════════════
        // CATÁLOGOS — Actividades policiales, delitos y códigos de cierre
        // ════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// Retorna el catálogo de actividades policiales.
        /// tipo = "O" (Operativas), "P" (Preventivas), null = todas.
        /// </summary>
        public async Task<List<DtoActividadPolicial>> G_GetActividadesPolicialesAsync(
            string? tipo, CancellationToken ct)
        {
            var result = new List<DtoActividadPolicial>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();

            if (string.IsNullOrWhiteSpace(tipo))
            {
                cmd.CommandText = @"
SELECT id, tipo, codigo, descripcion, requiere_delito, orden
FROM   cad_act_policial
WHERE  vigente = true
ORDER  BY tipo, orden";
            }
            else
            {
                cmd.CommandText = @"
SELECT id, tipo, codigo, descripcion, requiere_delito, orden
FROM   cad_act_policial
WHERE  vigente = true AND tipo = @tipo
ORDER  BY orden";
                cmd.Parameters.AddWithValue("tipo", tipo.ToUpperInvariant());
            }

            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            while (await rdr.ReadAsync(ct))
                result.Add(new DtoActividadPolicial
                {
                    Id             = rdr.GetInt32(0),
                    Tipo           = rdr.GetString(1),
                    Codigo         = rdr.GetString(2),
                    Descripcion    = rdr.GetString(3),
                    RequiereDelito = rdr.GetBoolean(4),
                    Orden          = rdr.GetInt16(5)
                });
            return result;
        }

        /// <summary>
        /// Búsqueda por texto libre en cad_delitos.
        /// Filtra por descripción, artículo o bien jurídico (ILIKE).
        /// </summary>
        public async Task<List<DtoDelitoItem>> G_BuscarDelitosAsync(
            string q, int limit, CancellationToken ct)
        {
            var result = new List<DtoDelitoItem>();
            if (string.IsNullOrWhiteSpace(q)) return result;

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
SELECT id, articulo, descripcion, bien_juridico
FROM   cad_delitos
WHERE  vigente = true
  AND (descripcion ILIKE @q OR articulo ILIKE @q OR bien_juridico ILIKE @q)
ORDER  BY articulo
LIMIT  @lim";
            cmd.Parameters.AddWithValue("q",   $"%{q}%");
            cmd.Parameters.AddWithValue("lim", limit > 0 ? limit : 10);

            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            while (await rdr.ReadAsync(ct))
                result.Add(new DtoDelitoItem
                {
                    Id           = rdr.GetInt32(0),
                    Articulo     = rdr.GetString(1),
                    Descripcion  = rdr.GetString(2),
                    BienJuridico = rdr.IsDBNull(3) ? null : rdr.GetString(3)
                });
            return result;
        }

        /// <summary>
        /// Búsqueda de códigos de tipificación en cad_casos.
        /// Misma tabla que usa el módulo de Recepción para tipificar casos.
        /// </summary>
        public async Task<List<DtoCodigoCasoItem>> G_BuscarCodigosCierreAsync(
            string q, int limit, CancellationToken ct)
        {
            var result = new List<DtoCodigoCasoItem>();
            if (string.IsNullOrWhiteSpace(q)) return result;

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
SELECT codigo, descripcion
FROM   cad_casos
WHERE  vigente = 'S'
  AND (codigo ILIKE @q OR descripcion ILIKE @q)
ORDER  BY codigo
LIMIT  @lim";
            cmd.Parameters.AddWithValue("q",   $"%{q}%");
            cmd.Parameters.AddWithValue("lim", limit > 0 ? limit : 10);

            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            while (await rdr.ReadAsync(ct))
                result.Add(new DtoCodigoCasoItem
                {
                    Codigo      = rdr.GetString(0),
                    Descripcion = rdr.GetString(1)
                });
            return result;
        }

        // ════════════════════════════════════════════════════════════════════════
        // PRIVATE HELPERS
        // ════════════════════════════════════════════════════════════════════════

        private static object NullOrString(string? value) =>
            string.IsNullOrWhiteSpace(value) ? DBNull.Value : value;

        /// <summary>
        /// Valida que el canal/fuerza de la sesión (claims del JWT) coincida con el
        /// canal/fuerza que ASIGNÓ la actuación. En un evento multi-canal, cada canal
        /// solo puede gestionar (cambiar estado, cerrar, agregar notas/unidades,
        /// desasignar) los recursos que él mismo despachó — nunca los de otro canal
        /// que también esté gestionando el mismo evento.
        /// canalCodigo/fuerzaId &lt;= 0 (JWT sin esos claims) deshabilita el chequeo,
        /// igual que una actuación legacy sin canal_codigo/fuerza_id registrado.
        /// Devuelve null si el chequeo pasa (o no aplica); el mensaje de error si no.
        /// </summary>
        private static async Task<string?> VerificarCanalPropietarioAsync(
            NpgsqlConnection conn, NpgsqlTransaction? tx, long actuacionId,
            int canalCodigo, int fuerzaId, CancellationToken ct)
        {
            if (canalCodigo <= 0 || fuerzaId <= 0) return null;

            await using var cmd = conn.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = "SELECT canal_codigo, fuerza_id FROM cad_actuaciones WHERE id = @id";
            cmd.Parameters.AddWithValue("id", actuacionId);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (!await r.ReadAsync(ct)) return null; // no existe — que lo reporte la operación principal

            var actCanal  = r.IsDBNull(0) ? (int?)null : r.GetInt32(0);
            var actFuerza = r.IsDBNull(1) ? (int?)null : r.GetInt32(1);
            if (!actCanal.HasValue || !actFuerza.HasValue) return null;

            if (actCanal.Value != canalCodigo || actFuerza.Value != fuerzaId)
                return "Este recurso fue asignado por otro canal. Solo el canal que lo asignó puede gestionarlo.";

            return null;
        }

        // ════════════════════════════════════════════════════════════════════════
        // RETROALIMENTACIÓN EXTERNA (via PIP)
        // ════════════════════════════════════════════════════════════════════════

        public async Task SaveAuditoriaActualizacionAsync(
            DtoAuditoriaActualizacionExterna dto, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
                INSERT INTO cad_auditoria_actualizacion_externa
                    (id, caso_id, agencia_nombre, estado_reportado,
                     payload_crudo, procesado, ip_origen)
                VALUES
                    (@id, @caso, @agencia, @estado,
                     @payload::jsonb, FALSE, @ip)";
            cmd.Parameters.AddWithValue("id",      dto.Id);
            cmd.Parameters.AddWithValue("caso",    dto.CasoId);
            cmd.Parameters.AddWithValue("agencia", (object?)dto.AgenciaNombre  ?? DBNull.Value);
            cmd.Parameters.AddWithValue("estado",  (object?)dto.EstadoReportado ?? DBNull.Value);
            cmd.Parameters.AddWithValue("payload", (object?)dto.PayloadCrudo   ?? DBNull.Value);
            cmd.Parameters.AddWithValue("ip",      (object?)dto.IpOrigen        ?? DBNull.Value);
            await cmd.ExecuteNonQueryAsync(ct);
        }

        public async Task UpdateAuditoriaActualizacionOkAsync(
            long auditoriaId, long actuacionId, string estado, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
                UPDATE cad_auditoria_actualizacion_externa
                   SET procesado = TRUE, actuacion_id = @act,
                       estado_reportado = @estado
                 WHERE id = @id";
            cmd.Parameters.AddWithValue("id",     auditoriaId);
            cmd.Parameters.AddWithValue("act",    actuacionId);
            cmd.Parameters.AddWithValue("estado", estado);
            await cmd.ExecuteNonQueryAsync(ct);
        }

        public async Task UpdateAuditoriaActualizacionErrorAsync(
            long auditoriaId, string error, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
                UPDATE cad_auditoria_actualizacion_externa
                   SET procesado = FALSE, error = @error
                 WHERE id = @id";
            cmd.Parameters.AddWithValue("id",    auditoriaId);
            cmd.Parameters.AddWithValue("error", error);
            await cmd.ExecuteNonQueryAsync(ct);
        }

        /// <summary>
        /// Aplica la actualización de estado enviada por la agencia externa (via PIP):
        ///   1. Localiza la actuación por ActuacionId o por (casoId + FuerzaId).
        ///   2. Actualiza estado, timestamps, unidad, placa y cierre.
        ///   3. Agrega una nota al historial de la actuación.
        ///   4. Llama a fn_recalcular_estado_evento para actualizar el estado global.
        /// </summary>
        public async Task<DtoActualizacionExternaResult> P_ActualizarDesdeExternoAsync(
            long casoId,
            DtoActualizacionExternaRequest req,
            long auditoriaId,
            string ipOrigen,
            CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);

            // ── 1. Resolver actuacionId ────────────────────────────────────────
            long actuacionId = 0;

            if (!string.IsNullOrWhiteSpace(req.ActuacionId) &&
                long.TryParse(req.ActuacionId, out var aidParsed))
            {
                actuacionId = aidParsed;
            }
            else if (req.FuerzaId.HasValue)
            {
                // Buscar la actuación más reciente para ese caso + fuerza
                await using var cmdFind = conn.CreateCommand();
                cmdFind.CommandText = @"
                    SELECT a.id
                    FROM   cad_actuaciones a
                    JOIN   cad_eventos e ON e.id = a.evento_id
                    WHERE  e.pedido_id  = @caso
                      AND  a.fuerza_id = @fuerza
                      AND  a.estado NOT IN ('C','V')
                    ORDER  BY a.fecha_creacion DESC
                    LIMIT  1";
                cmdFind.Parameters.AddWithValue("caso",   casoId);
                cmdFind.Parameters.AddWithValue("fuerza", req.FuerzaId.Value);
                var found = await cmdFind.ExecuteScalarAsync(ct);
                if (found is long fid) actuacionId = fid;
            }

            if (actuacionId == 0)
                return new DtoActualizacionExternaResult
                {
                    Success = false,
                    Message = "No se encontró la actuación para este caso. Proporcione ActuacionId o FuerzaId.",
                    CasoId  = casoId.ToString()
                };

            // Validar que la actuación pertenece al caso indicado
            await using (var cmdVal = conn.CreateCommand())
            {
                cmdVal.CommandText = @"
                    SELECT COUNT(1) FROM cad_actuaciones a
                    JOIN cad_eventos e ON e.id = a.evento_id
                    WHERE a.id = @act AND e.pedido_id = @caso";
                cmdVal.Parameters.AddWithValue("act",  actuacionId);
                cmdVal.Parameters.AddWithValue("caso", casoId);
                var cnt = (long)(await cmdVal.ExecuteScalarAsync(ct) ?? 0L);
                if (cnt == 0)
                    return new DtoActualizacionExternaResult
                    {
                        Success = false,
                        Message = "La actuación no pertenece al caso indicado.",
                        CasoId  = casoId.ToString()
                    };
            }

            // ── 2. Construir SET dinámico ──────────────────────────────────────
            var sets   = new List<string> { "fecha_modificacion = NOW()" };
            var estado = (req.Estado ?? "").ToUpperInvariant();

            if (!string.IsNullOrWhiteSpace(estado) && "DACV".Contains(estado))
                sets.Add("estado = @estado");
            if (req.FechaDespacho.HasValue) sets.Add("fecha_despacho = @fdespacho");
            if (req.FechaLlegada.HasValue)  sets.Add("fecha_llegada  = @fllegada");
            if (req.FechaCierre.HasValue)   sets.Add("fecha_cierre   = @fcierre");
            if (!string.IsNullOrWhiteSpace(req.Unidad)) sets.Add("unidad_asignada = @unidad");
            if (!string.IsNullOrWhiteSpace(req.Placa))  sets.Add("placa_unidad    = @placa");
            if (!string.IsNullOrWhiteSpace(req.CodigoCierre))
                sets.Add("codigo_cierre_primario = @codCierre");
            if (!string.IsNullOrWhiteSpace(req.ClasifCierre))
                sets.Add("clasif_cierre = @clasifCierre");
            if (!string.IsNullOrWhiteSpace(req.ObservacionCierre))
                sets.Add("observacion_cierre = @obsCierre");

            // ── 3. UPDATE actuación ────────────────────────────────────────────
            long eventoId = 0;
            await using (var cmdUpd = conn.CreateCommand())
            {
                cmdUpd.CommandText = $@"
                    UPDATE cad_actuaciones
                       SET {string.Join(", ", sets)}
                     WHERE id = @act
                    RETURNING evento_id";
                cmdUpd.Parameters.AddWithValue("act", actuacionId);
                if (!string.IsNullOrWhiteSpace(estado) && "DACV".Contains(estado))
                    cmdUpd.Parameters.AddWithValue("estado",      estado);
                if (req.FechaDespacho.HasValue)
                    cmdUpd.Parameters.AddWithValue("fdespacho",   req.FechaDespacho.Value.UtcDateTime);
                if (req.FechaLlegada.HasValue)
                    cmdUpd.Parameters.AddWithValue("fllegada",    req.FechaLlegada.Value.UtcDateTime);
                if (req.FechaCierre.HasValue)
                    cmdUpd.Parameters.AddWithValue("fcierre",     req.FechaCierre.Value.UtcDateTime);
                if (!string.IsNullOrWhiteSpace(req.Unidad))
                    cmdUpd.Parameters.AddWithValue("unidad",      req.Unidad);
                if (!string.IsNullOrWhiteSpace(req.Placa))
                    cmdUpd.Parameters.AddWithValue("placa",       req.Placa);
                if (!string.IsNullOrWhiteSpace(req.CodigoCierre))
                    cmdUpd.Parameters.AddWithValue("codCierre",   req.CodigoCierre);
                if (!string.IsNullOrWhiteSpace(req.ClasifCierre))
                    cmdUpd.Parameters.AddWithValue("clasifCierre",req.ClasifCierre);
                if (!string.IsNullOrWhiteSpace(req.ObservacionCierre))
                    cmdUpd.Parameters.AddWithValue("obsCierre",   req.ObservacionCierre);

                var evResult = await cmdUpd.ExecuteScalarAsync(ct);
                if (evResult is long eid) eventoId = eid;
            }

            // ── 4. Agregar nota al historial de la actuación ───────────────────
            var textoNota = BuildNota(req);
            if (!string.IsNullOrWhiteSpace(textoNota))
            {
                await using var cmdNota = conn.CreateCommand();
                cmdNota.CommandText = @"
                    INSERT INTO cad_actuaciones_notas
                        (actuacion_id, nota, tipo_nota, usuario_registra)
                    VALUES
                        (@act, @nota, 'NOVEDAD', @usr)";
                cmdNota.Parameters.AddWithValue("act",  actuacionId);
                cmdNota.Parameters.AddWithValue("nota", textoNota);
                cmdNota.Parameters.AddWithValue("usr",  req.AgenciaNombre ?? "AGENCIA_EXTERNA");
                await cmdNota.ExecuteNonQueryAsync(ct);
            }

            // ── 5. Recalcular estado global del evento ─────────────────────────
            if (eventoId > 0)
            {
                await using var cmdRecalc = conn.CreateCommand();
                cmdRecalc.CommandText = "SELECT fn_recalcular_estado_evento(@evId)";
                cmdRecalc.Parameters.AddWithValue("evId", eventoId);
                await cmdRecalc.ExecuteScalarAsync(ct);
            }

            _logger.LogInformation(
                "[ActualizacionExterna] Caso {Caso} | Actuacion {Act} | Estado {Est} | Agencia {Agencia}",
                casoId, actuacionId, estado, req.AgenciaNombre);

            return new DtoActualizacionExternaResult
            {
                Success     = true,
                Message     = $"Actuación actualizada correctamente a estado '{estado}'.",
                CasoId      = casoId.ToString(),
                ActuacionId = actuacionId.ToString(),
                Estado      = estado
            };
        }

        private static string BuildNota(DtoActualizacionExternaRequest req)
        {
            var partes = new List<string>();
            if (!string.IsNullOrWhiteSpace(req.AgenciaNombre))
                partes.Add($"Agencia: {req.AgenciaNombre}");
            if (!string.IsNullOrWhiteSpace(req.ReferenciaCasoExterno))
                partes.Add($"Ref. externo: {req.ReferenciaCasoExterno}");
            if (!string.IsNullOrWhiteSpace(req.Estado))
                partes.Add($"Estado reportado: {req.Estado}");
            if (!string.IsNullOrWhiteSpace(req.Nota))
                partes.Add(req.Nota);
            if (!string.IsNullOrWhiteSpace(req.ObservacionCierre))
                partes.Add($"Obs. cierre: {req.ObservacionCierre}");
            return string.Join(" | ", partes);
        }
    }
}
