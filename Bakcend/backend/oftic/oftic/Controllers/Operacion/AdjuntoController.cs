using Api.Services;
using Comun.Dtos.Operacion;
using Comun.Dtos.Recepcion;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Negocio.Interfaz;
using ofic.Security;
using System.Security.Claims;

namespace Api.Controllers.Operacion
{
    /// <summary>
    /// Gestión de fotos (y grabaciones de videollamada) adjuntas a pedidos de recepción.
    /// El archivo se guarda en disco en este controlador; el servicio sólo maneja la BD.
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class AdjuntoController : ControllerBase
    {
        private readonly IDbAdjuntoService          _svc;
        private readonly IDbVideoLlamadaService      _videoSvc;
        private readonly GrabacionVideoStore        _store;
        private readonly GrabacionFinalizador       _finalizador;
        private readonly ILogger<AdjuntoController> _logger;
        private readonly string                     _uploadsPath;

        private const long MaxFotoBytes  = 8 * 1024 * 1024;    // 8 MB
        private const long MaxVideoBytes = 100 * 1024 * 1024;  // 100 MB — deja margen bajo el límite global de Kestrel (150 MB)

        private static readonly HashSet<string> AllowedExtensions =
            new(StringComparer.OrdinalIgnoreCase) { ".jpg", ".jpeg", ".png", ".webp" };

        private static readonly HashSet<string> AllowedVideoExtensions =
            new(StringComparer.OrdinalIgnoreCase) { ".webm", ".mp4" };

        private string UsuarioClaim => User.FindFirstValue(ClaimTypes.Name)
                                    ?? User.FindFirstValue("unique_name") ?? "sistema";
        private int SitioGraba     => int.TryParse(User.FindFirstValue("sitio_graba"), out var v) ? v : 0;

        public AdjuntoController(
            IDbAdjuntoService          svc,
            IDbVideoLlamadaService     videoSvc,
            GrabacionVideoStore        store,
            GrabacionFinalizador       finalizador,
            IConfiguration             configuration,
            IWebHostEnvironment        environment,
            ILogger<AdjuntoController> logger)
        {
            _svc         = svc;
            _videoSvc    = videoSvc;
            _store       = store;
            _finalizador = finalizador;
            _logger      = logger;

            var configured = configuration["AppSettings:UploadsPath"];
            var root = string.IsNullOrWhiteSpace(configured)
                ? Path.Combine(environment.ContentRootPath, "uploads")
                : configured;

            if (!Path.IsPathRooted(root))
                root = Path.GetFullPath(Path.Combine(environment.ContentRootPath, root));

            _uploadsPath = Path.GetFullPath(Path.Combine(root, "adjuntos"));
        }

        // ── POST api/Adjunto/subir ───────────────────────────────────────────────
        [HttpPost("subir")]
        [Consumes("multipart/form-data")]
        [RequestSizeLimit(9 * 1024 * 1024)]
        public async Task<IActionResult> SubirAdjunto(
            [FromForm] DtoUploadAdjuntoRequest req,
            CancellationToken ct)
        {
            var file = req?.File;
            if (file is null || file.Length == 0)
                return BadRequest(new { success = false, message = "Archivo requerido." });

            if (req!.PedidoId <= 0)
                return BadRequest(new { success = false, message = "PedidoId requerido." });

            if (file.Length > MaxFotoBytes)
                return BadRequest(new { success = false, message = $"La foto excede {MaxFotoBytes / 1024 / 1024} MB." });

            var ext = Path.GetExtension(file.FileName)?.ToLowerInvariant() ?? "";
            if (!AllowedExtensions.Contains(ext))
                return BadRequest(new { success = false, message = "Formato inválido. Use JPG, PNG o WEBP." });

            if (!SecurityGuards.HasValidImageSignature(file, ext))
                return BadRequest(new { success = false, message = "Firma de archivo inválida." });

            var sitio    = req.SitioGraba > 0 ? req.SitioGraba : SitioGraba;
            var subDir   = Path.Combine(_uploadsPath, sitio.ToString(), req.PedidoId.ToString());
            Directory.CreateDirectory(subDir);

            var safeName = $"{Guid.NewGuid():N}{ext}";
            var fullPath = Path.Combine(subDir, safeName);

            try
            {
                await using (var stream = new FileStream(fullPath, FileMode.Create))
                    await file.CopyToAsync(stream, ct);

                var rutaRelativa = string.Join("/", "uploads", "adjuntos",
                    sitio.ToString(), req.PedidoId.ToString(), safeName);

                var adjunto = new DtoAdjunto
                {
                    PedidoId       = req.PedidoId,
                    SitioGraba     = sitio,
                    TipoAdjunto    = "FOTO",
                    NombreOriginal = Path.GetFileName(file.FileName),
                    NombreGuardado = safeName,
                    RutaRelativa   = rutaRelativa,
                    MimeType       = file.ContentType,
                    TamanioBytes   = file.Length,
                    Descripcion    = req.Descripcion,
                    CanalOrigen    = req.CanalOrigen,
                    SubidoPor      = UsuarioClaim,
                    UrlPublica     = "/" + rutaRelativa
                };

                adjunto.Id = await _svc.RegistrarAdjuntoAsync(adjunto, ct);

                return Ok(new { success = true, data = adjunto, message = "Foto subida correctamente." });
            }
            catch (Exception ex)
            {
                // Si la BD falló, limpiar el archivo del disco
                if (System.IO.File.Exists(fullPath))
                    try { System.IO.File.Delete(fullPath); } catch { /* ignorar */ }

                _logger.LogError(ex, "SubirAdjunto error pedidoId={Id}", req.PedidoId);
                return StatusCode(500, new { success = false, message = "Error interno al subir la foto." });
            }
        }

        // ── POST api/Adjunto/subir-video ─────────────────────────────────────────
        // Grabación de una videollamada (MediaRecorder del navegador del
        // despachador) — mismo patrón que SubirAdjunto, con límites propios de video.
        [HttpPost("subir-video")]
        [Consumes("multipart/form-data")]
        [RequestSizeLimit(101 * 1024 * 1024)]
        public async Task<IActionResult> SubirVideo(
            [FromForm] DtoUploadAdjuntoRequest req,
            [FromForm] long sesionId,
            CancellationToken ct)
        {
            var file = req?.File;
            if (file is null || file.Length == 0)
                return BadRequest(new { success = false, message = "Archivo requerido." });

            if (req!.PedidoId <= 0)
                return BadRequest(new { success = false, message = "PedidoId requerido." });

            if (file.Length > MaxVideoBytes)
                return BadRequest(new { success = false, message = $"El video excede {MaxVideoBytes / 1024 / 1024} MB." });

            var ext = Path.GetExtension(file.FileName)?.ToLowerInvariant() ?? "";
            if (!AllowedVideoExtensions.Contains(ext))
                return BadRequest(new { success = false, message = "Formato inválido. Use WEBM o MP4." });

            if (!SecurityGuards.HasValidVideoSignature(file, ext))
                return BadRequest(new { success = false, message = "Firma de archivo inválida." });

            var sitio    = req.SitioGraba > 0 ? req.SitioGraba : SitioGraba;
            var subDir   = Path.Combine(_uploadsPath, sitio.ToString(), req.PedidoId.ToString());
            Directory.CreateDirectory(subDir);

            var safeName = $"{Guid.NewGuid():N}{ext}";
            var fullPath = Path.Combine(subDir, safeName);

            try
            {
                await using (var stream = new FileStream(fullPath, FileMode.Create))
                    await file.CopyToAsync(stream, ct);

                var rutaRelativa = string.Join("/", "uploads", "adjuntos",
                    sitio.ToString(), req.PedidoId.ToString(), safeName);

                var adjunto = new DtoAdjunto
                {
                    PedidoId       = req.PedidoId,
                    SitioGraba     = sitio,
                    TipoAdjunto    = "VIDEO",
                    NombreOriginal = Path.GetFileName(file.FileName),
                    NombreGuardado = safeName,
                    RutaRelativa   = rutaRelativa,
                    MimeType       = file.ContentType,
                    TamanioBytes   = file.Length,
                    Descripcion    = req.Descripcion,
                    CanalOrigen    = "VIDEOLLAMADA",
                    SubidoPor      = UsuarioClaim,
                    UrlPublica     = "/" + rutaRelativa
                };

                adjunto.Id = await _svc.RegistrarAdjuntoAsync(adjunto, ct);

                if (sesionId > 0)
                    await _videoSvc.VincularGrabacionAsync(sesionId, adjunto.Id, ct);

                return Ok(new { success = true, data = adjunto, message = "Grabación subida correctamente." });
            }
            catch (Exception ex)
            {
                if (System.IO.File.Exists(fullPath))
                    try { System.IO.File.Delete(fullPath); } catch { /* ignorar */ }

                _logger.LogError(ex, "SubirVideo error pedidoId={Id} sesionId={Sesion}", req.PedidoId, sesionId);
                return StatusCode(500, new { success = false, message = "Error interno al subir la grabación." });
            }
        }

        // ═════════════════════════════════════════════════════════════════════════
        //  GRABACIÓN RESILIENTE — el video se sube por trozos MIENTRAS se graba
        //
        //  El endpoint clásico subir-video (arriba) sigue existiendo, pero solo
        //  sirve si el despachador llega a oprimir "Detener". Estos tres endpoints
        //  son el camino a prueba de fallos: la evidencia queda en el servidor
        //  desde el primer trozo, así el puesto del despachador muera después.
        // ═════════════════════════════════════════════════════════════════════════

        // ── POST api/Adjunto/grabacion/iniciar ───────────────────────────────────
        [HttpPost("grabacion/iniciar")]
        public async Task<IActionResult> IniciarGrabacion([FromBody] DtoIniciarGrabacionRequest req, CancellationToken ct)
        {
            if (req is null || req.SesionId <= 0)
                return BadRequest(new { success = false, message = "SesionId requerido." });

            try
            {
                await _videoSvc.IniciarGrabacionAsync(
                    req.SesionId, _store.RutaTemp(req.SesionId), UsuarioClaim, ct);

                return Ok(new { success = true, message = "Grabación iniciada." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "IniciarGrabacion error sesionId={Sesion}", req.SesionId);
                return StatusCode(500, new { success = false, message = "No se pudo iniciar la grabación." });
            }
        }

        // ── POST api/Adjunto/grabacion/chunk ─────────────────────────────────────
        // Un trozo de la grabación en curso. Se anexa al archivo temporal de la
        // sesión. Debe ser barato y tolerante: el navegador lo llama cada pocos
        // segundos durante toda la llamada.
        [HttpPost("grabacion/chunk")]
        [Consumes("multipart/form-data")]
        [RequestSizeLimit(25 * 1024 * 1024)]
        public async Task<IActionResult> SubirChunkGrabacion(
            [FromForm] IFormFile file,
            [FromForm] long sesionId,
            CancellationToken ct)
        {
            if (sesionId <= 0)
                return BadRequest(new { success = false, message = "SesionId requerido." });
            if (file is null || file.Length == 0)
                return Ok(new { success = true, message = "Trozo vacío ignorado." });

            try
            {
                await using var origen = file.OpenReadStream();
                var escritos = await _store.AnexarAsync(sesionId, origen, ct);

                if (escritos < 0)
                    return Ok(new { success = false, message = "La grabación alcanzó el tamaño máximo." });

                await _videoSvc.RegistrarChunkAsync(sesionId, escritos, ct);
                return Ok(new { success = true, bytes = escritos });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "SubirChunkGrabacion error sesionId={Sesion}", sesionId);
                return StatusCode(500, new { success = false, message = "No se pudo guardar el trozo." });
            }
        }

        // ── POST api/Adjunto/grabacion/finalizar ─────────────────────────────────
        // Cierra la grabación y la registra como adjunto del caso. Idempotente: si
        // el sweeper ya la cerró (porque el puesto murió), no duplica nada.
        [HttpPost("grabacion/finalizar")]
        public async Task<IActionResult> FinalizarGrabacion([FromBody] DtoIniciarGrabacionRequest req, CancellationToken ct)
        {
            if (req is null || req.SesionId <= 0)
                return BadRequest(new { success = false, message = "SesionId requerido." });

            try
            {
                var grabacion = await _videoSvc.GetGrabacionAsync(req.SesionId, ct);
                if (grabacion is null)
                    return NotFound(new { success = false, message = "Sesión no encontrada." });

                if (grabacion.Estado is null)
                    return Ok(new { success = true, message = "La sesión no tenía grabación." });

                var adjuntoId = await _finalizador.FinalizarAsync(
                    grabacion, UsuarioClaim, "Grabación de videollamada", ct);

                return Ok(new
                {
                    success   = true,
                    adjuntoId,
                    message   = adjuntoId.HasValue
                        ? "Grabación guardada en el caso."
                        : "La grabación ya estaba guardada."
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "FinalizarGrabacion error sesionId={Sesion}", req.SesionId);
                return StatusCode(500, new { success = false, message = "No se pudo cerrar la grabación." });
            }
        }

        // ── GET api/Adjunto/{pedidoId} ───────────────────────────────────────────
        [HttpGet("{pedidoId:long}")]
        public async Task<IActionResult> GetAdjuntos(long pedidoId, CancellationToken ct)
        {
            try
            {
                var data = await _svc.GetAdjuntosAsync(pedidoId, ct);
                return Ok(new { success = true, data });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetAdjuntos error pedidoId={Id}", pedidoId);
                return StatusCode(500, new { success = false, data = new List<object>(), message = ex.Message });
            }
        }

        // ── DELETE api/Adjunto/{id} ──────────────────────────────────────────────
        [HttpDelete("{id:long}")]
        public async Task<IActionResult> EliminarAdjunto(long id, CancellationToken ct)
        {
            try
            {
                var (found, ruta) = await _svc.EliminarRegistroAsync(id, ct);
                if (!found)
                    return NotFound(new { success = false, message = "Adjunto no encontrado." });

                // Borrar el archivo del disco (no crítico — el registro ya fue eliminado)
                if (!string.IsNullOrEmpty(ruta))
                {
                    var fullPath = Path.GetFullPath(
                        Path.Combine(_uploadsPath, "..", "..",
                            ruta.Replace('/', Path.DirectorySeparatorChar)));
                    if (System.IO.File.Exists(fullPath))
                        try { System.IO.File.Delete(fullPath); }
                        catch (Exception ex) { _logger.LogWarning(ex, "No se pudo borrar archivo {P}", fullPath); }
                }

                return Ok(new { success = true, message = "Adjunto eliminado." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "EliminarAdjunto error id={Id}", id);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }
}
