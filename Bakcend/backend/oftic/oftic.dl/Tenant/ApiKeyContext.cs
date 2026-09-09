using Comun.Dtos.Integraciones;

namespace Datos.Tenant
{
    /// <summary>
    /// La llave con la que entró una petición externa, resuelta por
    /// TenantMiddleware antes de que llegue a ningún controlador.
    ///
    /// Es la identidad del llamante: de aquí sale el CAD y la unidad por
    /// defecto. Antes eso lo decidía la cabecera X-Cod-Dane, que cualquiera con
    /// la clave global podía cambiar para escribir en otro CAD.
    /// </summary>
    public class ApiKeyContext
    {
        public DtoApiKeyResuelta? Llave { get; private set; }

        /// <summary>true = la petición vino con una llave válida de secad_api_keys.</summary>
        public bool Resuelta => Llave is not null;

        public void Set(DtoApiKeyResuelta llave) => Llave = llave;

        /// <summary>¿Esta llave alcanza para el endpoint que se está usando?</summary>
        public bool Cubre(string alcanceExigido) =>
            Llave is not null && AlcanceApiKey.Cubre(Llave.Alcance, alcanceExigido);
    }
}
