using Comun.Dtos.Administracion;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Negocio.Interfaz;

namespace Api.Controllers.Administracion
{
    /// <summary>
    /// Catálogo de códigos de caso (cad_casos) — CRUD individual + importación
    /// masiva desde Excel (el archivo se parsea en el frontend con SheetJS; acá
    /// solo llega la lista ya parseada de {codigo, descripcion}).
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class CasoController : ControllerBase
    {
        private readonly IDbCasoService _service;
        private readonly ILogger<CasoController> _logger;

        public CasoController(IDbCasoService service, ILogger<CasoController> logger)
        {
            _service = service;
            _logger  = logger;
        }

        [HttpGet]
        public async Task<ActionResult> GetAll([FromQuery] string? busqueda, CancellationToken ct)
        {
            try
            {
                var data = await _service.GetAllAsync(busqueda, ct);
                return Ok(new { success = true, data });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al listar códigos de caso");
                return StatusCode(500, new { success = false, message = "Error al listar códigos de caso.", data = new List<object>() });
            }
        }

        [HttpPost]
        public async Task<ActionResult> Crear([FromBody] DtoCasoRequest request, CancellationToken ct)
        {
            try
            {
                var result = await _service.CrearAsync(request, ct);
                if (!result.Success) return BadRequest(result);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al crear código de caso {Codigo}", request?.Codigo);
                return StatusCode(500, new DtoCasoResult { Success = false, Message = "Error interno al crear el código de caso." });
            }
        }

        [HttpPut("{codigo}")]
        public async Task<ActionResult> Actualizar(string codigo, [FromBody] DtoCasoRequest request, CancellationToken ct)
        {
            try
            {
                request.Codigo = codigo;
                var result = await _service.ActualizarAsync(request, ct);
                if (!result.Success) return BadRequest(result);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al actualizar código de caso {Codigo}", codigo);
                return StatusCode(500, new DtoCasoResult { Success = false, Message = "Error interno al actualizar el código de caso." });
            }
        }

        [HttpPatch("{codigo}/estado")]
        public async Task<ActionResult> SetEstado(string codigo, [FromBody] DtoCasoEstadoRequest request, CancellationToken ct)
        {
            try
            {
                var result = await _service.SetVigenteAsync(codigo, request.Vigente, ct);
                if (!result.Success) return BadRequest(result);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al cambiar estado del código de caso {Codigo}", codigo);
                return StatusCode(500, new DtoCasoResult { Success = false, Message = "Error interno al cambiar el estado." });
            }
        }

        /// <summary>
        /// Importación masiva: recibe las filas ya parseadas del Excel
        /// (frontend usa SheetJS) y hace un upsert por código en un solo
        /// round-trip a la base de datos — pensado para archivos de
        /// cientos/miles de filas.
        /// </summary>
        [HttpPost("importar")]
        public async Task<ActionResult> Importar([FromBody] List<DtoCasoImportItem> items, CancellationToken ct)
        {
            try
            {
                if (items is null || items.Count == 0)
                    return BadRequest(new DtoImportarCasosResult { Success = false, Message = "El archivo no tiene filas para importar." });

                var result = await _service.ImportarAsync(items, ct);
                if (!result.Success) return BadRequest(result);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al importar códigos de caso ({Cantidad} filas)", items?.Count ?? 0);
                return StatusCode(500, new DtoImportarCasosResult { Success = false, Message = "Error interno al importar los códigos de caso." });
            }
        }
    }

    public class DtoCasoEstadoRequest
    {
        public bool Vigente { get; set; }
    }
}
