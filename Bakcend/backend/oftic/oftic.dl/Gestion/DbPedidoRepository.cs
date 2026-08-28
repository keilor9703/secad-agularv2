using Comun.Dtos.Incidentes;
using Ev = Comun.Dtos.Eventos;
using Comun.Snowflake;
using Datos.Interfaz;
using Datos.Tenant;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace Datos.Gestion
{
    public class DbPedidoRepository : IDbPedidoRepository
    {
        private readonly TenantContext              _tenant;
        private readonly ILogger<DbPedidoRepository> _logger;
        private readonly ISnowflakeGenerator         _snowflake;

        public DbPedidoRepository(
            TenantContext tenant,
            ILogger<DbPedidoRepository> logger,
            ISnowflakeGenerator snowflake)
        {
            _tenant    = tenant;
            _logger    = logger;
            _snowflake = snowflake;
        }

        // ─── Queries ──────────────────────────────────────────────────────────

        /// <summary>
        /// Lista paginada de pedidos. cad_pedidos puede crecer a millones de filas —
        /// antes esto devolvía siempre los últimos 500 por hora_caso sin forma de ver
        /// nada más viejo; ahora acepta página/tamaño y un rango de fechas opcional,
        /// y devuelve el total real para que el cliente arme un paginador.
        /// pageSize se acota a [1,200] — 200 sigue siendo una carga liviana por página
        /// (ver MapListItem: solo columnas escalares) y evita que un valor arbitrario
        /// del cliente vuelva a convertir esto en un "traer todo" sin control.
        /// </summary>
        public async Task<DtoPedidoListPagedResult> GetListAsync(
            string? estado, int? sitioGraba, DateTime? fechaDesde, DateTime? fechaHasta,
            int page, int pageSize, CancellationToken ct)
        {
            page     = page     < 1 ? 1   : page;
            pageSize = pageSize < 1 ? 100 : Math.Min(pageSize, 200);

            var result = new DtoPedidoListPagedResult { Page = page, PageSize = pageSize };
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();

            var sql = @"
                        SELECT p.id, p.sitio_graba, p.nume_llamada, p.hora_caso,
                               p.nume_telefono, p.dire_caso, p.estado, p.enviar,
                               p.codi_pedido, p.codi_pedido2, p.comentario,
                               -- Preferir username_creacion almacenado directamente; fallback a cadusua_usuario (Recepción); último recurso, el JOIN
                               COALESCE(NULLIF(p.username_creacion,''), NULLIF(p.cadusua_usuario,''), u.username, 'sin usuario') AS username_creacion,
                               p.fecha_creacion,
                               COUNT(*) OVER() AS total_count
                        FROM cad_pedidos p
                        LEFT JOIN ctr_usuarios u ON u.id_usuario = p.usuario_creacion
                        WHERE 1=1";

            if (!string.IsNullOrWhiteSpace(estado))
                sql += " AND p.estado = @estado";
            if (sitioGraba.HasValue)
                sql += " AND p.sitio_graba = @sitioGraba";
            if (fechaDesde.HasValue)
                sql += " AND p.hora_caso >= @fechaDesde";
            if (fechaHasta.HasValue)
                // Límite superior EXCLUSIVO — el llamador pasa el día siguiente a las
                // 00:00 para que "hasta el 10" incluya todo el 10 sin ambigüedad de hora.
                sql += " AND p.hora_caso < @fechaHasta";

            sql += " ORDER BY p.hora_caso DESC LIMIT @pageSize OFFSET @offset";

            cmd.CommandText = sql;
            if (!string.IsNullOrWhiteSpace(estado))
                cmd.Parameters.AddWithValue("estado", estado);
            if (sitioGraba.HasValue)
                cmd.Parameters.AddWithValue("sitioGraba", sitioGraba.Value);
            // fechaDesde/fechaHasta llegan como fecha local de Colombia (UTC-5, sin
            // horario de verano) — sumar 5h para obtener la medianoche real en UTC,
            // igual que el resto del sistema (ver GetTurnoActual/turnoDeIncidente).
            if (fechaDesde.HasValue)
                cmd.Parameters.AddWithValue("fechaDesde", DateTime.SpecifyKind(fechaDesde.Value.Date.AddHours(5), DateTimeKind.Utc));
            if (fechaHasta.HasValue)
                cmd.Parameters.AddWithValue("fechaHasta", DateTime.SpecifyKind(fechaHasta.Value.Date.AddDays(1).AddHours(5), DateTimeKind.Utc));
            cmd.Parameters.AddWithValue("pageSize", pageSize);
            cmd.Parameters.AddWithValue("offset", (page - 1) * pageSize);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                result.Items.Add(MapListItem(reader));
                if (result.Total == 0)
                    result.Total = reader.IsDBNull(13) ? 0 : (int)reader.GetInt64(13);
            }

            return result;
        }

        public async Task<DtoPedidoDetalle?> GetByIdAsync(long id, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
SELECT p.id, p.sitio_graba, p.nume_llamada, p.hora_caso,
       p.nume_telefono, p.prop_telefono, p.nomb_llamante,
       p.barrio, p.ciudad, p.dire_llamante, p.dire_caso,
       p.latitud_caso, p.longitud_caso, p.cordx, p.cordy,
       p.tiposhape, p.radio, p.comentario,
       p.codi_pedido, p.codi_pedido2, p.tipo_pedido, p.cali_pedido,
       p.importancia, p.prioridad, p.disp_telefonico, p.celda_marcacion,
       p.canales, p.canal_fuerza, p.enviar, p.estado,
       p.pedido_padre_sitio, p.pedido_padre_num,
       COALESCE(NULLIF(p.username_creacion,''), NULLIF(p.cadusua_usuario,''), u.username, '') AS username_creacion, -- col 32
       p.fecha_creacion,                               -- col 33
       c1.descripcion         AS desc_pedido,          -- col 34
       c2.descripcion         AS desc_pedido2,         -- col 35
       -- ── Datos del evento de despacho más reciente ──────────────────
       e.id                   AS evento_id,            -- col 36
       e.canal_codigo,                                  -- col 37
       COALESCE(cn.descripcion, '') AS canal_descripcion, -- col 38
       COALESCE(f.descripcion,  '') AS fuerza_descripcion, -- col 39
       e.fecha_cierre,                                  -- col 40
       COALESCE(e.observacion_cierre, '') AS observacion_cierre, -- col 41
       COALESCE(e.usuario_modifica, '')  AS usuario_cierre,      -- col 42
       ultimo.username       AS ultimo_acceso_username, -- col 43
       ultimo.fecha_acceso   AS ultimo_acceso_fecha,     -- col 44
       e.estado               AS evento_estado          -- col 45: P/D/A/C/V (cad_eventos, dominio propio)
FROM cad_pedidos p
LEFT JOIN ctr_usuarios u  ON u.id_usuario           = p.usuario_creacion
LEFT JOIN cad_casos    c1 ON TRIM(UPPER(c1.codigo)) = TRIM(UPPER(p.codi_pedido))
LEFT JOIN cad_casos    c2 ON TRIM(UPPER(c2.codigo)) = TRIM(UPPER(p.codi_pedido2))
-- Evento más reciente del pedido
LEFT JOIN LATERAL (
    SELECT id, canal_codigo, fuerza_id, fecha_cierre,
           observacion_cierre, usuario_modifica, estado
    FROM   cad_eventos ev
    WHERE  ev.pedido_id = p.id
    ORDER  BY ev.fecha_creacion DESC
    LIMIT  1
) e ON TRUE
LEFT JOIN cad_canales cn ON cn.codigo      = e.canal_codigo
                         AND cn.cadfuerz_id = e.fuerza_id
LEFT JOIN cad_fuerzas f  ON f.id           = e.fuerza_id
-- Último registro de acceso (trazabilidad — quién y cuándo abrió el evento)
LEFT JOIN LATERAL (
    SELECT username, fecha_acceso
    FROM   cad_auditoria_acceso_evento a
    WHERE  a.pedido_id = p.id
    ORDER  BY a.fecha_acceso DESC
    LIMIT  1
) ultimo ON TRUE
WHERE p.id = @id";
            cmd.Parameters.AddWithValue("id", id);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            if (!await reader.ReadAsync(ct))
                return null;

            var item = MapDetalle(reader);
            await reader.CloseAsync();

            // Cargar anotaciones y códigos de cierre en paralelo
            item.Anotaciones   = await GetAnotacionesAsync(id, ct);
            if (item.EventoId.HasValue)
                item.CodigosCierre = await GetCodigosCierreAsync(item.EventoId.Value, conn, ct);

            return item;
        }

        // ─── Mutations ────────────────────────────────────────────────────────

        public async Task<DtoPedidoResult> CreateAsync(DtoPedidoRequest req, long usuario, string username, string maquina, CancellationToken ct)
        {
            var result = new DtoPedidoResult();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx = await conn.BeginTransactionAsync(ct);

            try
            {
                await using var cmd = conn.CreateCommand();
                cmd.Transaction = tx;
                var newId = _snowflake.NextId();
                cmd.CommandText = @"
INSERT INTO cad_pedidos
    (id,
     sitio_graba, nume_llamada, hora_caso, nume_telefono, prop_telefono,
     nomb_llamante, barrio, ciudad, dire_llamante, dire_caso,
     latitud_caso, longitud_caso, cordx, cordy, tiposhape, radio,
     comentario, codi_pedido, codi_pedido2, tipo_pedido, cali_pedido,
     importancia, prioridad, disp_telefonico, celda_marcacion,
     canales, canal_fuerza, enviar, estado,
     pedido_padre_sitio, pedido_padre_num,
     usuario_creacion, username_creacion, fecha_creacion, maquina_creacion)
VALUES
    (@newId,
     @sitioGraba, @numeLlamada, @horaCaso, @numeTelefono, @propTelefono,
     @nombLlamante, @barrio, @ciudad, @direLlamante, @direCaso,
     @latitudCaso, @longitudCaso, @cordx, @cordy, @tiposhape, @radio,
     @comentario, @codiPedido, @codiPedido2, @tipoPedido, @caliPedido,
     @importancia, @prioridad, @dispTelefonico, @celdaMarcacion,
     @canales, @canalFuerza, @enviar, @estado,
     @pedidoPadreSitio, @pedidoPadreNum,
     @usuario, @usernameCreacion, NOW(), @maquina)
RETURNING id";

                cmd.Parameters.AddWithValue("newId", newId);
                BindPedidoParams(cmd, req, usuario, maquina, username);

                result.Id = Convert.ToInt64(await cmd.ExecuteScalarAsync(ct));
                result.Success = true;
                result.Message = "Caso registrado exitosamente.";
                await tx.CommitAsync(ct);
                _logger.LogInformation("Pedido creado ID={Id}", result.Id);
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync(ct);
                result.Success = false;
                result.Message = $"Error: {ex.Message}";
                _logger.LogError(ex, "Error creando pedido");
            }

            return result;
        }

        public async Task<DtoPedidoResult> UpdateAsync(long id, DtoPedidoRequest req, long usuario, string maquina, CancellationToken ct)
        {
            var result = new DtoPedidoResult();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx = await conn.BeginTransactionAsync(ct);

            try
            {
                await using var cmd = conn.CreateCommand();
                cmd.Transaction = tx;
                cmd.CommandText = @"
UPDATE cad_pedidos SET
    sitio_graba = @sitioGraba, nume_llamada = @numeLlamada,
    hora_caso = @horaCaso, nume_telefono = @numeTelefono,
    prop_telefono = @propTelefono, nomb_llamante = @nombLlamante,
    barrio = @barrio, ciudad = @ciudad,
    dire_llamante = @direLlamante, dire_caso = @direCaso,
    latitud_caso = @latitudCaso, longitud_caso = @longitudCaso,
    cordx = @cordx, cordy = @cordy, tiposhape = @tiposhape, radio = @radio,
    comentario = @comentario, codi_pedido = @codiPedido,
    codi_pedido2 = @codiPedido2, tipo_pedido = @tipoPedido,
    cali_pedido = @caliPedido, importancia = @importancia,
    prioridad = @prioridad, disp_telefonico = @dispTelefonico,
    celda_marcacion = @celdaMarcacion, canales = @canales,
    canal_fuerza = @canalFuerza, enviar = @enviar, estado = @estado,
    pedido_padre_sitio = @pedidoPadreSitio, pedido_padre_num = @pedidoPadreNum,
    usuario_modifica = @usuario, fecha_modifica = NOW(), maquina_modifica = @maquina
WHERE id = @id";

                BindPedidoParams(cmd, req, usuario, maquina);
                cmd.Parameters.AddWithValue("id", id);

                var rows = await cmd.ExecuteNonQueryAsync(ct);
                result.Success = rows > 0;
                result.Message = rows > 0 ? "Caso actualizado exitosamente." : "Caso no encontrado.";
                result.Id = id;

                if (result.Success) await tx.CommitAsync(ct);
                else await tx.RollbackAsync(ct);
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync(ct);
                result.Success = false;
                result.Message = $"Error: {ex.Message}";
                _logger.LogError(ex, "Error actualizando pedido id={Id}", id);
            }

            return result;
        }

        public async Task<DtoPedidoResult> CerrarRapidoAsync(long id, DtoCerrarRapidoRequest req, long usuario, string maquina, CancellationToken ct)
        {
            var result = new DtoPedidoResult();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx = await conn.BeginTransactionAsync(ct);

            try
            {
                await using var cmd = conn.CreateCommand();
                cmd.Transaction = tx;
                cmd.CommandText = @"
UPDATE cad_pedidos SET
    comentario       = @comentario,
    codi_pedido      = @codiPedido,
    estado           = 'C',
    enviar           = @enviar,
    usuario_modifica = @usuario,
    fecha_modifica   = NOW(),
    maquina_modifica = @maquina
WHERE id = @id";

                cmd.Parameters.AddWithValue("comentario", (object?)req.Comentario ?? DBNull.Value);
                cmd.Parameters.AddWithValue("codiPedido", (object?)req.CodiPedido ?? DBNull.Value);
                cmd.Parameters.AddWithValue("enviar", string.IsNullOrWhiteSpace(req.Enviar) ? "N" : req.Enviar);
                cmd.Parameters.AddWithValue("usuario", usuario);
                cmd.Parameters.AddWithValue("maquina", Truncate(maquina, 100));
                cmd.Parameters.AddWithValue("id", id);

                var rows = await cmd.ExecuteNonQueryAsync(ct);
                result.Success = rows > 0;
                result.Message = rows > 0 ? "Caso cerrado exitosamente." : "Caso no encontrado.";
                result.Id = id;

                if (result.Success) await tx.CommitAsync(ct);
                else await tx.RollbackAsync(ct);
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync(ct);
                result.Success = false;
                result.Message = $"Error: {ex.Message}";
                _logger.LogError(ex, "Error cerrando pedido id={Id}", id);
            }

            return result;
        }

        public async Task<DtoPedidoResult> CerrarEventoDesdeDespachoAsync(
            long pedidoId, Ev.DtoCerrarEventoDespachoRequest req,
            int canalCodigo, int fuerzaId,
            long usuarioId, string username, string maquina, CancellationToken ct)
        {
            var result = new DtoPedidoResult();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx   = await conn.BeginTransactionAsync(ct);

            try
            {
                // ── 1. Obtener el ID del evento + identificadores del pedido ──
                long eventoId    = 0;
                long numeLlamada = 0;
                int  sitioGraba  = 0;
                await using (var sel = conn.CreateCommand())
                {
                    sel.Transaction = tx;
                    sel.CommandText = @"
SELECT e.id, p.nume_llamada, p.sitio_graba
FROM   cad_pedidos p
JOIN   cad_eventos  e ON e.pedido_id = p.id
WHERE  p.id = @pedidoId
ORDER  BY e.fecha_creacion DESC
LIMIT  1";
                    sel.Parameters.AddWithValue("pedidoId", pedidoId);
                    await using var rSel = await sel.ExecuteReaderAsync(ct);
                    if (!await rSel.ReadAsync(ct))
                    {
                        await rSel.CloseAsync();
                        await tx.RollbackAsync(ct);
                        result.Success = false;
                        result.Message = $"No se encontró ningún evento asociado al pedido {pedidoId}.";
                        return result;
                    }
                    eventoId    = rSel.GetInt64(0);
                    numeLlamada = rSel.IsDBNull(1) ? pedidoId : rSel.GetInt64(1);
                    sitioGraba  = rSel.IsDBNull(2) ? 0 : rSel.GetInt32(2);
                }

                // ── 1b. Multi-canal: ¿hay más de un canal asignado a este pedido? ──
                // Si solo hay uno (o ninguno registrado — casos legacy vía p.canales),
                // "cerrar" equivale al cierre global inmediato de siempre: no tiene
                // sentido ni riesgo aplicar el gate por-canal cuando no hay nadie más
                // gestionando el caso en paralelo.
                int totalCanales = 0;
                await using (var cnt = conn.CreateCommand())
                {
                    cnt.Transaction = tx;
                    cnt.CommandText = @"
SELECT COUNT(*) FROM cad_pedidos_canales
WHERE  cadpedi_sitiograba  = @sg
  AND  cadpedi_numellamada = @nl";
                    cnt.Parameters.AddWithValue("sg", sitioGraba);
                    cnt.Parameters.AddWithValue("nl", numeLlamada);
                    totalCanales = Convert.ToInt32(await cnt.ExecuteScalarAsync(ct) ?? 0);
                }

                if (totalCanales > 1)
                {
                    if (canalCodigo <= 0 || fuerzaId <= 0)
                    {
                        await tx.RollbackAsync(ct);
                        result.Success = false;
                        result.Message = "Este evento tiene varios canales asignados y no se pudo determinar su canal actual. Intente de nuevo.";
                        return result;
                    }

                    // No se puede cerrar la participación de este canal si todavía
                    // tiene recursos propios en campo — evita abandonar actuaciones
                    // activas sin que nadie las esté viendo en su bandeja.
                    long actuacionesCanal;
                    await using (var actCnt = conn.CreateCommand())
                    {
                        actCnt.Transaction = tx;
                        actCnt.CommandText = @"
SELECT COUNT(*) FROM cad_actuaciones
WHERE  pedido_id    = @pedidoId
  AND  canal_codigo = @canalCodigo
  AND  fuerza_id    = @fuerzaId
  AND  estado NOT IN ('C','V')";
                        actCnt.Parameters.AddWithValue("pedidoId",    pedidoId);
                        actCnt.Parameters.AddWithValue("canalCodigo", canalCodigo);
                        actCnt.Parameters.AddWithValue("fuerzaId",    fuerzaId);
                        actuacionesCanal = Convert.ToInt64(await actCnt.ExecuteScalarAsync(ct) ?? 0);
                    }
                    if (actuacionesCanal > 0)
                    {
                        await tx.RollbackAsync(ct);
                        result.Success = false;
                        result.Message = $"Su canal aún tiene {actuacionesCanal} recurso(s) activo(s). Cierre esas actuaciones antes de cerrar el evento.";
                        return result;
                    }

                    // Cerrar SOLO la fila de este canal — no toca cad_eventos/cad_pedidos.
                    await using (var updCanal = conn.CreateCommand())
                    {
                        updCanal.Transaction = tx;
                        updCanal.CommandText = @"
UPDATE cad_pedidos_canales
SET    estado             = 'C',
       fecha_modificacion = NOW(),
       usua_modifica      = @usuario
WHERE  cadpedi_sitiograba  = @sg
  AND  cadpedi_numellamada = @nl
  AND  cadcana_codigo      = @canal
  AND  cadcana_fuerz_id    = @fuerza
  AND  estado             <> 'C'";
                        updCanal.Parameters.AddWithValue("usuario", NullOrString(username));
                        updCanal.Parameters.AddWithValue("sg",      sitioGraba);
                        updCanal.Parameters.AddWithValue("nl",      numeLlamada);
                        updCanal.Parameters.AddWithValue("canal",   canalCodigo);
                        updCanal.Parameters.AddWithValue("fuerza",  fuerzaId);
                        await updCanal.ExecuteNonQueryAsync(ct);
                    }

                    // ¿Quedan otros canales activos o actuaciones abiertas en cualquiera?
                    // Si alguno de los dos es cierto, este NO es el cierre definitivo —
                    // se deja el evento/pedido tal cual, visible para el canal que sigue.
                    long canalesActivos, actuacionesGlobales;
                    await using (var restCnt = conn.CreateCommand())
                    {
                        restCnt.Transaction = tx;
                        restCnt.CommandText = @"
SELECT COUNT(*) FROM cad_pedidos_canales
WHERE  cadpedi_sitiograba  = @sg
  AND  cadpedi_numellamada = @nl
  AND  estado             <> 'C'";
                        restCnt.Parameters.AddWithValue("sg", sitioGraba);
                        restCnt.Parameters.AddWithValue("nl", numeLlamada);
                        canalesActivos = Convert.ToInt64(await restCnt.ExecuteScalarAsync(ct) ?? 0);
                    }
                    await using (var actGlobalCnt = conn.CreateCommand())
                    {
                        actGlobalCnt.Transaction = tx;
                        actGlobalCnt.CommandText = "SELECT COUNT(*) FROM cad_actuaciones WHERE pedido_id = @pedidoId AND estado NOT IN ('C','V')";
                        actGlobalCnt.Parameters.AddWithValue("pedidoId", pedidoId);
                        actuacionesGlobales = Convert.ToInt64(await actGlobalCnt.ExecuteScalarAsync(ct) ?? 0);
                    }

                    // Trazabilidad — visible en la línea de tiempo del caso para
                    // cualquier funcionario, sin importar desde qué canal lo mire.
                    await using (var anot = conn.CreateCommand())
                    {
                        anot.Transaction = tx;
                        anot.CommandText = @"
INSERT INTO cad_anotaciones
    (id_pedido, titulo, anotacion, tipo_anotacion,
     usuario_creacion, username_creacion, fecha_creacion, maquina_creacion)
VALUES
    (@idPedido, @titulo, @anotacion, 'CIERRE', @usuario, @username, NOW(), @maquina)";
                        var titulo = canalesActivos == 0 && actuacionesGlobales == 0
                            ? "Cierre definitivo del evento"
                            : "Canal cerró su participación";
                        var detalle = canalesActivos == 0 && actuacionesGlobales == 0
                            ? "Todos los canales asignados cerraron su participación — el evento queda cerrado definitivamente."
                            : $"El canal (código {canalCodigo}, fuerza {fuerzaId}) cerró su participación en el evento. Sigue activo en otro(s) canal(es) o con recursos en campo.";
                        anot.Parameters.AddWithValue("idPedido",  pedidoId);
                        anot.Parameters.AddWithValue("titulo",    titulo);
                        anot.Parameters.AddWithValue("anotacion", detalle);
                        anot.Parameters.AddWithValue("usuario",   usuarioId);
                        anot.Parameters.AddWithValue("username",  Truncate(username, 100));
                        anot.Parameters.AddWithValue("maquina",   Truncate(maquina, 100));
                        await anot.ExecuteNonQueryAsync(ct);
                    }

                    if (canalesActivos > 0 || actuacionesGlobales > 0)
                    {
                        // No es el cierre definitivo — el evento/pedido permanecen
                        // como están, activos para el/los canal(es) restante(s).
                        await tx.CommitAsync(ct);
                        result.Success = true;
                        result.Id      = pedidoId;
                        result.Message = "Su canal cerró su participación en el evento. El caso sigue activo en otro(s) canal(es) o con recursos en campo.";
                        return result;
                    }
                    // Todos los canales ya cerraron y no quedan actuaciones abiertas
                    // en ninguno — continúa abajo con el cierre GLOBAL definitivo.
                }

                var estadoFinal    = req.Estado is Ev.EstadoEvento.Cerrado or Ev.EstadoEvento.Anulado
                                    ? req.Estado : Ev.EstadoEvento.Cerrado;
                var codigoPrimario = req.CodigosCierre
                    .OrderBy(x => x.Orden)
                    .FirstOrDefault()?.CodigoCierre ?? "";

                // ── 2. Actualizar cad_eventos ─────────────────────────────────
                // usuario_modifica en cad_eventos es VARCHAR → se usa el username.
                //
                // El guard permite escribir también cuando el evento YA está en
                // 'C' pero sin datos de cierre propios (codigo_cierre_primario /
                // observacion_cierre ambos NULL): eso indica que se cerró solo por
                // el recálculo automático de fn_recalcular_estado_evento al cerrarse
                // su última actuación (trigger trg_actuaciones_estado), NO por un
                // cierre explícito previo. Sin esta excepción, cerrar la última
                // actuación desde el modal "Atendió" con la opción "cerrar el
                // evento" marcada dejaba el evento en 'C' (vía el trigger) pero
                // ESTA llamada explícita —la que realmente guarda los códigos de
                // cierre y la observación— fallaba con "ya fue cerrado/anulado",
                // dejando el evento cerrado a medias (sin códigos/observación) y
                // sin ninguna confirmación visible para el despachador. Si el
                // evento YA tiene datos de cierre propios, sigue bloqueado (evita
                // que un doble clic pise un cierre explícito legítimo).
                await using (var upd = conn.CreateCommand())
                {
                    upd.Transaction = tx;
                    upd.CommandText = @"
UPDATE cad_eventos
SET    estado                 = @estado,
       fecha_cierre           = NOW(),
       codigo_cierre_primario = @codPrimario,
       clasif_cierre          = @clasif,
       observacion_cierre     = @obs,
       fecha_modificacion     = NOW(),
       usuario_modifica       = @username
WHERE  id = @eventoId
  AND  estado <> 'V'
  AND  (estado <> 'C' OR (codigo_cierre_primario IS NULL AND observacion_cierre IS NULL))";
                    upd.Parameters.AddWithValue("estado",      estadoFinal);
                    upd.Parameters.AddWithValue("codPrimario", string.IsNullOrWhiteSpace(codigoPrimario)
                                                               ? DBNull.Value : (object)codigoPrimario);
                    upd.Parameters.AddWithValue("clasif",      string.IsNullOrWhiteSpace(req.ClasifCierre)
                                                               ? DBNull.Value : (object)req.ClasifCierre);
                    upd.Parameters.AddWithValue("obs",         string.IsNullOrWhiteSpace(req.ObservacionCierre)
                                                               ? DBNull.Value : (object)req.ObservacionCierre);
                    upd.Parameters.AddWithValue("username",    username);
                    upd.Parameters.AddWithValue("eventoId",    eventoId);

                    var rows = await upd.ExecuteNonQueryAsync(ct);
                    if (rows == 0)
                    {
                        await tx.RollbackAsync(ct);
                        result.Success = false;
                        result.Message = $"El evento {eventoId} no existe o ya fue cerrado/anulado.";
                        return result;
                    }
                }

                // ── 3. Reemplazar códigos de cierre ───────────────────────────
                await using (var del = conn.CreateCommand())
                {
                    del.Transaction = tx;
                    del.CommandText = "DELETE FROM cad_eventos_codigos_cierre WHERE evento_id = @id";
                    del.Parameters.AddWithValue("id", eventoId);
                    await del.ExecuteNonQueryAsync(ct);
                }

                foreach (var codigo in req.CodigosCierre.OrderBy(x => x.Orden))
                {
                    await using var ins = conn.CreateCommand();
                    ins.Transaction = tx;
                    ins.CommandText = @"
INSERT INTO cad_eventos_codigos_cierre
    (evento_id, orden, codigo_cierre, tipo_codigo, descripcion_libre,
     usuario_registra, fecha_registra)
VALUES
    (@eventoId, @orden, @codigo, @tipo, @desc, @username, NOW())";
                    ins.Parameters.AddWithValue("eventoId", eventoId);
                    ins.Parameters.AddWithValue("orden",    codigo.Orden);
                    ins.Parameters.AddWithValue("codigo",   codigo.CodigoCierre);
                    ins.Parameters.AddWithValue("tipo",     string.IsNullOrWhiteSpace(codigo.TipoCodigo)
                                                            ? "CIERRE" : codigo.TipoCodigo);
                    ins.Parameters.AddWithValue("desc",     string.IsNullOrWhiteSpace(codigo.DescripcionLibre)
                                                            ? DBNull.Value : (object)codigo.DescripcionLibre);
                    ins.Parameters.AddWithValue("username", username);
                    await ins.ExecuteNonQueryAsync(ct);
                }

                // ── 4. Actualizar cad_pedidos — SOLO estado a 'C' ────────────
                // comentario y codi_pedido son INMUTABLES: no se modifican aquí.
                // usuario_modifica en cad_pedidos es BIGINT → se usa el usuarioId.
                await using (var updPed = conn.CreateCommand())
                {
                    updPed.Transaction = tx;
                    updPed.CommandText = @"
UPDATE cad_pedidos
SET    estado           = 'C',
       usuario_modifica = @usuarioId,
       fecha_modifica   = NOW(),
       maquina_modifica = @maquina
WHERE  id = @pedidoId";
                    updPed.Parameters.AddWithValue("usuarioId", usuarioId);
                    updPed.Parameters.AddWithValue("maquina",   Truncate(maquina, 100));
                    updPed.Parameters.AddWithValue("pedidoId",  pedidoId);
                    await updPed.ExecuteNonQueryAsync(ct);
                }

                await tx.CommitAsync(ct);
                result.Success = true;
                result.Message = $"Evento cerrado. Pedido {pedidoId} marcado como cerrado.";
                result.Id      = pedidoId;
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync(ct);
                result.Success = false;
                result.Message = $"Error: {ex.Message}";
                _logger.LogError(ex, "CerrarEventoDesdeDespacho pedidoId={Id}", pedidoId);
            }

            return result;
        }

        public async Task<DtoPedidoResult> SetEstadoAsync(
            long id, string estado, long usuario, string username,
            string maquina, string? motivo, CancellationToken ct)
        {
            var result = new DtoPedidoResult();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx = await conn.BeginTransactionAsync(ct);

            try
            {
                // Estado anterior — para el historial y para no insertar una fila
                // de "cambio" cuando en realidad no cambió nada.
                string? estadoAnterior = null;
                await using (var qOld = conn.CreateCommand())
                {
                    qOld.Transaction = tx;
                    qOld.CommandText = "SELECT estado FROM cad_pedidos WHERE id = @id FOR UPDATE";
                    qOld.Parameters.AddWithValue("id", id);
                    var raw = await qOld.ExecuteScalarAsync(ct);
                    if (raw is null or DBNull)
                    {
                        await tx.RollbackAsync(ct);
                        result.Success = false;
                        result.Message = "Caso no encontrado.";
                        return result;
                    }
                    estadoAnterior = (string)raw;
                }

                await using var cmd = conn.CreateCommand();
                cmd.Transaction = tx;
                cmd.CommandText = @"
UPDATE cad_pedidos SET
    estado           = @estado,
    usuario_modifica = @usuario,
    fecha_modifica   = NOW(),
    maquina_modifica = @maquina
WHERE id = @id";

                cmd.Parameters.AddWithValue("estado", Truncate(estado, 20));
                cmd.Parameters.AddWithValue("usuario", usuario);
                cmd.Parameters.AddWithValue("maquina", Truncate(maquina, 100));
                cmd.Parameters.AddWithValue("id", id);

                var rows = await cmd.ExecuteNonQueryAsync(ct);
                result.Success = rows > 0;
                result.Message = rows > 0 ? "Estado actualizado." : "Caso no encontrado.";
                result.Id = id;

                // Historial de auditoría — solo si el estado realmente cambió.
                // No bloquea el cambio de estado si algo raro pasa acá (ej. motivo
                // demasiado largo ya truncado); es trazabilidad, no una regla de
                // negocio que deba poder tumbar la operación principal.
                if (result.Success && !string.Equals(estadoAnterior, estado, StringComparison.Ordinal))
                {
                    await using var hist = conn.CreateCommand();
                    hist.Transaction = tx;
                    hist.CommandText = @"
INSERT INTO cad_pedidos_estado_historial
    (pedido_id, estado_anterior, estado_nuevo, motivo, usuario, username, fecha)
VALUES (@pedidoId, @estadoAnterior, @estadoNuevo, @motivo, @usuario, @username, NOW())";
                    hist.Parameters.AddWithValue("pedidoId",       id);
                    hist.Parameters.AddWithValue("estadoAnterior", (object?)estadoAnterior ?? DBNull.Value);
                    hist.Parameters.AddWithValue("estadoNuevo",    Truncate(estado, 20));
                    hist.Parameters.AddWithValue("motivo",         NullOrString(motivo?.Length > 500 ? motivo[..500] : motivo));
                    hist.Parameters.AddWithValue("usuario",        usuario);
                    hist.Parameters.AddWithValue("username",       Truncate(username, 100));
                    await hist.ExecuteNonQueryAsync(ct);
                }

                if (result.Success) await tx.CommitAsync(ct);
                else await tx.RollbackAsync(ct);
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync(ct);
                result.Success = false;
                result.Message = $"Error: {ex.Message}";
                _logger.LogError(ex, "Error actualizando estado pedido id={Id}", id);
            }

            return result;
        }

        public async Task<List<DtoEstadoHistorialItem>> GetEstadoHistorialAsync(long pedidoId, CancellationToken ct)
        {
            var result = new List<DtoEstadoHistorialItem>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
SELECT estado_anterior, estado_nuevo, motivo, username,
       TO_CHAR(fecha AT TIME ZONE 'America/Bogota','YYYY-MM-DD""T""HH24:MI:SS')
FROM   cad_pedidos_estado_historial
WHERE  pedido_id = @pedidoId
ORDER  BY fecha DESC";
            cmd.Parameters.AddWithValue("pedidoId", pedidoId);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                result.Add(new DtoEstadoHistorialItem
                {
                    EstadoAnterior = reader.IsDBNull(0) ? null : reader.GetString(0),
                    EstadoNuevo    = reader.GetString(1),
                    Motivo         = reader.IsDBNull(2) ? null : reader.GetString(2),
                    Username       = reader.IsDBNull(3) ? null : reader.GetString(3),
                    Fecha          = reader.GetString(4)
                });
            }
            return result;
        }

        public async Task<DtoPedidoResult> VincularPedidoAsync(
            long id, int? sitioGraba, long? numeLlamada, long usuario, string maquina, CancellationToken ct)
        {
            var result = new DtoPedidoResult();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
UPDATE cad_pedidos SET
    pedido_padre_sitio = @sitio,
    pedido_padre_num   = @num,
    usuario_modifica    = @usuario,
    fecha_modifica       = NOW(),
    maquina_modifica     = @maquina
WHERE id = @id";
            cmd.Parameters.AddWithValue("sitio",   (object?)sitioGraba  ?? DBNull.Value);
            cmd.Parameters.AddWithValue("num",     (object?)numeLlamada ?? DBNull.Value);
            cmd.Parameters.AddWithValue("usuario", usuario);
            cmd.Parameters.AddWithValue("maquina", Truncate(maquina, 100));
            cmd.Parameters.AddWithValue("id",      id);

            try
            {
                var rows = await cmd.ExecuteNonQueryAsync(ct);
                result.Success = rows > 0;
                result.Message = rows > 0
                    ? (sitioGraba.HasValue ? "Caso vinculado." : "Vínculo removido.")
                    : "Caso no encontrado.";
                result.Id = id;
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = $"Error: {ex.Message}";
                _logger.LogError(ex, "Error vinculando pedido id={Id}", id);
            }

            return result;
        }

        // ─── Annotations ──────────────────────────────────────────────────────

        public async Task<List<DtoAnotacion>> GetAnotacionesAsync(long idPedido, CancellationToken ct)
        {
            var result = new List<DtoAnotacion>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
SELECT id, id_pedido, titulo, anotacion, tipo_anotacion,
       usuario_creacion, username_creacion, fecha_creacion, maquina_creacion
FROM cad_anotaciones
WHERE id_pedido = @idPedido
ORDER BY fecha_creacion DESC";
            cmd.Parameters.AddWithValue("idPedido", idPedido);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
                result.Add(MapAnotacion(reader));

            return result;
        }

        public async Task<DtoPedidoResult> CreateAnotacionAsync(long idPedido, DtoAnotacionRequest req, long usuario, string username, string maquina, CancellationToken ct)
        {
            var result = new DtoPedidoResult();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx = await conn.BeginTransactionAsync(ct);

            try
            {
                await using var cmd = conn.CreateCommand();
                cmd.Transaction = tx;
                cmd.CommandText = @"
INSERT INTO cad_anotaciones
    (id_pedido, titulo, anotacion, tipo_anotacion,
     usuario_creacion, username_creacion, fecha_creacion, maquina_creacion)
VALUES
    (@idPedido, @titulo, @anotacion, @tipoAnotacion,
     @usuario, @username, NOW(), @maquina)
RETURNING id";

                cmd.Parameters.AddWithValue("idPedido", idPedido);
                cmd.Parameters.AddWithValue("titulo", Truncate(req.Titulo, 200));
                cmd.Parameters.AddWithValue("anotacion", (object?)req.Anotacion ?? DBNull.Value);
                cmd.Parameters.AddWithValue("tipoAnotacion", Truncate(req.TipoAnotacion, 50));
                cmd.Parameters.AddWithValue("usuario", usuario);
                cmd.Parameters.AddWithValue("username", Truncate(username, 100));
                cmd.Parameters.AddWithValue("maquina", Truncate(maquina, 100));

                result.Id = Convert.ToInt64(await cmd.ExecuteScalarAsync(ct));
                result.Success = true;
                result.Message = "Anotación registrada.";

                // Red de seguridad: agregar una nota es una gestión real — promover a
                // 'En proceso' si el pedido seguía en 'P'/'A' (ver EstadoPedidoHelper).
                result.EstadoActual = await EstadoPedidoHelper.PromoverPorPedidoIdAsync(conn, tx, idPedido, ct);

                await tx.CommitAsync(ct);
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync(ct);
                result.Success = false;
                result.Message = $"Error: {ex.Message}";
                _logger.LogError(ex, "Error creando anotacion para pedido id={Id}", idPedido);
            }

            return result;
        }

        public async Task<List<DtoPedidoAsociar>> BuscarParaAsociarAsync(int sitioGraba, CancellationToken ct)
        {
            var result = new List<DtoPedidoAsociar>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
SELECT id, nume_llamada, hora_caso, nume_telefono, cali_pedido,
       ciudad, nomb_llamante, dire_caso, codi_pedido, estado, sitio_graba
FROM cad_pedidos
WHERE sitio_graba = @sitioGraba
  AND estado = 'A'
ORDER BY hora_caso DESC
LIMIT 50";
            cmd.Parameters.AddWithValue("sitioGraba", sitioGraba);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
                result.Add(MapAsociar(reader));

            return result;
        }

        // ─── Eventos (dispatcher queue) ──────────────────────────────────────

        public async Task<List<DtoEventoListItem>> GetEventosByCanalAsync(
            int canalCodigo, int fuerzaId, string? estado, CancellationToken ct)
        {
            var result = new List<DtoEventoListItem>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();

            // ── Regla de negocio: eventos cerrados solo se muestran cuando el filtro
            // es explícitamente 'C'; en ese caso solo se cargan los del turno vigente.
            // Para todos los demás filtros (incluyendo "Todos"), se excluyen los cerrados.
            var (turnoDesde, _) = GetTurnoActual();

            var sql = @"
SELECT p.id, p.sitio_graba, p.nume_llamada, p.hora_caso,
       p.nume_telefono, p.dire_caso, p.estado, p.enviar,
       p.codi_pedido, p.codi_pedido2, p.comentario,
       COALESCE(p.prioridad, '')   AS prioridad,
       COALESCE(p.cali_pedido, '') AS cali_pedido,
       COALESCE(p.ciudad, '')      AS ciudad,
       COALESCE(NULLIF(p.username_creacion,''), NULLIF(p.cadusua_usuario,''), u.username, 'sin usuario') AS username_creacion,
       p.fecha_creacion,
       COALESCE(c1.descripcion, '') AS desc_pedido,
       p.fecha_primer_acceso,
       (SELECT COUNT(*) FROM cad_actuaciones a
        WHERE a.pedido_id = p.id
          AND a.estado NOT IN ('C','V'))::int AS total_actuaciones_activas,
       e.id                         AS evento_id,   -- col 19: Snowflake ID del evento (≠ p.id)
       COALESCE(e.origen, 'MANUAL') AS origen,       -- col 20: canal de origen del evento
       COALESCE(p.nomb_llamante, '') AS nomb_llamante -- col 21: nombre del llamante / afectado
FROM cad_pedidos p
LEFT JOIN ctr_usuarios u  ON u.id_usuario         = p.usuario_creacion
LEFT JOIN cad_casos    c1 ON TRIM(UPPER(c1.codigo)) = TRIM(UPPER(p.codi_pedido))
LEFT JOIN cad_eventos  e  ON e.pedido_id          = p.id
-- Fila de cad_pedidos_canales específica de ESTE canal (si existe). pc.estado
-- indica si YO (este canal) ya cerré mi participación en el caso — distinto
-- de p.estado, que es el cierre GLOBAL (solo ocurre cuando todos los canales
-- asignados cerraron su parte y no quedan actuaciones abiertas en ninguno).
LEFT JOIN LATERAL (
    SELECT estado FROM cad_pedidos_canales pc2
    WHERE pc2.cadpedi_sitiograba  = p.sitio_graba
      AND pc2.cadpedi_numellamada = p.nume_llamada
      AND pc2.cadcana_codigo      = @canalCodigo
      AND pc2.cadcana_fuerz_id    = @fuerzaId
    LIMIT 1
) pc ON TRUE
WHERE p.enviar = 'S'
  AND (
      pc.estado IS NOT NULL
      -- NOTA: esta rama de respaldo (p.canales, poblada solo al crear el pedido)
      -- es fuerza-agnóstica por diseño de datos — cad_pedidos.canales solo guarda
      -- códigos de canal (List<int>), sin fuerza, a diferencia de
      -- cad_pedidos_canales que sí es (codigo, fuerza). Igual que el código de
      -- canal se numera por fuerza, dos fuerzas con el mismo código de canal aquí
      -- SÍ pueden verse cruzadas. No se corrige en este cambio porque requiere
      -- migrar el formato de esa columna o dejar de depender de ella (ver
      -- auditoría del módulo Pedidos — cad_pedidos_canales sigue siendo la única
      -- vía fuerza-consciente para canales remitidos después de creado el pedido).
      -- Tampoco tiene granularidad por-canal para el cierre parcial: un caso
      -- visible solo por esta rama nunca se oculta por cierre-de-mi-canal.
      OR @canalCodigoStr = ANY(string_to_array(COALESCE(p.canales, ''), ','))
  )";

            if (estado == "C")
            {
                // Filtro Cerrados: vista histórica — no importa si YO cerré mi canal
                // antes que el resto; se muestra igual una vez el evento cierra
                // globalmente. Solo los del turno vigente para no sobrecargar.
                // Npgsql strict mode requiere UTC para timestamptz — convertir explícitamente.
                sql += " AND p.estado = 'C' AND p.fecha_modifica >= @turnoDesde";
                cmd.Parameters.AddWithValue("turnoDesde", turnoDesde.UtcDateTime);
            }
            else if (!string.IsNullOrWhiteSpace(estado))
            {
                // Filtro activo específico (A, P, E, T, R): excluir cerrados globalmente
                // Y excluir los que YO ya cerré desde mi canal (aunque sigan abiertos
                // globalmente porque otro canal sigue gestionándolos).
                sql += " AND p.estado = @estado AND p.estado != 'C' AND COALESCE(pc.estado,'') <> 'C'";
                cmd.Parameters.AddWithValue("estado", estado);
            }
            else
            {
                // Vista "Todos": excluir cerrados globalmente y los cerrados desde mi canal.
                sql += " AND p.estado != 'C' AND COALESCE(pc.estado,'') <> 'C'";
            }

            sql += @"
ORDER BY
    CASE UPPER(COALESCE(p.prioridad, ''))
        WHEN 'FLASH'     THEN 0
        WHEN 'INMEDIATA' THEN 1
        WHEN 'RUTINA'    THEN 2
        ELSE 3 END,
    p.hora_caso ASC
LIMIT 300";

            cmd.CommandText = sql;
            cmd.Parameters.AddWithValue("canalCodigo",    canalCodigo);
            cmd.Parameters.AddWithValue("canalCodigoStr", canalCodigo.ToString());
            cmd.Parameters.AddWithValue("fuerzaId",       fuerzaId);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
                result.Add(MapEventoListItem(reader));

            return result;
        }

        // ─── Búsqueda server-side (más allá de la cola de 300 cargados) ───────────

        /// <summary>
        /// Busca eventos por dirección, código de caso, nombre del llamante, teléfono
        /// o número de evento/llamada/pedido — sin el LIMIT 300 ni el filtro de
        /// "excluir cerrados" de GetEventosByCanalAsync. A diferencia de la cola en
        /// vivo (scopeada por canal), esto busca en TODA la fuerza del operador,
        /// incluyendo casos ya cerrados o remitidos a otro canal — para que un caso
        /// que salió de la vista activa siga siendo encontrable.
        /// </summary>
        public async Task<List<DtoEventoListItem>> G_BuscarEventosAsync(
            string texto, int fuerzaId, int sitioGraba, CancellationToken ct)
        {
            var result = new List<DtoEventoListItem>();
            var t = texto?.Trim() ?? "";
            if (t.Length < 3) return result;

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
SELECT p.id, p.sitio_graba, p.nume_llamada, p.hora_caso,
       p.nume_telefono, p.dire_caso, p.estado, p.enviar,
       p.codi_pedido, p.codi_pedido2, p.comentario,
       COALESCE(p.prioridad, '')   AS prioridad,
       COALESCE(p.cali_pedido, '') AS cali_pedido,
       COALESCE(p.ciudad, '')      AS ciudad,
       COALESCE(NULLIF(p.username_creacion,''), NULLIF(p.cadusua_usuario,''), u.username, 'sin usuario') AS username_creacion,
       p.fecha_creacion,
       COALESCE(c1.descripcion, '') AS desc_pedido,
       p.fecha_primer_acceso,
       (SELECT COUNT(*) FROM cad_actuaciones a
        WHERE a.pedido_id = p.id AND a.estado NOT IN ('C','V'))::int AS total_actuaciones_activas,
       e.id                         AS evento_id,
       COALESCE(e.origen, 'MANUAL') AS origen,
       COALESCE(p.nomb_llamante, '') AS nomb_llamante
FROM   cad_pedidos p
LEFT   JOIN ctr_usuarios u  ON u.id_usuario         = p.usuario_creacion
LEFT   JOIN cad_casos    c1 ON TRIM(UPPER(c1.codigo)) = TRIM(UPPER(p.codi_pedido))
LEFT   JOIN cad_eventos  e  ON e.pedido_id          = p.id
WHERE  p.enviar = 'S'
  AND  (p.sitio_graba = @sitioGraba OR @sitioGraba = 0)
  -- Scoping por fuerza — igual intención que el resto del módulo: un operador
  -- de una fuerza no debe poder buscar/encontrar casos de otra.
  AND  (
      @fuerzaId = 0
      OR e.fuerza_id = @fuerzaId
      OR EXISTS (
          SELECT 1 FROM cad_pedidos_canales pc
          WHERE pc.cadpedi_sitiograba  = p.sitio_graba
            AND pc.cadpedi_numellamada = p.nume_llamada
            AND pc.cadcana_fuerz_id    = @fuerzaId
      )
  )
  AND (
      p.dire_caso        ILIKE @like
      OR p.codi_pedido    ILIKE @like
      OR p.codi_pedido2   ILIKE @like
      OR p.nomb_llamante  ILIKE @like
      OR CAST(p.nume_telefono AS TEXT) = @textoExacto
      OR CAST(p.id             AS TEXT) = @textoExacto
      OR CAST(e.id             AS TEXT) = @textoExacto
      OR CAST(p.nume_llamada   AS TEXT) = @textoExacto
  )
ORDER  BY p.hora_caso DESC
LIMIT  50";
            cmd.Parameters.AddWithValue("sitioGraba",  sitioGraba);
            cmd.Parameters.AddWithValue("fuerzaId",    fuerzaId);
            cmd.Parameters.AddWithValue("like",        "%" + t + "%");
            cmd.Parameters.AddWithValue("textoExacto", t);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
                result.Add(MapEventoListItem(reader));

            return result;
        }

        public async Task<List<string>> G_GetPresenciaAsync(long pedidoId, long usuarioActual, CancellationToken ct)
        {
            var result = new List<string>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
SELECT DISTINCT username
FROM   cad_auditoria_acceso_evento
WHERE  pedido_id  = @pedidoId
  AND  usuario_id <> @usuarioActual
  AND  fecha_acceso > NOW() - INTERVAL '5 minutes'
  AND  username IS NOT NULL AND username <> ''";
            cmd.Parameters.AddWithValue("pedidoId",      pedidoId);
            cmd.Parameters.AddWithValue("usuarioActual", usuarioActual);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
                result.Add(reader.GetString(0));

            return result;
        }

        // ─── Conteos para badges de filtro ────────────────────────────────────────

        public async Task<DtoEventoConteos> GetConteosByCanalAsync(
            int canalCodigo, int fuerzaId, CancellationToken ct)
        {
            var (turnoDesde, turnoNombre) = GetTurnoActual();

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();

            // Una sola consulta con COUNT … FILTER — muy eficiente
            // pc.estado = cierre parcial de ESTE canal (ver GetEventosByCanalAsync).
            // Los buckets "activos" excluyen lo que ya cerré desde mi canal; el
            // bucket "cerrados_turno" no se ve afectado — es una vista histórica.
            cmd.CommandText = @"
SELECT
    COUNT(*) FILTER (WHERE p.estado != 'C' AND COALESCE(pc.estado,'') <> 'C') AS total,
    COUNT(*) FILTER (WHERE p.estado = 'A' AND COALESCE(pc.estado,'') <> 'C')  AS activos,
    COUNT(*) FILTER (WHERE p.estado = 'P' AND COALESCE(pc.estado,'') <> 'C')  AS pendientes,
    COUNT(*) FILTER (WHERE p.estado = 'E' AND COALESCE(pc.estado,'') <> 'C')  AS en_proceso,
    COUNT(*) FILTER (WHERE p.estado = 'T' AND COALESCE(pc.estado,'') <> 'C')  AS seguimiento,
    COUNT(*) FILTER (WHERE p.estado = 'R' AND COALESCE(pc.estado,'') <> 'C')  AS revision,
    COUNT(*) FILTER (WHERE p.estado = 'C'
                       AND p.fecha_modifica >= @turnoDesde)                  AS cerrados_turno
FROM cad_pedidos p
LEFT JOIN LATERAL (
    SELECT estado FROM cad_pedidos_canales pc2
    WHERE pc2.cadpedi_sitiograba  = p.sitio_graba
      AND pc2.cadpedi_numellamada = p.nume_llamada
      AND pc2.cadcana_codigo      = @canalCodigo
      AND pc2.cadcana_fuerz_id    = @fuerzaId
    LIMIT 1
) pc ON TRUE
WHERE p.enviar = 'S'
  AND (
      pc.estado IS NOT NULL
      -- NOTA: esta rama de respaldo (p.canales, poblada solo al crear el pedido)
      -- es fuerza-agnóstica por diseño de datos — cad_pedidos.canales solo guarda
      -- códigos de canal (List<int>), sin fuerza, a diferencia de
      -- cad_pedidos_canales que sí es (codigo, fuerza). Igual que el código de
      -- canal se numera por fuerza, dos fuerzas con el mismo código de canal aquí
      -- SÍ pueden verse cruzadas. No se corrige en este cambio porque requiere
      -- migrar el formato de esa columna o dejar de depender de ella (ver
      -- auditoría del módulo Pedidos — cad_pedidos_canales sigue siendo la única
      -- vía fuerza-consciente para canales remitidos después de creado el pedido).
      OR @canalCodigoStr = ANY(string_to_array(COALESCE(p.canales, ''), ','))
  )";

            cmd.Parameters.AddWithValue("canalCodigo",    canalCodigo);
            cmd.Parameters.AddWithValue("canalCodigoStr", canalCodigo.ToString());
            cmd.Parameters.AddWithValue("fuerzaId",       fuerzaId);
            // Npgsql strict mode rechaza DateTimeOffset con offset != 0 para timestamptz.
            // Convertir a UTC (DateTimeKind.Utc) antes de pasar el parámetro.
            cmd.Parameters.AddWithValue("turnoDesde",     turnoDesde.UtcDateTime);

            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (!await r.ReadAsync(ct))
                return new DtoEventoConteos { TurnoActual = turnoNombre, TurnoDesde = turnoDesde.ToString("o") };

            return new DtoEventoConteos
            {
                Total         = r.IsDBNull(0) ? 0 : (int)(long)r.GetValue(0),
                Activos       = r.IsDBNull(1) ? 0 : (int)(long)r.GetValue(1),
                Pendientes    = r.IsDBNull(2) ? 0 : (int)(long)r.GetValue(2),
                EnProceso     = r.IsDBNull(3) ? 0 : (int)(long)r.GetValue(3),
                Seguimiento   = r.IsDBNull(4) ? 0 : (int)(long)r.GetValue(4),
                Revision      = r.IsDBNull(5) ? 0 : (int)(long)r.GetValue(5),
                CerradosTurno = r.IsDBNull(6) ? 0 : (int)(long)r.GetValue(6),
                TurnoActual   = turnoNombre,
                TurnoDesde    = turnoDesde.ToString("o")
            };
        }

        // ─── Visibilidad multi-canal: qué canales/agencias tienen el evento ──────
        // Da a cualquier funcionario, sin importar desde qué canal mire el caso,
        // conocimiento de que un evento está siendo gestionado en paralelo por
        // otro(s) canal(es) o agencia(s) — antes esta información no era visible
        // en ningún lugar de la UI.
        public async Task<Ev.DtoCanalesAsignadosResult> G_GetCanalesAsignadosAsync(long pedidoId, CancellationToken ct)
        {
            var result = new Ev.DtoCanalesAsignadosResult();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);

            await using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"
