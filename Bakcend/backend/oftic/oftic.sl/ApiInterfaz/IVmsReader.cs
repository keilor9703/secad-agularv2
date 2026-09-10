using Comun.Dtos.Camaras;

namespace Servicios.ApiInterfaz
{
    /// <summary>
    /// Lo que SECAD le pide a un sistema de video, sea de la marca que sea.
    ///
    /// La abstracción existe porque en el país hay varios proveedores de VMS:
    /// añadir Genetec o Bosch debe ser un driver nuevo y nada más, igual que se
    /// hizo con GESPO. Deliberadamente NO incluye nada de PTZ ni de video
    /// grabado: eso es de una fase posterior y meterlo aquí ahora obligaría a
    /// que todos los drivers futuros fingieran soportarlo.
    /// </summary>
    public interface IVmsReader
    {
        /// <summary>Identificador del driver que atiende (HIKCENTRAL, ONVIF_RTSP…).</summary>
        string Driver { get; }

        /// <summary>
        /// Comprueba credenciales y alcance de red haciendo una llamada real y
        /// barata. Devuelve cuántas cámaras ve, que es lo que le dice al
        /// administrador que quedó bien configurado.
        /// </summary>
        Task<DtoVmsResultado<int>> ProbarAsync(DtoVmsConexion cx, CancellationToken ct);

        /// <summary>Una página del catálogo de cámaras del VMS.</summary>
        Task<DtoVmsResultado<DtoVmsPagina>> ListarCamarasAsync(
            DtoVmsConexion cx, int pagina, int tamano, CancellationToken ct);

        /// <summary>
        /// URL para reproducir una cámara en vivo. La devuelve el VMS y es de
        /// corta vida: no se guarda, se entrega al navegador y se audita.
        /// </summary>
        Task<DtoVmsResultado<DtoVmsStream>> ObtenerStreamAsync(
            DtoVmsConexion cx, string camaraCodigo, CancellationToken ct);
    }

    /// <summary>Devuelve el driver que corresponde a una conexión.</summary>
    public interface IVmsReaderFactory
    {
        /// <summary>null = no hay driver para ese identificador.</summary>
        IVmsReader? Para(string? driver);
    }
}
