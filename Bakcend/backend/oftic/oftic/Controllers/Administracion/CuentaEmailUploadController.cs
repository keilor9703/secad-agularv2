using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ofic.Security;

namespace ofic.Controllers.Administracion
{
    public class DtoCuentaEmailUploadRequest
    {
        public IFormFile? File { get; set; }
    }

    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class CuentaEmailUploadController : ControllerBase
    {
        private readonly ILogger<CuentaEmailUploadController> _logger;
        private readonly string _uploadsPath;

        private const long MaxImageBytes = 3 * 1024 * 1024;
        private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
        {
            ".jpg", ".jpeg", ".png", ".webp"
        };

        public CuentaEmailUploadController(IConfiguration configuration, IWebHostEnvironment environment, ILogger<CuentaEmailUploadController> logger)
        {
            _logger = logger;
            var configuredBasePath = configuration["AppSettings:UploadsPath"];
            var basePath = string.IsNullOrWhiteSpace(configuredBasePath)
                ? Path.Combine(environment.ContentRootPath, "uploads")
                : configuredBasePath;

            if (!Path.IsPathRooted(basePath))
                basePath = Path.GetFullPath(Path.Combine(environment.ContentRootPath, basePath));

            _uploadsPath = Path.GetFullPath(Path.Combine(basePath, "email-headers"));
        }

        [HttpPost("imagen")]
        [Consumes("multipart/form-data")]
        [RequestSizeLimit(4 * 1024 * 1024)]
        public async Task<IActionResult> UploadImagen([FromForm] DtoCuentaEmailUploadRequest request)
        {
            var file = request?.File;
            if (file is null || file.Length <= 0)
                return BadRequest(new { success = false, message = "Archivo requerido." });

            if (file.Length > MaxImageBytes)
                return BadRequest(new { success = false, message = "La imagen excede 3 MB." });

            var extension = Path.GetExtension(file.FileName)?.ToLowerInvariant() ?? string.Empty;
            if (!AllowedExtensions.Contains(extension))
                return BadRequest(new { success = false, message = "Formato inválido. Use JPG, PNG o WEBP." });

            if (!SecurityGuards.HasValidImageSignature(file, extension))
                return BadRequest(new { success = false, message = "Firma de archivo inválida." });

            Directory.CreateDirectory(_uploadsPath);
            var safeName = $"{Guid.NewGuid():N}{extension}";
            var fullPath = Path.Combine(_uploadsPath, safeName);

            await using var stream = new FileStream(fullPath, FileMode.Create);
            await file.CopyToAsync(stream);

            var publicUrl = $"/uploads/email-headers/{safeName}";
            return Ok(new { success = true, url = publicUrl, fileName = safeName });
        }
    }
}