SELECT pc.cadcana_codigo, pc.cadcana_fuerz_id,
       COALESCE(f.descripcion, '') AS fuerza_desc,
       COALESCE(c.descripcion, '') AS canal_desc,
       pc.estado,
       (SELECT COUNT(*) FROM cad_actuaciones a
        WHERE  a.pedido_id    = p.id
          AND  a.canal_codigo = pc.cadcana_codigo
          AND  a.fuerza_id    = pc.cadcana_fuerz_id
          AND  a.estado NOT IN ('C','V'))::int AS actuaciones_activas,
       pc.fecha_modificacion,
       pc.usua_modifica
FROM   cad_pedidos p
JOIN   cad_pedidos_canales pc
       ON pc.cadpedi_sitiograba  = p.sitio_graba
      AND pc.cadpedi_numellamada = p.nume_llamada
LEFT   JOIN cad_canales c ON c.codigo = pc.cadcana_codigo AND c.cadfuerz_id = pc.cadcana_fuerz_id
LEFT   JOIN cad_fuerzas f ON f.id     = pc.cadcana_fuerz_id
WHERE  p.id = @pedidoId
ORDER  BY pc.estado, f.descripcion, c.descripcion";
                cmd.Parameters.AddWithValue("pedidoId", pedidoId);

                await using var reader = await cmd.ExecuteReaderAsync(ct);
                while (await reader.ReadAsync(ct))
                {
                    result.Canales.Add(new Ev.DtoCanalAsignadoEvento
                    {
                        Codigo             = reader.GetInt32(0),
                        FuerzaId           = reader.GetInt32(1),
                        FuerzaDescripcion  = reader.GetString(2),
                        CanalDescripcion   = reader.GetString(3),
                        Estado             = reader.IsDBNull(4) ? "A" : reader.GetString(4),
                        ActuacionesActivas = reader.IsDBNull(5) ? 0 : reader.GetInt32(5),
                        FechaModificacion  = reader.IsDBNull(6) ? null : reader.GetDateTime(6).ToString("o"),
                        UsuarioModifica    = reader.IsDBNull(7) ? null : reader.GetString(7)
                    });
                }
            }

            await using (var cmdAg = conn.CreateCommand())
            {
                cmdAg.CommandText = @"
SELECT d.agencia_id, COALESCE(a.nombre, ''), COALESCE(a.tipo_agencia, ''),
       d.fecha_envio, d.exitoso, d.enviado_por
FROM   cad_despachos_externos d
LEFT   JOIN cad_agencias_externas a ON a.id = d.agencia_id
WHERE  d.pedido_id = @pedidoId
ORDER  BY d.fecha_envio DESC";
                cmdAg.Parameters.AddWithValue("pedidoId", pedidoId);

                await using var readerAg = await cmdAg.ExecuteReaderAsync(ct);
                while (await readerAg.ReadAsync(ct))
                {
                    result.AgenciasExternas.Add(new Ev.DtoAgenciaDespachadaEvento
                    {
                        AgenciaId   = readerAg.GetInt64(0),
                        Nombre      = readerAg.GetString(1),
                        TipoAgencia = readerAg.GetString(2),
                        FechaEnvio  = readerAg.GetDateTime(3).ToString("o"),
                        Exitoso     = readerAg.GetBoolean(4),
                        EnviadoPor  = readerAg.IsDBNull(5) ? null : readerAg.GetString(5)
                    });
                }
            }

            return result;
        }

        // ─── Helper: turno de vigilancia (Colombia UTC-5, sin horario de verano) ──

        /// <summary>
        /// Determina el inicio del turno vigente según la hora actual en Colombia.
        /// <list type="bullet">
        ///   <item>1ro: 22:00 – 05:59  </item>
        ///   <item>2do: 06:00 – 13:59  </item>
        ///   <item>3ro: 14:00 – 21:59  </item>
        /// </list>
        /// Colombia no aplica horario de verano → siempre UTC-5.
        /// </summary>
        private static (DateTimeOffset desde, string nombre) GetTurnoActual()
        {
            var offset = TimeSpan.FromHours(-5);
            var ahora  = DateTimeOffset.UtcNow.ToOffset(offset);
            var hora   = ahora.TimeOfDay;
            var hoy    = ahora.Date;

            if (hora >= TimeSpan.FromHours(6) && hora < TimeSpan.FromHours(14))
                return (new DateTimeOffset(hoy.Add(TimeSpan.FromHours(6)), offset), "2do");

            if (hora >= TimeSpan.FromHours(14) && hora < TimeSpan.FromHours(22))
                return (new DateTimeOffset(hoy.Add(TimeSpan.FromHours(14)), offset), "3ro");

            // 1er turno: 22:00 – 05:59 (puede cruzar medianoche)
            var turnoDesde = hora >= TimeSpan.FromHours(22)
                ? new DateTimeOffset(hoy.Add(TimeSpan.FromHours(22)), offset)          // 22:xx hoy
                : new DateTimeOffset(hoy.AddDays(-1).Add(TimeSpan.FromHours(22)), offset); // 0x:xx → turno empezó ayer

            return (turnoDesde, "1ro");
        }

        // ─── Auditoría y primer acceso ────────────────────────────────────────────

        /// <summary>
        /// Registra el acceso de un despachador a un evento, marca fecha_primer_acceso
        /// la primera vez (para la semaforización SLA) y — a diferencia de antes —
        /// promueve el evento a estado 'E' (En proceso) de inmediato, porque un
        /// despachador ya lo tiene abierto. El guard WHERE estado IN ('P','A') evita
        /// pisar un estado más avanzado (T/R/C) que el despachador haya elegido a mano.
        /// Devuelve el nuevo estado si se promovió, o null si no cambió (ya estaba en
        /// 'E' o más adelante). El caller debe reflejar este valor en la respuesta que
        /// ya se armó con el estado "viejo", para no pagar una segunda consulta.
        /// Errores de auditoría no deben romper la respuesta principal — se atrapan y
        /// se loguean, pero si falla el UPDATE de estado sí se logea por separado
        /// (no debería fallar salvo problema de conexión, mismo criterio que el resto).
        /// </summary>
        public async Task<string?> RegistrarAccesoAsync(
            long pedidoId, long usuarioId, string username, string ip,
            string accion, CancellationToken ct)
        {
            string? nuevoEstado = null;
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);

            try
            {
                // 1. Insertar en auditoría
                await using var cmdAudit = conn.CreateCommand();
                cmdAudit.CommandText = @"
INSERT INTO cad_auditoria_acceso_evento
    (pedido_id, usuario_id, username, ip_origen, accion)
VALUES (@pedidoId, @usuarioId, @username, @ip, @accion)";
                cmdAudit.Parameters.AddWithValue("pedidoId",  pedidoId);
                cmdAudit.Parameters.AddWithValue("usuarioId", usuarioId > 0 ? (object)usuarioId : DBNull.Value);
                cmdAudit.Parameters.AddWithValue("username",  Truncate(username, 100));
                cmdAudit.Parameters.AddWithValue("ip",        Truncate(ip, 50));
                cmdAudit.Parameters.AddWithValue("accion",    Truncate(accion, 50));
                await cmdAudit.ExecuteNonQueryAsync(ct);

                // 2. Marcar primer acceso si aún no estaba registrado
                await using var cmdPrimer = conn.CreateCommand();
                cmdPrimer.CommandText = @"
UPDATE cad_pedidos
   SET fecha_primer_acceso = NOW()
 WHERE id = @pedidoId
   AND fecha_primer_acceso IS NULL";
                cmdPrimer.Parameters.AddWithValue("pedidoId", pedidoId);
                await cmdPrimer.ExecuteNonQueryAsync(ct);
            }
            catch (Exception ex)
            {
                // Audit failure must NOT break the main request
                _logger.LogWarning(ex,
                    "Error registrando auditoría para pedido={PedidoId}", pedidoId);
            }

            try
            {
                // 3. Promover a 'En proceso' porque alguien ya está viendo el evento.
                nuevoEstado = await EstadoPedidoHelper.PromoverPorPedidoIdAsync(conn, null, pedidoId, ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "Error promoviendo estado a 'En proceso' para pedido={PedidoId}", pedidoId);
            }

            return nuevoEstado;
        }

        // ─── SLA configuration ────────────────────────────────────────────────────

        public async Task<List<DtoSlaConfig>> GetSlaConfigAsync(CancellationToken ct)
        {
            var result = new List<DtoSlaConfig>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
SELECT id, nombre, umbral_minutos, color_hex, COALESCE(descripcion,''), orden
FROM cad_config_sla
WHERE activo = TRUE
ORDER BY orden";

            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
                result.Add(new DtoSlaConfig
                {
                    Id            = r.GetInt32(0),
                    Nombre        = r.GetString(1),
                    UmbralMinutos = r.GetInt32(2),
                    ColorHex      = r.GetString(3),
                    Descripcion   = r.GetString(4),
                    Orden         = r.GetInt32(5)
                });

            return result;
        }

        public async Task<List<DtoCanalItem>> GetCanalesPorSitioAsync(int sitioGraba, CancellationToken ct)
        {
            var result = new List<DtoCanalItem>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
SELECT c.codigo, c.cadfuerz_id, c.descripcion, f.descripcion AS fuerza_desc
FROM cad_canales c
JOIN cad_fuerzas f ON f.id = c.cadfuerz_id
WHERE c.vigente = 'S'
  AND f.sitio_graba = @sitioGraba
ORDER BY f.descripcion, c.codigo";
            cmd.Parameters.AddWithValue("sitioGraba", sitioGraba);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
                result.Add(new DtoCanalItem
                {
                    Codigo      = reader.IsDBNull(0) ? 0  : reader.GetInt32(0),
                    FuerzaId    = reader.IsDBNull(1) ? 0  : reader.GetInt32(1),
                    Descripcion = reader.IsDBNull(2) ? "" : reader.GetString(2),
                    FuerzaDesc  = reader.IsDBNull(3) ? "" : reader.GetString(3)
                });

            return result;
        }

        // ─── Mapping helpers ──────────────────────────────────────────────────

        private static void BindPedidoParams(NpgsqlCommand cmd, DtoPedidoRequest req, long usuario, string maquina, string? username = null)
        {
            cmd.Parameters.AddWithValue("usernameCreacion", (object?)(username ?? "sistema") ?? DBNull.Value);
            cmd.Parameters.AddWithValue("sitioGraba", req.SitioGraba);
            cmd.Parameters.AddWithValue("numeLlamada",
                req.NumeLlamada == 0 ? (object)DBNull.Value : req.NumeLlamada);

            if (DateTimeOffset.TryParse(req.HoraCaso, out var horaCasoDto))
                cmd.Parameters.AddWithValue("horaCaso", horaCasoDto);
            else
                cmd.Parameters.AddWithValue("horaCaso", DateTimeOffset.Now);

            cmd.Parameters.AddWithValue("numeTelefono",
                req.NumeTelefono == 0 ? (object)DBNull.Value : req.NumeTelefono);
            cmd.Parameters.AddWithValue("propTelefono",    Truncate(req.PropTelefono, 200));
            cmd.Parameters.AddWithValue("nombLlamante",    Truncate(req.NombLlamante, 200));
            cmd.Parameters.AddWithValue("barrio",          Truncate(req.Barrio, 200));
            cmd.Parameters.AddWithValue("ciudad",          Truncate(req.Ciudad, 200));
            cmd.Parameters.AddWithValue("direLlamante",    Truncate(req.DireLlamante, 300));
            cmd.Parameters.AddWithValue("direCaso",        Truncate(req.DireCaso, 300));
            cmd.Parameters.AddWithValue("latitudCaso",     Truncate(req.LatitudCaso, 50));
            cmd.Parameters.AddWithValue("longitudCaso",    Truncate(req.LongitudCaso, 50));
            cmd.Parameters.AddWithValue("cordx",           Truncate(req.Cordx, 50));
            cmd.Parameters.AddWithValue("cordy",           Truncate(req.Cordy, 50));
            cmd.Parameters.AddWithValue("tiposhape",       Truncate(req.Tiposhape, 50));
            cmd.Parameters.AddWithValue("radio",           req.Radio);
            cmd.Parameters.AddWithValue("comentario",      (object?)req.Comentario ?? DBNull.Value);
            cmd.Parameters.AddWithValue("codiPedido",      Truncate(req.CodiPedido, 50));
            cmd.Parameters.AddWithValue("codiPedido2",     Truncate(req.CodiPedido2, 50));
            cmd.Parameters.AddWithValue("tipoPedido",      Truncate(req.TipoPedido, 50));
            cmd.Parameters.AddWithValue("caliPedido",      Truncate(req.CaliPedido, 50));
            cmd.Parameters.AddWithValue("importancia",     Truncate(req.Importancia, 50));
            cmd.Parameters.AddWithValue("prioridad",       Truncate(req.Prioridad, 50));
            cmd.Parameters.AddWithValue("dispTelefonico",  Truncate(req.DispTelefonico, 100));
            cmd.Parameters.AddWithValue("celdaMarcacion",  Truncate(req.CeldaMarcacion, 100));
            cmd.Parameters.AddWithValue("canales",
                req.CanalesSeleccionados.Count > 0
                    ? string.Join(",", req.CanalesSeleccionados)
                    : (object)DBNull.Value);
            cmd.Parameters.AddWithValue("canalFuerza",     Truncate(req.CanalFuerza, 50));
            cmd.Parameters.AddWithValue("enviar",          Truncate(string.IsNullOrWhiteSpace(req.Enviar) ? "N" : req.Enviar, 5));
            cmd.Parameters.AddWithValue("estado",          Truncate(string.IsNullOrWhiteSpace(req.Estado) ? "A" : req.Estado, 20));
            cmd.Parameters.AddWithValue("pedidoPadreSitio",(object?)req.PedidoPadreSitio ?? DBNull.Value);
            cmd.Parameters.AddWithValue("pedidoPadreNum",  (object?)req.PedidoPadreNum ?? DBNull.Value);
            cmd.Parameters.AddWithValue("usuario",         usuario);
            cmd.Parameters.AddWithValue("maquina",         Truncate(maquina, 100));
        }

        private static DtoEventoListItem MapEventoListItem(NpgsqlDataReader r) => new()
        {
            Id                       = r.GetInt64(0),
            SitioGraba               = r.IsDBNull(1)  ? 0    : r.GetInt32(1),
            NumeLlamada              = r.IsDBNull(2)  ? null : r.GetInt64(2),
            HoraCaso                 = r.IsDBNull(3)  ? null : r.GetDateTime(3),
            NumeTelefono             = r.IsDBNull(4)  ? null : r.GetInt64(4),
            DireCaso                 = r.IsDBNull(5)  ? ""   : r.GetString(5),
            Estado                   = r.IsDBNull(6)  ? ""   : r.GetString(6),
            Enviar                   = r.IsDBNull(7)  ? ""   : r.GetString(7),
            CodiPedido               = r.IsDBNull(8)  ? ""   : r.GetString(8),
            CodiPedido2              = r.IsDBNull(9)  ? ""   : r.GetString(9),
            Comentario               = r.IsDBNull(10) ? ""   : r.GetString(10),
            Prioridad                = r.IsDBNull(11) ? ""   : r.GetString(11),
            CaliPedido               = r.IsDBNull(12) ? ""   : r.GetString(12),
            Ciudad                   = r.IsDBNull(13) ? ""   : r.GetString(13),
            UsernameCreacion         = r.IsDBNull(14) ? ""   : r.GetString(14),
            FechaCreacion            = r.IsDBNull(15) ? null : r.GetDateTime(15),
            DescPedido               = r.IsDBNull(16) ? ""   : r.GetString(16),
            FechaPrimerAcceso        = r.IsDBNull(17) ? null : r.GetDateTime(17),
            TotalActuacionesActivas  = r.IsDBNull(18) ? 0    : r.GetInt32(18),
            // col 19: cad_eventos.id — el número oficial del evento para el despachador
            NumeEvento               = r.IsDBNull(19) ? null : r.GetInt64(19),
            // col 20: cad_eventos.origen — canal de origen (PLANTATEL, RECEPCION, MANUAL, etc.)
            Origen                   = r.IsDBNull(20) ? "MANUAL" : r.GetString(20),
            // col 21: nombre del llamante / afectado (cad_pedidos.nomb_llamante)
            NombLlamante             = r.IsDBNull(21) ? "" : r.GetString(21)
        };

        private static DtoPedidoListItem MapListItem(NpgsqlDataReader r) => new()
        {
            Id               = r.GetInt64(0),
            SitioGraba       = r.IsDBNull(1)  ? 0  : r.GetInt32(1),
            NumeLlamada      = r.IsDBNull(2)  ? null : r.GetInt64(2),
            HoraCaso         = r.IsDBNull(3)  ? null : r.GetDateTime(3),
            NumeTelefono     = r.IsDBNull(4)  ? null : r.GetInt64(4),
            DireCaso         = r.IsDBNull(5)  ? ""  : r.GetString(5),
            Estado           = r.IsDBNull(6)  ? ""  : r.GetString(6),
            Enviar           = r.IsDBNull(7)  ? ""  : r.GetString(7),
            CodiPedido       = r.IsDBNull(8)  ? ""  : r.GetString(8),
            CodiPedido2      = r.IsDBNull(9)  ? ""  : r.GetString(9),
            Comentario       = r.IsDBNull(10) ? ""  : r.GetString(10),
            UsernameCreacion = r.IsDBNull(11) ? ""  : r.GetString(11),
            FechaCreacion    = r.IsDBNull(12) ? null : r.GetDateTime(12)
        };

        private static DtoPedidoDetalle MapDetalle(NpgsqlDataReader r) => new()
        {
            Id               = r.GetInt64(0),
            SitioGraba       = r.IsDBNull(1)  ? 0    : r.GetInt32(1),
            NumeLlamada      = r.IsDBNull(2)  ? null  : r.GetInt64(2),
            HoraCaso         = r.IsDBNull(3)  ? null  : r.GetDateTime(3),
            NumeTelefono     = r.IsDBNull(4)  ? null  : r.GetInt64(4),
            PropTelefono     = r.IsDBNull(5)  ? ""    : r.GetString(5),
            NombLlamante     = r.IsDBNull(6)  ? ""    : r.GetString(6),
            Barrio           = r.IsDBNull(7)  ? ""    : r.GetString(7),
            Ciudad           = r.IsDBNull(8)  ? ""    : r.GetString(8),
            DireLlamante     = r.IsDBNull(9)  ? ""    : r.GetString(9),
            DireCaso         = r.IsDBNull(10) ? ""    : r.GetString(10),
            LatitudCaso      = r.IsDBNull(11) ? ""    : r.GetString(11),
            LongitudCaso     = r.IsDBNull(12) ? ""    : r.GetString(12),
            Cordx            = r.IsDBNull(13) ? ""    : r.GetString(13),
            Cordy            = r.IsDBNull(14) ? ""    : r.GetString(14),
            Tiposhape        = r.IsDBNull(15) ? ""    : r.GetString(15),
            Radio            = r.IsDBNull(16) ? 0     : r.GetInt32(16),
            Comentario       = r.IsDBNull(17) ? ""    : r.GetString(17),
            CodiPedido       = r.IsDBNull(18) ? ""    : r.GetString(18),
            CodiPedido2      = r.IsDBNull(19) ? ""    : r.GetString(19),
            TipoPedido       = r.IsDBNull(20) ? ""    : r.GetString(20),
            CaliPedido       = r.IsDBNull(21) ? ""    : r.GetString(21),
            Importancia      = r.IsDBNull(22) ? ""    : r.GetString(22),
            Prioridad        = r.IsDBNull(23) ? ""    : r.GetString(23),
            DispTelefonico   = r.IsDBNull(24) ? ""    : r.GetString(24),
            CeldaMarcacion   = r.IsDBNull(25) ? ""    : r.GetString(25),
            Canales          = r.IsDBNull(26) ? ""    : r.GetString(26),
            CanalFuerza      = r.IsDBNull(27) ? ""    : r.GetString(27),
            Enviar           = r.IsDBNull(28) ? ""    : r.GetString(28),
            Estado           = r.IsDBNull(29) ? ""    : r.GetString(29),
            PedidoPadreSitio = r.IsDBNull(30) ? null  : r.GetInt32(30),
            PedidoPadreNum   = r.IsDBNull(31) ? null  : r.GetInt64(31),
            UsernameCreacion = r.IsDBNull(32) ? ""    : r.GetString(32),
            FechaCreacion    = r.IsDBNull(33) ? null  : r.GetDateTime(33),
            DescPedido       = r.IsDBNull(34) ? ""    : r.GetString(34),
            DescPedido2      = r.IsDBNull(35) ? ""    : r.GetString(35),
            // ── Datos del evento ──────────────────────────────────────────────
            EventoId         = r.IsDBNull(36) ? null  : r.GetInt64(36),
            CanalCodigo      = r.IsDBNull(37) ? 0     : r.GetInt32(37),
            CanalDescripcion = r.IsDBNull(38) ? ""    : r.GetString(38),
            FuerzaDescripcion= r.IsDBNull(39) ? ""    : r.GetString(39),
            FechaCierre      = r.IsDBNull(40) ? null  : r.GetDateTime(40),
            ObservacionCierre= r.IsDBNull(41) ? ""    : r.GetString(41),
            UsuarioCierre    = r.IsDBNull(42) ? ""    : r.GetString(42),
            // ── Trazabilidad: último acceso registrado ─────────────────────────
            UltimoAccesoUsername = r.IsDBNull(43) ? null : r.GetString(43),
            UltimoAccesoFecha    = r.IsDBNull(44) ? null : r.GetDateTime(44),
            // Estado propio de cad_eventos (P/D/A/C/V) — dominio distinto al de cad_pedidos.estado.
            EventoEstado         = r.IsDBNull(45) ? null : r.GetString(45)
        };

        private static async Task<List<DtoCodigoCierrePedido>> GetCodigosCierreAsync(
            long eventoId, NpgsqlConnection conn, CancellationToken ct)
        {
            var result = new List<DtoCodigoCierrePedido>();
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
SELECT orden, codigo_cierre, tipo_codigo, COALESCE(descripcion_libre, '') AS descripcion_libre
FROM   cad_eventos_codigos_cierre
WHERE  evento_id = @eventoId
ORDER  BY orden";
            cmd.Parameters.AddWithValue("eventoId", eventoId);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                result.Add(new DtoCodigoCierrePedido
                {
                    Orden            = r.GetInt16(0),
                    CodigoCierre     = r.IsDBNull(1) ? "" : r.GetString(1),
                    TipoCodigo       = r.IsDBNull(2) ? "" : r.GetString(2),
                    DescripcionLibre = r.GetString(3)
                });
            }
            return result;
        }

        private static DtoAnotacion MapAnotacion(NpgsqlDataReader r) => new()
        {
            Id               = r.GetInt64(0),
            IdPedido         = r.GetInt64(1),
            Titulo           = r.IsDBNull(2) ? "" : r.GetString(2),
            Anotacion        = r.IsDBNull(3) ? "" : r.GetString(3),
            TipoAnotacion    = r.IsDBNull(4) ? "" : r.GetString(4),
            UsuarioCreacion  = r.IsDBNull(5) ? null : r.GetInt64(5),
            UsernameCreacion = r.IsDBNull(6) ? "" : r.GetString(6),
            FechaCreacion    = r.IsDBNull(7) ? null : r.GetDateTime(7),
            MaquinaCreacion  = r.IsDBNull(8) ? "" : r.GetString(8)
        };

        private static DtoPedidoAsociar MapAsociar(NpgsqlDataReader r) => new()
        {
            Id           = r.GetInt64(0),
            NumeLlamada  = r.IsDBNull(1) ? null : r.GetInt64(1),
            HoraCaso     = r.IsDBNull(2) ? "" : r.GetDateTime(2).ToString("dd/MM/yyyy HH:mm:ss"),
            NumeTelefono = r.IsDBNull(3) ? null : r.GetInt64(3),
            CaliPedido   = r.IsDBNull(4) ? "" : r.GetString(4),
            Ciudad       = r.IsDBNull(5) ? "" : r.GetString(5),
            NombLlamante = r.IsDBNull(6) ? "" : r.GetString(6),
            DireCaso     = r.IsDBNull(7) ? "" : r.GetString(7),
            CodiPedido   = r.IsDBNull(8) ? "" : r.GetString(8),
            Estado       = r.IsDBNull(9) ? "" : r.GetString(9),
            SitioGraba   = r.IsDBNull(10) ? 0 : r.GetInt32(10)
        };

        private static string Truncate(string? value, int maxLen)
        {
            var s = (value ?? string.Empty).Trim();
            return s.Length > maxLen ? s[..maxLen] : s;
        }

        private static object NullOrString(string? value) =>
            string.IsNullOrWhiteSpace(value) ? DBNull.Value : value;
    }
}
