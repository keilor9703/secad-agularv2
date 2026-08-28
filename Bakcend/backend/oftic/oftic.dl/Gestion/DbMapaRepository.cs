using Comun.Dtos.Mapa;
using Datos.Interfaz;
using Datos.Tenant;
using Microsoft.Extensions.Logging;

namespace Datos.Gestion
{
    /// <summary>
    /// Implementación del repositorio GIS 2D.
    /// Consulta incidentes activos con coordenadas para el módulo Mapa de Incidentes.
    /// </summary>
    public class DbMapaRepository : IDbMapaRepository
    {
        private readonly TenantContext              _tenant;
        private readonly ILogger<DbMapaRepository>  _logger;

        private const string TsFormat = "DD/MM/YYYY HH24:MI";

        public DbMapaRepository(TenantContext tenant, ILogger<DbMapaRepository> logger)
        {
            _tenant = tenant;
            _logger = logger;
        }

        // Timeout máximo para la consulta del mapa, independiente del CancellationToken del request.
        // Esto evita que la conexión espere indefinidamente cuando el CAD está degradado.
        private const int DbTimeoutSeconds = 12;

        // Debe coincidir con el LIMIT de la consulta — usado para inferir si la
        // lista fue truncada (llegar exactamente a este número es la señal).
        private const int MaxIncidentes = 1000;

        /// <inheritdoc />
        public async Task<(List<DtoMapaIncidente> Items, bool Truncated)> GetIncidentesActivosAsync(
            int sitioGraba, int canalCodigo, int canalFuerzaId, CancellationToken ct)
        {
            var result = new List<DtoMapaIncidente>();

            // Combinamos el CT del request con un timeout propio de 12 s.
            // Así si el cliente cancela (navegación) o la BD tarda demasiado,
            // ambos casos se cubren sin dejar conexiones colgadas.
            using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(DbTimeoutSeconds));
            using var linkedCts  = CancellationTokenSource.CreateLinkedTokenSource(ct, timeoutCts.Token);
            var queryCt = linkedCts.Token;

