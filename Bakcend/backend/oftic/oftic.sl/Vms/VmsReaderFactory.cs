using Servicios.ApiInterfaz;

namespace Servicios.Vms
{
    /// <summary>
    /// Resuelve el driver por su identificador. Es lo único que hay que tocar
    /// —además de registrar el nuevo driver en DI— para soportar otro VMS.
    /// </summary>
    public class VmsReaderFactory : IVmsReaderFactory
    {
        private readonly Dictionary<string, IVmsReader> _drivers;

        public VmsReaderFactory(IEnumerable<IVmsReader> drivers)
        {
            _drivers = drivers.ToDictionary(d => d.Driver, StringComparer.OrdinalIgnoreCase);
        }

        public IVmsReader? Para(string? driver) =>
            !string.IsNullOrWhiteSpace(driver) && _drivers.TryGetValue(driver.Trim(), out var d) ? d : null;
    }
}
