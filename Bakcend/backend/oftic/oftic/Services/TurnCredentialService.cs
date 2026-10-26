using Comun.Dtos.Operacion;
using Microsoft.Extensions.Configuration;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace Api.Services
{
    /// <summary>
    /// Emite los servidores ICE (STUN y TURN) de la videollamada, con
    /// credenciales TURN que caducan.
    ///
    /// <para><b>Por qué existe.</b> Antes la credencial del TURN estaba escrita
    /// en <c>environment.prod.ts</c>, es decir, dentro del JavaScript público de
    /// la aplicación: cualquiera que abriera las herramientas del navegador
    /// podía usar nuestro servidor como retransmisor propio, a nuestra costa.
    /// Eso era inevitable mientras la credencial fuera una sola y permanente.</para>
    ///
    /// <para><b>Cómo funciona.</b> Es el mecanismo estándar de coturn
    /// (<c>use-auth-secret</c>): el servidor y coturn comparten un secreto que
    /// NUNCA sale del backend. Cada credencial es
    /// <c>usuario = "{expiración}:{sujeto}"</c> y
    /// <c>contraseña = Base64(HMAC-SHA1(secreto, usuario))</c>. coturn recalcula
    /// el HMAC con el mismo secreto y rechaza lo que ya expiró. Una credencial
    /// robada deja de servir en {TtlSeconds} segundos, y ni siquiera hay que
    /// guardarla.</para>
    ///
    /// <para><b>Si falta configuración</b> el servicio NO falla: devuelve solo
    /// STUN, que es lo que había por defecto. La videollamada sigue
    /// funcionando donde el NAT lo permite, y el aviso queda en el registro.
    /// Una videollamada que no abre por un secreto mal puesto sería peor que una
    /// que abre solo donde no hace falta TURN.</para>
    ///
    /// Configuración (variables de entorno con doble guion bajo):
    /// <c>Turn:Urls</c> (separadas por coma), <c>Turn:Secret</c>,
    /// <c>Turn:TtlSeconds</c> (60 a 86400, por defecto 3600) y
    /// <c>Turn:StunUrls</c> (por defecto el STUN público de Google).
    /// </summary>
    public sealed class TurnCredentialService
    {
        public const int TtlMinimo  = 60;
        public const int TtlMaximo  = 86400;
        public const int TtlDefecto = 3600;

        private const string StunPorDefecto = "stun:stun.l.google.com:19302";

        private readonly IConfiguration _cfg;
        private readonly ILogger<TurnCredentialService> _logger;
        private readonly TimeProvider _reloj;
        private int _avisado;

        public TurnCredentialService(
            IConfiguration cfg,
            ILogger<TurnCredentialService> logger,
            TimeProvider reloj)
        {
            _cfg    = cfg;
            _logger = logger;
            _reloj  = reloj;
        }

        /// <summary>
        /// Servidores ICE para un participante. <paramref name="sujeto"/> solo
        /// sirve para rastrear en los registros de coturn quién usó el relevo;
        /// no es un secreto ni se valida.
        /// </summary>
        public IReadOnlyList<DtoIceServer> Generar(string sujeto)
        {
            var servidores = new List<DtoIceServer>();

            var stun = Lista(_cfg["Turn:StunUrls"] ?? StunPorDefecto);
            if (stun.Length > 0)
                servidores.Add(new DtoIceServer { Urls = stun });

            var urls = Lista(_cfg["Turn:Urls"]);
            if (urls.Length == 0)
                return servidores;

            var secreto = _cfg["Turn:Secret"];
            if (string.IsNullOrWhiteSpace(secreto))
            {
                // Una sola vez: este método se llama por cada llamada y el
                // aviso repetido taparía el registro.
                if (Interlocked.Exchange(ref _avisado, 1) == 0)
                    _logger.LogWarning(
                        "Turn:Urls está configurado pero Turn:Secret no: se entrega solo STUN. " +
                        "En redes móviles con NAT simétrico la videollamada no conectará.");
                return servidores;
            }

            var ttl = Math.Clamp(_cfg.GetValue("Turn:TtlSeconds", TtlDefecto), TtlMinimo, TtlMaximo);
            var expira = _reloj.GetUtcNow().ToUnixTimeSeconds() + ttl;

            // El separador ':' lo parte coturn por el PRIMER ':' —lo que va
            // antes es la expiración—, así que el sujeto no puede traer otro
            // que confunda a quien lea los registros.
            var usuario = $"{expira}:{Limpiar(sujeto)}";
            var credencial = Convert.ToBase64String(
                HMACSHA1.HashData(Encoding.UTF8.GetBytes(secreto), Encoding.UTF8.GetBytes(usuario)));

            servidores.Add(new DtoIceServer { Urls = urls, Username = usuario, Credential = credencial });
            return servidores;
        }

        private static string[] Lista(string? valor) =>
            string.IsNullOrWhiteSpace(valor)
                ? Array.Empty<string>()
                : valor.Split(new[] { ',', ';', ' ', '\n', '\r', '\t' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        private static string Limpiar(string? sujeto)
        {
            var limpio = Regex.Replace(sujeto ?? "", "[^A-Za-z0-9._-]", "");
            if (limpio.Length > 40) limpio = limpio[..40];
            return limpio.Length == 0 ? "anonimo" : limpio;
        }
    }
}
