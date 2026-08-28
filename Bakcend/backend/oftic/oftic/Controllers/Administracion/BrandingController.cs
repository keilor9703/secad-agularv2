using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.Hosting;
using ofic.Security;
using System.Text.Json;

namespace ofic.Controllers.Administracion
{
    public class BrandingConfig
    {
        public string sistema { get; set; } = "SECAD";
        public string nombreSistema { get; set; } = "SECAD";
        public string? logoFileName { get; set; } = null;
        public string? faviconFileName { get; set; } = null;
    }

    public class BrandingSaveRequest
    {
        public string? sistema { get; set; }
        public string? nombreSistema { get; set; }
        public string? logoFileName { get; set; }
        public string? faviconFileName { get; set; }
    }

    public class BrandingUploadRequest
    {
        public IFormFile? File { get; set; }
    }

    [ApiController]
    [Route("api/[controller]")]
    [EnableCors("PublicCors")]
    public class BrandingController : ControllerBase
    {
        private const string ConfigName = "config.json";
        private const long MaxLogoBytes = 5 * 1024 * 1024;
        private const long MaxFaviconBytes = 2 * 1024 * 1024;

        private static readonly HashSet<string> AllowedLogoExtensions = new(StringComparer.OrdinalIgnoreCase)
        {
            ".jpg", ".jpeg", ".png", ".webp"
        };

        private static readonly HashSet<string> AllowedFaviconExtensions = new(StringComparer.OrdinalIgnoreCase)
        {
            ".ico", ".png", ".webp"
        };

        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            PropertyNamingPolicy = null,
            WriteIndented = true
        };

        private readonly ILogger<BrandingController> _logger;
        private readonly string _rootPath;
        private readonly string _configPath;

        public BrandingController(ILogger<BrandingController> logger, IHostEnvironment env)
        {
            _logger = logger;
            _rootPath = ResolveStoragePath(env.ContentRootPath);
            _configPath = Path.Combine(_rootPath, ConfigName);
        }

