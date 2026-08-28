using System.Net;
using System.Net.Mail;
using System.Net.Mime;
using System.Text.RegularExpressions;
using Comun.Dtos.GestionDocumental;
using Datos.Interfaz;
using Datos.Interfaz.GestionDocumental;
using Comun.Security;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Negocio.Gestion.GestionDocumental
{
    public interface IEmailService
    {
        Task<DtoEnvioCorreoResult> EnviarCorreoAsync(DtoEnvioCorreoRequest request, string usuario, string maquina, int? idUsuario);
        List<DtoHistoricoCorreo> ConsultarHistorico();
        string GetSiglaSistema();
    }

    public class EmailService : IEmailService
    {
        private readonly IDbCuentaEmailRepository _cuentaRepo;
        private readonly IDbGestionCorreosRepository _gestionRepo;
        private readonly ILogger<EmailService> _logger;
        private readonly string _uploadsBase;

        public EmailService(
            IDbCuentaEmailRepository cuentaRepo,
            IDbGestionCorreosRepository gestionRepo,
            ILogger<EmailService> logger,
            IConfiguration configuration)
        {
            _cuentaRepo = cuentaRepo;
            _gestionRepo = gestionRepo;
            _logger = logger;

            var configured = configuration["AppSettings:UploadsPath"];
            _uploadsBase = string.IsNullOrWhiteSpace(configured)
                ? Path.Combine(AppContext.BaseDirectory, "uploads")
                : (Path.IsPathRooted(configured)
                    ? configured
                    : Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, configured)));
        }

        public async Task<DtoEnvioCorreoResult> EnviarCorreoAsync(DtoEnvioCorreoRequest request, string usuario, string maquina, int? idUsuario)
        {
            try
            {
                if (!request.IdClasificacion.HasValue || request.IdClasificacion <= 0)
                    return new DtoEnvioCorreoResult { Success = false, Message = "Debe seleccionar una clasificación de la información para enviar el correo." };

                if (!idUsuario.HasValue || idUsuario.Value <= 0)
                    return new DtoEnvioCorreoResult { Success = false, Message = "No fue posible identificar el usuario autenticado." };

                var autorizado = _cuentaRepo.ValidarAutorizacionEnvio(request.IdCuentaEmail, idUsuario.Value);
                if (!autorizado)
                    return new DtoEnvioCorreoResult { Success = false, Message = "No está autorizado para enviar correos con la cuenta seleccionada." };

                var paraAddresses = string.IsNullOrWhiteSpace(request.Para)
                    ? Array.Empty<string>()
                    : request.Para.Split(';', ',').Select(x => x.Trim()).Where(x => !string.IsNullOrWhiteSpace(x)).ToArray();
                var bccAddresses = string.IsNullOrWhiteSpace(request.Cc)
                    ? Array.Empty<string>()
                    : request.Cc.Split(';', ',').Select(x => x.Trim()).Where(x => !string.IsNullOrWhiteSpace(x)).ToArray();

                if (paraAddresses.Length == 0 && bccAddresses.Length == 0)
                    return new DtoEnvioCorreoResult { Success = false, Message = "Debe indicar al menos un destinatario en 'Para' o 'CCO'." };

                _logger.LogInformation("[CORREO] Para={Para} | CCO={Cco} | Asunto={Asunto}", request.Para, string.IsNullOrWhiteSpace(request.Cc) ? "(sin CCO)" : request.Cc, request.Asunto);

                var cuenta = _cuentaRepo.ConsultarCuentas(request.IdCuentaEmail).FirstOrDefault();
                if (cuenta == null || cuenta.Vigente == 0)
                    return new DtoEnvioCorreoResult { Success = false, Message = "La cuenta emisora no existe o no está vigente." };

                string claveDescifrada = CryptoUtility.Decrypt(cuenta.ClaveSmtp);
                string radicadoReal = _cuentaRepo.GetNextRadicado(request.IdCuentaEmail);

                using var client = new SmtpClient(cuenta.ServidorSmtp, cuenta.Puerto);
                client.Credentials = new NetworkCredential(cuenta.UsuarioSmtp, claveDescifrada);
                client.EnableSsl = cuenta.UsarSsl == 1;

                var mailMessage = new MailMessage
                {
                    From = new MailAddress(cuenta.Email, cuenta.NombreCuenta),
                    Subject = request.Asunto,
                    IsBodyHtml = true
                };

                if (request.PrioridadAlta)
                {
                    mailMessage.Priority = MailPriority.High;
                    mailMessage.Headers.Add("X-Priority", "1");
                    mailMessage.Headers.Add("X-MSMail-Priority", "High");
                    mailMessage.Headers.Add("Importance", "High");
                }

                if (request.AcuseRecibido)
                {
                    mailMessage.Headers.Add("Disposition-Notification-To", cuenta.Email);
                    mailMessage.Headers.Add("Return-Receipt-To", cuenta.Email);
                }

                string encabezadoImg = string.Empty;
                if (!string.IsNullOrWhiteSpace(cuenta.ImagenEncabezado))
                {
                    encabezadoImg = $@"<div style='text-align:center;margin-bottom:16px;'>
                        <img src='cid:encabezado_cuenta' style='max-width:100%;height:auto;' alt='{cuenta.NombreCuenta}' />
                    </div>";
                }

                string cuerpoFinal = encabezadoImg +
                    $@"<p style='font-family: Arial, sans-serif; font-size: 14px; margin-bottom: 20px;margin-top: 20px;'>
                       Correo Electrónico  <b>No. {radicadoReal} </b> de fecha  <b>{DateTime.Now:dd/MM/yyyy}</b>
                      </p>" + request.Cuerpo;

                if (!string.IsNullOrEmpty(cuenta.FirmaHtml))
                    cuerpoFinal += $"<br><br>{cuenta.FirmaHtml}";

                cuerpoFinal += $@"<br><p style='text-align: center; color: #000; font-family: Arial, sans-serif;'><b>{request.NombreClasificacion?.ToUpper()}</b></p>";

                string siglaSistema = _cuentaRepo.GetSiglaSistema();
                cuerpoFinal += $@"
                    <br>
                    <table style='width: 100%; border-top: 1px solid #e2e8f0; padding-top: 15px; font-family: Arial, sans-serif;'>
                        <tr>
                            <td style='font-size: 12px; color: #64748b;'>
                                <p style='margin: 0;'><b>SEGURIDAD DE LA INFORMACIÓN:</b></p>
                                <p style='margin: 5px 0;'>Este mensaje fue generado y enviado de forma segura a través del sistema {siglaSistema}.</p>
                                <p style='margin: 0;'><b>ENVIADO POR:</b> {usuario.ToUpper()}</p>
                                <p style='margin: 0;'><b>FECHA DE ENVÍO:</b> {DateTime.Now:dd/MM/yyyy HH:mm:ss}</p>
                            </td>
                        </tr>
                    </table>";

                string cuerpoFinalParaBcc = encabezadoImg.Length > 0 ? cuerpoFinal.Substring(encabezadoImg.Length) : cuerpoFinal;

                var regex = new Regex(@"<img[^>]+src=""data:(image\/[^;]+);base64,([^""]+)""[^>]*>", RegexOptions.IgnoreCase);
                var matches = regex.Matches(cuerpoFinal);
                bool tieneEncabezado = !string.IsNullOrWhiteSpace(cuenta.ImagenEncabezado);

                if (matches.Count > 0 || tieneEncabezado)
                {
                    int imgCount = 0;
                    var resView = AlternateView.CreateAlternateViewFromString(cuerpoFinal, null, MediaTypeNames.Text.Html);

                    if (tieneEncabezado)
                    {
                        try
                        {
                            var urlPath = cuenta.ImagenEncabezado!.TrimStart('/');
                            var subPath = urlPath.StartsWith("uploads/", StringComparison.OrdinalIgnoreCase)
                                ? urlPath.Substring("uploads/".Length)
                                : urlPath;
                            var encabezadoFsPath = Path.Combine(_uploadsBase, subPath);

                            if (File.Exists(encabezadoFsPath))
                            {
                                var ext = Path.GetExtension(encabezadoFsPath).ToLowerInvariant();
                                var mime = ext switch { ".png" => "image/png", ".webp" => "image/webp", _ => "image/jpeg" };
                                var imgBytes = await File.ReadAllBytesAsync(encabezadoFsPath);
                                var lr = new LinkedResource(new MemoryStream(imgBytes), mime) { ContentId = "encabezado_cuenta" };
                                resView.LinkedResources.Add(lr);
                            }
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning(ex, "No se pudo adjuntar imagen de encabezado.");
                        }
                    }

                    foreach (Match match in matches)
                    {
                        try
                        {
                            string contentType = match.Groups[1].Value;
                            string base64Data = match.Groups[2].Value;
                            byte[] imageBytes = Convert.FromBase64String(base64Data);
                            string contentId = $"img_{imgCount++}";
                            var lr = new LinkedResource(new MemoryStream(imageBytes), contentType) { ContentId = contentId };
                            resView.LinkedResources.Add(lr);
                            cuerpoFinal = cuerpoFinal.Replace(match.Value, $@"<img src=""cid:{contentId}"" style=""max-width: 100%;"" />");
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning(ex, "Error al procesar imagen embebida.");
                        }
                    }

                    var finalView = AlternateView.CreateAlternateViewFromString(cuerpoFinal, null, MediaTypeNames.Text.Html);
                    foreach (var res in resView.LinkedResources)
                        finalView.LinkedResources.Add(res);
                    mailMessage.AlternateViews.Add(finalView);
                }
                else
                {
                    mailMessage.Body = cuerpoFinal;
                    mailMessage.IsBodyHtml = true;
                }

                foreach (var dest in paraAddresses)
                    mailMessage.To.Add(dest);

                if (request.Adjuntos != null)
                {
                    foreach (var file in request.Adjuntos)
                    {
                        if (file.Length > 0)
                            mailMessage.Attachments.Add(new Attachment(file.OpenReadStream(), file.FileName));
                    }
                }

                _logger.LogInformation("Intentando conectar SMTP: {Servidor}:{Puerto} (SSL: {SSL})", cuenta.ServidorSmtp, cuenta.Puerto, client.EnableSsl);
                ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12 | SecurityProtocolType.Tls13;

                if (mailMessage.To.Count > 0)
                    await client.SendMailAsync(mailMessage).WaitAsync(TimeSpan.FromSeconds(60));

                foreach (var bccAddr in bccAddresses)
                {
                    try
                    {
                        using var bccMsg = new MailMessage
                        {
                            From = mailMessage.From,
                            Subject = mailMessage.Subject,
                            IsBodyHtml = true,
                            Body = cuerpoFinalParaBcc
                        };
                        bccMsg.To.Add(bccAddr);
                        if (request.PrioridadAlta) { bccMsg.Priority = MailPriority.High; }
                        if (request.Adjuntos != null)
                        {
                            foreach (var file in request.Adjuntos)
                            {
                                if (file.Length > 0)
                                    bccMsg.Attachments.Add(new Attachment(file.OpenReadStream(), file.FileName));
                            }
                        }
                        await client.SendMailAsync(bccMsg).WaitAsync(TimeSpan.FromSeconds(30));
                        _logger.LogInformation("[CORREO] Copia oculta enviada a: {BccAddress}", bccAddr);
                    }
                    catch (Exception bccEx)
                    {
                        _logger.LogError(bccEx, "[CORREO] Error al enviar copia oculta a {BccAddress}", bccAddr);
                    }
                }

                var ok = _gestionRepo.RegistrarEnvio(request, radicadoReal, usuario, maquina);
                if (!ok)
                    _logger.LogError("Correo enviado pero falló el registro en BD para radicado {Radicado}", radicadoReal);

                return new DtoEnvioCorreoResult
                {
                    Success = true,
                    Message = ok ? "Correo enviado y registrado correctamente." : "Correo enviado. Advertencia: no se pudo guardar en el historial.",
                    Radicado = radicadoReal
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al enviar correo desde cuenta {Id}", request.IdCuentaEmail);
                return new DtoEnvioCorreoResult { Success = false, Message = $"Error SMTP: {ex.Message}" };
            }
        }

        public List<DtoHistoricoCorreo> ConsultarHistorico() => _gestionRepo.ConsultarHistorico();

        public string GetSiglaSistema() => _cuentaRepo.GetSiglaSistema();
    }
}
