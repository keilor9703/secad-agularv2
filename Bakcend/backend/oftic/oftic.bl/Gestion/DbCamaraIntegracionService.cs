using Comun.Dtos.Camaras;
using Datos.Interfaz;
using Negocio.Interfaz;
using Servicios.ApiInterfaz;

namespace Negocio.Gestion
{
    /// <summary>
    /// Lógica de negocio de integraciones VMS. Define el catálogo de drivers
    /// (auto-descriptivos) y valida la configuración contra ellos antes de guardar.
    /// </summary>
    public class DbCamaraIntegracionService : IDbCamaraIntegracionService
    {
        private readonly IDbCamaraIntegracionRepository _repo;
        private readonly IVmsReaderFactory               _drivers2;

        public DbCamaraIntegracionService(
            IDbCamaraIntegracionRepository repo,
            IVmsReaderFactory drivers)
        {
            _repo     = repo;
            _drivers2 = drivers;
        }

        // ════════════════════════════════════════════════════════════════════════
        // Catálogo de drivers soportados (registry). Agregar un driver aquí +
        // su implementación de runtime NO obliga a tocar la UI: el frontend pinta
        // el formulario a partir de estos descriptores.
        // ════════════════════════════════════════════════════════════════════════
        private static readonly List<DtoVmsDriverDescriptor> _drivers = new()
        {
            new DtoVmsDriverDescriptor
            {
                Driver      = VmsDrivers.HikCentral,
                Nombre      = "HikCentral Professional (OpenAPI)",
                Descripcion = "VMS central de Hikvision. Entrega video HLS al navegador vía OpenAPI (Artemis). Sin gateway.",
                Icono       = "fa-solid fa-server",
                RequiereGateway = false,
                Campos = new()
                {
                    new() { Key = "baseUrl",   Nombre = "URL del HikCentral", Tipo = "text", Requerido = true,
                            Ayuda = "Host y puerto TLS del servidor HikCentral.", Ejemplo = "https://10.41.0.10:443" },
                    new() { Key = "userId",    Nombre = "Usuario (userId)", Tipo = "text", Requerido = true,
                            Ayuda = "Usuario de HikCentral usado en la cabecera userId de las peticiones de video." },
                    new() { Key = "appKey",    Nombre = "App Key", Tipo = "text", Requerido = true,
                            Ayuda = "Generado al crear el Partner en HikCentral." },
                    new() { Key = "appSecret", Nombre = "App Secret", Tipo = "password", Requerido = true, Secreto = true,
                            Ayuda = "Secreto para firmar (AK/SK HMAC-SHA256). No se muestra una vez guardado." },
                    new() { Key = "streamType", Nombre = "Calidad de video", Tipo = "select", Requerido = false,
                            Opciones = new() { "1", "0" },
                            Ayuda = "1 = sub-stream (H.264, recomendado para el navegador) · 0 = main (suele H.265)." },
                    new() { Key = "protocol", Nombre = "Protocolo de video", Tipo = "select", Requerido = false,
                            Opciones = new() { "hls_s", "hls", "websocket" },
                            Ayuda = "hls_s = HLS sobre TLS (recomendado: la especificación exige cifrado en " +
                                    "tránsito; lo añadió la OpenAPI V3.1.1) · hls = sin cifrar · " +
                                    "websocket = para el reproductor jsDecoder, necesario si la cámara solo tiene H.265." }
                }
            },
            new DtoVmsDriverDescriptor
            {
                Driver      = VmsDrivers.OnvifRtsp,
                Nombre      = "Genérico ONVIF / RTSP",
                Descripcion = "Cámaras o NVR sueltos por RTSP. Requiere un media gateway (go2rtc/MediaMTX) que convierta RTSP→WebRTC/HLS.",
                Icono       = "fa-solid fa-video",
                RequiereGateway = true,
                Campos = new()
                {
                    new() { Key = "rtspPlantilla", Nombre = "Plantilla URL RTSP", Tipo = "text", Requerido = true,
                            Ayuda = "Use {usuario},{clave},{host},{canal}.",
                            Ejemplo = "rtsp://{usuario}:{clave}@{host}:554/Streaming/Channels/{canal}02" },
                    new() { Key = "usuario", Nombre = "Usuario", Tipo = "text", Requerido = false },
                    new() { Key = "clave",   Nombre = "Contraseña", Tipo = "password", Requerido = false, Secreto = true },
                    new() { Key = "gatewayUrl", Nombre = "URL del media gateway", Tipo = "text", Requerido = true,
                            Ayuda = "go2rtc/MediaMTX que expone el stream al navegador (WebRTC/HLS).",
                            Ejemplo = "https://gateway.local:1984" }
                }
            }
        };

        public List<DtoVmsDriverDescriptor> GetDrivers() => _drivers;

        private static DtoVmsDriverDescriptor? Descriptor(string driver) =>
            _drivers.FirstOrDefault(d =>
                string.Equals(d.Driver, driver?.Trim(), StringComparison.OrdinalIgnoreCase));