            try
            {
                await using var conn = await _tenant.DataSource.OpenConnectionAsync(queryCt);
                await using var cmd  = conn.CreateCommand();

                // CommandTimeout en segundos — límite a nivel de PostgreSQL.
                cmd.CommandTimeout = DbTimeoutSeconds;

                // Filtro por sitio_graba solo si se pasa uno válido (> 0).
                // El campo latitud_caso / longitud_caso puede ser '0' o '' cuando
                // el operador no capturó la ubicación — los excluimos del mapa.
                cmd.CommandText = $@"
SELECT
    p.id::TEXT                                                          AS id,
    p.sitio_graba,
    COALESCE(p.codi_pedido,  '')                                        AS codi_pedido,
    COALESCE(c1.descripcion, '')                                        AS desc_pedido,
    COALESCE(p.codi_pedido2, '')                                        AS codi_pedido2,
    COALESCE(c2.descripcion, '')                                        AS desc_pedido2,
    COALESCE(p.dire_caso,  '')                                          AS dire_caso,
    COALESCE(p.barrio,     '')                                          AS barrio,
    COALESCE(p.ciudad,     '')                                          AS ciudad,
    COALESCE(p.latitud_caso,  '')                                       AS latitud_caso,
    COALESCE(p.longitud_caso, '')                                       AS longitud_caso,
    COALESCE(p.estado,     'P')                                         AS estado,
    COALESCE(p.prioridad,  '03')                                        AS prioridad,
    TO_CHAR(p.hora_caso AT TIME ZONE 'America/Bogota', '{TsFormat}')   AS hora_caso,
    COALESCE(NULLIF(p.username_creacion,''), p.cadusua_usuario, '')     AS username_creacion,
    COALESCE(e.origen,       'MANUAL')                                  AS origen,
    (
        SELECT COUNT(*)
        FROM   cad_actuaciones a
        WHERE  a.pedido_id = p.id
          AND  a.estado NOT IN ('C','V')
    )                                                                   AS total_actuaciones,
    COALESCE(sg.cod_dane,    '')                                        AS cod_dane,
    -- ── Identificadores de trazabilidad ──────────────────────────────────
    p.nume_llamada,
    e.evento_id,
    -- ── Canal de atención ─────────────────────────────────────────────────
    COALESCE(e.canal_codigo, 0)                                         AS canal_codigo,
    COALESCE(e.fuerza_id,    0)                                         AS fuerza_id,
    COALESCE(cn.descripcion, '')                                        AS canal_descripcion
FROM cad_pedidos p
LEFT JOIN cad_casos c1
       ON c1.codigo = p.codi_pedido
LEFT JOIN cad_casos c2
       ON c2.codigo = p.codi_pedido2
LEFT JOIN cad_sitios_grabacion sg
       ON sg.consecutivo = p.sitio_graba
LEFT JOIN LATERAL (
    SELECT ev.id::TEXT  AS evento_id,
           ev.origen,
           ev.canal_codigo,
           ev.fuerza_id
    FROM   cad_eventos ev
    WHERE  ev.pedido_id = p.id
    ORDER BY ev.fecha_creacion DESC
    LIMIT  1
) e ON TRUE
LEFT JOIN cad_canales cn
       ON cn.codigo      = e.canal_codigo
      AND cn.cadfuerz_id = e.fuerza_id
WHERE p.estado NOT IN ('C','V')
  AND p.latitud_caso  ~ '^-?[0-9]+\.?[0-9]*$'
  AND p.longitud_caso ~ '^-?[0-9]+\.?[0-9]*$'
  AND p.latitud_caso::NUMERIC  <> 0
  AND p.longitud_caso::NUMERIC <> 0
  {(sitioGraba   > 0 ? "AND p.sitio_graba   = @sitio"  : "")}
  {(canalCodigo  > 0 ? "AND e.canal_codigo  = @canal"  : "")}
  {(canalCodigo  > 0 && canalFuerzaId > 0 ? "AND e.fuerza_id = @canalFuerza" : "")}
ORDER BY p.hora_caso DESC
LIMIT {MaxIncidentes}";

                if (sitioGraba  > 0) cmd.Parameters.AddWithValue("sitio", sitioGraba);
                if (canalCodigo > 0) cmd.Parameters.AddWithValue("canal", canalCodigo);
                if (canalCodigo > 0 && canalFuerzaId > 0) cmd.Parameters.AddWithValue("canalFuerza", canalFuerzaId);

                await using var reader = await cmd.ExecuteReaderAsync(queryCt);
                while (await reader.ReadAsync(queryCt))
                {
                    var numeLlamadaOrd = reader.GetOrdinal("nume_llamada");
                    var eventoIdOrd    = reader.GetOrdinal("evento_id");

                    result.Add(new DtoMapaIncidente
                    {
                        Id                = reader.GetString(reader.GetOrdinal("id")),
                        SitioGraba        = reader.GetInt32(reader.GetOrdinal("sitio_graba")),
                        CodiPedido        = reader.GetString(reader.GetOrdinal("codi_pedido")),
                        DescPedido        = reader.GetString(reader.GetOrdinal("desc_pedido")),
                        CodiPedido2       = reader.GetString(reader.GetOrdinal("codi_pedido2")),
                        DescPedido2       = reader.GetString(reader.GetOrdinal("desc_pedido2")),
                        DireCaso          = reader.GetString(reader.GetOrdinal("dire_caso")),
                        Barrio            = reader.GetString(reader.GetOrdinal("barrio")),
                        Ciudad            = reader.GetString(reader.GetOrdinal("ciudad")),
                        LatitudCaso       = reader.GetString(reader.GetOrdinal("latitud_caso")),
                        LongitudCaso      = reader.GetString(reader.GetOrdinal("longitud_caso")),
                        Estado            = reader.GetString(reader.GetOrdinal("estado")),
                        Prioridad         = reader.GetString(reader.GetOrdinal("prioridad")),
                        HoraCaso          = reader.GetString(reader.GetOrdinal("hora_caso")),
                        UsernameCreacion  = reader.GetString(reader.GetOrdinal("username_creacion")),
                        Origen            = reader.GetString(reader.GetOrdinal("origen")),
                        TotalActuaciones  = Convert.ToInt32(reader["total_actuaciones"]),
                        CodDane           = reader.GetString(reader.GetOrdinal("cod_dane")),
                        // Identificadores de trazabilidad
                        NumeLlamada       = reader.IsDBNull(numeLlamadaOrd) ? null : reader.GetInt64(numeLlamadaOrd),
                        NumeEvento        = reader.IsDBNull(eventoIdOrd)    ? null : reader.GetString(eventoIdOrd),
                        // Canal de atención
                        CanalCodigo       = reader.GetInt32(reader.GetOrdinal("canal_codigo")),
                        FuerzaId          = reader.GetInt32(reader.GetOrdinal("fuerza_id")),
                        CanalDescripcion  = reader.GetString(reader.GetOrdinal("canal_descripcion"))
                    });
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                // El cliente HTTP canceló la solicitud (navegó fuera del mapa).
                // No es un error — simplemente retornamos lista vacía.
                _logger.LogDebug("[Mapa] Consulta cancelada por el cliente (sitioGraba={Sitio})", sitioGraba);
            }
            catch (OperationCanceledException)
            {
                // Timeout propio de 12 s alcanzado — CAD en estado degradado.
                _logger.LogWarning("[Mapa] Timeout de {Sec}s al consultar incidentes (sitioGraba={Sitio}). BD lenta o CAD degradado.",
                    DbTimeoutSeconds, sitioGraba);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[Mapa] Error consultando incidentes activos (sitioGraba={Sitio})", sitioGraba);
            }

            return (result, result.Count >= MaxIncidentes);
        }
    }
}
