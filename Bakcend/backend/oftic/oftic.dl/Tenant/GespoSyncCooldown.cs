using System.Collections.Concurrent;

namespace Datos.Tenant
{
    /// <summary>
    /// Singleton: evita que múltiples operadores del mismo tenant, con Turnos o
    /// Eventos abiertos al mismo tiempo, disparen consultas a Oracle GESPO
    /// simultáneas o demasiado seguidas — la sincronización de GPS ahora es bajo
    /// demanda (un tick del polling normal de la pantalla, no un
    /// BackgroundService aparte), así que sin este límite N pestañas abiertas
    /// del mismo tenant multiplicarían la carga sobre Oracle por N.
    /// </summary>
    public sealed class GespoSyncCooldown
    {
        private readonly ConcurrentDictionary<string, DateTime> _ultimaSync = new(StringComparer.OrdinalIgnoreCase);

        /// <summary>
        /// true si ya pasó <paramref name="minIntervalo"/> desde la última vez que
        /// este tenant sincronizó (y marca el intento actual como el más reciente);
        /// false si hay que saltarse esta sincronización porque otra ya corrió hace poco.
        /// </summary>
        public bool TryEntrar(string codDane, TimeSpan minIntervalo)
        {
            var ahora = DateTime.UtcNow;
            var actualizado = _ultimaSync.AddOrUpdate(
                codDane,
                ahora,
                (_, anterior) => ahora - anterior >= minIntervalo ? ahora : anterior);

            return actualizado == ahora;
        }
    }
}
