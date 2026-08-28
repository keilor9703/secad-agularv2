namespace Comun.Dtos
{
    // ════════════════════════════════════════════════════════════════════════════
    // DTOs de 2FA / MFA para SECAD
    // Flujo: credentials OK → estado MFA → modal en login → token final
    // ════════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Respuesta del endpoint POST /api/Cuenta/Token cuando el usuario
    /// requiere completar el segundo factor antes de recibir el JWT real.
    /// </summary>
    public class DtoMfaLoginResponse : DtoTokenResponse
    {
        /// <summary>true = credenciales OK pero requiere paso 2FA.</summary>
        public bool   RequiresMfa     { get; set; }

        /// <summary>
        /// Modo que debe mostrar el frontend:
        /// 'enroll'  → no enrolado: mostrar modal con QR
        /// 'verify'  → enrolado: mostrar modal de verificación TOTP
        /// 'blocked' → bloqueado temporalmente
        /// 'svcdown' → servicio 2FA caído
        /// </summary>
        public string? MfaMode        { get; set; }

        /// <summary>
        /// Token de sesión MFA de corta vida (firmado con Jwt:MfaSessionKey, 5 min).
        /// Se envía de vuelta en cada llamada MFA posterior para identificar al usuario
        /// sin que pueda manipular los datos.
        /// </summary>
        public string? MfaSessionToken { get; set; }

        // ── Datos para el modal de enrolamiento ───────────────────────────────

        /// <summary>QR code como PNG en base64. Solo presente cuando MfaMode='enroll'.</summary>
        public string? MfaQrBase64    { get; set; }

        /// <summary>Clave manual base32. Solo presente cuando MfaMode='enroll'.</summary>
        public string? MfaManualKey   { get; set; }

        /// <summary>Token de enrolamiento opaco devuelto por Api2FA.</summary>
        public string? MfaEnrollToken { get; set; }

        /// <summary>Bloqueo hasta (ISO 8601). Solo presente cuando MfaMode='blocked'.</summary>
        public string? BloqueoHasta   { get; set; }
    }

    // ── Requests para los endpoints MFA ──────────────────────────────────────

    /// <summary>POST /api/Cuenta/MfaVerify — verificar código TOTP.</summary>
    public class DtoMfaVerifyRequest
    {
        /// <summary>Token de sesión MFA obtenido del primer paso del login.</summary>
        public string MfaSessionToken { get; set; } = "";
        /// <summary>Código TOTP de 6 dígitos.</summary>
        public string Code            { get; set; } = "";
        /// <summary>Si true y DeviceId presente, se guarda el dispositivo como confiable.</summary>
        public bool   RememberDevice  { get; set; }
        /// <summary>UUID del dispositivo para recordar (del localStorage del navegador).</summary>
        public string? DeviceId       { get; set; }
    }

    /// <summary>POST /api/Cuenta/MfaEnrollConfirm — confirmar primer enrolamiento.</summary>
    public class DtoMfaEnrollConfirmRequest
    {
        public string MfaSessionToken { get; set; } = "";
        /// <summary>Código TOTP de 6 dígitos generado por la app tras escanear el QR.</summary>
        public string Code            { get; set; } = "";
        /// <summary>EnrollToken recibido en la respuesta del login (paso 1).</summary>
        public string EnrollToken     { get; set; } = "";
    }

    /// <summary>POST /api/Cuenta/MfaResetRequest — solicitar código de reset por correo.</summary>
    public class DtoMfaResetRequest
    {
        public string MfaSessionToken { get; set; } = "";
    }

    /// <summary>POST /api/Cuenta/MfaResetConfirm — confirmar código de correo y re-enrolar.</summary>
    public class DtoMfaResetConfirmRequest
    {
        public string MfaSessionToken { get; set; } = "";
        /// <summary>Código de 6 dígitos enviado al correo institucional.</summary>
        public string Code            { get; set; } = "";
    }

    // ── Respuesta genérica para los pasos MFA ─────────────────────────────────

    /// <summary>Respuesta de los endpoints MFA intermedios.</summary>
    public class DtoMfaStepResponse
    {
        public bool    Success    { get; set; }
        public string  Message    { get; set; } = "";
        /// <summary>Cuando hay bloqueo — fecha hasta la que está bloqueado (ISO 8601).</summary>
        public string? BloqueoHasta { get; set; }
        /// <summary>true = la respuesta es informativa (no error ni éxito final).</summary>
        public bool    IsInfo     { get; set; }
        /// <summary>Nuevo QR tras un reset exitoso (para pasar al modal de enrolamiento).</summary>
        public string? QrBase64   { get; set; }
        /// <summary>Clave manual tras un reset exitoso.</summary>
        public string? ManualKey  { get; set; }
        /// <summary>Nuevo enrollToken tras un reset exitoso.</summary>
        public string? EnrollToken { get; set; }
        /// <summary>JWT final cuando el paso 2FA es completado correctamente.</summary>
        public string? Token      { get; set; }
    }
}
