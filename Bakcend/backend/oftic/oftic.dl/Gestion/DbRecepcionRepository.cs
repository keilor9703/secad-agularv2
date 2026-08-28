using Comun.Dtos.Eventos;
using Comun.Dtos.Recepcion;
using Comun.Snowflake;
using Datos.Interfaz;
using Datos.Tenant;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace Datos.Gestion
{
    public class DbRecepcionRepository : IDbRecepcionRepository
    {
        private readonly TenantContext              _tenant;
        private readonly ILogger<DbRecepcionRepository> _logger;
        private readonly ISnowflakeGenerator        _snowflake;

        // Formato heredado del SECAD JS original (obtenerFechaActual / txtFechaIngreso)
        private const string HoraFormat    = "dd/MM/yyyy HH:mm:ss";
        private const string TsFormat      = "dd/MM/yyyy HH:mm:ss";

        public DbRecepcionRepository(
            TenantContext tenant,
            ILogger<DbRecepcionRepository> logger,
            ISnowflakeGenerator snowflake)
        {
            _tenant    = tenant;
            _logger    = logger;
            _snowflake = snowflake;
        }

        // ════════════════════════════════════════════════════════════════════════
        // PLANTATEL / INCOMING CALL
        // ════════════════════════════════════════════════════════════════════════

        public async Task<DtoLlamadaEntrante?> F_GetLlamadasAsync(
    int sitioGraba, int acd, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx = await conn.BeginTransactionAsync(ct);

            try
            {
                long id = 0;
                long numeTelefono = 0;
                bool found;

                // FOR UPDATE SKIP LOCKED: si dos pollers concurrentes llegan a la vez,
                // el segundo salta esta fila (ya bloqueada por el primero).
                await using (var cmd = conn.CreateCommand())
                {
                    cmd.Transaction = tx;
                    cmd.CommandText = @"
                SELECT id, nume_telefono
                FROM   cad_plantatel
                WHERE  sitio_graba = @sg AND acd = @acd AND registrada = 'N'
                ORDER  BY fecha_registro ASC
                LIMIT  1
                FOR UPDATE SKIP LOCKED";
                    cmd.Parameters.AddWithValue("sg", sitioGraba);
                    cmd.Parameters.AddWithValue("acd", acd);

                    await using var rdr = await cmd.ExecuteReaderAsync(ct);
                    found = await rdr.ReadAsync(ct);
                    if (found)
                    {
                        id = rdr.GetInt64(0);
                        numeTelefono = rdr.IsDBNull(1) ? 0 : rdr.GetInt64(1);
                    }
                } // 👈 AQUÍ se liberan rdr y cmd → la conexión queda libre

                // Ahora sí es seguro operar sobre la transacción
                if (!found || numeTelefono == 0)
                {
                    await tx.RollbackAsync(ct);
                    return null;
                }

                // Generar ID Snowflake — sin round-trip a la BD
                long numeLlamada = _snowflake.NextId();

                // Marcar SOLO la fila leída
                await using (var upd = conn.CreateCommand())
                {
                    upd.Transaction = tx;
                    upd.CommandText = @"
                UPDATE cad_plantatel
                SET    registrada = 'S'
                WHERE  id = @id";
                    upd.Parameters.AddWithValue("id", id);
                    await upd.ExecuteNonQueryAsync(ct);
                }

                await tx.CommitAsync(ct);

                return new DtoLlamadaEntrante
                {
                    NUME_LLAMADA = numeLlamada,
                    NUME_TELEFONO = numeTelefono,
                    CORDX = "0",
                    CORDY = "0",
                    TIPOSHAPE = "Nulo",
                    RADIO = 0,
                    FECHAGMLC = DateTime.Now.ToString(HoraFormat),
                    OPERADOR = ""
                };
            }
            catch (Exception ex)
            {
                // Aquí el reader ya fue liberado (el 'using' lo dispone al propagarse
                // la excepción), así que el rollback es seguro.
                await tx.RollbackAsync(ct);
                _logger.LogError(ex, "Error al obtener llamada PlantaTel sitioGraba={Sg} acd={Acd}", sitioGraba, acd);
                throw;
            }
        }
        public async Task<DtoPlantaTelEntradaResult> P_RegistrarLlamadaPlantaTelAsync(
            int sitioGraba, int acd, long numeTelefono, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
                INSERT INTO cad_plantatel (sitio_graba, acd, nume_telefono, registrada, fecha_registro)
                VALUES (@sg, @acd, @tel, 'N', NOW())
                RETURNING id";
            cmd.Parameters.AddWithValue("sg",  sitioGraba);
            cmd.Parameters.AddWithValue("acd", acd);
            cmd.Parameters.AddWithValue("tel", numeTelefono);

            var id = (long)(await cmd.ExecuteScalarAsync(ct))!;

            return new DtoPlantaTelEntradaResult
            {
                Success = true,
                Message = "Llamada PlantaTel registrada.",
                Id      = id
            };
        }

        // ════════════════════════════════════════════════════════════════════════
        // ID GENERATION (Snowflake — sin acceso a BD)
        // ════════════════════════════════════════════════════════════════════════

        public Task<long> F_ConsultarSeqPedidoAsync(CancellationToken ct)
            => Task.FromResult(_snowflake.NextId());

        // ════════════════════════════════════════════════════════════════════════
        // CATALOG LOOKUPS
        // ════════════════════════════════════════════════════════════════════════

        public async Task<List<DtoCasoItem>> F_GetCasosIntelAsync(
            string busqueda, CancellationToken ct)
        {
            var result = new List<DtoCasoItem>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
                SELECT c.codigo          AS CODIGO_CASO,
                       c.descripcion     AS DESCRIPCION_CASO,
                       c.id_categoria_asistente,
                       cat.codigo        AS CATEGORIA_CODIGO,
                       cat.descripcion   AS CATEGORIA_DESCRIPCION
                FROM   cad_casos c
                LEFT   JOIN cad_asistente_categorias cat
                         ON cat.id = c.id_categoria_asistente
                WHERE (UPPER(c.codigo)       LIKE '%' || UPPER(@b) || '%'
                    OR UPPER(c.descripcion)  LIKE '%' || UPPER(@b) || '%')
                  AND c.vigente = 'S'
                ORDER  BY c.descripcion
                LIMIT  50";
            cmd.Parameters.AddWithValue("b", busqueda ?? "");
            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            while (await rdr.ReadAsync(ct))
                result.Add(new DtoCasoItem
                {
                    CODIGO_CASO            = rdr.IsDBNull(0) ? "" : rdr.GetString(0),
                    DESCRIPCION_CASO       = rdr.IsDBNull(1) ? "" : rdr.GetString(1),
                    ID_CATEGORIA_ASISTENTE = rdr.IsDBNull(2) ? null : rdr.GetInt64(2).ToString(),
                    CATEGORIA_CODIGO       = rdr.IsDBNull(3) ? null : rdr.GetString(3),
                    CATEGORIA_DESCRIPCION  = rdr.IsDBNull(4) ? null : rdr.GetString(4)
                });
            return result;
        }

        public async Task<DtoCasoItem?> F_GetCasoPorCodigoAsync(
            string codigo, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
                SELECT c.codigo          AS CODIGO_CASO,
                       c.descripcion     AS DESCRIPCION_CASO,
                       c.id_categoria_asistente,
                       cat.codigo        AS CATEGORIA_CODIGO,
                       cat.descripcion   AS CATEGORIA_DESCRIPCION
                FROM   cad_casos c
                LEFT   JOIN cad_asistente_categorias cat
                         ON cat.id = c.id_categoria_asistente
                WHERE  TRIM(UPPER(c.codigo)) = TRIM(UPPER(@c))
                LIMIT  1";
            cmd.Parameters.Add("c", NpgsqlTypes.NpgsqlDbType.Varchar).Value = codigo ?? "";
            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            if (!await rdr.ReadAsync(ct)) return null;
            return new DtoCasoItem
            {
                CODIGO_CASO            = rdr.IsDBNull(0) ? "" : rdr.GetString(0),
                DESCRIPCION_CASO       = rdr.IsDBNull(1) ? "" : rdr.GetString(1),
                ID_CATEGORIA_ASISTENTE = rdr.IsDBNull(2) ? null : rdr.GetInt64(2).ToString(),
                CATEGORIA_CODIGO       = rdr.IsDBNull(3) ? null : rdr.GetString(3),
                CATEGORIA_DESCRIPCION  = rdr.IsDBNull(4) ? null : rdr.GetString(4)
            };
        }

        public async Task<List<DtoCanalRecepcion>> F_GetCanalesAsync(
            int sitioGraba, CancellationToken ct)
        {
            var result = new List<DtoCanalRecepcion>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
                SELECT r.codigo, r.descripcion, f.descripcion AS fuerza, f.id AS fuerza_id
                FROM   cad_canales r
                JOIN   cad_fuerzas f ON r.cadfuerz_id = f.id
                WHERE  f.sitio_graba = @sg AND r.vigente = 'S'
                ORDER  BY f.descripcion ASC, r.descripcion ASC";
            cmd.Parameters.AddWithValue("sg", sitioGraba);
            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            while (await rdr.ReadAsync(ct))
                result.Add(new DtoCanalRecepcion
                {
                    Codigo      = rdr.IsDBNull(0) ? 0  : rdr.GetInt32(0),
                    Descripcion = rdr.IsDBNull(1) ? "" : rdr.GetString(1),
                    Fuerza      = rdr.IsDBNull(2) ? "" : rdr.GetString(2),
                    FuerzaId    = rdr.IsDBNull(3) ? 0  : rdr.GetInt32(3)
                });
            return result;
        }

        public async Task<List<DtoReferenciaSecad>> F_GetReferenciasAsync(
            string nombre, CancellationToken ct)
        {
            var result = new List<DtoReferenciaSecad>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
                SELECT nombre, codigo, descripcion, COALESCE(abreviatura,'')
                FROM   cad_referencias_secad
                WHERE  nombre = @n
                ORDER  BY descripcion";
            cmd.Parameters.AddWithValue("n", nombre ?? "");
            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            while (await rdr.ReadAsync(ct))
                result.Add(new DtoReferenciaSecad
                {
                    Nombre      = rdr.IsDBNull(0) ? "" : rdr.GetString(0),
                    Codigo      = rdr.IsDBNull(1) ? "" : rdr.GetString(1),
                    Descripcion = rdr.IsDBNull(2) ? "" : rdr.GetString(2),
                    Abreviatura = rdr.IsDBNull(3) ? "" : rdr.GetString(3)
                });
            return result;
        }

        public async Task<List<DtoLlamadaAsociar>> F_BuscarLlamadasAsociarAsync(
            int sitioGraba, string horaCaso, long numeLlamada, CancellationToken ct)
        {
            var result = new List<DtoLlamadaAsociar>();
            if (!DateTime.TryParseExact(horaCaso, HoraFormat,
                    System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.None, out var fechaRef))
                fechaRef = DateTime.UtcNow;

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
                SELECT a.nume_llamada,
                       TO_CHAR(a.hora_caso AT TIME ZONE 'America/Bogota','DD/MM/YYYY HH24:MI:SS'),
                       a.nume_telefono,
                       COALESCE(a.cali_pedido,''),
                       COALESCE(l.descripcion,''),
                       COALESCE(a.nomb_llamante,''),
                       COALESCE(a.dire_caso,''),
                       COALESCE(a.codi_pedido,''),
                       COALESCE(a.estado,''),
                       a.sitio_graba
                FROM   cad_pedidos a
                LEFT   JOIN cad_lugares_geograficos l ON l.codigo = a.luge_codigo
                WHERE  a.sitio_graba = @sg
                  AND  a.estado NOT IN ('C','V')
                  AND  COALESCE(TRIM(a.codi_pedido),'0') <> '900'
                  AND  a.hora_caso <= @ref
                  AND  a.hora_caso  > @ref - INTERVAL '200 minutes'
                  AND  a.cadpedi_nume_llamada IS NULL
                  AND  a.nume_llamada <> @id
                ORDER  BY a.hora_caso DESC";
            cmd.Parameters.AddWithValue("sg",  sitioGraba);
            cmd.Parameters.AddWithValue("ref", fechaRef);
            cmd.Parameters.AddWithValue("id",  numeLlamada);
            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            while (await rdr.ReadAsync(ct))
                result.Add(new DtoLlamadaAsociar
                {
                    NUME_LLAMADA  = rdr.IsDBNull(0) ? 0  : rdr.GetInt64(0),
                    HORA_CASO     = rdr.IsDBNull(1) ? "" : rdr.GetString(1),
                    NUME_TELEFONO = rdr.IsDBNull(2) ? 0  : rdr.GetInt64(2),
                    CALI_PEDIDO   = rdr.IsDBNull(3) ? "" : rdr.GetString(3),
                    CIUDAD        = rdr.IsDBNull(4) ? "" : rdr.GetString(4),
                    NOMB_LLAMANTE = rdr.IsDBNull(5) ? "" : rdr.GetString(5),
                    DIRE_CASO     = rdr.IsDBNull(6) ? "" : rdr.GetString(6),
                    CODI_PEDIDO   = rdr.IsDBNull(7) ? "" : rdr.GetString(7),
                    ESTADO        = rdr.IsDBNull(8) ? "" : rdr.GetString(8),
                    SITIO_GRABA   = rdr.IsDBNull(9) ? 0  : rdr.GetInt32(9)
                });
            return result;
        }

        // ════════════════════════════════════════════════════════════════════════
        // GUARDAR LLAMADA COMPLETA
        // Inserta: cad_pedidos → cad_eventos → cad_pedidos_canales (por canal)
        // Todo dentro de una sola transacción.
        // ════════════════════════════════════════════════════════════════════════

        public async Task<DtoRecepcionResult> P_GuardarLlamadaAsync(
            DtoRecepcion d, int canalFuerza, string usuario, long idEmpleado, CancellationToken ct)
        {
            // El formulario de Recepción en Angular ya exige lat/lng, pero solo del
            // lado del cliente — sin esto, un pedido sin coordenadas queda invisible
            // en el Mapa de Incidentes y fuera de la detección de duplicados cercanos.
            if (string.IsNullOrWhiteSpace(d.LATITUD_CASO) || string.IsNullOrWhiteSpace(d.LONGITUD_CASO))
                return new DtoRecepcionResult { Success = false, Message = "Latitud y longitud del caso son obligatorias." };

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx   = await conn.BeginTransactionAsync(ct);

            try
            {
                var (codiBarrio, lugeBarrio, barrioNoEncontrado) =
                    await BuscarBarrioAsync(conn, tx, d.SITIO_GRABA, d.BARRIO, d.CIUDAD, ct);

                // Si el parseo falla, horaCaso queda en default(DateTime) — se
                // degrada a DateTime.Now en el binding de abajo en vez de DBNull,
                // porque hora_caso es NOT NULL: un DBNull explícito en un INSERT
                // que sí lista la columna revienta la transacción entera por un
                // simple problema de formato (no aplica el DEFAULT NOW() de la
                // columna, eso solo pasa si la columna se omite del INSERT).
                DateTime.TryParseExact(d.HORA_CASO, HoraFormat,
                    System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.None, out var horaCaso);

                // ── 1. INSERT cad_pedidos ─────────────────────────────────────
                long newPedidoId = _snowflake.NextId();
                await using (var ins = conn.CreateCommand())
                {
                    ins.Transaction = tx;
                    ins.CommandText = @"
INSERT INTO cad_pedidos
    (id,
     sitio_graba, nume_llamada, hora_caso, fech_caso,
     disp_telefonico, celda_marcacion,
     nume_telefono, prop_telefono,
     luge_codigo,
     tipo_pedido, cali_pedido,
     nomb_llamante, dire_llamante,
     luge_barrio, dire_caso, codi_barrio,
     latitud_caso, longitud_caso,
     comentario, codi_pedido, importancia, prioridad, codi_pedido2,
     estado, enviar,
     cadusua_usuario, cadpoli_cedu_empleado,
     cadpedi_sitio_graba, cadpedi_nume_llamada,
     fecha_creacion, total_canales,
     barrio, ciudad)
VALUES
    (@newPedidoId,
     @sg, @nl, @hc, @hc,
     @disp, @celda,
     @tel, @propTel,
     @luge,
     @tpedido, @cpedido,
     @nomb, @direl,
     @lugeB, @direc, @codiB,
     @lat, @lon,
     @coment, @codi, @impo, @prio, @codi2,
     @estado, @enviar,
     @usuario, @empleado,
     @cadiSitio, @cadiNum,
     NOW(), 'N',
     @barrio, @ciudad)";
                    ins.Parameters.AddWithValue("newPedidoId", newPedidoId);

                    ins.Parameters.AddWithValue("sg",       d.SITIO_GRABA);
                    ins.Parameters.AddWithValue("nl",       d.NUME_LLAMADA);
                    ins.Parameters.AddWithValue("hc",       horaCaso == default ? (object)DateTime.Now : horaCaso);
                    ins.Parameters.AddWithValue("disp",     NullOrString(d.DISP_TELEFONICO));
                    ins.Parameters.AddWithValue("celda",    NullOrString(d.OPERADOR));
                    ins.Parameters.AddWithValue("tel",      d.NUME_TELEFONO);
                    ins.Parameters.AddWithValue("propTel",  NullOrString(d.PROP_TELEFONO));
                    ins.Parameters.AddWithValue("luge",     lugeBarrio == 0 ? (object)DBNull.Value : lugeBarrio);
                    ins.Parameters.AddWithValue("tpedido",  NullOrString(d.TIPO_PEDIDO));
                    ins.Parameters.AddWithValue("cpedido",  NullOrString(d.CALI_PEDIDO));
                    ins.Parameters.AddWithValue("nomb",     NullOrString(d.NOMB_LLAMANTE));
                    ins.Parameters.AddWithValue("direl",    NullOrString(d.DIRE_LLAMANTE));
                    ins.Parameters.AddWithValue("lugeB",    lugeBarrio == 0 ? (object)DBNull.Value : lugeBarrio);
                    ins.Parameters.AddWithValue("direc",    NullOrString(d.DIRE_CASO));
                    ins.Parameters.AddWithValue("codiB",    codiBarrio == 0 ? (object)DBNull.Value : codiBarrio);
                    ins.Parameters.AddWithValue("lat",      NullOrString(d.LATITUD_CASO));
                    ins.Parameters.AddWithValue("lon",      NullOrString(d.LONGITUD_CASO));
                    ins.Parameters.AddWithValue("coment",   NullOrString(d.COMENTARIO));
                    ins.Parameters.AddWithValue("codi",     NullOrString(d.CODI_PEDIDO));
                    ins.Parameters.AddWithValue("impo",     NullOrString(d.IMPORTANCIA));
                    ins.Parameters.AddWithValue("prio",     NullOrString(d.PRIORIDAD));
                    ins.Parameters.AddWithValue("codi2",    NullOrString(d.CODI_PEDIDO2));
                    ins.Parameters.AddWithValue("estado",   NullOrString(d.ESTADO));
                    ins.Parameters.AddWithValue("enviar",   NullOrString(d.ENVIAR));
                    ins.Parameters.AddWithValue("usuario",  NullOrString(usuario));
                    ins.Parameters.AddWithValue("empleado", idEmpleado == 0 ? (object)DBNull.Value : idEmpleado);
                    // cadpedi_sitio_graba es INTEGER — castear, no bindear como texto
                    // (con AddWithValue(string) Npgsql infiere `text` y Postgres rechaza
                    // el INSERT con 42804 "column is of type integer but expression is of type text").
                    ins.Parameters.AddWithValue("cadiSitio", string.IsNullOrWhiteSpace(d.CADPEDI_SITIO_GRABA)
                                                            ? (object)DBNull.Value
                                                            : Convert.ToInt32(d.CADPEDI_SITIO_GRABA));
                    ins.Parameters.AddWithValue("cadiNum",  string.IsNullOrWhiteSpace(d.CADPEDI_NUME_LLAMADA)
                                                            ? (object)DBNull.Value
                                                            : Convert.ToInt64(d.CADPEDI_NUME_LLAMADA));
                    ins.Parameters.AddWithValue("barrio",   NullOrString(d.BARRIO));
                    ins.Parameters.AddWithValue("ciudad",   NullOrString(d.CIUDAD));
                    await ins.ExecuteNonQueryAsync(ct);
                }

                // ── 2. Generar ID del evento (Snowflake — sin round-trip) ─────
                long numeEvento   = _snowflake.NextId();
                // fuerza_id/canal_codigo deben ser los del CANAL elegido, no los del
                // operador que digita — SECAD es multi-agencia y un operador de la
                // Fuerza A puede despachar a un canal de la Fuerza B. Usar canalFuerza
                // (fuerza del operador) aquí corrompía cad_eventos.fuerza_id en despacho
                // cruzado, afectando reportes por fuerza (DbReporteRepository) y el JOIN
                // a cad_canales (que exige (codigo, cadfuerz_id) exactos).
                int  canalPrimario = d.CANALES_SELECCIONADOS.Count > 0
                                   ? d.CANALES_SELECCIONADOS[0].Codigo : 0;
                int  fuerzaCanal   = d.CANALES_SELECCIONADOS.Count > 0
                                   ? d.CANALES_SELECCIONADOS[0].FuerzaId : canalFuerza;
                string origenEvento = string.IsNullOrWhiteSpace(d.Origen)
                                    ? OrigenEvento.Recepcion : d.Origen;

                // ── 3. INSERT cad_eventos ─────────────────────────────────────
                await using (var insEvt = conn.CreateCommand())
                {
                    insEvt.Transaction  = tx;
                    insEvt.CommandText  = @"
INSERT INTO cad_eventos (
    id, sitio_graba, origen,
    pedido_id, pedido_sitio_graba,
    fuerza_id, canal_codigo,
    cedu_empleado, usuario_genera, tipo_despachador,
    estado, fecha_creacion
) VALUES (
    @id, @sg, @origen,
    @pedidoId, @pedidoSg,
    @fuerzaId, @canal,
    @cedu, @usuario, 'O',
    'P', NOW()
)";
                    insEvt.Parameters.AddWithValue("id",       numeEvento);
                    insEvt.Parameters.AddWithValue("sg",       d.SITIO_GRABA);
                    insEvt.Parameters.AddWithValue("origen",   origenEvento);
                    insEvt.Parameters.AddWithValue("pedidoId", newPedidoId);   // cad_pedidos.id Snowflake
                    insEvt.Parameters.AddWithValue("pedidoSg", d.SITIO_GRABA);
                    insEvt.Parameters.AddWithValue("fuerzaId", fuerzaCanal == 0
                                                       ? (object)DBNull.Value : fuerzaCanal);
                    insEvt.Parameters.AddWithValue("canal",    canalPrimario == 0
                                                       ? (object)DBNull.Value : canalPrimario);
                    // cedu_empleado = VARCHAR(20): guardar solo si cabe.
                    // Un id interno tipo Snowflake (≤19 dígitos) cabe; si por alguna
                    // razón fuera mayor, se guarda NULL para no romper la transacción.
                    var ceduStr = idEmpleado == 0 ? null : idEmpleado.ToString();
                    insEvt.Parameters.AddWithValue("cedu",
                        ceduStr is null || ceduStr.Length > 20
                        ? (object)DBNull.Value
                        : ceduStr);
                    insEvt.Parameters.AddWithValue("usuario",  usuario);
                    await insEvt.ExecuteNonQueryAsync(ct);
                }

                // ── 4. INSERT cad_pedidos_canales (uno por canal notificado) ────────
                // IMPORTANTE: cad_pedidos_canales registra qué canales fueron notificados
                // de la llamada. NO se crean actuaciones aquí porque cad_actuaciones
                // representa el despacho explícito de un recurso por parte de un
                // despachador — eso ocurre cuando el operador asigna un medio en el
                // módulo de Eventos (POST /api/Actuaciones).
                foreach (var canal in d.CANALES_SELECCIONADOS)
                {
                    await using var insCan = conn.CreateCommand();
                    insCan.Transaction  = tx;
                    // La llave de canal es (Codigo, FuerzaId) — no solo el código.
                    // ON CONFLICT apunta al constraint único de V26.
                    insCan.CommandText  = @"
INSERT INTO cad_pedidos_canales
    (cadpedi_sitiograba, cadpedi_numellamada,
     cadcana_fuerz_id, cadcana_codigo,
     cali_pedido, comentario,
     estado, enviar,
     cadeven_sitio_graba, cadeven_nume_evento,
     fecha_grabacion, fecha_modificacion, usua_modifica)
VALUES
    (@sg, @nl, @fuerza, @canal,
     '01', @coment,
     @estado, @enviar,
     @sg, @evento,
     NOW(), NOW(), @usuario)
ON CONFLICT (cadpedi_sitiograba, cadpedi_numellamada, cadcana_fuerz_id, cadcana_codigo)
DO NOTHING";
                    insCan.Parameters.AddWithValue("sg",      d.SITIO_GRABA);
                    insCan.Parameters.AddWithValue("nl",      d.NUME_LLAMADA);
                    insCan.Parameters.AddWithValue("fuerza",  canal.FuerzaId);   // fuerza propia del canal
                    insCan.Parameters.AddWithValue("canal",   canal.Codigo);
                    insCan.Parameters.AddWithValue("coment",  NullOrString(d.COMENTARIO));
                    insCan.Parameters.AddWithValue("estado",  NullOrString(d.ESTADO));
                    insCan.Parameters.AddWithValue("enviar",  NullOrString(d.ENVIAR));
                    insCan.Parameters.AddWithValue("evento",  numeEvento);
                    insCan.Parameters.AddWithValue("usuario", NullOrString(usuario));
                    await insCan.ExecuteNonQueryAsync(ct);
                }

                await tx.CommitAsync(ct);

                var msg = barrioNoEncontrado
                    ? $"Llamada enviada ID: {d.NUME_LLAMADA} — Evento: {numeEvento}. Barrio \"{d.BARRIO}\" no encontrado."
                    : $"Llamada enviada ID: {d.NUME_LLAMADA} — Evento: {numeEvento}";

                // PedidoId = newPedidoId (cad_pedidos.id real, Snowflake generado aquí)
                // NO usar d.NUME_LLAMADA — ese es cad_pedidos.nume_llamada, distinto de .id
                return new DtoRecepcionResult { Success = true, Message = msg, EventoId = numeEvento, PedidoId = newPedidoId };
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync(ct);
                _logger.LogError(ex, "P_GuardarLlamada error");
                return new DtoRecepcionResult { Success = false, Message = $"Error al guardar la llamada: {ex.Message}" };
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // CIERRE RÁPIDO
        // Inserta cad_pedidos + cad_eventos con estado=V (anulado) en una tx.
        // ════════════════════════════════════════════════════════════════════════

        public async Task<DtoRecepcionResult> P_CerrarLlamadaRapidaAsync(
            DtoRecepcion d, string usuario, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx   = await conn.BeginTransactionAsync(ct);

            try
            {
                DateTime.TryParseExact(d.HORA_CASO, HoraFormat,
                    System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.None, out var horaCaso);

                // ── 1. INSERT cad_pedidos ─────────────────────────────────────
                // luge_codigo/luge_barrio/codi_barrio quedan NULL a propósito: son
                // codespaces de cad_lugares_geograficos (ciudad/municipio, resueltos
                // vía BuscarBarrioAsync en el flujo completo), un cierre rápido no
                // tiene ubicación real que resolver. Antes se insertaba d.SITIO_GRABA
                // (el ID de la consola, un codespace totalmente distinto) ahí, lo que
                // podía coincidir por casualidad con un código geográfico real y
                // producir datos de ubicación incorrectos mostrados como válidos.
                long newPedidoId = _snowflake.NextId();
                await using (var ins = conn.CreateCommand())
                {
                    ins.Transaction = tx;
                    ins.CommandText = @"
INSERT INTO cad_pedidos
    (id,
     sitio_graba, nume_llamada, hora_caso, fech_caso,
     nume_telefono, prop_telefono,
     luge_codigo, dire_caso, codi_barrio, luge_barrio,
     latitud_caso, longitud_caso,
     comentario, codi_pedido, importancia, prioridad,
     estado, enviar, cadusua_usuario,
     fecha_creacion, total_canales)
VALUES
    (@newPedidoId,
     @sg, @nl, @hc, @hc,
     @tel, @propTel,
     NULL, NULL, NULL, NULL,
     NULL, NULL,
     @coment, @codi, '01', '01',
     @estado, @enviar, @usuario,
     NOW(), 'N')";
                    ins.Parameters.AddWithValue("newPedidoId", newPedidoId);
                    ins.Parameters.AddWithValue("sg",      d.SITIO_GRABA);
                    ins.Parameters.AddWithValue("nl",      d.NUME_LLAMADA);
                    ins.Parameters.AddWithValue("hc",      horaCaso == default ? (object)DateTime.Now : horaCaso);
                    ins.Parameters.AddWithValue("tel",     d.NUME_TELEFONO);
                    ins.Parameters.AddWithValue("propTel", NullOrString(d.PROP_TELEFONO));
                    ins.Parameters.AddWithValue("coment",  NullOrString(d.COMENTARIO));
                    ins.Parameters.AddWithValue("codi",    NullOrString(d.CODI_PEDIDO));
                    ins.Parameters.AddWithValue("estado",  NullOrString(d.ESTADO));
                    ins.Parameters.AddWithValue("enviar",  NullOrString(d.ENVIAR));
                    ins.Parameters.AddWithValue("usuario", NullOrString(usuario));
                    await ins.ExecuteNonQueryAsync(ct);
                }

                // ── 2. INSERT cad_eventos con estado=V, cierre inmediato ──────
                long eventoId = _snowflake.NextId();
                await using (var insEvt = conn.CreateCommand())
                {
                    insEvt.Transaction = tx;
                    insEvt.CommandText = @"
INSERT INTO cad_eventos (
    id, sitio_graba, origen,
    pedido_id, pedido_sitio_graba,
    usuario_genera, tipo_despachador,
    estado, fecha_creacion, fecha_cierre
) VALUES (
    @id, @sg, @origen,
    @pedidoId, @pedidoSg,
    @usuario, 'O',
    'V', NOW(), NOW()
)";
                    insEvt.Parameters.AddWithValue("id",       eventoId);
                    insEvt.Parameters.AddWithValue("sg",       d.SITIO_GRABA);
                    insEvt.Parameters.AddWithValue("origen",   string.IsNullOrWhiteSpace(d.Origen)
                                                               ? OrigenEvento.Recepcion : d.Origen);
                    insEvt.Parameters.AddWithValue("pedidoId", newPedidoId);   // cad_pedidos.id Snowflake
                    insEvt.Parameters.AddWithValue("pedidoSg", d.SITIO_GRABA);
                    insEvt.Parameters.AddWithValue("usuario",  usuario);
                    await insEvt.ExecuteNonQueryAsync(ct);
                }

                await tx.CommitAsync(ct);
                return new DtoRecepcionResult { Success = true, Message = $"Llamada cerrada. ID: {d.NUME_LLAMADA}" };
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync(ct);
                _logger.LogError(ex, "P_CerrarLlamadaRapida error");
                return new DtoRecepcionResult { Success = false, Message = $"Error al cerrar la llamada: {ex.Message}" };
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // CONSULTAR EVENTO COMPLETO (con sus códigos de cierre)
        // ════════════════════════════════════════════════════════════════════════

        public async Task<DtoEvento?> G_GetEventoAsync(long eventoId, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);

            DtoEvento? evt = null;

            await using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"
SELECT e.id, e.sitio_graba, e.origen,
       e.origen_referencia_ext, e.integracion_cliente_id,
       COALESCE(ic.nombre,'')                       AS integracion_nombre,
       e.pedido_id, e.pedido_sitio_graba,
       COALESCE(TO_CHAR(p.hora_caso AT TIME ZONE 'America/Bogota',
                        'DD/MM/YYYY HH24:MI:SS'),'') AS hora_caso_pedido,
       COALESCE(p.dire_caso,'')                     AS direccion_caso,
       COALESCE(p.codi_pedido,'')                   AS codi_pedido,
       COALESCE(p.cali_pedido,'')                   AS cali_pedido,
       e.fuerza_id,
       COALESCE(f.descripcion,'')                   AS fuerza_desc,
       e.canal_codigo,
       COALESCE(c.descripcion,'')                   AS canal_desc,
       e.cedu_empleado, e.usuario_genera, e.tipo_despachador,
       e.estado,
       TO_CHAR(e.fecha_creacion AT TIME ZONE 'America/Bogota',
               'DD/MM/YYYY HH24:MI:SS')             AS fecha_creacion,
       TO_CHAR(e.fecha_despacho AT TIME ZONE 'America/Bogota',
               'DD/MM/YYYY HH24:MI:SS')             AS fecha_despacho,
       TO_CHAR(e.fecha_llegada  AT TIME ZONE 'America/Bogota',
               'DD/MM/YYYY HH24:MI:SS')             AS fecha_llegada,
       TO_CHAR(e.fecha_cierre   AT TIME ZONE 'America/Bogota',
               'DD/MM/YYYY HH24:MI:SS')             AS fecha_cierre,
       e.codigo_cierre_primario, e.clasif_cierre, e.observacion_cierre
FROM   cad_eventos e
LEFT   JOIN cad_integraciones_clientes ic ON ic.id  = e.integracion_cliente_id
LEFT   JOIN cad_pedidos p  ON p.sitio_graba = e.pedido_sitio_graba
                           AND p.id         = e.pedido_id
LEFT   JOIN cad_fuerzas f  ON f.id           = e.fuerza_id
LEFT   JOIN cad_canales c  ON c.codigo       = e.canal_codigo
                           AND c.cadfuerz_id = e.fuerza_id
WHERE  e.id = @id";
                cmd.Parameters.AddWithValue("id", eventoId);

                await using var rdr = await cmd.ExecuteReaderAsync(ct);
                if (!await rdr.ReadAsync(ct)) return null;

                evt = new DtoEvento
                {
                    Id                   = rdr.GetInt64(0),
                    SitioGraba           = rdr.GetInt32(1),
                    Origen               = rdr.IsDBNull(2)  ? "" : rdr.GetString(2),
                    OrigenReferenciaExt  = rdr.IsDBNull(3)  ? null : rdr.GetString(3),
                    IntegracionClienteId = rdr.IsDBNull(4)  ? null : rdr.GetInt32(4),
                    IntegracionNombre    = rdr.IsDBNull(5)  ? null : rdr.GetString(5),
                    PedidoId             = rdr.IsDBNull(6)  ? null : rdr.GetInt64(6),
                    PedidoSitioGraba     = rdr.IsDBNull(7)  ? null : rdr.GetInt32(7),
                    HoraCasoPedido       = rdr.IsDBNull(8)  ? "" : rdr.GetString(8),
                    DireccionCaso        = rdr.IsDBNull(9)  ? "" : rdr.GetString(9),
                    CodiPedido           = rdr.IsDBNull(10) ? "" : rdr.GetString(10),
                    CaliPedido           = rdr.IsDBNull(11) ? "" : rdr.GetString(11),
                    FuerzaId             = rdr.IsDBNull(12) ? null : rdr.GetInt32(12),
                    FuerzaDescripcion    = rdr.IsDBNull(13) ? "" : rdr.GetString(13),
                    CanalCodigo          = rdr.IsDBNull(14) ? null : rdr.GetInt32(14),
                    CanalDescripcion     = rdr.IsDBNull(15) ? "" : rdr.GetString(15),
                    CeduEmpleado         = rdr.IsDBNull(16) ? null : rdr.GetString(16),
                    UsuarioGenera        = rdr.IsDBNull(17) ? "" : rdr.GetString(17),
                    TipoDespachador      = rdr.IsDBNull(18) ? null : rdr.GetString(18),
                    Estado               = rdr.IsDBNull(19) ? "" : rdr.GetString(19),
                    FechaCreacion        = rdr.IsDBNull(20) ? "" : rdr.GetString(20),
                    FechaDespacho        = rdr.IsDBNull(21) ? null : rdr.GetString(21),
                    FechaLlegada         = rdr.IsDBNull(22) ? null : rdr.GetString(22),
                    FechaCierre          = rdr.IsDBNull(23) ? null : rdr.GetString(23),
                    CodigoCierrePrimario = rdr.IsDBNull(24) ? null : rdr.GetString(24),
                    ClasifCierre         = rdr.IsDBNull(25) ? null : rdr.GetString(25),
                    ObservacionCierre    = rdr.IsDBNull(26) ? null : rdr.GetString(26)
                };
            }

            // Cargar códigos de cierre asociados
            await using (var cmdCod = conn.CreateCommand())
            {
                cmdCod.CommandText = @"
SELECT orden, codigo_cierre, tipo_codigo, descripcion_libre
FROM   cad_eventos_codigos_cierre
WHERE  evento_id = @id
ORDER  BY orden";
                cmdCod.Parameters.AddWithValue("id", eventoId);
                await using var rdr2 = await cmdCod.ExecuteReaderAsync(ct);
                while (await rdr2.ReadAsync(ct))
                    evt.CodigosCierre.Add(new DtoCodigoCierreEvento
                    {
                        Orden            = rdr2.IsDBNull(0) ? 1  : rdr2.GetInt16(0),
                        CodigoCierre     = rdr2.IsDBNull(1) ? "" : rdr2.GetString(1),
                        TipoCodigo       = rdr2.IsDBNull(2) ? "" : rdr2.GetString(2),
                        DescripcionLibre = rdr2.IsDBNull(3) ? null : rdr2.GetString(3)
                    });
            }

            return evt;
        }

        // ════════════════════════════════════════════════════════════════════════
        // EVENTOS DE UN PEDIDO (para panel de detalle en Recepción o Eventos)
        // ════════════════════════════════════════════════════════════════════════

        public async Task<List<DtoEventoListItem>> G_GetEventosPorPedidoAsync(
            long pedidoId, CancellationToken ct)
        {
            var result = new List<DtoEventoListItem>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
SELECT e.id, e.origen, e.estado,
       e.pedido_id,
       COALESCE(p.dire_caso,'')  AS direccion_caso,
       COALESCE(p.codi_pedido,'') AS codi_pedido,
       COALESCE(p.cali_pedido,'') AS cali_pedido,
       COALESCE(f.descripcion,'') AS fuerza_desc,
       COALESCE(c.descripcion,'') AS canal_desc,
       TO_CHAR(e.fecha_creacion AT TIME ZONE 'America/Bogota','DD/MM/YYYY HH24:MI:SS'),
       TO_CHAR(e.fecha_despacho AT TIME ZONE 'America/Bogota','DD/MM/YYYY HH24:MI:SS'),
       TO_CHAR(e.fecha_cierre   AT TIME ZONE 'America/Bogota','DD/MM/YYYY HH24:MI:SS')
FROM   cad_eventos e
LEFT   JOIN cad_pedidos p ON p.id = e.pedido_id
LEFT   JOIN cad_fuerzas f ON f.id = e.fuerza_id
LEFT   JOIN cad_canales c ON c.codigo = e.canal_codigo AND c.cadfuerz_id = e.fuerza_id
WHERE  e.pedido_id = @pid
ORDER  BY e.fecha_creacion DESC";
            cmd.Parameters.AddWithValue("pid", pedidoId);
            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            while (await rdr.ReadAsync(ct))
                result.Add(new DtoEventoListItem
                {
                    Id            = rdr.GetInt64(0),
                    Origen        = rdr.IsDBNull(1)  ? "" : rdr.GetString(1),
                    Estado        = rdr.IsDBNull(2)  ? "" : rdr.GetString(2),
                    PedidoId      = rdr.IsDBNull(3)  ? null : rdr.GetInt64(3),
                    DireccionCaso = rdr.IsDBNull(4)  ? "" : rdr.GetString(4),
                    CodiPedido    = rdr.IsDBNull(5)  ? "" : rdr.GetString(5),
                    CaliPedido    = rdr.IsDBNull(6)  ? "" : rdr.GetString(6),
                    FuerzaDesc    = rdr.IsDBNull(7)  ? "" : rdr.GetString(7),
                    CanalDesc     = rdr.IsDBNull(8)  ? "" : rdr.GetString(8),
                    FechaCreacion = rdr.IsDBNull(9)  ? "" : rdr.GetString(9),
                    FechaDespacho = rdr.IsDBNull(10) ? null : rdr.GetString(10),
                    FechaCierre   = rdr.IsDBNull(11) ? null : rdr.GetString(11)
                });
            return result;
        }

        // ════════════════════════════════════════════════════════════════════════
        // ACTUALIZAR ESTADO OPERATIVO (Despachado / Atendido)
        // Solo cambia la marca de tiempo y el estado; sin códigos de cierre.
        // ════════════════════════════════════════════════════════════════════════

        public async Task<DtoEventoResult> P_ActualizarEstadoEventoAsync(
            long eventoId, string estado, string usuario, CancellationToken ct)
        {
            if (estado != EstadoEvento.Despachado && estado != EstadoEvento.Atendido)
                return new DtoEventoResult
                {
                    Success  = false,
                    EventoId = eventoId,
                    Message  = $"Estado inválido para actualización de ciclo: '{estado}'. Use D o A."
                };

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();

            // Asignar la columna de timestamp correcta según el estado
            var tsColumn = estado == EstadoEvento.Despachado ? "fecha_despacho" : "fecha_llegada";
            cmd.CommandText = $@"
UPDATE cad_eventos
SET    estado               = @estado,
       {tsColumn}           = NOW(),
       fecha_modificacion   = NOW(),
       usuario_modifica     = @usuario
WHERE  id = @id
  AND  estado NOT IN ('C','V')
RETURNING pedido_id";    // no se puede reabrir un evento cerrado/anulado

            cmd.Parameters.AddWithValue("estado",  estado);
            cmd.Parameters.AddWithValue("usuario", usuario);
            cmd.Parameters.AddWithValue("id",      eventoId);

            var rawPedidoId = await cmd.ExecuteScalarAsync(ct);
            var success = rawPedidoId is not null and not DBNull;

            // Red de seguridad: es la única transición de estado de evento que no
            // pasaba por EstadoPedidoHelper — normalmente ya está en 'E' desde que
            // se abrió el evento, esto solo actúa si quedó atrás manualmente.
            if (success)
            {
                try { await EstadoPedidoHelper.PromoverPorPedidoIdAsync(conn, null, Convert.ToInt64(rawPedidoId), ct); }
                catch (Exception ex) { _logger.LogWarning(ex, "Error promoviendo estado tras actualizar ciclo evento={Id}", eventoId); }
            }

            return new DtoEventoResult
            {
                Success  = success,
                EventoId = eventoId,
                Message  = success
                    ? $"Evento {eventoId} actualizado a estado '{estado}'."
                    : $"Evento {eventoId} no encontrado o ya está cerrado."
            };
        }

        // ════════════════════════════════════════════════════════════════════════
        // CERRAR EVENTO CON CÓDIGOS DE CIERRE
        // UPDATE cad_eventos + INSERT cad_eventos_codigos_cierre en una tx.
        // ════════════════════════════════════════════════════════════════════════

        public async Task<DtoEventoResult> P_CerrarEventoAsync(
            DtoCierreEventoRequest req, string usuario, long usuarioId, string maquina, CancellationToken ct)
        {
            if (req.EventoId <= 0)
                return new DtoEventoResult { Success = false, Message = "EventoId inválido." };

            // Validar dominio/longitud ANTES de tocar la BD — sin esto, un código de
            // cierre demasiado largo, un tipo fuera del CHECK, un Orden fuera de rango
            // o dos códigos con el mismo Orden (viola la PK compuesta (evento_id,orden))
            // revientan el INSERT con una excepción cruda de Postgres a mitad de la
            // transacción (columnas reales: codigo_cierre VARCHAR(6), tipo_codigo
            // CHECK IN ('CIERRE','DISPOSICION','NOVEDAD'), orden SMALLINT 1..20).
            if (req.ClasifCierre is { Length: > 2 })
                return new DtoEventoResult { Success = false, EventoId = req.EventoId, Message = "Clasificación de cierre inválida (máx. 2 caracteres)." };
            var ordenesVistos = new HashSet<int>();
            foreach (var codigo in req.CodigosCierre)
            {
                if (string.IsNullOrWhiteSpace(codigo.CodigoCierre) || codigo.CodigoCierre.Length > 6)
                    return new DtoEventoResult { Success = false, EventoId = req.EventoId, Message = $"Código de cierre inválido: '{codigo.CodigoCierre}' (máx. 6 caracteres)." };
                if (codigo.Orden is < 1 or > 20)
                    return new DtoEventoResult { Success = false, EventoId = req.EventoId, Message = $"Orden de código de cierre fuera de rango (1-20): {codigo.Orden}." };
                if (!ordenesVistos.Add(codigo.Orden))
                    return new DtoEventoResult { Success = false, EventoId = req.EventoId, Message = $"Orden de código de cierre duplicado: {codigo.Orden}." };
                var tipo = string.IsNullOrWhiteSpace(codigo.TipoCodigo) ? "CIERRE" : codigo.TipoCodigo;
                if (tipo is not ("CIERRE" or "DISPOSICION" or "NOVEDAD"))
                    return new DtoEventoResult { Success = false, EventoId = req.EventoId, Message = $"Tipo de código inválido: '{tipo}'. Valores permitidos: CIERRE, DISPOSICION, NOVEDAD." };
            }

            var estadoFinal = req.Estado is EstadoEvento.Cerrado or EstadoEvento.Anulado
                            ? req.Estado : EstadoEvento.Cerrado;

            var codigoPrimario = req.CodigosCierre
                .OrderBy(x => x.Orden)
                .FirstOrDefault()?.CodigoCierre ?? "";

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx   = await conn.BeginTransactionAsync(ct);

            long pedidoId;

            try
            {
                // ── UPDATE cad_eventos ────────────────────────────────────────
                // RETURNING pedido_id: lo necesitamos para el paso 4 (cerrar el
                // pedido dueño) y este request no trae pedidoId, solo eventoId.
                await using (var upd = conn.CreateCommand())
                {
                    upd.Transaction = tx;
                    upd.CommandText = @"
UPDATE cad_eventos
SET    estado                = @estado,
       fecha_cierre          = NOW(),
       codigo_cierre_primario= @codPrimario,
       clasif_cierre         = @clasif,
       observacion_cierre    = @obs,
       fecha_modificacion    = NOW(),
       usuario_modifica      = @usuario
WHERE  id = @id
  AND  estado NOT IN ('C','V')
RETURNING pedido_id";
                    upd.Parameters.AddWithValue("estado",      estadoFinal);
                    upd.Parameters.AddWithValue("codPrimario", NullOrString(codigoPrimario));
                    upd.Parameters.AddWithValue("clasif",      NullOrString(req.ClasifCierre));
                    upd.Parameters.AddWithValue("obs",         NullOrString(req.ObservacionCierre));
                    upd.Parameters.AddWithValue("usuario",     usuario);
                    upd.Parameters.AddWithValue("id",          req.EventoId);
                    var rawPedidoId = await upd.ExecuteScalarAsync(ct);
                    if (rawPedidoId is null or DBNull)
                    {
                        await tx.RollbackAsync(ct);
                        return new DtoEventoResult
                        {
                            Success  = false,
                            EventoId = req.EventoId,
                            Message  = $"Evento {req.EventoId} no encontrado o ya está cerrado/anulado."
                        };
                    }
                    pedidoId = Convert.ToInt64(rawPedidoId);
                }

                // ── Gate multi-canal ────────────────────────────────────────────
                // Mismo criterio que DbPedidoRepository.CerrarEventoDesdeDespachoAsync:
                // no hacer un cierre global del pedido si otro canal/evento todavía
                // tiene una actuación activa con un recurso desplegado — sin esto se
                // abandona en silencio el despacho de ese otro canal.
                long actuacionesOtroCanal;
                await using (var actCnt = conn.CreateCommand())
                {
                    actCnt.Transaction = tx;
                    actCnt.CommandText = @"
SELECT COUNT(*) FROM cad_actuaciones
WHERE  pedido_id = @pedidoId
  AND  evento_id <> @eventoId
  AND  estado NOT IN ('C','V')";
                    actCnt.Parameters.AddWithValue("pedidoId", pedidoId);
                    actCnt.Parameters.AddWithValue("eventoId", req.EventoId);
                    actuacionesOtroCanal = Convert.ToInt64(await actCnt.ExecuteScalarAsync(ct) ?? 0);
                }
                if (actuacionesOtroCanal > 0)
                {
                    await tx.RollbackAsync(ct);
                    return new DtoEventoResult
                    {
                        Success  = false,
                        EventoId = req.EventoId,
                        Message  = $"Este pedido tiene {actuacionesOtroCanal} actuación(es) activa(s) en otro canal. " +
                                   "Ciérrelas antes de cerrar el evento."
                    };
                }

                // ── Limpiar códigos previos (si se re-cierra por corrección) ──
                await using (var del = conn.CreateCommand())
                {
                    del.Transaction = tx;
                    del.CommandText = "DELETE FROM cad_eventos_codigos_cierre WHERE evento_id = @id";
                    del.Parameters.AddWithValue("id", req.EventoId);
                    await del.ExecuteNonQueryAsync(ct);
                }

                // ── INSERT código(s) de cierre ────────────────────────────────
                foreach (var codigo in req.CodigosCierre.OrderBy(x => x.Orden))
                {
                    await using var insCod = conn.CreateCommand();
                    insCod.Transaction  = tx;
                    insCod.CommandText  = @"
INSERT INTO cad_eventos_codigos_cierre
    (evento_id, orden, codigo_cierre, tipo_codigo, descripcion_libre,
     usuario_registra, fecha_registra)
VALUES
    (@eventoId, @orden, @codigo, @tipo, @desc, @usuario, NOW())";
                    insCod.Parameters.AddWithValue("eventoId", req.EventoId);
                    insCod.Parameters.AddWithValue("orden",    codigo.Orden);
                    insCod.Parameters.AddWithValue("codigo",   codigo.CodigoCierre);
                    insCod.Parameters.AddWithValue("tipo",     string.IsNullOrWhiteSpace(codigo.TipoCodigo)
                                                               ? "CIERRE" : codigo.TipoCodigo);
                    insCod.Parameters.AddWithValue("desc",     NullOrString(codigo.DescripcionLibre));
                    insCod.Parameters.AddWithValue("usuario",  usuario);
                    await insCod.ExecuteNonQueryAsync(ct);
                }

                // ── Actualizar cad_pedidos — SOLO estado a 'C' ──────────────────
                // Mismo criterio que DbPedidoRepository.CerrarEventoDesdeDespachoAsync:
                // comentario y codi_pedido son inmutables, no se tocan aquí. Se marca
                // 'C' sin importar si el evento terminó Cerrado o Anulado. Sin este
                // paso el pedido queda "abierto" en la cola/badges del despachador
                // aunque cad_eventos ya esté cerrado — era el bug real.
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
                    updPed.Parameters.AddWithValue("maquina",   maquina);
                    updPed.Parameters.AddWithValue("pedidoId",  pedidoId);
                    await updPed.ExecuteNonQueryAsync(ct);
                }

                await tx.CommitAsync(ct);
                return new DtoEventoResult
                {
                    Success  = true,
                    EventoId = req.EventoId,
                    Message  = $"Evento {req.EventoId} cerrado con {req.CodigosCierre.Count} código(s)."
                };
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync(ct);
                _logger.LogError(ex, "P_CerrarEvento error eventoId={Id}", req.EventoId);
                return new DtoEventoResult { Success = false, EventoId = req.EventoId, Message = ex.Message };
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // CREAR EVENTO DESDE INTEGRACIÓN EXTERNA
        // (app móvil, sistema de cámaras, SIEDCO, otro sistema policial, etc.)
        // Genera un pedido ficticio + un evento en una sola transacción.
        // ════════════════════════════════════════════════════════════════════════

        public async Task<DtoEventoResult> P_CrearEventoIntegracionAsync(
            DtoEventoIntegracionRequest req, string usuario, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(req.DireccionCaso))
                return new DtoEventoResult { Success = false, Message = "La dirección del caso es obligatoria." };
            if (req.SitioGraba <= 0)
                return new DtoEventoResult { Success = false, Message = "SitioGraba inválido." };

            var origenValidos = new[]
            {
                OrigenEvento.AppMovil, OrigenEvento.Integracion,
                OrigenEvento.Interno, OrigenEvento.Siedco
            };
            if (!origenValidos.Contains(req.Origen))
                return new DtoEventoResult { Success = false,
                    Message = $"Origen '{req.Origen}' inválido para integración. " +
                              $"Use: {string.Join(", ", origenValidos)}" };

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx   = await conn.BeginTransactionAsync(ct);

            try
            {
                // cad_integraciones_clientes.vigente existe justamente para poder
                // revocar el acceso de un sistema externo sin borrar su registro
                // (preserva el FK histórico) — sin este chequeo, un cliente
                // desactivado podía seguir creando eventos indefinidamente.
                if (req.IntegracionClienteId > 0)
                {
                    await using var cmdVig = conn.CreateCommand();
                    cmdVig.Transaction = tx;
                    cmdVig.CommandText = "SELECT vigente FROM cad_integraciones_clientes WHERE id = @id";
                    cmdVig.Parameters.AddWithValue("id", req.IntegracionClienteId);
                    var vigente = await cmdVig.ExecuteScalarAsync(ct) as string;
                    if (vigente != "S")
                    {
                        await tx.RollbackAsync(ct);
                        return new DtoEventoResult { Success = false,
                            Message = $"Cliente de integración {req.IntegracionClienteId} no existe o no está vigente." };
                    }
                }

                long pedidoId = _snowflake.NextId();
                long eventoId = _snowflake.NextId();

                // ── INSERT cad_pedidos (registro mínimo de origen externo) ────
                await using (var ins = conn.CreateCommand())
                {
                    ins.Transaction = tx;
                    ins.CommandText = @"
INSERT INTO cad_pedidos
    (id,
     sitio_graba, nume_llamada, hora_caso, fech_caso,
     dire_caso, barrio, ciudad,
     latitud_caso, longitud_caso,
     comentario, codi_pedido, cali_pedido,
     nomb_llamante, nume_telefono,
     importancia, prioridad,
     estado, enviar, cadusua_usuario,
     fecha_creacion, total_canales)
VALUES
    (@pedidoId,
     @sg, @id, NOW(), NOW(),
     @dir, @barrio, @ciudad,
     @lat, @lon,
     @coment, @codi, @cali,
     @nomb, @tel,
     '01', '01',
     'A', 'N', @usuario,
     NOW(), 'N')";
                    ins.Parameters.AddWithValue("pedidoId", pedidoId);  // cad_pedidos.id Snowflake
                    ins.Parameters.AddWithValue("sg",      req.SitioGraba);
                    ins.Parameters.AddWithValue("id",      pedidoId);   // NUME_LLAMADA (ref. externa)
                    ins.Parameters.AddWithValue("dir",     req.DireccionCaso);
                    ins.Parameters.AddWithValue("barrio",  NullOrString(req.Barrio));
                    ins.Parameters.AddWithValue("ciudad",  NullOrString(req.Ciudad));
                    ins.Parameters.AddWithValue("lat",     NullOrString(req.LatitudCaso));
                    ins.Parameters.AddWithValue("lon",     NullOrString(req.LongitudCaso));
                    ins.Parameters.AddWithValue("coment",  NullOrString(req.Comentario));
                    ins.Parameters.AddWithValue("codi",    NullOrString(req.CodiPedido));
                    ins.Parameters.AddWithValue("cali",    NullOrString(req.CaliPedido));
                    ins.Parameters.AddWithValue("nomb",    NullOrString(req.NombReportante));
                    ins.Parameters.AddWithValue("tel",     string.IsNullOrWhiteSpace(req.TelefonoReportante)
                                                           ? (object)DBNull.Value
                                                           : (long.TryParse(req.TelefonoReportante,
                                                                            out var tel) ? tel : (object)DBNull.Value));
                    ins.Parameters.AddWithValue("usuario", usuario);
                    await ins.ExecuteNonQueryAsync(ct);
                }

                // ── INSERT cad_eventos ────────────────────────────────────────
                await using (var insEvt = conn.CreateCommand())
                {
                    insEvt.Transaction = tx;
                    insEvt.CommandText = @"
INSERT INTO cad_eventos (
    id, sitio_graba, origen,
    integracion_cliente_id, origen_referencia_ext,
    pedido_id, pedido_sitio_graba,
    usuario_genera, tipo_despachador,
    estado, fecha_creacion
) VALUES (
    @id, @sg, @origen,
    @clienteId, @refExt,
    @pedidoId, @pedidoSg,
    @usuario, 'S',
    'P', NOW()
)";
                    insEvt.Parameters.AddWithValue("id",        eventoId);
                    insEvt.Parameters.AddWithValue("sg",        req.SitioGraba);
                    insEvt.Parameters.AddWithValue("origen",    req.Origen);
                    insEvt.Parameters.AddWithValue("clienteId", req.IntegracionClienteId == 0
                                                                ? (object)DBNull.Value
                                                                : req.IntegracionClienteId);
                    insEvt.Parameters.AddWithValue("refExt",    NullOrString(req.OrigenReferenciaExt));
                    insEvt.Parameters.AddWithValue("pedidoId",  pedidoId);
                    insEvt.Parameters.AddWithValue("pedidoSg",  req.SitioGraba);
                    insEvt.Parameters.AddWithValue("usuario",   usuario);
                    await insEvt.ExecuteNonQueryAsync(ct);
                }

                await tx.CommitAsync(ct);
                return new DtoEventoResult
                {
                    Success  = true,
                    EventoId = eventoId,
                    PedidoId = pedidoId,
                    Message  = $"Evento {eventoId} creado desde integración '{req.Origen}'."
                };
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync(ct);
                _logger.LogError(ex, "P_CrearEventoIntegracion error");
                return new DtoEventoResult { Success = false, Message = ex.Message };
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // PRIVATE HELPERS
        // ════════════════════════════════════════════════════════════════════════

        private static object NullOrString(string? value) =>
            string.IsNullOrWhiteSpace(value) ? DBNull.Value : value;

        /// <summary>
        /// 4-level barrio lookup (mirrors Oracle SP strategy).
        /// Returns (codiBarrio, lugeBarrio, notFound).
        /// </summary>
        private static async Task<(int codiBarrio, int lugeBarrio, bool notFound)> BuscarBarrioAsync(
            NpgsqlConnection conn, NpgsqlTransaction tx,
            int sitioGraba, string barrio, string ciudad, CancellationToken ct)
        {
            var barrioCleaned = (barrio ?? "").Trim().ToUpper();

            var (c1, l1) = await BarrioQuery(conn, tx, @"
SELECT codigo, luge_codigo FROM cad_barrios
WHERE  luge_codigo = @sg AND TRIM(UPPER(descripcion)) = @b LIMIT 1",
                new[] { ("sg", (object)sitioGraba), ("b", barrioCleaned) }, ct);
            if (c1 > 0) return (c1, l1, false);

            var words = barrioCleaned.Replace("BARRIO ", "").Trim()
                                     .Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (words.Length > 0)
            {
                var sql2   = "SELECT codigo, luge_codigo FROM cad_barrios WHERE luge_codigo = @sg";
                var parms2 = new List<(string, object)> { ("sg", (object)sitioGraba) };
                for (var i = 0; i < words.Length; i++)
                {
                    sql2 += $" AND UPPER(descripcion) LIKE '%' || @w{i} || '%'";
                    parms2.Add(($"w{i}", words[i]));
                }
                sql2 += " LIMIT 1";
                var (c2, l2) = await BarrioQuery(conn, tx, sql2, parms2.ToArray(), ct);
                if (c2 > 0) return (c2, l2, false);
            }

            var ciudadUpper = (ciudad ?? "").ToUpper();
            var (c3, l3) = await BarrioQuery(conn, tx, @"
SELECT b.codigo, b.luge_codigo FROM cad_barrios b
JOIN   cad_lugares_geograficos l ON b.luge_codigo = l.codigo
WHERE  UPPER(l.descripcion) LIKE '%' || @c || '%'
  AND  TRIM(UPPER(b.descripcion)) = @b LIMIT 1",
                new[] { ("c", (object)ciudadUpper), ("b", barrioCleaned) }, ct);
            if (c3 > 0) return (c3, l3, false);

            if (words.Length > 0)
            {
                var sql4 = @"
SELECT b.codigo, b.luge_codigo FROM cad_barrios b
JOIN   cad_lugares_geograficos l ON b.luge_codigo = l.codigo
WHERE  UPPER(l.descripcion) LIKE '%' || @c || '%'";
                var parms4 = new List<(string, object)> { ("c", (object)ciudadUpper) };
                for (var i = 0; i < words.Length; i++)
                {
                    sql4 += $" AND UPPER(b.descripcion) LIKE '%' || @w{i} || '%'";
                    parms4.Add(($"w{i}", words[i]));
                }
                sql4 += " LIMIT 1";
                var (c4, l4) = await BarrioQuery(conn, tx, sql4, parms4.ToArray(), ct);
                if (c4 > 0) return (c4, l4, false);
            }

            return (sitioGraba, sitioGraba, true);
        }

        private static async Task<(int code, int luge)> BarrioQuery(
            NpgsqlConnection conn, NpgsqlTransaction tx, string sql,
            (string name, object value)[] parms, CancellationToken ct)
        {
            await using var cmd = conn.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = sql;
            foreach (var (name, value) in parms)
                cmd.Parameters.AddWithValue(name, value);
            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            if (!await rdr.ReadAsync(ct)) return (0, 0);
            return (rdr.IsDBNull(0) ? 0 : rdr.GetInt32(0),
                    rdr.IsDBNull(1) ? 0 : rdr.GetInt32(1));
        }

        // ════════════════════════════════════════════════════════════════════════
        // REMISIÓN A CANAL SECAD  (§6.11 / §6.1)
        // ════════════════════════════════════════════════════════════════════════

        /// <inheritdoc/>
        public async Task<(bool success, string message, int canalesAgregados)> RemitirCanalAsync(
            DtoRemitirCanalRequest req, string usuario, CancellationToken ct)
        {
            if (req.Canales is null || req.Canales.Count == 0)
                return (false, "Debe seleccionar al menos un canal.", 0);

            try
            {
                await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
                await using var tx   = await conn.BeginTransactionAsync(ct);

                // ── Resolver la clave correcta de cad_pedidos_canales ────────────
                // cad_pedidos tiene DOS identificadores:
                //   · id           = Snowflake generado en SERVIDOR (lo que ve el frontend)
                //   · nume_llamada = Snowflake generado en CLIENTE  (lo que usa cad_pedidos_canales)
                // El frontend envía req.PedidoId = cad_pedidos.id (servidor).
                // Pero la listing query une por: pc.cadpedi_numellamada = p.nume_llamada.
                // → Hay que resolver p.nume_llamada y usarla en el INSERT.
                long numeLlamada = req.PedidoId;
                int  sitioGraba  = req.SitioGraba;

                await using (var cmdNl = conn.CreateCommand())
                {
                    cmdNl.Transaction = tx;
                    cmdNl.CommandText =
                        "SELECT COALESCE(nume_llamada, id), sitio_graba " +
                        "FROM   cad_pedidos WHERE id = @id LIMIT 1";
                    cmdNl.Parameters.AddWithValue("id", req.PedidoId);
                    await using var rNl = await cmdNl.ExecuteReaderAsync(ct);
                    if (await rNl.ReadAsync(ct))
                    {
                        numeLlamada = rNl.GetInt64(0);
                        sitioGraba  = rNl.GetInt32(1);
                    }
                    else
                    {
                        // Antes seguía usando req.PedidoId/req.SitioGraba (controlados
                        // por el cliente) como si fueran nume_llamada/sitio_graba reales,
                        // insertando filas huérfanas en cad_pedidos_canales que apuntan
                        // a un pedido inexistente, sin ningún error (success=true).
                        await rNl.CloseAsync();
                        await tx.RollbackAsync(ct);
                        return (false, $"Pedido {req.PedidoId} no encontrado.", 0);
                    }
                }

                var comentario = string.IsNullOrWhiteSpace(req.Observacion)
                    ? $"Remitido a canal por {usuario}"
                    : req.Observacion.Trim();

                // Deduplicar por (Codigo, FuerzaId)
                var canalesUnicos = req.Canales
                    .GroupBy(c => (c.Codigo, c.FuerzaId))
                    .Select(g => g.First())
                    .ToList();

                int agregados = 0;
                foreach (var canal in canalesUnicos)
                {
                    await using var insCan = conn.CreateCommand();
                    insCan.Transaction = tx;
                    // INSERT sólo si no existe ya ese canal para este pedido.
                    // No depende de ON CONFLICT para funcionar sin la migración V26.
                    insCan.CommandText = @"
                        INSERT INTO cad_pedidos_canales
                            (cadpedi_sitiograba, cadpedi_numellamada,
                             cadcana_fuerz_id,   cadcana_codigo,
                             cali_pedido,        comentario,
                             estado,             enviar,
                             cadeven_sitio_graba, cadeven_nume_evento,
                             fecha_grabacion,    fecha_modificacion,  usua_modifica)
                        SELECT @sg, @nl, @fuerza, @canal,
                               '01', @coment,
                               'P', 'S',
                               @sg, @evento,
                               NOW(), NOW(), @usuario
                        WHERE NOT EXISTS (
                            SELECT 1 FROM cad_pedidos_canales
                            WHERE  cadpedi_sitiograba  = @sg
                              AND  cadpedi_numellamada = @nl
                              AND  cadcana_fuerz_id    = @fuerza
                              AND  cadcana_codigo      = @canal
                        )";

                    insCan.Parameters.AddWithValue("sg",      sitioGraba);
                    insCan.Parameters.AddWithValue("nl",      numeLlamada);  // ← nume_llamada, no id
                    insCan.Parameters.AddWithValue("fuerza",  canal.FuerzaId);
                    insCan.Parameters.AddWithValue("canal",   canal.Codigo);
                    insCan.Parameters.AddWithValue("coment",  comentario);
                    insCan.Parameters.AddWithValue("evento",  req.EventoId);
                    insCan.Parameters.AddWithValue("usuario", NullOrString(usuario));

                    var rows = await insCan.ExecuteNonQueryAsync(ct);
                    if (rows > 0) agregados++;
                }

                // ── Remover el canal origen (gestión EXCLUSIVA en el/los destino) ──
                // Caso típico: el evento llegó al canal incorrecto y se corrige el
                // destino, sin necesidad de gestión conjunta.
                var removidoOrigen = false;
                if (req.RemoverCanalOrigen && req.CanalOrigenCodigo is > 0 && req.CanalOrigenFuerzaId is > 0)
                {
                    long actuacionesOrigen;
                    await using (var actCnt = conn.CreateCommand())
                    {
                        actCnt.Transaction = tx;
                        actCnt.CommandText = @"
SELECT COUNT(*) FROM cad_actuaciones
WHERE  pedido_id    = @pedidoId
  AND  canal_codigo = @canal
  AND  fuerza_id    = @fuerza
  AND  estado NOT IN ('C','V')";
                        actCnt.Parameters.AddWithValue("pedidoId", req.PedidoId);
                        actCnt.Parameters.AddWithValue("canal",    req.CanalOrigenCodigo.Value);
                        actCnt.Parameters.AddWithValue("fuerza",   req.CanalOrigenFuerzaId.Value);
                        actuacionesOrigen = Convert.ToInt64(await actCnt.ExecuteScalarAsync(ct) ?? 0);
                    }
                    if (actuacionesOrigen > 0)
                    {
                        await tx.RollbackAsync(ct);
                        return (false,
                            $"No se puede remover el caso de su canal: tiene {actuacionesOrigen} recurso(s) activo(s). " +
                            "Cierre esas actuaciones antes de remitir en exclusiva.", 0);
                    }

                    await using var updOrig = conn.CreateCommand();
                    updOrig.Transaction = tx;
                    updOrig.CommandText = @"
UPDATE cad_pedidos_canales
SET    estado             = 'C',
       fecha_modificacion = NOW(),
       usua_modifica      = @usuario
WHERE  cadpedi_sitiograba  = @sg
  AND  cadpedi_numellamada = @nl
  AND  cadcana_codigo      = @canal
  AND  cadcana_fuerz_id    = @fuerza
  AND  estado             <> 'C'";
                    updOrig.Parameters.AddWithValue("usuario", NullOrString(usuario));
                    updOrig.Parameters.AddWithValue("sg",      sitioGraba);
                    updOrig.Parameters.AddWithValue("nl",      numeLlamada);
                    updOrig.Parameters.AddWithValue("canal",   req.CanalOrigenCodigo.Value);
                    updOrig.Parameters.AddWithValue("fuerza",  req.CanalOrigenFuerzaId.Value);
                    var rowsOrig = await updOrig.ExecuteNonQueryAsync(ct);
                    removidoOrigen = rowsOrig > 0;
                }

                await tx.CommitAsync(ct);

                var msg = agregados > 0
                    ? $"Caso remitido a {agregados} canal(es) correctamente."
                    : "El caso ya estaba asignado a todos los canales seleccionados.";
                if (removidoOrigen)
                    msg += " Se removió de su canal — ahora se gestiona solo en el/los canal(es) destino.";

                return (true, msg, agregados);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error remitiendo a canales SECAD. PedidoId={Id}", req.PedidoId);
                return (false, $"Error al remitir: {ex.Message}", 0);
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // DUPLICATE / NEARBY-CALL DETECTION  (§6.8)
        // Fuente: cad_pedidos — donde se almacena la georreferenciación y los
        // códigos de caso del formulario de recepción.
        // ════════════════════════════════════════════════════════════════════════

        /// <inheritdoc/>
        public async Task<List<DtoPedidoCercano>> G_GetPedidosCercanosAsync(
            double lat, double lng, int radioMetros, int minutosAtras,
            string? codCaso, CancellationToken ct)
        {
            // Deltas de bounding box para pre-filtro SQL rápido
            // (1° lat ≈ 111 km;  1° lng ≈ 111 km × cos(lat))
            double deltaLat = radioMetros / 111_000.0;
            double deltaLng = radioMetros / (111_000.0 * Math.Cos(lat * Math.PI / 180.0));

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();

            // Pre-filtro por bounding box + ventana temporal.
            // Se protege contra valores varchar no numéricos con regex.
            // Solo se incluyen pedidos reales despachados (enviar = 'S'),
            // excluyendo cierres rápidos (estado = 'C') y anulados.
            // DECISIÓN EXPLÍCITA: a diferencia de F_BuscarLlamadasAsociarAsync/
            // F_GetCanalesAsync, esta búsqueda NO filtra por sitio_graba — es
            // intencional. Un mismo incidente real puede ser reportado por
            // distintos testigos a consolas/líneas diferentes dentro de la misma
            // ciudad; restringir la detección de duplicados al sitio del operador
            // que está digitando reduciría su utilidad real (dejaría de detectar
            // justamente el caso más común de llamada duplicada entre consolas).
            cmd.CommandText = @"
                SELECT p.id,
                       p.sitio_graba,
                       p.codi_pedido,
                       p.codi_pedido2,
                       p.dire_caso,
                       p.ciudad,
                       p.barrio,
                       p.estado,
                       p.prioridad,
                       p.nomb_llamante,
                       p.hora_caso,
                       p.latitud_caso,
                       p.longitud_caso
                FROM   cad_pedidos p
                WHERE  p.estado NOT IN ('C', 'V')
                  AND  p.enviar = 'S'
                  AND  p.fecha_creacion > NOW() - (@mins * INTERVAL '1 minute')
                  AND  p.latitud_caso  IS NOT NULL AND p.latitud_caso  <> '' AND p.latitud_caso  <> '0'
                  AND  p.longitud_caso IS NOT NULL AND p.longitud_caso <> '' AND p.longitud_caso <> '0'
                  AND  p.latitud_caso  ~ '^-?[0-9]+\.?[0-9]*$'
                  AND  p.longitud_caso ~ '^-?[0-9]+\.?[0-9]*$'
                  AND  p.latitud_caso ::float BETWEEN @latMin AND @latMax
                  AND  p.longitud_caso::float BETWEEN @lngMin AND @lngMax
                ORDER  BY p.fecha_creacion DESC
                LIMIT  30";

            cmd.Parameters.AddWithValue("mins",   minutosAtras);
            cmd.Parameters.AddWithValue("latMin", lat - deltaLat);
            cmd.Parameters.AddWithValue("latMax", lat + deltaLat);
            cmd.Parameters.AddWithValue("lngMin", lng - deltaLng);
            cmd.Parameters.AddWithValue("lngMax", lng + deltaLng);

            // Leer filas crudas
            var rows = new List<(DtoPedidoCercano item, double pLat, double pLng)>();
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                var rawLat = reader.IsDBNull(11) ? "" : reader.GetString(11);
                var rawLng = reader.IsDBNull(12) ? "" : reader.GetString(12);

                if (!double.TryParse(rawLat, System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var pLat)) continue;
                if (!double.TryParse(rawLng, System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var pLng)) continue;

                // hora_caso es timestamptz — leer directamente como DateTime
                DateTime? hora = reader.IsDBNull(10)
                    ? null
                    : reader.GetDateTime(10).ToLocalTime();

                rows.Add((new DtoPedidoCercano
                {
                    Id           = reader.GetInt64(0).ToString(),
                    SitioGraba   = reader.IsDBNull(1)  ? 0    : reader.GetInt32(1),
                    CodiPedido   = reader.IsDBNull(2)  ? null : reader.GetString(2),
                    CodiPedido2  = reader.IsDBNull(3)  ? null : reader.GetString(3),
                    DireCaso     = reader.IsDBNull(4)  ? null : reader.GetString(4),
                    Ciudad       = reader.IsDBNull(5)  ? null : reader.GetString(5),
                    Barrio       = reader.IsDBNull(6)  ? null : reader.GetString(6),
                    Estado       = reader.IsDBNull(7)  ? null : reader.GetString(7),
                    Prioridad    = reader.IsDBNull(8)  ? null : reader.GetString(8),
                    NombLlamante = reader.IsDBNull(9)  ? null : reader.GetString(9),
                    HoraCaso     = hora?.ToString("O"),
                    MinutosAtras = hora.HasValue
                        ? (int)Math.Round((DateTime.Now - hora.Value).TotalMinutes)
                        : 0,
                }, pLat, pLng));
            }

            // Calcular distancia exacta Haversine + aplicar radio + filtro por código de caso
            var codPrefix = codCaso?.Trim().ToUpperInvariant();
            var result    = new List<DtoPedidoCercano>();

            foreach (var (item, pLat, pLng) in rows)
            {
                var dist = HaversineMetros(lat, lng, pLat, pLng);
                if (dist > radioMetros) continue;

                // Filtro por código de caso (si se proporcionó): exacto o prefijo de 3 chars
                if (!string.IsNullOrEmpty(codPrefix))
                {
                    var pfx = codPrefix[..Math.Min(3, codPrefix.Length)];
                    bool codMatch =
                        (item.CodiPedido?.ToUpperInvariant().StartsWith(pfx)  == true) ||
                        (item.CodiPedido2?.ToUpperInvariant().StartsWith(pfx) == true) ||
                        (item.CodiPedido?.Equals(codPrefix, StringComparison.OrdinalIgnoreCase) == true);
                    if (!codMatch) continue;
                }

                item.DistanciaMetros = (int)Math.Round(dist);
                result.Add(item);
            }

            return result.OrderBy(r => r.DistanciaMetros).Take(5).ToList();
        }

        /// <summary>Haversine formula — returns distance in metres between two WGS-84 points.</summary>
        private static double HaversineMetros(double lat1, double lon1, double lat2, double lon2)
        {
            const double R = 6_371_000.0;
            var dLat = (lat2 - lat1) * Math.PI / 180.0;
            var dLon = (lon2 - lon1) * Math.PI / 180.0;
            var a    = Math.Sin(dLat / 2) * Math.Sin(dLat / 2)
                     + Math.Cos(lat1 * Math.PI / 180.0) * Math.Cos(lat2 * Math.PI / 180.0)
                     * Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
            return R * 2.0 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1.0 - a));
        }
    }
}
