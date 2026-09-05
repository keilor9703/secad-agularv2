using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Comun.Dtos
{
    public class DtoFuncionario
    {
        public string? identificacion { get; set; }
        public string? nombres { get; set; }
        public string? apellidos { get; set; }
        public string? situacionLaboral { get; set; }
        public string? correo { get; set; }
        public string? usuario { get; set; }
        public string? celular { get; set; }
        public string? dependencia { get; set; }
        public string? siglaFisica { get; set; }
        public string? siglaLaborando { get; set; }
        public string? nombreGrado { get; set; }
        public string? cargo { get; set; }
        public string? tiempoServicio { get; set; }
        public string? gradAlfabetico { get; set; }
        public string? funcionarioCodigo { get; set; }
        public string? undeLaborandoCodigo { get; set; }
        public string? codigoCargo { get; set; }
        public bool activo { get; set; } = true;
        /// <summary>ID local en ctr_usuarios (Snowflake). Se rellena tras EnsureUsuarioExistsAsync.</summary>
        public long idUsuario { get; set; }
    }

    public class DtoRol
    {
        public int id { get; set; }
        public string? nombre { get; set; }
    }

    public class DtoRolAsignado
    {
        public int id { get; set; }
        public string? rol { get; set; }
        public string? fechaInicio { get; set; }
        public string? fechaFin { get; set; }
        public string? estado { get; set; }
        public string? justificacion { get; set; }
    }

    public class DtoUsuarioListadoItem
    {
        public long idUsuario { get; set; }
        public string identificacion { get; set; } = string.Empty;
        public string username { get; set; } = string.Empty;
        public string nombreCompleto { get; set; } = string.Empty;
        public string rol { get; set; } = string.Empty;
        public string? fechaFinRol { get; set; }
        /// <summary>POLICIA o CIVIL — determina si la consulta de detalle va a PIP o a la BD local.</summary>
        public string tipoUsuario { get; set; } = "POLICIA";
    }

    /// <summary>
    /// Datos de un usuario leídos directamente de ctr_usuarios (sin pasar por PIP).
    /// Usado para administrar usuarios civiles / otras entidades.
    /// </summary>
    public class DtoUsuarioLocalDetalle
    {
        public long idUsuario { get; set; }
        public string username { get; set; } = string.Empty;
        public string? identificacion { get; set; }
        public string? nombres { get; set; }
        public string? apellidos { get; set; }
        public string? email { get; set; }
        public string? entidad { get; set; }
        public string? cargo { get; set; }
        public string tipoUsuario { get; set; } = "POLICIA";
        public bool activo { get; set; }
        // ── Datos operacionales (módulos Recepción / Turnos / Eventos) ──────
        public int cadcanaFuerzaId { get; set; }
        public int cadcanaCodigo   { get; set; }
        public int acd             { get; set; }
        public int sitioGrabacion  { get; set; }
    }

    public class DtoTokenRequest
    {
        public string? Usuario { get; set; }
        public string? Contrasena { get; set; }
    }

    public class DtoTokenResponse
    {
        public string? token { get; set; }
        public string? usuario { get; set; }
        public bool success { get; set; }
        public string? message { get; set; }
    }

    public class DtoUsuarioRequest
    {
        public string? username { get; set; }
        public string? identificacion { get; set; }
        public string? nombres { get; set; }
        public string? apellidos { get; set; }
        public string? email { get; set; }
        public string? gradAlfabetico { get; set; }
        public string? funcionario { get; set; }
        public string? undeLaborando { get; set; }
        public string? codigoCargo { get; set; }
        public bool activo { get; set; }
    }

    /// <summary>
    /// Request para crear/actualizar un usuario civil o de otra entidad.
    /// Estos usuarios autentican localmente (nunca via OUD/PIP/LDAP).
    /// El codigo_dane y sitio_graba son heredados del JWT del administrador creador.
    /// </summary>
    public class DtoCivilUsuarioRequest
    {
        public string? username { get; set; }
        /// <summary>Contraseña en texto plano; se almacena como hash BCrypt en secad_users_fallback.</summary>
        public string? password { get; set; }
        public string? identificacion { get; set; }
        public string? nombres { get; set; }
        public string? apellidos { get; set; }
        public string? email { get; set; }
        public string? entidad { get; set; }
        public string? cargo { get; set; }
        public bool activo { get; set; } = true;
    }

    public class DtoGuardarUsuarioResult
    {
        public long idUsuario { get; set; }
        public string message { get; set; } = string.Empty;
    }

    /// <summary>
    /// Retiro de un rol concedido a un usuario. El motivo es obligatorio: es
    /// lo que queda escrito en la auditoría, y sin él el retiro no se explica
    /// solo. Va por POST y no por DELETE porque DELETE con cuerpo lo descartan
    /// algunos proxies corporativos.
    /// </summary>
    public class DtoRetirarRolRequest
    {
        public string? usuario        { get; set; }
        public string? identificacion { get; set; }
        public string? observacion    { get; set; }
    }

    /// <summary>Retiro (bloqueo) de un usuario, con su motivo.</summary>
    public class DtoRetirarUsuarioRequest
    {
        public string? observacion { get; set; }
    }

    public class DtoAsignarRolRequest
    {
        public int usuarioId { get; set; }
        public string? usuario { get; set; }
        public string? identificacion { get; set; }
        public int rolId { get; set; }
        public string? justificacion { get; set; }
        public string? fechaFin { get; set; }
        public int vigente { get; set; } = 1;
    }

    public class DtoRolAdmin
    {
        public int id { get; set; }
        public string? nombre { get; set; }
        public int vigente { get; set; }
    }

    public class DtoSaveRolRequest
    {
        public int? id { get; set; }
        public string? nombre { get; set; }
        public int vigente { get; set; } = 1;
    }

    public class DtoSetRolEstadoRequest
    {
        public int vigente { get; set; }
    }

    public class DtoSaveRolResult
    {
        public long idRol { get; set; }
        public string message { get; set; } = string.Empty;
    }
}
