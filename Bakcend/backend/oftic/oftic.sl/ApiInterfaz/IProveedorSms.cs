namespace Servicios.ApiInterfaz
{
    /// <summary>
    /// Envío de SMS saliente — abstrae el proveedor real. La implementación activa
    /// (<see cref="Negocio.Gestion.DbConfigProveedorSms"/>, en oftic.bl) lee el
    /// proveedor configurado y sus credenciales desde ctr_config_sms
    /// (Administración → Proveedor SMS) y despacha a Infobip o Inalambria
    /// Express según corresponda — no requiere redeploy para cambiar de
    /// proveedor. Si no hay api_key configurado (o el envío falla), devuelve
    /// false sin bloquear el resto del flujo de videollamada — el link sigue
    /// disponible para el despachador.
    /// </summary>
    public interface IProveedorSms
    {
        /// <summary>true si el proveedor confirmó el envío; false si no hay proveedor configurado o falló.</summary>
        Task<bool> EnviarSmsAsync(string numero, string mensaje, CancellationToken ct = default);
    }
}
