namespace Comun.Dtos.Auth
{
    public class DtoOudResult
    {
        public bool Success { get; set; }
        public string? Uid { get; set; }
        public string? SiglaLaborando { get; set; }
        public string? UndeLaborandoCodigo { get; set; }
        public string? Identificacion { get; set; }
        public string? Nombres { get; set; }
        public string? Apellidos { get; set; }
        public string? Correo { get; set; }
    }
}
