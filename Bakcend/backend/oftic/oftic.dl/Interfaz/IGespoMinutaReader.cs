using Comun.Dtos.Turnos;

namespace Datos.Interfaz
{
    /// <summary>
    /// Lee la minuta digital (unidades activas, cuadrantes y personal asignado)
    /// directamente desde Oracle GESPO — sin FDW, conexión directa vía
    /// Oracle.ManagedDataAccess.Core (mismo enfoque que IGespoOracleReader para
    /// GPS). Sin polling: se consulta bajo demanda, cuando el usuario abre el
    /// wizard de importación en el módulo Turnos.
    /// </summary>
    public interface IGespoMinutaReader
    {
        /// <summary>
        /// Unidades con minuta activa para la sigla/turno/fecha indicados
        /// (VM_MINUTAS_ACTIVAS). Lista vacía si la lectura está deshabilitada/sin
        /// configurar (GespoOracle:Enabled = false o sin ConnectionString).
        /// </summary>
        Task<List<DtoUnidadSivicc>> LeerUnidadesActivasAsync(
            string siglaFisica, int turno, DateTime fecha, CancellationToken ct);

        /// <summary>
        /// Personal asignado a los cuadrantes de una minuta (MINUTA_EMPLEADO
        /// join VM_CUADRANTE join VM_PERSONAL_AGRUPADO), solo empleados en
        /// servicio. Una fila por policía; agrupar por CuadranteId para obtener
        /// las patrullas. Lista vacía si la lectura está deshabilitada/sin
        /// configurar.
        /// </summary>
        Task<List<DtoMinutaEmpleadoGespo>> LeerMediosDeMinutaAsync(long minutaId, CancellationToken ct);
    }
}
