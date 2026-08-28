using Comun.Dtos.Administracion;

namespace Datos.Interfaz
{
    public interface IDbCuentaEmailRepository
    {
        List<DtoCuentaEmail> ConsultarCuentas(int idCuenta);
        List<DtoCuentaEmail> ConsultarCuentasPorUsuario(int idUsuario);
        bool GestionarCuenta(DtoCuentaEmailRequest request);
        bool EliminarCuenta(int idCuenta);
        List<DtoCuentaEmailUsuario> ConsultarAutorizaciones(int? idCuenta, int? idUsuario, int? vigente);
        bool GuardarAutorizacion(DtoCuentaEmailUsuarioRequest request);
        bool ActualizarAutorizacion(DtoCuentaEmailUsuarioEstadoRequest request);
        bool EliminarAutorizacion(DtoCuentaEmailUsuarioEstadoRequest request);
        bool ValidarAutorizacionEnvio(int idCuenta, int idUsuario);
        string GetNextRadicado(int idCuentaEmail);
        string GetSiglaSistema();
    }
}
