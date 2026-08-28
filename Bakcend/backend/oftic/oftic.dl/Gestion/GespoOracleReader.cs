using System.Globalization;
using Comun.Dtos.Turnos;
using Datos.Interfaz;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Oracle.ManagedDataAccess.Client;

namespace Datos.Gestion
{
    /// <summary>
    /// Lee la georreferenciación GPS actual directamente desde la vista Oracle de
    /// GESPO (VW_CONSULTA_ACTUAL_GPS) usando el driver 100% administrado
    /// Oracle.ManagedDataAccess.Core — sin FDW, sin extensiones ni clientes
    /// nativos que instalar en el servidor de Postgres (enfoque descartado por
    /// no ser instalable en varios de los servidores de los tenants).
    ///
    /// La vista trae GPS de TODO el país. En vez de filtrar por SIGLA_PAPA_UNIDAD
    /// (que trae TODAS las patrullas de la fuerza/ciudad completa), se filtra por
    /// la lista explícita de CUADRANTE_ID (=patrulla_codigo) que el llamador ya
    /// sabe que le interesan — los medios del canal/unidad en cuestión, ya
    /// resueltos en Postgres. Así cada consulta a Oracle trae solo lo que hace
    /// falta para esa unidad/canal, no toda la ciudad.
    ///
    /// La vista trae una fila por policía/celular; varios pueden compartir el
    /// mismo CUADRANTE_ID (=patrulla_codigo). Se colapsa aquí en memoria al fix
    /// más reciente por cuadrante.
    ///
    /// A diferencia de la vista anterior, esta sí trae VELOCIDAD (se asume
    /// km/h — no confirmado con GESPO, ajustar si resulta ser otra unidad).
    /// Sigue sin traer rumbo/dirección, así que RumboGrados queda en null.
    /// </summary>
    public sealed class GespoOracleReader : IGespoOracleReader
    {
        // Colombia es UTC-5 fijo, sin horario de verano — igual que el resto del
        // sistema interpreta los timestamps naive de Oracle (ver DbReporteRepository).
        private static readonly TimeSpan ColombiaOffset = TimeSpan.FromHours(-5);

        private readonly GespoOracleOptions        _opts;
        private readonly ILogger<GespoOracleReader> _logger;

        public GespoOracleReader(IOptions<GespoOracleOptions> opts, ILogger<GespoOracleReader> logger)
        {
            _opts   = opts.Value;
            _logger = logger;
        }

        public async Task<List<DtoGespoUbicacion>> LeerUbicacionesActualesAsync(
            IReadOnlyCollection<string> cuadranteIds, CancellationToken ct)
        {
            var result = new List<DtoGespoUbicacion>();
            if (!_opts.Enabled || string.IsNullOrWhiteSpace(_opts.ConnectionString))
            {
                _logger.LogInformation(
                    "[GespoOracleReader] Lectura deshabilitada o sin ConnectionString " +
                    "(GespoOracle:Enabled={Enabled}) — no se consulta Oracle.", _opts.Enabled);
                return result;
            }
            if (cuadranteIds is null || cuadranteIds.Count == 0)
            {
                _logger.LogInformation(
                    "[GespoOracleReader] Sin cuadrante_id que consultar (canal/unidad sin medios " +
                    "activos en este momento) — no se llama a Oracle.");
                return result;
            }

            using var conn = new OracleConnection(_opts.ConnectionString);
            await conn.OpenAsync(ct);

            using var cmd = conn.CreateCommand();
            cmd.CommandTimeout = _opts.TimeoutSeconds;

            // Bind por posición (:c0, :c1, ...) en vez de literales concatenados —
            // sigue siendo una consulta parametrizada, solo con tantos parámetros
            // como cuadrante_id se necesiten (a esta escala, medios de un solo
            // canal/unidad, siempre muy por debajo del límite práctico de Oracle).
            var ids = cuadranteIds.ToArray();
            var nombresParam = new string[ids.Length];
            for (int i = 0; i < ids.Length; i++)
            {
                nombresParam[i] = $":c{i}";
                cmd.Parameters.Add(new OracleParameter($"c{i}", ids[i]));
            }

            // Nombres de esquema/vista vienen de configuración (no de input de usuario),
            // igual que el resto de sentencias de esquema en el proyecto.
            cmd.CommandText = $@"
SELECT cuadrante_id, latitud, longitud, fecha, velocidad
FROM   {_opts.Schema}.{_opts.ViewName}
WHERE  cuadrante_id IN ({string.Join(",", nombresParam)})
  AND  latitud      IS NOT NULL
  AND  longitud     IS NOT NULL
  AND  fecha        IS NOT NULL";

            var masRecientePorCuadrante = new Dictionary<string, (double Lat, double Lng, double? Velocidad, DateTime Fecha)>();

            using (var rdr = await cmd.ExecuteReaderAsync(ct))
            {
                while (await rdr.ReadAsync(ct))
                {
                    // CultureInfo.InvariantCulture explícito es obligatorio acá: Convert.ToDouble
                    // sin proveedor de formato usa la cultura del hilo/SO del servidor, y en una
                    // cultura es-* el '.' se interpreta como separador de miles en vez de decimal
                    // (4.6183887 → 46183887), corrompiendo silenciosamente cada coordenada leída.
                    var cuadranteId = Convert.ToInt64(rdr.GetValue(0)).ToString(CultureInfo.InvariantCulture);
                    var lat         = Convert.ToDouble(rdr.GetValue(1), CultureInfo.InvariantCulture);
                    var lng         = Convert.ToDouble(rdr.GetValue(2), CultureInfo.InvariantCulture);
                    var fecha       = rdr.GetDateTime(3);
                    var velocidad   = rdr.IsDBNull(4) ? (double?)null : Convert.ToDouble(rdr.GetValue(4), CultureInfo.InvariantCulture);

                    if (!masRecientePorCuadrante.TryGetValue(cuadranteId, out var actual) || fecha > actual.Fecha)
                        masRecientePorCuadrante[cuadranteId] = (lat, lng, velocidad, fecha);
                }
            }

            foreach (var (cuadranteId, v) in masRecientePorCuadrante)
            {
                var fechaGps = new DateTimeOffset(DateTime.SpecifyKind(v.Fecha, DateTimeKind.Unspecified), ColombiaOffset);
                result.Add(new DtoGespoUbicacion
                {
                    PatrullaCodigo = cuadranteId,
                    Latitud        = v.Lat,
                    Longitud       = v.Lng,
                    VelocidadKmh   = v.Velocidad,
                    RumboGrados    = null,
                    FechaGps       = fechaGps.ToString("o", CultureInfo.InvariantCulture),
                });
            }

            _logger.LogInformation(
                "[GespoOracleReader] {Solicitados} cuadrante(s) solicitados — {Cantidad} leído(s) de Oracle.",
                ids.Length, result.Count);
            return result;
        }
    }
}
