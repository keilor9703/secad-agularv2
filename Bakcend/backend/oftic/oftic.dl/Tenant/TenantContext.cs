using Npgsql;

namespace Datos.Tenant
{
    public class TenantContext
    {
        private NpgsqlDataSource? _dataSource;

        public string? CodDane    { get; private set; }
        public string? NombreCad  { get; private set; }

        /// <summary>
        /// Sitio de grabación principal del tenant (de secad_tenants.sitio_graba).
        /// Útil para integraciones externas que no incluyen JWT y necesitan un sitio por defecto.
        /// Es distinto del sitio_graba del usuario autenticado (que viene del JWT claim).
        /// </summary>
        public int? SitioGraba    { get; private set; }

        /// <summary>
        /// Sigla de la unidad tal como aparece en GESPO (secad_tenants.gespo_sigla_unidad)
        /// — filtra las consultas a Oracle GESPO para este tenant. Null si no está
        /// configurada (GPS/minuta deshabilitados para el tenant hasta que se configure).
        /// </summary>
        public string? GespoSiglaUnidad { get; private set; }

        public NpgsqlDataSource DataSource =>
            _dataSource ?? throw new InvalidOperationException(
                "TenantContext no ha sido inicializado. Asegúrese de que TenantMiddleware esté configurado " +
                "o que el tenant sea resuelto antes de usar este contexto.");

        public void Set(
            NpgsqlDataSource dataSource,
            string           codDane,
            string?          nombreCad        = null,
            int?             sitioGraba       = null,
            string?          gespoSiglaUnidad = null)
        {
            _dataSource      = dataSource;
            CodDane          = codDane;
            NombreCad        = nombreCad;
            SitioGraba       = sitioGraba;
            GespoSiglaUnidad = gespoSiglaUnidad;
        }

        public bool IsInitialized => _dataSource is not null;
    }
}