        // ════════════════════════════════════════════════════════════════════════
        // CRUD
        // ════════════════════════════════════════════════════════════════════════

        public async Task<List<DtoCamaraIntegracion>> GetAllAsync(CancellationToken ct)
        {
            var list = await _repo.GetAllAsync(ct);
            foreach (var i in list)
                i.DriverNombre = Descriptor(i.Driver)?.Nombre ?? i.Driver;
            return list;
        }

        public async Task<(bool, string, string?)> CreateAsync(
            DtoCamaraIntegracionRequest req, string usuario, CancellationToken ct)
        {
            var val = Validar(req, esCreacion: true);
            if (!val.Ok) return (false, val.Mensaje, null);
            NormalizarBaseUrl(req);
            return await _repo.CreateAsync(req, usuario, ct);
        }

        public async Task<(bool, string)> UpdateAsync(
            long id, DtoCamaraIntegracionRequest req, string usuario, CancellationToken ct)
        {
            var val = Validar(req, esCreacion: false);
            if (!val.Ok) return (false, val.Mensaje);
            NormalizarBaseUrl(req);
            return await _repo.UpdateAsync(id, req, usuario, ct);
        }

        public Task<(bool, string)> ToggleAsync(long id, CancellationToken ct) => _repo.ToggleAsync(id, ct);
        public Task<(bool, string)> DeleteAsync(long id, CancellationToken ct) => _repo.DeleteAsync(id, ct);

        public async Task<DtoCamaraPruebaResult> ProbarConexionAsync(
            long id, DtoCamaraIntegracionRequest req, CancellationToken ct)
        {
            // Si la ficha ya existe, el formulario puede no reenviar el
            // secreto (se muestra vacío para no revelarlo). Se valida contra
            // el que está guardado, que es el que se va a usar de verdad.
            var guardada = id > 0 ? await _repo.GetConexionAsync(id, ct) : null;
            var val = Validar(req, esCreacion: guardada is null);
            if (!val.Ok) return new DtoCamaraPruebaResult { Ok = false, Mensaje = val.Mensaje };

            NormalizarBaseUrl(req);

            var lector = _drivers2.Para(req.Driver);
            if (lector is null)
                return new DtoCamaraPruebaResult
                {
                    Ok = false,
                    Mensaje = $"El driver '{req.Driver}' está en el catálogo pero todavía no tiene " +
                              "implementación de conexión. La configuración se puede guardar; probarla, no."
                };

            var cx = new DtoVmsConexion
            {
                Driver      = req.Driver,
                BaseUrl     = req.BaseUrl ?? guardada?.BaseUrl ?? "",
                NodoEdgeUrl = req.NodoEdgeUrl ?? guardada?.NodoEdgeUrl,
                Config      = new Dictionary<string, string>(req.Config ?? new()),
                Secretos    = new Dictionary<string, string>(guardada?.Secretos ?? new()),
            };
            // Lo que el formulario sí manda pisa lo guardado: es lo que el
            // administrador quiere probar ahora.
            foreach (var kv in req.Secretos ?? new())
                if (!string.IsNullOrWhiteSpace(kv.Value)) cx.Secretos[kv.Key] = kv.Value;

            var r = await lector.ProbarAsync(cx, ct);
            return new DtoCamaraPruebaResult
            {
                Ok                = r.Ok,
                Mensaje           = r.Mensaje,
                CamarasDetectadas = r.Ok ? r.Datos : null,
            };
        }

        // ── Helpers ──────────────────────────────────────────────────────────────

        /// <summary>base_url (columna) se toma del campo config["baseUrl"] para mantener la UI genérica.</summary>
        private static void NormalizarBaseUrl(DtoCamaraIntegracionRequest req)
        {
            if (req.Config != null && req.Config.TryGetValue("baseUrl", out var b) && !string.IsNullOrWhiteSpace(b))
                req.BaseUrl = b.Trim();
        }

        private static (bool Ok, string Mensaje) Validar(DtoCamaraIntegracionRequest req, bool esCreacion)
        {
            if (req is null || string.IsNullOrWhiteSpace(req.Nombre))
                return (false, "El nombre es obligatorio.");

            var desc = Descriptor(req.Driver);
            if (desc is null)
                return (false, $"Driver no soportado: '{req.Driver}'.");

            req.Config   ??= new();
            req.Secretos ??= new();

            foreach (var campo in desc.Campos.Where(c => c.Requerido))
            {
                if (campo.Secreto)
                {
                    // En edición, un secreto ya guardado puede venir vacío (se conserva).
                    var provisto = req.Secretos.TryGetValue(campo.Key, out var sv) && !string.IsNullOrWhiteSpace(sv);
                    if (esCreacion && !provisto)
                        return (false, $"El campo '{campo.Nombre}' es obligatorio.");
                }
                else
                {
                    var provisto = req.Config.TryGetValue(campo.Key, out var cv) && !string.IsNullOrWhiteSpace(cv);
                    if (!provisto)
                        return (false, $"El campo '{campo.Nombre}' es obligatorio.");
                }
            }
            return (true, "");
        }
    }
}
