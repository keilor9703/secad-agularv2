namespace Datos.Interfaz
{
    /// <summary>Forma interna (con el api_key real) — nunca se expone tal cual al frontend.</summary>
    public class ConfigSmsRegistro
    {
        public string    Proveedor       { get; set; } = "INFOBIP";
        public string?   BaseUrl         { get; set; }
        public string?   ApiKey          { get; set; }
        public string?   Sender          { get; set; }
        public string?   UsuarioModifica { get; set; }
        public DateTime? FechaModifica   { get; set; }
    }

    public interface IDbConfigSmsRepository
    {
        /// <summary>La fila (id=1) siempre existe — la crea la migración V51.</summary>
        Task<ConfigSmsRegistro> GetAsync(CancellationToken ct);
        Task GuardarAsync(ConfigSmsRegistro registro, CancellationToken ct);
    }
}
