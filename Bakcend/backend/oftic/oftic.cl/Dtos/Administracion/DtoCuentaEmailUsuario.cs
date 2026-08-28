namespace Comun.Dtos.Administracion
{
    public class DtoCuentaEmailUsuario
    {
        public int IdCuentaUsuario { get; set; }
        public int IdCuenta { get; set; }
        public string NombreCuenta { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public int IdUsuario { get; set; }
        public string UsuarioLogin { get; set; } = string.Empty;
        public string NombreCompleto { get; set; } = string.Empty;
        public string Identificacion { get; set; } = string.Empty;
        public int Vigente { get; set; }
        public string? UsuarioCrea { get; set; }
        public DateTime? FechaCrea { get; set; }
        public string? UsuarioModifica { get; set; }
        public DateTime? FechaModifica { get; set; }
        public string? IpRegistro { get; set; }
    }

    public class DtoCuentaEmailUsuarioRequest
    {
        public int IdCuenta { get; set; }
        public int IdUsuario { get; set; }
        public string? UsuarioAuditoria { get; set; }
        public string? IpAuditoria { get; set; }
    }

    public class DtoCuentaEmailUsuarioEstadoRequest
    {
        public int IdCuentaUsuario { get; set; }
        public int Vigente { get; set; }
        public string? UsuarioAuditoria { get; set; }
        public string? IpAuditoria { get; set; }
    }
}
