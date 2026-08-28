using System.Globalization;
using Comun.Dtos.Turnos;
using Datos.Interfaz;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Oracle.ManagedDataAccess.Client;

namespace Datos.Gestion
{
    /// <summary>
    /// Lee la minuta digital de GESPO (unidades activas + personal por cuadrante)
    /// directamente desde Oracle usando Oracle.ManagedDataAccess.Core — sin FDW,
    /// mismo enfoque y misma configuración de conexión (<see cref="GespoOracleOptions"/>)
    /// que <see cref="GespoOracleReader"/> (GPS). Reemplaza el flujo anterior basado
    /// en las vistas FDW v_unidades_minuta/v_personal_minuta (V11, ya eliminado).
    ///
    /// Tablas GESPO consultadas (esquema configurado en GespoOracleOptions.Schema):
    ///   VM_MINUTAS_ACTIVAS    — unidades con minuta activa (paso 1 del wizard).
    ///   MINUTA_EMPLEADO       — personal asignado por cuadrante en una minuta.
    ///   VM_CUADRANTE          — nombre/código del cuadrante (CODIGO_ZONA).
    ///   VM_PERSONAL_AGRUPADO  — datos del policía (nombre, cédula, cargo).
    /// </summary>
    public sealed class GespoMinutaReader : IGespoMinutaReader
    {
        private readonly GespoOracleOptions        _opts;
        private readonly ILogger<GespoMinutaReader> _logger;

        public GespoMinutaReader(IOptions<GespoOracleOptions> opts, ILogger<GespoMinutaReader> logger)
        {
            _opts   = opts.Value;
            _logger = logger;
        }

        public async Task<List<DtoUnidadSivicc>> LeerUnidadesActivasAsync(
            string siglaFisica, int turno, DateTime fecha, CancellationToken ct)
        {
            var result = new List<DtoUnidadSivicc>();
            if (!_opts.Enabled || string.IsNullOrWhiteSpace(_opts.ConnectionString) ||
                string.IsNullOrWhiteSpace(siglaFisica))
                return result;

            using var conn = new OracleConnection(_opts.ConnectionString);
            await conn.OpenAsync(ct);

            using var cmd = conn.CreateCommand();
            cmd.CommandTimeout = _opts.TimeoutSeconds;
            // SUBSTR(CODIGO_MINUTA,14,1) IN ('C','A') — filtro de tipo de minuta
            // indicado por negocio (minutas de Cuadrante). :fecha se compara con
            // TRUNC porque FECHA_MINUTA trae hora; se asume tipo DATE en Oracle —
            // si en la práctica resulta ser VARCHAR2 con formato 'DD/MM/YYYY', hay
            // que ajustar a TO_DATE(t.FECHA_MINUTA,'DD/MM/YYYY') = :fecha.
            cmd.CommandText = $@"
SELECT t.MINUTA_ID, t.CONSECUTIVO, t.UNIDAD
FROM   {_opts.Schema}.VM_MINUTAS_ACTIVAS t
WHERE  SUBSTR(t.CODIGO_MINUTA, 14, 1) IN ('C', 'A')
  AND  UPPER(t.SIGLA_FISICA) = UPPER(:sigla)
  AND  t.TURNO = :turno
  AND  TRUNC(t.FECHA_MINUTA) = TRUNC(:fecha)";
            cmd.Parameters.Add(new OracleParameter("sigla", siglaFisica));
            cmd.Parameters.Add(new OracleParameter("turno", turno));
            cmd.Parameters.Add(new OracleParameter("fecha", fecha.Date));

            using var rdr = await cmd.ExecuteReaderAsync(ct);
            while (await rdr.ReadAsync(ct))
            {
                var consecutivo = Convert.ToInt32(rdr.GetValue(1));
                result.Add(new DtoUnidadSivicc
                {
                    MinutaId     = Convert.ToInt32(rdr.GetValue(0)),
                    Consecutivo  = consecutivo,
                    UnidadCodigo = consecutivo.ToString(CultureInfo.InvariantCulture),
                    Descripcion  = rdr.IsDBNull(2) ? "" : rdr.GetString(2)
                });
            }

            _logger.LogDebug(
                "[GespoMinutaReader] sigla={Sigla} turno={Turno} fecha={Fecha} — {Cantidad} unidad(es) leída(s).",
                siglaFisica, turno, fecha.ToString("yyyy-MM-dd"), result.Count);
            return result;
        }

        public async Task<List<DtoMinutaEmpleadoGespo>> LeerMediosDeMinutaAsync(long minutaId, CancellationToken ct)
        {
            var result = new List<DtoMinutaEmpleadoGespo>();
            if (!_opts.Enabled || string.IsNullOrWhiteSpace(_opts.ConnectionString))
                return result;

            using var conn = new OracleConnection(_opts.ConnectionString);
            await conn.OpenAsync(ct);

            using var cmd = conn.CreateCommand();
            cmd.CommandTimeout = _opts.TimeoutSeconds;
            cmd.CommandText = $@"
SELECT me.CUADRANTE_ID, cua.CODIGO_ZONA, pa.IDENTIFICACION, pa.FUNCIONARIO, pa.CARGO_ACTUAL
FROM   {_opts.Schema}.MINUTA_EMPLEADO me
JOIN   {_opts.Schema}.VM_CUADRANTE cua        ON cua.CUADRANTE_ID = me.CUADRANTE_ID
JOIN   {_opts.Schema}.VM_PERSONAL_AGRUPADO pa ON pa.CONSECUTIVO   = me.EMPLEADO_ID
WHERE  me.MINUTA_ID = :minutaId
  AND  me.EMPLEADO_EN_SERVICIO = 1
  AND  me.CUADRANTE_ID IS NOT NULL
ORDER  BY me.CUADRANTE_ID DESC";
            cmd.Parameters.Add(new OracleParameter("minutaId", minutaId));

            using var rdr = await cmd.ExecuteReaderAsync(ct);
            while (await rdr.ReadAsync(ct))
            {
                result.Add(new DtoMinutaEmpleadoGespo
                {
                    CuadranteId    = Convert.ToInt64(rdr.GetValue(0)).ToString(CultureInfo.InvariantCulture),
                    PatrullaDesc   = rdr.IsDBNull(1) ? "" : rdr.GetString(1),
                    Identificacion = rdr.IsDBNull(2) ? "" : rdr.GetValue(2).ToString() ?? "",
                    NombreCompleto = rdr.IsDBNull(3) ? "" : rdr.GetString(3),
                    Cargo          = rdr.IsDBNull(4) ? "" : rdr.GetString(4)
                });
            }

            _logger.LogDebug(
                "[GespoMinutaReader] minutaId={MinutaId} — {Cantidad} policía(s) leído(s).",
                minutaId, result.Count);
            return result;
        }
    }
}
