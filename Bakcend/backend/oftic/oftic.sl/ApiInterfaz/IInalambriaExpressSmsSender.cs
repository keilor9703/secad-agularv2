namespace Servicios.ApiInterfaz
{
    /// <summary>Envío de un SMS puntual vía Inalambria Express, con credenciales explícitas (ver DbConfigProveedorSms).</summary>
    public interface IInalambriaExpressSmsSender
    {
        Task<bool> EnviarAsync(string baseUrl, string apiKey, string numero, string mensaje, CancellationToken ct = default);
    }
}
