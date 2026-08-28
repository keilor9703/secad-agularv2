namespace Servicios.ApiInterfaz
{
    /// <summary>Envío de un SMS puntual vía Infobip, con credenciales explícitas (ver DbConfigProveedorSms).</summary>
    public interface IInfobipSmsSender
    {
        Task<bool> EnviarAsync(string baseUrl, string apiKey, string? sender, string numero, string mensaje, CancellationToken ct = default);
    }
}
