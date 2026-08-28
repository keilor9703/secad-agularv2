using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using ofic.Security;
using System.Text.Json;

namespace ofic.Controllers.Administracion
{
    public class LoginVisualItem
    {
        public string file { get; set; } = string.Empty;
        public bool active { get; set; } = true;
        public int order { get; set; }
        public string? title { get; set; }
        public string? subtitle { get; set; }
    }

    public class LoginVisualConfig
    {
        public int intervalMs { get; set; } = 6000;
        public List<LoginVisualItem> items { get; set; } = new();
    }

    public class LoginVisualSaveConfigRequest
    {
        public int intervalMs { get; set; } = 6000;
        public List<LoginVisualItem>? items { get; set; }
    }

    public class LoginVisualUploadRequest
    {
        public IFormFile? File { get; set; }
    }

    [ApiController]
    [Route("api/[controller]")]
    [EnableCors("PublicCors")]
    public class LoginVisualController : ControllerBase
    {
        private const long MaxImageBytes = 10 * 1024 * 1024; // 10MB
        private const string ManifestName = "manifest.json";
        private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
        {
            ".jpg", ".jpeg", ".png", ".webp"
        };

        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            PropertyNamingPolicy = null,
            WriteIndented = true
        };

        private readonly ILogger<LoginVisualController> _logger;
        private readonly string _rootPath;

        public LoginVisualController(
            ILogger<LoginVisualController> logger,
            IConfiguration configuration,
            IHostEnvironment environment)
        {
            _logger = logger;
            _rootPath = ResolveStoragePath(
                configuration,
                "Storage:LoginBackgroundsPath",
                Path.Combine(environment.ContentRootPath, "uploads", "login"));
        }

        [HttpGet("config")]
        [AllowAnonymous]
        public IActionResult GetConfig()
        {
            try
            {
                EnsureStorage();
                var config = ReadConfig();
                return Ok(BuildPublicConfig(config));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error consultando configuraciÃ³n visual del login");
                return StatusCode(500, new { message = "Error consultando configuraciÃ³n visual del login." });
            }
        }

        [HttpGet("files")]
        [Authorize]
        public IActionResult GetFiles()
        {
            try
            {
                EnsureStorage();
                var files = Directory.GetFiles(_rootPath)
                    .Select(Path.GetFileName)
                    .Where(name => !string.IsNullOrWhiteSpace(name))
                    .Where(name => !string.Equals(name, ManifestName, StringComparison.OrdinalIgnoreCase))
                    .Where(name => AllowedExtensions.Contains(Path.GetExtension(name!)))
                    .OrderBy(name => name)
                    .ToList();

                return Ok(files);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error consultando archivos visuales del login");
                return StatusCode(500, new { message = "Error consultando archivos visuales." });
            }
        }