        [HttpGet("config")]
        [AllowAnonymous]
        public IActionResult GetPublicConfig()
        {
            try
            {
                EnsureStorage();
                var cfg = ReadConfig();
                return Ok(new
                {
                    sistema = cfg.sistema,
                    nombreSistema = cfg.nombreSistema,
                    systemName = cfg.nombreSistema,
                    logoUrl = BuildLogoUrl(cfg.logoFileName),
                    faviconUrl = BuildFaviconUrl(cfg.faviconFileName)
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error consultando configuracion branding");
                return StatusCode(500, new { message = "Error consultando configuracion branding." });
            }
        }

        [HttpGet("admin-config")]
        [Authorize]
        public IActionResult GetAdminConfig()
        {
            try
            {
                EnsureStorage();
                var cfg = ReadConfig();
                return Ok(new
                {
                    sistema = cfg.sistema,
                    nombreSistema = cfg.nombreSistema,
                    systemName = cfg.nombreSistema,
                    logoFileName = cfg.logoFileName,
                    logoUrl = BuildLogoUrl(cfg.logoFileName),
                    faviconFileName = cfg.faviconFileName,
                    faviconUrl = BuildFaviconUrl(cfg.faviconFileName)
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error consultando configuracion admin branding");
                return StatusCode(500, new { message = "Error consultando configuracion admin branding." });
            }
        }

        [HttpGet("logo/{fileName}")]
        [AllowAnonymous]
        public IActionResult GetLogo([FromRoute] string fileName)
        {
            return GetAsset(fileName, AllowedLogoExtensions, "logo");
        }

        [HttpGet("favicon/{fileName}")]
        [AllowAnonymous]
        public IActionResult GetFavicon([FromRoute] string fileName)
        {
            return GetAsset(fileName, AllowedFaviconExtensions, "favicon");
        }

        [HttpPost("upload-logo")]
        [Authorize]
        [Consumes("multipart/form-data")]
        [RequestSizeLimit(MaxLogoBytes)]
        [RequestFormLimits(MultipartBodyLengthLimit = MaxLogoBytes)]
        public Task<IActionResult> UploadLogo([FromForm] BrandingUploadRequest request)
        {
            return UploadAsset(request, MaxLogoBytes, AllowedLogoExtensions, "logo", (cfg, fileName) => cfg.logoFileName = fileName);
        }

        [HttpPost("upload-favicon")]
        [Authorize]
        [Consumes("multipart/form-data")]
        [RequestSizeLimit(MaxFaviconBytes)]
        [RequestFormLimits(MultipartBodyLengthLimit = MaxFaviconBytes)]
        public Task<IActionResult> UploadFavicon([FromForm] BrandingUploadRequest request)
        {
            return UploadAsset(request, MaxFaviconBytes, AllowedFaviconExtensions, "favicon", (cfg, fileName) => cfg.faviconFileName = fileName);
        }

        [HttpPost("save-config")]
        [Authorize]
        public IActionResult SaveConfig([FromBody] BrandingSaveRequest request)
        {
            try
            {
                if (request is null)
                {
                    return BadRequest(new { success = false, message = "Payload requerido." });
                }

                EnsureStorage();
                var cfg = ReadConfig();

                var sistema = (request.sistema ?? cfg.sistema ?? "SECAD").Trim();
                var nombreSistema = (request.nombreSistema ?? cfg.nombreSistema ?? "SECAD").Trim();

                if (string.IsNullOrWhiteSpace(sistema))
                {
                    return BadRequest(new { success = false, message = "El campo Sistema es obligatorio." });
                }
                if (sistema.Length > 10)
                {
                    return BadRequest(new { success = false, message = "El campo Sistema solo permite hasta 10 caracteres." });
                }
                if (!SecurityGuards.IsSafeText(sistema, 10))
                {
                    return BadRequest(new { success = false, message = "El campo Sistema contiene caracteres no permitidos." });
                }

                if (string.IsNullOrWhiteSpace(nombreSistema))
                {
                    return BadRequest(new { success = false, message = "El campo Nombre del sistema es obligatorio." });
                }
                if (nombreSistema.Length > 50)
                {
                    return BadRequest(new { success = false, message = "Nombre del sistema solo permite hasta 50 caracteres." });
                }
                if (!SecurityGuards.IsSafeText(nombreSistema, 50))
                {
                    return BadRequest(new { success = false, message = "Nombre del sistema contiene caracteres no permitidos." });
                }

                cfg.sistema = sistema;
                cfg.nombreSistema = nombreSistema;

                if (!string.IsNullOrWhiteSpace(request.logoFileName))
                {
                    var safeLogo = Path.GetFileName(request.logoFileName.Trim());
                    var exists = System.IO.File.Exists(Path.Combine(_rootPath, safeLogo));
                    if (!exists)
                    {
                        return BadRequest(new { success = false, message = "El logo indicado no existe." });
                    }
                    cfg.logoFileName = safeLogo;
                }

                if (!string.IsNullOrWhiteSpace(request.faviconFileName))
                {
                    var safeFavicon = Path.GetFileName(request.faviconFileName.Trim());
                    var exists = System.IO.File.Exists(Path.Combine(_rootPath, safeFavicon));
                    if (!exists)
                    {
                        return BadRequest(new { success = false, message = "El favicon indicado no existe." });
                    }
                    cfg.faviconFileName = safeFavicon;
                }

                WriteConfig(cfg);
                return Ok(new { success = true, message = "Configuracion de marca guardada correctamente." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error guardando configuracion branding - Path: {RootPath}", _rootPath);
                return StatusCode(500, new { success = false, message = "Error guardando configuracion branding." });
            }
        }

        private IActionResult GetAsset(string fileName, HashSet<string> allowedExtensions, string assetType)
        {
            try
            {
                EnsureStorage();
                var safe = Path.GetFileName(fileName ?? string.Empty);
                if (string.IsNullOrWhiteSpace(safe))
                {
                    return BadRequest(new { message = "Nombre de archivo invalido." });
                }

                var extension = Path.GetExtension(safe);
                if (!allowedExtensions.Contains(extension))
                {
                    return BadRequest(new { message = $"Formato de {assetType} invalido." });
                }

                var fullPath = Path.Combine(_rootPath, safe);
                if (!System.IO.File.Exists(fullPath))
                {
                    return NotFound();
                }

                var provider = new FileExtensionContentTypeProvider();
                if (!provider.TryGetContentType(safe, out var contentType))
                {
                    contentType = "application/octet-stream";
                }

                return PhysicalFile(fullPath, contentType, enableRangeProcessing: true);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error devolviendo {AssetType} branding", assetType);
                return StatusCode(500, new { message = $"Error devolviendo {assetType}." });
            }
        }

        private async Task<IActionResult> UploadAsset(
            BrandingUploadRequest request,
            long maxBytes,
            HashSet<string> allowedExtensions,
            string assetPrefix,
            Action<BrandingConfig, string> applyFileName)
        {
            try
            {
                var file = request?.File;
                if (file is null || file.Length <= 0)
                {
                    return BadRequest(new { success = false, message = "Archivo requerido." });
                }

                if (file.Length > maxBytes)
                {
                    return BadRequest(new { success = false, message = $"El {assetPrefix} excede el tamano permitido." });
                }

                var extension = Path.GetExtension(file.FileName)?.ToLowerInvariant() ?? string.Empty;
                if (!allowedExtensions.Contains(extension))
                {
                    return BadRequest(new { success = false, message = "Formato invalido para el archivo." });
                }
                if (!SecurityGuards.HasValidImageSignature(file, extension))
                {
                    return BadRequest(new { success = false, message = "Firma de archivo invalida para la imagen." });
                }

                EnsureStorage();
                var cfg = ReadConfig();

                var fileName = $"{assetPrefix}-{Guid.NewGuid():N}{extension}";
                var fullPath = Path.Combine(_rootPath, fileName);
                await using (var stream = new FileStream(fullPath, FileMode.Create))
                {
                    await file.CopyToAsync(stream);
                }

                var previous = assetPrefix == "logo" ? cfg.logoFileName : cfg.faviconFileName;
                if (!string.IsNullOrWhiteSpace(previous))
                {
                    TryDeleteAsset(previous);
                }

                applyFileName(cfg, fileName);
                WriteConfig(cfg);

                return Ok(new
                {
                    success = true,
                    fileName,
                    logoUrl = assetPrefix == "logo" ? BuildLogoUrl(fileName) : null,
                    faviconUrl = assetPrefix == "favicon" ? BuildFaviconUrl(fileName) : null,
                    message = assetPrefix == "logo" ? "Logo cargado correctamente." : "Favicon cargado correctamente."
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error cargando {AssetPrefix} branding", assetPrefix);
                return StatusCode(500, new { success = false, message = $"Error cargando {assetPrefix}." });
            }
        }

        private void EnsureStorage()
        {
            Directory.CreateDirectory(_rootPath);
        }

        private BrandingConfig ReadConfig()
        {
            if (System.IO.File.Exists(_configPath))
            {
                try
                {
                    var json = System.IO.File.ReadAllText(_configPath);
                    var cfg = JsonSerializer.Deserialize<BrandingConfig>(json, JsonOptions);
                    if (cfg is not null)
                    {
                        try
                        {
                            using var doc = JsonDocument.Parse(json);
                            var root = doc.RootElement;
                            var hasNombreSistema = root.TryGetProperty("nombreSistema", out _);
                            if (!hasNombreSistema && root.TryGetProperty("systemName", out var legacySystemName))
                            {
                                cfg.nombreSistema = legacySystemName.GetString() ?? "SECAD";
                            }
                        }
                        catch
                        {
                            // If legacy parse fails, fallback defaults below keep config usable.
                        }

                        cfg.sistema = string.IsNullOrWhiteSpace(cfg.sistema) ? "SECAD" : cfg.sistema.Trim();
                        if (cfg.sistema.Length > 10)
                        {
                            cfg.sistema = cfg.sistema[..10];
                        }

                        cfg.nombreSistema = string.IsNullOrWhiteSpace(cfg.nombreSistema) ? "SECAD" : cfg.nombreSistema.Trim();
                        if (cfg.nombreSistema.Length > 50)
                        {
                            cfg.nombreSistema = cfg.nombreSistema[..50];
                        }

                        cfg.logoFileName = string.IsNullOrWhiteSpace(cfg.logoFileName) ? null : Path.GetFileName(cfg.logoFileName);
                        cfg.faviconFileName = string.IsNullOrWhiteSpace(cfg.faviconFileName) ? null : Path.GetFileName(cfg.faviconFileName);
                        return cfg;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "No fue posible leer branding config en {ConfigPath}. Se aplicaran valores por defecto.", _configPath);
                    // If file is corrupt, keep service working with defaults.
                    // Next save operation rewrites a valid config.
                }
            }

            return new BrandingConfig();
        }

        private void WriteConfig(BrandingConfig config)
        {
            try
            {
                EnsureStorage();
                
                var safe = new BrandingConfig
                {
                    sistema = string.IsNullOrWhiteSpace(config.sistema) ? "SECAD" : config.sistema.Trim(),
                    nombreSistema = string.IsNullOrWhiteSpace(config.nombreSistema) ? "SECAD" : config.nombreSistema.Trim(),
                    logoFileName = string.IsNullOrWhiteSpace(config.logoFileName) ? null : Path.GetFileName(config.logoFileName),
                    faviconFileName = string.IsNullOrWhiteSpace(config.faviconFileName) ? null : Path.GetFileName(config.faviconFileName)
                };

                if (safe.sistema.Length > 10)
                {
                    safe.sistema = safe.sistema[..10];
                }
                if (safe.nombreSistema.Length > 50)
                {
                    safe.nombreSistema = safe.nombreSistema[..50];
                }

                var json = JsonSerializer.Serialize(safe, JsonOptions);
                System.IO.File.WriteAllText(_configPath, json);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error guardando configuracion branding");
                throw;
            }
        }

        private static string ResolveStoragePath(string contentRootPath)
        {
            var configured = Environment.GetEnvironmentVariable("SECAD_BRANDING_PATH");
            if (!string.IsNullOrWhiteSpace(configured))
            {
                return Path.GetFullPath(configured);
            }

            // Backward-compatibility: previous Windows-like relative folder accidentally created in Linux publish.
            var legacyFolder = Path.Combine(contentRootPath, @"C:\SECAD\branding");
            if (Directory.Exists(legacyFolder))
            {
                return legacyFolder;
            }

            if (OperatingSystem.IsWindows())
            {
                return @"C:\SECAD\branding";
            }

            return "/opt/oftic/uploads/branding";
        }

        private static string? BuildLogoUrl(string? fileName)
        {
            if (string.IsNullOrWhiteSpace(fileName))
            {
                return null;
            }

            var safe = Path.GetFileName(fileName);
            return $"/api/Branding/logo/{Uri.EscapeDataString(safe)}";
        }

        private static string? BuildFaviconUrl(string? fileName)
        {
            if (string.IsNullOrWhiteSpace(fileName))
            {
                return null;
            }

            var safe = Path.GetFileName(fileName);
            return $"/api/Branding/favicon/{Uri.EscapeDataString(safe)}";
        }

        private void TryDeleteAsset(string? fileName)
        {
            if (string.IsNullOrWhiteSpace(fileName))
            {
                return;
            }

            var safe = Path.GetFileName(fileName);
            var fullPath = Path.Combine(_rootPath, safe);
            if (System.IO.File.Exists(fullPath))
            {
                System.IO.File.Delete(fullPath);
            }
        }
    }
}

