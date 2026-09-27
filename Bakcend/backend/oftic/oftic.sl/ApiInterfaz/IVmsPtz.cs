using Comun.Dtos.Camaras;

namespace Servicios.ApiInterfaz
{
    /// <summary>
    /// Control PTZ. Va en una interfaz APARTE de IVmsReader a propósito: no
    /// todos los VMS lo soportan, y meterlo en la interfaz principal obligaría
    /// a que cada driver futuro fingiera soportarlo. Un driver que pueda mover
    /// cámaras implementa las dos; el servicio comprueba con «is IVmsPtz».
    ///
    /// ── El riesgo que gobierna este diseño ──────────────────────────────────
    /// La API de HikCentral es de ARRANCAR y PARAR (§5.4.23: action 0 = start,
    /// 1 = stop). Si el «parar» nunca llega —el navegador se cierra, se cae la
    /// red, el operador suelta el ratón fuera de la ventana— la cámara sigue
    /// girando indefinidamente y queda apuntando a cualquier parte.
    ///
    /// Por eso el contrato NO es «arranca» y «para» por separado: es MOVER UN
    /// PASO. El backend arranca, espera una duración acotada y para él mismo,
    /// dentro de la misma llamada. Una petición no puede dejar la cámara
    /// girando, pase lo que pase en el navegador.
    /// </summary>
    public interface IVmsPtz
    {
        /// <summary>
        /// Mueve la cámara un paso acotado, o dispara un comando puntual
        /// (preset, patrulla), que el VMS ejecuta solo y no hay que parar.
        /// </summary>
        Task<DtoVmsResultado<DtoPtzResultado>> MoverAsync(
            DtoVmsConexion cx, string camaraCodigo, DtoPtzPeticion peticion, CancellationToken ct);
    }
}
