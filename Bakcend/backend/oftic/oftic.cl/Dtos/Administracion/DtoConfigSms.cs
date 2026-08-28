namespace Comun.Dtos.Administracion
{
    /// <summary>Config del proveedor de SMS expuesta al frontend — el api_key real nunca se envía completo.</summary>
    public class DtoConfigSms
    {
        public string  Proveedor       { get; set; } = "INFOBIP";
        public string? BaseUrl         { get; set; }
        public string? Sender          { get; set; }
        public bool    TieneApiKey     { get; set; }
        /// <summary>Últimos 4 caracteres del api_key guardado, o null si no hay ninguno — solo para que el admin confirme cuál tiene cargado.</summary>
        public string? ApiKeyMascara   { get; set; }
        public string? UsuarioModifica { get; set; }
        public string? FechaModifica   { get; set; }
    }

    public class DtoConfigSmsRequest
    {
        public string  Proveedor { get; set; } = "INFOBIP";
        public string? BaseUrl   { get; set; }
        /// <summary>Vacío/null = mantener el api_key ya guardado (no se sobreescribe).</summary>
        public string? ApiKey   { get; set; }
        public string? Sender   { get; set; }
    }

    public class DtoConfigSmsResult
    {
        public bool   Success { get; set; }
        public string Message { get; set; } = "";
    }

    public class DtoProbarSmsRequest
    {
        public string NumeroTelefono { get; set; } = "";
    }
}