        [HttpGet("admin-config")]
        [Authorize]
        public IActionResult GetAdminConfig()
        {
            try
            {
                EnsureStorage();
                var config = ReadConfig();
                var items = (config.items ?? new List<LoginVisualItem>())
                    .OrderBy(x => x.order)
                    .Select(x => new
                    {
                        file = x.file,
                        active = x.active,
                        order = x.order,
                        title = x.title,
                        subtitle = x.subtitle,
                        url = BuildImageUrl(x.file)
                    })
                    .ToList();

                return Ok(new
                {
                    intervalMs = config.intervalMs < 1500 ? 1500 : config.intervalMs,
                    items
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error consultando configuraciÃ³n admin visual del login");
                return StatusCode(500, new { message = "Error consultando configuraciÃ³n admin visual del login." });
            }
        }

        [HttpGet("image/{fileName}")]
        [AllowAnonymous]
        public IActionResult GetImage([FromRoute] string fileName)
        {
            try
            {
                EnsureStorage();
                var safe = Path.GetFileName(fileName ?? string.Empty);
                if (string.IsNullOrWhiteSpace(safe))
                {
                    return BadRequest(new { message = "Nombre de archivo invÃ¡lido." });
                }

                var extension = Path.GetExtension(safe);
                if (!AllowedExtensions.Contains(extension))
                {
                    return BadRequest(new { message = "Formato de imagen invÃ¡lido." });
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
                _logger.LogError(ex, "Error devolviendo imagen de login");
                return StatusCode(500, new { message = "Error devolviendo imagen de login." });
            }
        }

        [HttpPost("upload")]
        [Authorize]
        [Consumes("multipart/form-data")]
        [RequestSizeLimit(MaxImageBytes)]
        [RequestFormLimits(MultipartBodyLengthLimit = MaxImageBytes)]
        public async Task<IActionResult> Upload([FromForm] LoginVisualUploadRequest request)
        {
            try
            {
                var file = request?.File;
                if (file is null || file.Length <= 0)
                {
                    return BadRequest(new { success = false, message = "Archivo requerido." });
                }

                if (file.Length > MaxImageBytes)
                {
                    return BadRequest(new { success = false, message = "La imagen excede 10MB." });
                }

                var extension = Path.GetExtension(file.FileName)?.ToLowerInvariant() ?? string.Empty;
                if (!AllowedExtensions.Contains(extension))
                {
                    return BadRequest(new { success = false, message = "Formato invÃ¡lido. Use JPG, PNG o WEBP." });
                }
                if (!SecurityGuards.HasValidImageSignature(file, extension))
                {
                    return BadRequest(new { success = false, message = "Firma de archivo invÃ¡lida para imagen." });
                }

                EnsureStorage();
                var safeName = $"login-{Guid.NewGuid():N}{extension}";
                var fullPath = Path.Combine(_rootPath, safeName);

                await using (var stream = new FileStream(fullPath, FileMode.Create))
                {
                    await file.CopyToAsync(stream);
                }

                return Ok(new
                {
                    success = true,
                    fileName = safeName,
                    url = BuildImageUrl(safeName),
                    message = "Imagen cargada correctamente."
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error cargando imagen visual de login");
                return StatusCode(500, new { success = false, message = "Error cargando imagen." });
            }
        }

        [HttpPost("save-config")]
        [Authorize]
        public IActionResult SaveConfig([FromBody] LoginVisualSaveConfigRequest request)
        {
            try
            {
                if (request is null)
                {
                    return BadRequest(new { success = false, message = "Payload requerido." });
                }

                EnsureStorage();

                var items = (request.items ?? new List<LoginVisualItem>())
                    .Select(x => new LoginVisualItem
                    {
                        file = Path.GetFileName(x.file ?? string.Empty),
                        active = x.active,
                        order = x.order <= 0 ? 1 : x.order,
                        title = (x.title ?? string.Empty).Trim(),
                        subtitle = (x.subtitle ?? string.Empty).Trim()
                    })
                    .Where(x => !string.IsNullOrWhiteSpace(x.file))
                    .Where(x => AllowedExtensions.Contains(Path.GetExtension(x.file)))
                    .Where(x => SecurityGuards.IsSafeText(x.title, 120))
                    .Where(x => SecurityGuards.IsSafeText(x.subtitle, 200))
                    .ToList();

                var fileSet = Directory.GetFiles(_rootPath)
                    .Select(Path.GetFileName)
                    .Where(name => !string.IsNullOrWhiteSpace(name))
                    .ToHashSet(StringComparer.OrdinalIgnoreCase);

                items = items
                    .Where(x => fileSet.Contains(x.file))
                    .OrderBy(x => x.order)
                    .ToList();

                var config = new LoginVisualConfig
                {
                    intervalMs = request.intervalMs < 1500 ? 1500 : request.intervalMs,
                    items = items
                };

                WriteConfig(config);
                return Ok(new { success = true, message = "ConfiguraciÃ³n guardada correctamente." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error guardando configuraciÃ³n visual del login");
                return StatusCode(500, new { success = false, message = "Error guardando configuraciÃ³n." });
            }
        }

        [HttpDelete("{fileName}")]
        [Authorize]
        public IActionResult Delete([FromRoute] string fileName)
        {
            try
            {
                EnsureStorage();
                var safe = Path.GetFileName(fileName ?? string.Empty);
                if (string.IsNullOrWhiteSpace(safe) || string.Equals(safe, ManifestName, StringComparison.OrdinalIgnoreCase))
                {
                    return BadRequest(new { success = false, message = "Nombre de archivo invÃ¡lido." });
                }

                var fullPath = Path.Combine(_rootPath, safe);
                if (!System.IO.File.Exists(fullPath))
                {
                    return NotFound(new { success = false, message = "Archivo no encontrado." });
                }

                System.IO.File.Delete(fullPath);

                // Limpia referencias del manifest a archivos eliminados.
                var config = ReadConfig();
                var before = config.items.Count;
                config.items = config.items
                    .Where(x => !string.Equals(x.file, safe, StringComparison.OrdinalIgnoreCase))
                    .ToList();
                if (config.items.Count != before)
                {
                    WriteConfig(config);
                }

                return Ok(new { success = true, message = "Imagen eliminada correctamente." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error eliminando imagen visual del login");
                return StatusCode(500, new { success = false, message = "Error eliminando imagen." });
            }
        }

        private void EnsureStorage()
        {
            Directory.CreateDirectory(_rootPath);
        }

        private string ManifestPath => Path.Combine(_rootPath, ManifestName);

        private LoginVisualConfig ReadConfig()
        {
            if (System.IO.File.Exists(ManifestPath))
            {
                var json = System.IO.File.ReadAllText(ManifestPath);
                var parsed = JsonSerializer.Deserialize<LoginVisualConfig>(json, JsonOptions);
                if (parsed is not null)
                {
                    parsed.items ??= new List<LoginVisualItem>();
                    return parsed;
                }
            }

            // Fallback: si no existe manifest, crea una config automÃ¡tica con lo que exista en carpeta.
            var files = Directory.GetFiles(_rootPath)
                .Select(Path.GetFileName)
                .Where(name => !string.IsNullOrWhiteSpace(name))
                .Where(name => !string.Equals(name, ManifestName, StringComparison.OrdinalIgnoreCase))
                .Where(name => AllowedExtensions.Contains(Path.GetExtension(name!)))
                .OrderBy(name => name)
                .ToList();

            var cfg = new LoginVisualConfig
            {
                intervalMs = 6000,
                items = files.Select((name, idx) => new LoginVisualItem
                {
                    file = name!,
                    active = true,
                    order = idx + 1
                }).ToList()
            };

            return cfg;
        }

        private void WriteConfig(LoginVisualConfig config)
        {
            var json = JsonSerializer.Serialize(config, JsonOptions);
            System.IO.File.WriteAllText(ManifestPath, json);
        }

        private static string ResolveStoragePath(IConfiguration configuration, string key, string fallback)
        {
            var configured = configuration[key];
            var path = string.IsNullOrWhiteSpace(configured) ? fallback : configured.Trim();
            return Path.GetFullPath(path);
        }

        private static object BuildPublicConfig(LoginVisualConfig config)
        {
            var items = (config.items ?? new List<LoginVisualItem>())
                .Where(x => x.active)
                .OrderBy(x => x.order)
                .Select(x => new
                {
                    fileName = x.file,
                    url = BuildImageUrl(x.file),
                    order = x.order,
                    title = x.title,
                    subtitle = x.subtitle
                })
                .ToList();

            return new
            {
                intervalMs = config.intervalMs < 1500 ? 1500 : config.intervalMs,
                items
            };
        }

        private static string BuildImageUrl(string fileName)
        {
            return $"/api/LoginVisual/image/{Uri.EscapeDataString(fileName)}";
        }
    }
}

