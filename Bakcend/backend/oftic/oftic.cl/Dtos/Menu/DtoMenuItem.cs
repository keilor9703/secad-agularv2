using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Comun.Dtos.Menu
{
    public class DtoMenuItem
    {
        public long IdMenu { get; set; }
        public string Descripcion { get; set; } = "";
        public long IdPadre { get; set; }
        public int Posicion { get; set; }
        public string Tipo { get; set; } = "";
        public string? Icono { get; set; }
        public int Vigente { get; set; }
        public string? Detalle { get; set; }


    }

    public class DtoMenuSaveRequest
    {
        public long? IdMenu { get; set; }
        public string? Descripcion { get; set; }
        public long IdPadre { get; set; }
        public int Posicion { get; set; }
        public string? Tipo { get; set; }
        public string? Icono { get; set; }
        public int Vigente { get; set; } = 1;
        public string? Detalle { get; set; }
    }

    public class DtoMenuEstadoRequest
    {
        public int Vigente { get; set; }
    }

    public class DtoMenuResult
    {
        public long Id { get; set; }
        public string Message { get; set; } = string.Empty;
    }

    public class DtoMenuRolCatalogItem
    {
        public int IdRol { get; set; }
        public string Descripcion { get; set; } = string.Empty;
    }

    public class DtoMenuRolItem
    {
        public long IdMenuRol { get; set; }
        public int IdRol { get; set; }
        public string DescripcionRol { get; set; } = string.Empty;
    }

    public class DtoAssignMenuRolRequest
    {
        public int IdRol { get; set; }
    }

    public class DtoRoleMenuItem
    {
        public long IdMenu { get; set; }
        public string DescripcionMenu { get; set; } = string.Empty;
        public long IdPadre { get; set; }
        public int Posicion { get; set; }
        public string Tipo { get; set; } = string.Empty;
        public string? Detalle { get; set; }
    }

    public class DtoAssignRoleMenuRequest
    {
        public long IdMenu { get; set; }
    }

    /// <summary>
    /// El conjunto COMPLETO de pantallas que el rol podrá ver. Lo que no venga
    /// en la lista se retira. Es lo que envía la pantalla de casillas al
    /// guardar: una decisión entera, no una concesión suelta.
    /// </summary>
    public class DtoReemplazarMenusRolRequest
    {
        public List<long> IdMenus { get; set; } = new();
    }
}
