using System.Globalization;
using System.Text;
using Comun.Dtos.Camaras;
using Comun.Snowflake;
using Datos.Interfaz;
using Datos.Tenant;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace Datos.Gestion
{
    /// <summary>
    /// Catálogo de cámaras (<c>cad_camaras</c>). Una fila es una cámara del
    /// mundo real; el censo institucional dice dónde está y el VMS si se puede
    /// ver. Las dos cosas se juntan al emparejar.
    /// </summary>
    public class DbCamaraRepository : IDbCamaraRepository
    {
        private const string TablaInexistente = "42P01";

        private readonly TenantContext _tenant;
        private readonly ISnowflakeGenerator _snowflake;
        private readonly ILogger<DbCamaraRepository> _logger;

        public DbCamaraRepository(
            TenantContext tenant, ISnowflakeGenerator snowflake, ILogger<DbCamaraRepository> logger)
        {
            _tenant = tenant; _snowflake = snowflake; _logger = logger;
        }

        // ════════════════════════════════════════════════════════════════════
        // SINCRONIZACIÓN
        // ════════════════════════════════════════════════════════════════════

        public async Task<DtoSyncResult> SincronizarAsync(
            long integracionId, List<DtoVmsCamara> camaras, CancellationToken ct)
        {
            var r = new DtoSyncResult { Reportadas = camaras.Count };
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx = await conn.BeginTransactionAsync(ct);

            foreach (var c in camaras)
            {
                if (string.IsNullOrWhiteSpace(c.Codigo)) continue;

                // 1) ¿Ya está emparejada? Entonces solo se refresca lo que el
                //    VMS sabe: estado, PTZ y nombre. NO se toca la coordenada
                //    ni la dirección: eso es del censo y el VMS no lo tiene.
                await using (var upd = conn.CreateCommand())
                {
                    upd.Transaction = tx;
                    upd.CommandText = @"
UPDATE cad_camaras
SET    estado     = @estado,
       tiene_ptz  = @ptz,
       region_codigo = COALESCE(@region, region_codigo),
       fecha_sync = NOW()
WHERE  integracion_id = @int AND camara_codigo = @cod";
                    upd.Parameters.AddWithValue("estado", (short)c.Estado);
                    upd.Parameters.AddWithValue("ptz",    c.TienePtz);
                    upd.Parameters.AddWithValue("region", (object?)c.RegionCodigo ?? DBNull.Value);
                    upd.Parameters.AddWithValue("int",    integracionId);
                    upd.Parameters.AddWithValue("cod",    c.Codigo);
                    if (await upd.ExecuteNonQueryAsync(ct) > 0) { r.Actualizadas++; continue; }
                }

                // 2) No la conocíamos: se da de alta como cámara del VMS, sin
                //    coordenadas. Existe para poder emparejarla; hasta que eso
                //    pase no sale en el mapa, porque no sabemos dónde está.
                await using (var ins = conn.CreateCommand())
                {
                    ins.Transaction = tx;
                    ins.CommandText = @"
INSERT INTO cad_camaras
    (id, integracion_id, camara_codigo, nombre, region_codigo,
     tiene_ptz, estado, activa, origen, fecha_sync, fecha_creacion)
VALUES
    (@id, @int, @cod, @nom, @region, @ptz, @estado, TRUE, 'VMS', NOW(), NOW())";
                    ins.Parameters.AddWithValue("id",     _snowflake.NextId());
                    ins.Parameters.AddWithValue("int",    integracionId);
                    ins.Parameters.AddWithValue("cod",    c.Codigo);
                    ins.Parameters.AddWithValue("nom",    Recortar(c.Nombre, 128));
                    ins.Parameters.AddWithValue("region", (object?)c.RegionCodigo ?? DBNull.Value);
                    ins.Parameters.AddWithValue("ptz",    c.TienePtz);
                    ins.Parameters.AddWithValue("estado", (short)c.Estado);
                    await ins.ExecuteNonQueryAsync(ct);
                    r.Nuevas++;
                }
            }

            await using (var cnt = conn.CreateCommand())
            {
                cnt.Transaction = tx;
                cnt.CommandText = "SELECT COUNT(*) FROM cad_camaras WHERE origen = 'VMS' AND integracion_id = @int";
                cnt.Parameters.AddWithValue("int", integracionId);
                r.SinEmparejar = Convert.ToInt32(await cnt.ExecuteScalarAsync(ct));
            }

            await tx.CommitAsync(ct);
            r.Ok = true;
            r.Mensaje = $"{r.Reportadas} cámara(s) reportadas por el VMS: {r.Actualizadas} actualizadas, " +
                        $"{r.Nuevas} nuevas. Quedan {r.SinEmparejar} sin emparejar con el censo.";
            return r;
        }

        // ════════════════════════════════════════════════════════════════════
        // EMPAREJAMIENTO
        // ════════════════════════════════════════════════════════════════════

        public async Task<List<DtoEmparejamientoCamara>> ProponerEmparejamientosAsync(
            long integracionId, CancellationToken ct)
        {
            var vms = new List<(long Id, string Codigo, string Nombre, int Estado)>();
            var censo = new List<(long Id, string Nombre, string? Numero, string? Direccion)>();

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"
SELECT id, camara_codigo, COALESCE(nombre,''), estado
FROM   cad_camaras
WHERE  origen = 'VMS' AND integracion_id = @int AND activa
ORDER  BY nombre";
                cmd.Parameters.AddWithValue("int", integracionId);
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                    vms.Add((r.GetInt64(0), r.GetString(1), r.GetString(2), r.GetInt16(3)));
            }
            await using (var cmd = conn.CreateCommand())
            {
                // Solo las del censo que NO están ya emparejadas.
                cmd.CommandText = @"
SELECT id, COALESCE(nombre,''), numero_censo, direccion
FROM   cad_camaras
WHERE  origen = 'CENSO' AND activa AND camara_codigo IS NULL
ORDER  BY nombre";
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                    censo.Add((r.GetInt64(0), r.GetString(1),
                               r.IsDBNull(2) ? null : r.GetString(2),
                               r.IsDBNull(3) ? null : r.GetString(3)));
            }

            var propuestas = new List<DtoEmparejamientoCamara>();
            var censoUsado = new HashSet<long>();

            foreach (var v in vms)
            {
                var nv = Normalizar(v.Nombre);
                if (nv.Length == 0) continue;

                (long id, int puntaje, string motivo, string nombre, string? num, string? dir) mejor = (0, 0, "", "", null, null);
                foreach (var c in censo)
                {
                    if (censoUsado.Contains(c.Id)) continue;
                    var (p, motivo) = Parecido(nv, Normalizar(c.Nombre), v.Nombre, c.Nombre, c.Numero);
                    if (p > mejor.puntaje) mejor = (c.Id, p, motivo, c.Nombre, c.Numero, c.Direccion);
                }

                // Por debajo de 45 la propuesta no aporta: hace perder más
                // tiempo revisándola que buscándola a mano.
                if (mejor.puntaje < 45) continue;
                censoUsado.Add(mejor.id);
                propuestas.Add(new DtoEmparejamientoCamara
                {
                    CensoId = mejor.id, CensoNombre = mejor.nombre,
                    CensoNumero = mejor.num, CensoDireccion = mejor.dir,
                    VmsId = v.Id, VmsCodigo = v.Codigo, VmsNombre = v.Nombre, VmsEstado = v.Estado,
                    Puntaje = mejor.puntaje, Motivo = mejor.motivo,
                });
            }

            return propuestas.OrderByDescending(p => p.Puntaje).ToList();
        }

        public async Task<(bool Ok, string Mensaje)> EmparejarAsync(
            long censoId, long vmsId, string usuario, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx = await conn.BeginTransactionAsync(ct);

            long integracionId; string codigo; short estado; bool ptz;
            await using (var sel = conn.CreateCommand())
            {
                sel.Transaction = tx;
                sel.CommandText = @"
SELECT integracion_id, camara_codigo, estado, tiene_ptz
FROM   cad_camaras WHERE id = @id AND origen = 'VMS'";
                sel.Parameters.AddWithValue("id", vmsId);
                await using var r = await sel.ExecuteReaderAsync(ct);
                if (!await r.ReadAsync(ct))
                    return (false, "La cámara del VMS ya no está en la lista de pendientes.");
                integracionId = r.GetInt64(0); codigo = r.GetString(1);
                estado = r.GetInt16(2); ptz = r.GetBoolean(3);
            }

            // El borrado va PRIMERO. ux_camaras_vms es un índice único sobre
            // (integracion_id, camara_codigo) y no es diferible: si se copia el
            // código a la fila del censo antes de soltar la del VMS, las dos lo
            // tienen a la vez dentro de la transacción y Postgres lo rechaza al
            // instante. La fila del VMS ya cumplió su función —los dos hechos
            // pasan a vivir en la del censo, que es la que tiene coordenadas—
            // y todo sigue en la misma transacción, así que sigue siendo atómico.
            await using (var del = conn.CreateCommand())
            {
                del.Transaction = tx;
                del.CommandText = "DELETE FROM cad_camaras WHERE id = @id AND origen = 'VMS'";
                del.Parameters.AddWithValue("id", vmsId);
                await del.ExecuteNonQueryAsync(ct);
            }

            await using (var upd = conn.CreateCommand())
            {
                upd.Transaction = tx;
                // El PTZ del VMS gana: el censo no tiene la columna y lo
                // deducimos del nombre, que es una conjetura.
                upd.CommandText = @"
UPDATE cad_camaras
SET    integracion_id = @int, camara_codigo = @cod,
       estado = @estado, tiene_ptz = @ptz, fecha_sync = NOW()
WHERE  id = @id AND origen = 'CENSO' AND camara_codigo IS NULL";
                upd.Parameters.AddWithValue("int", integracionId);
                upd.Parameters.AddWithValue("cod", codigo);
                upd.Parameters.AddWithValue("estado", estado);
                upd.Parameters.AddWithValue("ptz", ptz);
                upd.Parameters.AddWithValue("id", censoId);
                if (await upd.ExecuteNonQueryAsync(ct) == 0)
                {
                    // Rollback explícito: sin él la transacción se cerraría al
                    // salir del using y el DELETE de arriba se perdería igual,
                    // pero dejarlo escrito evita que un cambio futuro lo rompa.
                    await tx.RollbackAsync(ct);
                    return (false, "La cámara del censo no existe o ya estaba emparejada.");
                }
            }

            await tx.CommitAsync(ct);
            _logger.LogInformation("{Usuario} emparejó la cámara del censo {Censo} con {Codigo} del VMS.",
                usuario, censoId, codigo);
            return (true, "Cámara emparejada. Ya se le puede pedir video.");
        }

        public async Task<(bool Ok, string Mensaje)> DesemparejarAsync(long censoId, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx = await conn.BeginTransactionAsync(ct);

            long? integracionId = null; string? codigo = null; short estado = 0; bool ptz = false; string nombre = "";
            await using (var sel = conn.CreateCommand())
            {
                sel.Transaction = tx;
                sel.CommandText = @"
SELECT integracion_id, camara_codigo, estado, tiene_ptz, COALESCE(nombre,'')
FROM   cad_camaras WHERE id = @id AND origen = 'CENSO' AND camara_codigo IS NOT NULL";
                sel.Parameters.AddWithValue("id", censoId);
                await using var r = await sel.ExecuteReaderAsync(ct);
                if (!await r.ReadAsync(ct)) return (false, "Esa cámara no está emparejada.");
                integracionId = r.IsDBNull(0) ? null : r.GetInt64(0);
                codigo = r.GetString(1); estado = r.GetInt16(2); ptz = r.GetBoolean(3); nombre = r.GetString(4);
            }

            await using (var upd = conn.CreateCommand())
            {
                upd.Transaction = tx;
                upd.CommandText = @"
UPDATE cad_camaras SET integracion_id = NULL, camara_codigo = NULL, estado = 0
WHERE  id = @id";
                upd.Parameters.AddWithValue("id", censoId);
                await upd.ExecuteNonQueryAsync(ct);
            }

            // La cámara del VMS vuelve a la lista de pendientes: sigue
            // existiendo allá aunque aquí nos hayamos equivocado de pareja.
            // El orden importa igual que al emparejar, y aquí ya es el
            // correcto: primero se suelta el código de la fila del censo y
            // solo después se reinserta la del VMS.
            if (integracionId is > 0)
                await using (var ins = conn.CreateCommand())
                {
                    ins.Transaction = tx;
                    ins.CommandText = @"
INSERT INTO cad_camaras
    (id, integracion_id, camara_codigo, nombre, tiene_ptz, estado, activa, origen, fecha_sync, fecha_creacion)
VALUES (@id, @int, @cod, @nom, @ptz, @estado, TRUE, 'VMS', NOW(), NOW())
ON CONFLICT DO NOTHING";
                    ins.Parameters.AddWithValue("id", _snowflake.NextId());
                    ins.Parameters.AddWithValue("int", integracionId.Value);
                    ins.Parameters.AddWithValue("cod", codigo!);
                    ins.Parameters.AddWithValue("nom", Recortar(nombre, 128));
                    ins.Parameters.AddWithValue("ptz", ptz);
                    ins.Parameters.AddWithValue("estado", estado);
                    await ins.ExecuteNonQueryAsync(ct);
                }

            await tx.CommitAsync(ct);
            return (true, "Emparejamiento deshecho.");
        }

        // ════════════════════════════════════════════════════════════════════
        // CONSULTA PARA EL DESPACHO
        // ════════════════════════════════════════════════════════════════════

        public async Task<List<DtoCamara>> CercanasAsync(
            int sitioGraba, double latitud, double longitud,
            int radioMetros, int limite, CancellationToken ct)
        {
            var lista = new List<DtoCamara>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();

            // Haversine en SQL plano, igual que G_GetRecursoMasCercanoAsync. No
            // se usa PostGIS porque V40 lo quitó del proyecto: la extensión no
            // es instalable en los servidores de todos los tenants. A escala de
            // un municipio (cientos de cámaras) el recorrido con ORDER BY es de
            // sobra, apoyado en idx_camaras_unidad_geo.
            cmd.CommandText = @"
SELECT c.id, COALESCE(c.nombre,''), c.numero_censo, c.direccion, c.municipio, c.unidad,
       c.latitud, c.longitud, c.tiene_ptz, c.operativa, c.estado,
       c.camara_codigo, c.integracion_id, c.origen,
       ROUND((6371000 * 2 * ASIN(SQRT(
           POWER(SIN(RADIANS(c.latitud - @lat)/2), 2) +
           COS(RADIANS(@lat)) * COS(RADIANS(c.latitud)) *
           POWER(SIN(RADIANS(c.longitud - @lng)/2), 2)
       )))::numeric, 0)::int AS metros
FROM   cad_camaras c
WHERE  c.activa
  AND  c.latitud IS NOT NULL AND c.longitud IS NOT NULL
  AND  (@sg = 0 OR c.sitio_graba = @sg)
  -- Una cámara dada de baja en el inventario no se le ofrece al operador;
  -- las que no dicen nada (NULL) sí, porque no consta que estén malas.
  AND  COALESCE(c.operativa, TRUE)
ORDER  BY metros
LIMIT  @lim";
            cmd.Parameters.AddWithValue("lat", latitud);
            cmd.Parameters.AddWithValue("lng", longitud);
            cmd.Parameters.AddWithValue("sg",  sitioGraba);
            cmd.Parameters.AddWithValue("lim", Math.Clamp(limite, 1, 100));

            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                var metros = r.GetInt32(14);
                if (radioMetros > 0 && metros > radioMetros) continue;
                lista.Add(Map(r, metros));
            }
            return lista;
        }

        public async Task<DtoCamara?> GetPorCodigoAsync(string camaraCodigo, int sitioGraba, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
SELECT c.id, COALESCE(c.nombre,''), c.numero_censo, c.direccion, c.municipio, c.unidad,
       c.latitud, c.longitud, c.tiene_ptz, c.operativa, c.estado,
       c.camara_codigo, c.integracion_id, c.origen, 0
FROM   cad_camaras c
WHERE  c.activa AND c.camara_codigo = @cod AND (@sg = 0 OR c.sitio_graba = @sg)
LIMIT  1";
            cmd.Parameters.AddWithValue("cod", camaraCodigo);
            cmd.Parameters.AddWithValue("sg",  sitioGraba);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            return await r.ReadAsync(ct) ? Map(r, null) : null;
        }

        // ════════════════════════════════════════════════════════════════════
        // AUDITORÍA
        // ════════════════════════════════════════════════════════════════════

        public async Task RegistrarVisualizacionAsync(
            DtoCamara? camara, string camaraCodigo, long? pedidoId, long? eventoId,
            int sitioGraba, string usuario, string? ip, bool concedido, string? motivo,
            CancellationToken ct)
        {
            try
            {
                await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
                await using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
INSERT INTO cad_camaras_visualizacion
    (id, camara_id, camara_codigo, integracion_id, pedido_id, evento_id,
     sitio_graba, usuario, ip, concedido, motivo, fecha)
VALUES
    (@id, @camId, @cod, @int, @ped, @evt, @sg, @usr, @ip, @ok, @motivo, NOW())";
                cmd.Parameters.AddWithValue("id",    _snowflake.NextId());
                cmd.Parameters.AddWithValue("camId", (object?)camara?.Id ?? DBNull.Value);
                cmd.Parameters.AddWithValue("cod",   Recortar(camaraCodigo, 64));
                cmd.Parameters.AddWithValue("int",   (object?)camara?.IntegracionId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("ped",   (object?)pedidoId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("evt",   (object?)eventoId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("sg",    sitioGraba);
                cmd.Parameters.AddWithValue("usr",   Recortar(usuario, 100));
                cmd.Parameters.AddWithValue("ip",    (object?)Recortar(ip, 64) ?? DBNull.Value);
                cmd.Parameters.AddWithValue("ok",    concedido);
                cmd.Parameters.AddWithValue("motivo", (object?)Recortar(motivo, 300) ?? DBNull.Value);
                await cmd.ExecuteNonQueryAsync(ct);
            }
            catch (NpgsqlException ex)
            {
                // No se le niega el video al operador porque falle la bitácora,
                // pero tampoco se calla: queda en el log del servidor.
                _logger.LogError(ex, "No se pudo auditar la visualización de la cámara {Cod}.", camaraCodigo);
            }
        }

        // ── Ayudas ───────────────────────────────────────────────────────────

        private static DtoCamara Map(NpgsqlDataReader r, int? metros) => new()
        {
            Id            = r.GetInt64(0),
            Nombre        = r.GetString(1),
            NumeroCenso   = r.IsDBNull(2)  ? null : r.GetString(2),
            Direccion     = r.IsDBNull(3)  ? null : r.GetString(3),
            Municipio     = r.IsDBNull(4)  ? null : r.GetString(4),
            Unidad        = r.IsDBNull(5)  ? null : r.GetString(5),
            Latitud       = r.IsDBNull(6)  ? null : r.GetDouble(6),
            Longitud      = r.IsDBNull(7)  ? null : r.GetDouble(7),
            TienePtz      = r.GetBoolean(8),
            Operativa     = r.IsDBNull(9)  ? null : r.GetBoolean(9),
            Estado        = r.GetInt16(10),
            CamaraCodigo  = r.IsDBNull(11) ? null : r.GetString(11),
            IntegracionId = r.IsDBNull(12) ? null : r.GetInt64(12),
            Origen        = r.IsDBNull(13) ? "CENSO" : r.GetString(13),
            Distancia     = metros,
        };

        private static string? Recortar(string? s, int max) =>
            s is null ? null : (s.Length <= max ? s : s[..max]);

        /// <summary>
        /// Deja el nombre en una forma comparable: sin tildes, en mayúsculas,
        /// sin puntuación y sin las palabras que no distinguen nada («CAM»,
        /// «CAMARA», «PTZ», «DOMO», «FIJA»). Sin esto, «Cámara PTZ - Parque
        /// Principal» y «PARQUE PRINCIPAL» no se parecerían en nada.
        /// </summary>
        internal static string Normalizar(string? s)
        {
            if (string.IsNullOrWhiteSpace(s)) return string.Empty;
            var sinTildes = new string(s.Normalize(NormalizationForm.FormD)
                .Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                .ToArray()).ToUpperInvariant();

            var sb = new StringBuilder(sinTildes.Length);
            foreach (var c in sinTildes) sb.Append(char.IsLetterOrDigit(c) ? c : ' ');

            var ruido = new HashSet<string> { "CAM", "CAMARA", "CAMARAS", "PTZ", "DOMO", "FIJA", "BALA", "DE", "DEL", "LA", "EL", "LOS", "LAS" };
            var palabras = sb.ToString()
                .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Where(p => !ruido.Contains(p));
            return string.Join(' ', palabras);
        }

        /// <summary>
        /// Cuánto se parecen dos nombres ya normalizados, de 0 a 100, y por qué.
        /// El motivo se le muestra a quien confirma: un puntaje solo no permite
        /// juzgar si la propuesta tiene sentido.
        /// </summary>
        internal static (int Puntaje, string Motivo) Parecido(
            string a, string b, string origA, string origB, string? numeroCenso)
        {
            if (a.Length == 0 || b.Length == 0) return (0, "");
            // «Coinciden» es tras normalizar, no carácter por carácter: quien
            // confirma tiene que saber que «PTZ PARQUE PINZON» y «Parque
            // Pinzón» llegaron aquí porque se les quitaron tildes, mayúsculas
            // y palabras como PTZ, no porque estuvieran escritos igual.
            if (a == b)
                return (100, origA.Equals(origB, StringComparison.Ordinal)
                    ? "Los nombres son idénticos."
                    : $"Los nombres coinciden al normalizarlos (sin tildes, en mayúsculas y sin " +
                      $"palabras como PTZ o CÁMARA): «{origA}» ≡ «{origB}».");

            var ta = a.Split(' ', StringSplitOptions.RemoveEmptyEntries).ToHashSet();
            var tb = b.Split(' ', StringSplitOptions.RemoveEmptyEntries).ToHashSet();
            var comunes = ta.Intersect(tb).ToList();
            if (comunes.Count == 0) return (0, "");

            // Jaccard sobre las palabras: premia que compartan casi todo y
            // castiga que una traiga muchas palabras que la otra no tiene.
            var union = ta.Union(tb).Count();
            var puntaje = (int)Math.Round(100.0 * comunes.Count / union);

            // Que el número del censo aparezca en el nombre del VMS es una
            // señal fuerte y ocurre a menudo («CAM 40» ↔ «Camara 40 Mirador»).
            var motivo = $"Comparten {comunes.Count} palabra(s): {string.Join(", ", comunes.Take(4))}.";
            if (!string.IsNullOrWhiteSpace(numeroCenso))
            {
                var num = Normalizar(numeroCenso);
                if (num.Length > 0 && a.Split(' ').Contains(num))
                {
                    puntaje = Math.Min(100, puntaje + 25);
                    motivo += $" El número del censo ({numeroCenso}) aparece en el nombre del VMS.";
                }
            }
            return (puntaje, motivo);
        }
    }
}
