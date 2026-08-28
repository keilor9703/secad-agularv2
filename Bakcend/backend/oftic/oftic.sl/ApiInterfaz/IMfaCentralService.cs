namespace Servicios.ApiInterfaz
{
    // ── Respuestas internas del cliente MFA ───────────────────────────────────

    public class MfaStateResult
    {
        public bool      Ok               { get; set; }
        public string    Mensaje          { get; set; } = "";
        public bool      ServiceDown      { get; set; }
        public int       MfaHabilitado    { get; set; }   // 0=no enrolado, 1=enrolado
        public int       RequireReenroll  { get; set; }   // 1=forzar re-enrolamiento
        public int       IntentosFallidos { get; set; }
        public DateTime? BloqueoHasta     { get; set; }
    }

    public class MfaEnrollResult
    {
        public bool    Ok          { get; set; }
        public string  Mensaje     { get; set; } = "";
        public bool    ServiceDown { get; set; }
        public string? QrBase64    { get; set; }
        public string? ManualKey   { get; set; }
        public string? EnrollToken { get; set; }
    }

    public class MfaVerifyResult
    {
        public bool      Ok          { get; set; }
        public string    Mensaje     { get; set; } = "";
        public bool      ServiceDown { get; set; }
        public bool      Blocked     { get; set; }
        public DateTime? BloqueoHasta{ get; set; }
        public int       CodigoError { get; set; }
    }

    public class MfaResetRequestResult
    {
        public bool   Ok          { get; set; }
        public string Mensaje     { get; set; } = "";
        public bool   ServiceDown { get; set; }
    }

    public class MfaResetConfirmResult
    {
        public bool      Ok          { get; set; }
        public string    Mensaje     { get; set; } = "";
        public bool      ServiceDown { get; set; }
        public DateTime? AvailableAt { get; set; }
    }

    // ── Interfaz principal ────────────────────────────────────────────────────

    /// <summary>
    /// Cliente HTTP para el servicio centralizado Api2FA de la Policía Nacional.
    /// Gestiona obtención/cache del bearer token y exposición de todos los
    /// endpoints necesarios para el flujo 2FA en el login.
    /// </summary>
    public interface IMfaCentralService
    {
        /// <summary>Consulta el estado MFA del usuario (enrolado, bloqueado, etc.).</summary>
        Task<MfaStateResult> GetStateAsync(long identificacion, string usuario, CancellationToken ct = default);

        /// <summary>Inicia el enrolamiento: devuelve QR base64, clave manual y enrollToken.</summary>
        Task<MfaEnrollResult> EnrollStartAsync(long identificacion, string usuario, CancellationToken ct = default);

        /// <summary>Confirma el enrolamiento validando el primer código TOTP.</summary>
        Task<MfaVerifyResult> EnrollConfirmAsync(long identificacion, string usuario, string enrollToken, string code, string ip, CancellationToken ct = default);

        /// <summary>Verifica un código TOTP. Puede guardar dispositivo confiable.</summary>
        Task<MfaVerifyResult> VerifyAsync(long identificacion, string usuario, string code, bool rememberDevice, string? deviceId, string ip, CancellationToken ct = default);

        /// <summary>Comprueba si el deviceId ya está registrado como dispositivo confiable.</summary>
        Task<bool> IsTrustedAsync(long identificacion, string usuario, string deviceId, CancellationToken ct = default);

        /// <summary>Envía un código de reset al correo institucional del usuario.</summary>
        Task<MfaResetRequestResult> ResetRequestAsync(long identificacion, string usuario, string ip, CancellationToken ct = default);

        /// <summary>Valida el código enviado al correo (paso 1 del reset).</summary>
        Task<MfaResetConfirmResult> ResetConfirmAsync(long identificacion, string usuario, string code, string ip, CancellationToken ct = default);

        /// <summary>Ejecuta el reset definitivo (limpia secreto TOTP en Api2FA).</summary>
        Task<MfaResetRequestResult> ResetExecuteAsync(long identificacion, string usuario, string ip, CancellationToken ct = default);
    }
}
