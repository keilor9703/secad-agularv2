using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Comun.Dtos
{
    public class DtoRespuesta
    {
        public int Codigo { get; set; }
        public string? Mensaje { get; set; }
        public bool Estado { get; set; }
        public string? Respuesta { get; set; }
    }
    public class DtoRespuesta<T>
    {
        public int Codigo { get; set; }
        public string? Mensaje { get; set; }
        public bool Estado { get; set; }
        public T? Respuesta { get; set; }
    }
}
