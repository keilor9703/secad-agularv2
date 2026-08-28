using Comun.Dtos.Turnos;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Negocio.Interfaz;
using Oracle.ManagedDataAccess.Client;
using System.Security.Claims;

namespace Api.Controllers.Operacion
{
    /// <summary>
    /// Módulo de Turnos: gestión completa del turno de vigilancia.
    ///
    /// Jerarquía de datos:
    ///   Turno (cad_turnos)
    ///     └─ Unidad/Estación (cad_turnos_unidades)
    ///           └─ Medio/Patrulla (cad_medios_disponibles)  ← canal de radio
    ///                 └─ Personal policial (cad_personal_disponible)
    ///
    /// Integraciones:
    ///   · SIVICC  — importa la minuta oficial de asignación del día
    ///   · GESPO   — actualiza posiciones GPS de patrullas en tiempo real
    ///
    /// El endpoint /canal/{codigo}/recursos es consumido por el módulo
    /// de Eventos para mostrar los recursos disponibles en el panel de despacho.
    ///
    /// Base URL: api/Turnos
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class TurnosController : ControllerBase
    {
        private readonly IDbTurnoService             _svc;
        private readonly ILogger<TurnosController>   _logger;

        public TurnosController(
            IDbTurnoService svc,
            ILogger<TurnosController> logger)
        {
            _svc    = svc;
            _logger = logger;
        }

        // ── Claims helpers ───────────────────────────────────────────────────────
        private string UsuarioClaim => User.FindFirstValue(ClaimTypes.Name)
                                    ?? User.FindFirstValue("unique_name") ?? "sistema";

        private int GetIntClaim(string claimType)
        {
            var raw = User.FindFirstValue(claimType);
            return int.TryParse(raw, out var val) ? val : 0;
        }

        private int FuerzaIdClaim => GetIntClaim("fuerza_id");

        // ════════════════════════════════════════════════════════════════════════
        // CONSULTAS — TURNOS
        // ════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// Lista los turnos de una fuerza en una fecha determinada.
        /// </summary>
        /// <remarks>
        /// GET api/Turnos?fuerzaId=1&amp;fecha=24/05/2026&amp;sitioGraba=1
        ///
        /// El parámetro fecha acepta formato dd/MM/yyyy.
        /// Si se omite, retorna los turnos del día actual.
        /// </remarks>
        [HttpGet]
        public async Task<IActionResult> GetTurnos(
            [FromQuery] int    fuerzaId,
            [FromQuery] string fecha       = "",
            [FromQuery] int    sitioGraba  = 1,
            CancellationToken  ct          = default)
        {
            if (fuerzaId <= 0)
                return BadRequest(new { success = false, message = "fuerzaId requerido." });

            // Si no viene fecha, usar hoy en formato dd/MM/yyyy
            if (string.IsNullOrWhiteSpace(fecha))
                fecha = DateTime.Now.ToString("dd/MM/yyyy");

            try
            {
                var data = await _svc.G_GetTurnosAsync(fuerzaId, fecha, sitioGraba, ct);
                return Ok(new { success = true, data });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetTurnos error fuerzaId={F} fecha={D}", fuerzaId, fecha);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        /// <summary>
        /// Detalle completo de un turno: header con fuerza, horarios, estado y conteos.
        /// </summary>
        /// <remarks>
        /// GET api/Turnos/{id}
        /// </remarks>
        [HttpGet("{id:long}")]
        public async Task<IActionResult> GetTurno(long id, CancellationToken ct)
        {
            try
            {
                var data = await _svc.G_GetTurnoPorIdAsync(id, ct);
                if (data is null)
                    return NotFound(new { success = false, message = $"Turno {id} no encontrado." });
                return Ok(new { success = true, data });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetTurno error id={Id}", id);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        /// <summary>
        /// Lista las unidades/estaciones registradas en el turno.
        /// </summary>
        /// <remarks>
        /// GET api/Turnos/{id}/unidades
        /// </remarks>
        [HttpGet("{id:long}/unidades")]
        public async Task<IActionResult> GetUnidades(long id, CancellationToken ct)
        {
            try
            {
                var data = await _svc.G_GetUnidadesTurnoAsync(id, ct);
                return Ok(new { success = true, data });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetUnidades error turnoId={Id}", id);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        /// <summary>
        /// Lista los medios/patrullas de un turno.
        /// Opcionalmente filtra por unidad (turnoUnidadId).
        /// Incluye personal asignado y última posición GPS.
        /// </summary>
        /// <remarks>
        /// GET api/Turnos/{id}/medios
        /// GET api/Turnos/{id}/medios?turnoUnidadId=123
        /// </remarks>
        [HttpGet("{id:long}/medios")]
        public async Task<IActionResult> GetMedios(
            long              id,
            [FromQuery] long? turnoUnidadId = null,
            CancellationToken ct            = default)
        {
            try
            {
                var data = await _svc.G_GetMediosTurnoAsync(id, turnoUnidadId, ct);
                return Ok(new { success = true, data });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetMedios error turnoId={Id}", id);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // PANEL DE DESPACHO (consumido por módulo de Eventos)
        // ════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// Retorna los recursos ACTIVOS en turno para un canal de radio.
        /// Solo incluye turnos vigentes (hora_inicia ≤ NOW ≤ hora_termina).
        /// Incluye posición GPS, personal asignado e incidente activo si está ocupado.
        ///
        /// Usado por el panel de despacho del módulo de Eventos para mostrar
        /// los recursos disponibles del canal correspondiente al evento.
        /// </summary>
        /// <remarks>
        /// GET api/Turnos/canal/{canalCodigo}/recursos?canalFuerzaId=1&amp;sitioGraba=1
        ///
        /// canalFuerzaId es obligatorio para evitar mezclar canales homónimos de otra
        /// fuerza (cad_canales.codigo no es único por sí solo). Si se omite, se resuelve
        /// desde el claim "fuerza_id" del JWT del usuario autenticado.
        /// </remarks>
        [HttpGet("canal/{canalCodigo:int}/recursos")]
        public async Task<IActionResult> GetRecursosCanal(
            int               canalCodigo,
            [FromQuery] int?  canalFuerzaId = null,
            [FromQuery] int   sitioGraba    = 1,
            CancellationToken ct            = default)
        {
            try
            {
                var resolvedFuerza = canalFuerzaId ?? GetIntClaim("fuerza_id");
                var data = await _svc.G_GetMediosActivosPorCanalAsync(canalCodigo, resolvedFuerza, sitioGraba, ct);
                return Ok(new { success = true, data });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetRecursosCanal error canal={C}", canalCodigo);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        /// <summary>
        /// Versión compacta de recursos activos por canal para polling frecuente.
        /// Payload mínimo: solo campos esenciales para la grilla de despacho.
        ///
        /// Recomendado para polling cada 5-10 segundos desde Angular.
        /// </summary>
        /// <remarks>
        /// GET api/Turnos/canal/{canalCodigo}/recursos/resumen?canalFuerzaId=1&amp;sitioGraba=1
        ///
        /// canalFuerzaId es obligatorio para evitar mezclar canales homónimos de otra
        /// fuerza (cad_canales.codigo no es único por sí solo). Si se omite, se resuelve
        /// desde el claim "fuerza_id" del JWT del usuario autenticado.
        /// </remarks>
        [HttpGet("canal/{canalCodigo:int}/recursos/resumen")]
        public async Task<IActionResult> GetResumenRecursosCanal(
            int               canalCodigo,
            [FromQuery] int?  canalFuerzaId = null,
            [FromQuery] int   sitioGraba    = 1,
            CancellationToken ct            = default)
        {
            try
            {
                var resolvedFuerza = canalFuerzaId ?? GetIntClaim("fuerza_id");
                var data = await _svc.G_GetResumenMediosCanalAsync(canalCodigo, resolvedFuerza, sitioGraba, ct);
                return Ok(new { success = true, data });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetResumenRecursosCanal error canal={C}", canalCodigo);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        /// <summary>
        /// Sugiere los medios Libres más cercanos a un punto (p.ej. el sitio de un
        /// incidente), rankeados por distancia — cálculo Haversine en SQL plano
        /// sobre latitud/longitud (sin PostGIS, ver V40__postgis_medios_geo.sql).
        /// Mismo alcance canal+fuerza+sitio que GetRecursosCanal/GetResumenRecursosCanal.
        /// Es solo una sugerencia para asistir al despachador; la asignación real
        /// sigue siendo manual.
        /// </summary>
        /// <remarks>
        /// GET api/Turnos/canal/{canalCodigo}/sugerencia-recurso?canalFuerzaId=1&amp;sitioGraba=1&amp;lat=4.71&amp;lng=-74.07&amp;top=5&amp;prioridadAlta=true
        /// prioridadAlta (incidentes de prioridad 01/02) da preferencia suave a
        /// unidades de más capacidad (patrulla/ambulancia) sobre motos/bicicletas.
        /// </remarks>
        [HttpGet("canal/{canalCodigo:int}/sugerencia-recurso")]
        public async Task<IActionResult> GetSugerenciaRecurso(
            int                canalCodigo,
            [FromQuery] double lat,
            [FromQuery] double lng,
            [FromQuery] int?   canalFuerzaId = null,
            [FromQuery] int    sitioGraba    = 1,
            [FromQuery] int    top           = 5,
            [FromQuery] bool   prioridadAlta = false,
            CancellationToken  ct            = default)
        {
            if (lat < -90 || lat > 90 || lng < -180 || lng > 180)
                return BadRequest(new { success = false, message = "Coordenadas inválidas." });

            try
            {
                var resolvedFuerza = canalFuerzaId ?? GetIntClaim("fuerza_id");
                var data = await _svc.G_GetRecursoMasCercanoAsync(
                    canalCodigo, resolvedFuerza, sitioGraba, lat, lng, top, prioridadAlta, ct);
                return Ok(new { success = true, data });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetSugerenciaRecurso error canal={C}", canalCodigo);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // CREACIÓN / EDICIÓN DE TURNOS
        // ════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// Crea un nuevo turno de vigilancia.
        ///
        /// Validaciones aplicadas:
        ///   · Duración entre 6 y 9 horas
        ///   · No puede haber otro turno con la misma clase_turno en el mismo día y fuerza
        ///   · No puede solaparse con otro turno de la misma fuerza
        /// </summary>
        /// <remarks>
        /// POST api/Turnos
        /// Body: { "sitioGraba": 1, "fuerzaId": 1, "claseTurno": 1,
        ///         "horaInicia": "24/05/2026 06:00", "horaTermina": "24/05/2026 14:00" }
        /// </remarks>
        [HttpPost]
        public async Task<IActionResult> CrearTurno(
            [FromBody] DtoCrearTurnoRequest req,
            CancellationToken ct)
        {
            if (req is null)
                return BadRequest(new { success = false, message = "Datos requeridos." });
            if (req.FuerzaId <= 0 || string.IsNullOrWhiteSpace(req.HoraInicia))
                return BadRequest(new { success = false, message = "FuerzaId y HoraInicia son obligatorios." });
            // El cliente no puede crear turnos para una fuerza distinta a la de su propia sesión.
            if (FuerzaIdClaim > 0 && req.FuerzaId != FuerzaIdClaim)
                return Forbid();
            try
            {
                var result = await _svc.P_CrearTurnoAsync(req, UsuarioClaim, ct);
                return result.Success
                    ? Ok(new { success = true, message = result.Message, id = result.Id })
                    : BadRequest(new { success = false, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "CrearTurno error fuerzaId={F}", req?.FuerzaId);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        /// <summary>
        /// Copia un turno existente a una nueva franja horaria,
        /// duplicando todas sus unidades, medios y personal.
        ///
        /// Útil para replicar la configuración del día anterior
        /// o crear el turno nocturno basado en el diurno.
        /// </summary>
        /// <remarks>
        /// POST api/Turnos/copiar
        /// Body: { "turnoOrigenId": 123, "claseTurno": 2,
        ///         "horaInicia": "24/05/2026 14:00", "horaTermina": "24/05/2026 22:00" }
        /// </remarks>
        [HttpPost("copiar")]
        public async Task<IActionResult> CopiarTurno(
            [FromBody] DtoCopiarTurnoRequest req,
            CancellationToken ct)
        {
            if (req is null || req.TurnoOrigenId <= 0)
                return BadRequest(new { success = false, message = "TurnoOrigenId requerido." });
            try
            {
                var result = await _svc.P_CopiarTurnoAsync(req, FuerzaIdClaim, UsuarioClaim, ct);
                return result.Success
                    ? Ok(new { success = true, message = result.Message, id = result.Id })
                    : BadRequest(new { success = false, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "CopiarTurno error origenId={Id}", req?.TurnoOrigenId);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // UNIDADES
        // ════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// Agrega una unidad/estación al turno de forma manual.
        /// </summary>
        /// <remarks>
        /// POST api/Turnos/{id}/unidades
        /// Body: { "turnoId": 123, "unidadCodigo": "EST-01", "fuerzaId": 1 }
        /// </remarks>
        [HttpPost("{id:long}/unidades")]
        public async Task<IActionResult> AgregarUnidad(
            long id,
            [FromBody] DtoAgregarUnidadRequest req,
            CancellationToken ct)
        {
            if (req is null || string.IsNullOrWhiteSpace(req.UnidadCodigo))
                return BadRequest(new { success = false, message = "UnidadCodigo requerido." });

            req.TurnoId = id;
            try
            {
                var result = await _svc.P_AgregarUnidadAsync(req, FuerzaIdClaim, UsuarioClaim, ct);
                return result.Success
                    ? Ok(new { success = true, message = result.Message, id = result.Id })
                    : BadRequest(new { success = false, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "AgregarUnidad error turnoId={Id}", id);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // MEDIOS DISPONIBLES
        // ════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// Agrega un medio (patrulla/moto/etc.) al turno de forma manual.
        /// Permite asignar hasta 2 policías al medio.
        /// Valida que el código de patrulla no esté en otro turno activo simultáneo.
        /// </summary>
        /// <remarks>
        /// POST api/Turnos/{id}/medios
        /// Body: { "turnoId": 123, "patrullaCodigo": "PAT-01", "tipoMedio": 22,
        ///         "canalCodigo": 5, "personal": [{ "ceduEmpleado": "12345678" }] }
        /// </remarks>
        [HttpPost("{id:long}/medios")]
        public async Task<IActionResult> AgregarMedio(
            long id,
            [FromBody] DtoAgregarMedioRequest req,
            CancellationToken ct)
        {
            if (req is null || string.IsNullOrWhiteSpace(req.PatrullaCodigo))
                return BadRequest(new { success = false, message = "PatrullaCodigo requerido." });

            req.TurnoId = id;
            try
            {
                var result = await _svc.P_AgregarMedioAsync(req, FuerzaIdClaim, UsuarioClaim, ct);
                return result.Success
                    ? Ok(new { success = true, message = result.Message, id = result.Id })
                    : BadRequest(new { success = false, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "AgregarMedio error turnoId={Id}", id);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        /// <summary>
        /// PASO 1 del wizard GESPO (minuta digital, antes "SIVICC").
        ///
        /// Consulta las unidades con minuta activa en GESPO para el turno indicado —
        /// conexión directa a Oracle vía IGespoMinutaReader, sin FDW. Los filtros de
        /// búsqueda (sigla de la fuerza, clase de turno, fecha) se derivan
        /// automáticamente del turno en BD — el usuario no introduce ningún ID manualmente.
        ///
        /// Retorna la lista de unidades con:
        ///   · <c>minutaId</c>    — ID de la minuta en GESPO (necesario para el paso 3)
        ///   · <c>consecutivo</c> — Consecutivo de la unidad en GESPO
        ///   · <c>descripcion</c> — Nombre de la unidad
        ///   · <c>existeEnCadMedios</c> — true si ya se importó antes
        ///
        /// Requiere GespoOracle:Enabled = true y ConnectionString configurados.
        /// </summary>
        /// <remarks>
        /// GET api/Turnos/{id}/sivicc/unidades
        /// </remarks>
        [HttpGet("{id:long}/sivicc/unidades")]
        public async Task<IActionResult> GetUnidadesSivicc(long id, CancellationToken ct)
        {
            try
            {
                var data = await _svc.G_GetUnidadesSiviccAsync(id, ct);
                return Ok(new { success = true, data });
            }
            catch (OracleException ex)
            {
                _logger.LogWarning(ex, "GetUnidadesSivicc: error consultando GESPO turnoId={Id}", id);
                return StatusCode(503, new
                {
                    success = false,
                    message = "GESPO no está disponible en este momento. Intente más tarde o registre la unidad/medio manualmente."
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetUnidadesSivicc error turnoId={Id}", id);
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error al consultar GESPO: " + ex.Message
                });
            }
        }

        /// <summary>
        /// PASO 3 del wizard GESPO — Importa medios y personal de las unidades seleccionadas.
        ///
        /// Flujo correcto:
        ///   1. GET  api/Turnos/{id}/sivicc/unidades  → obtiene lista de unidades con minuta activa
        ///   2. El usuario selecciona cuáles importar
        ///   3. POST api/Turnos/{id}/sivicc           → envía las unidades seleccionadas
        ///
        /// Para cada unidad seleccionada: crea/actualiza su fila en
        /// cad_turnos_unidades (origen SIVICC), lee el personal por cuadrante
        /// directo en Oracle (MINUTA_EMPLEADO + VM_CUADRANTE + VM_PERSONAL_AGRUPADO,
        /// sin FDW), crea o actualiza los medios en cad_medios_disponibles con
        /// turno_unidad_id y origen='SIVICC', asigna personal (máx. 2) en
        /// cad_personal_disponible (se refresca por completo en cada reimportación),
        /// y marca el turno como sivicc_sincronizado = TRUE.
        ///
        /// Si el campo <c>unidades</c> está vacío, importa TODAS las unidades disponibles.
        /// </summary>
        /// <remarks>
        /// POST api/Turnos/{id}/sivicc
        /// Body: { "fuerzaId": 1, "sitioGraba": 1, "canalCodigo": 5,
        ///         "unidades": [{ "minutaId": 456, "consecutivo": 1, "descripcion": "ESTACION SUR" }] }
        /// </remarks>
        [HttpPost("{id:long}/sivicc")]
        public async Task<IActionResult> ImportarSivicc(
            long id,
            [FromBody] DtoImportarSiviccRequest req,
            CancellationToken ct)
        {
            if (req is null)
                return BadRequest(new { success = false, message = "Datos requeridos." });

            req.TurnoId = id;
            try
            {
                var result = await _svc.P_ImportarDesdeSiviccAsync(req, FuerzaIdClaim, UsuarioClaim, ct);
                return result.Success
                    ? Ok(new { success = true, message = result.Message, id = result.Id })
                    : BadRequest(new { success = false, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ImportarSivicc error turnoId={Id}", id);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // ESTADO DE MEDIOS (TIEMPO REAL)
        // ════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// Actualiza los datos editables de un medio ya registrado en el turno.
        ///
        /// Campos modificables: código de patrulla, descripción, tipo de medio,
        /// canal de radio y lista de personal asignado (máx. 2 policías).
        /// El personal anterior se reemplaza en su totalidad.
        ///
        /// No modifica: turnoId, unidadId, estado operativo, posición GPS ni fuerza.
        /// </summary>
        /// <remarks>
        /// PUT api/Turnos/medios/{medioId}
        /// Body: { "patrullaCodigo": "PAT-01", "tipoMedio": 22,
        ///         "canalCodigo": 5, "personal": [{ "ceduEmpleado": "12345678" }] }
        /// </remarks>
        [HttpPut("medios/{medioId:long}")]
        public async Task<IActionResult> ActualizarMedio(
            long medioId,
            [FromBody] DtoActualizarMedioRequest req,
            CancellationToken ct)
        {
            if (req is null || string.IsNullOrWhiteSpace(req.PatrullaCodigo))
                return BadRequest(new { success = false, message = "PatrullaCodigo es obligatorio." });
            try
            {
                var result = await _svc.P_ActualizarMedioAsync(medioId, req, FuerzaIdClaim, UsuarioClaim, ct);
                return result.Success
                    ? Ok(new { success = true, message = result.Message, id = result.Id })
                    : BadRequest(new { success = false, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ActualizarMedio error medioId={Id}", medioId);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        /// <summary>
        /// Cambia el estado operativo de un medio en tiempo real.
        ///
        /// Estados válidos:
        ///   27 = Libre          → disponible para despacho
        ///   28 = Ocupado        → atendiendo un incidente
        ///   29 = Fuera servicio → no disponible (avería, descanso, etc.)
        ///   30 = En ruta        → desplazándose hacia un incidente
        ///   31 = En base        → en cuartel / estación
        ///
        /// Al cambiar a 28 o 30 se puede asociar el eventoId / actuacionId.
        /// Al volver a 27/29/31 se limpia la asociación de evento automáticamente.
        /// El cambio queda registrado en el log de auditoría (cad_medios_estado_log).
        /// </summary>
        /// <remarks>
        /// PUT api/Turnos/medios/{medioId}/estado
        /// Body: { "nuevoEstado": 30, "eventoId": 789, "actuacionId": 101 }
        /// </remarks>
        [HttpPut("medios/{medioId:long}/estado")]
        public async Task<IActionResult> CambiarEstadoMedio(
            long medioId,
            [FromBody] DtoCambiarEstadoMedioRequest req,
            CancellationToken ct)
        {
            if (req is null)
                return BadRequest(new { success = false, message = "Datos requeridos." });

            int[] estadosValidos = [27, 28, 29, 30, 31];
            if (!estadosValidos.Contains(req.NuevoEstado))
                return BadRequest(new
                {
                    success = false,
                    message = "Estado inválido. Use: 27=Libre, 28=Ocupado, 29=Fuera servicio, 30=En ruta, 31=En base."
                });
            try
            {
                var result = await _svc.P_CambiarEstadoMedioAsync(medioId, req, FuerzaIdClaim, UsuarioClaim, ct);
                return result.Success
                    ? Ok(new { success = true, message = result.Message })
                    : BadRequest(new { success = false, message = result.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "CambiarEstadoMedio error medioId={Id}", medioId);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        /// <summary>
        /// Recibe un lote de posiciones GPS desde el sistema GESPO
        /// y actualiza las coordenadas de los medios activos en turno.
        ///
        /// Este endpoint es llamado periódicamente por el backend de integración
        /// GESPO (o por un worker service interno) con las últimas posiciones conocidas.
        /// Solo se actualizan medios que estén actualmente en un turno vigente.
        ///
        /// Retorna el número de medios actualizados.
        /// </summary>
        /// <remarks>
        /// POST api/Turnos/gespo/ubicaciones
        /// Body: [{ "patrullaCodigo": "PAT-01", "latitud": 4.123, "longitud": -74.456,
        ///          "velocidadKmh": 65.5, "rumboGrados": 180.0, "fechaGps": "2026-05-24T14:30:00Z" }]
        /// </remarks>
        [HttpPost("gespo/ubicaciones")]
        public async Task<IActionResult> ActualizarUbicacionesGespo(
            [FromBody] List<DtoGespoUbicacion> ubicaciones,
            CancellationToken ct)
        {
            if (ubicaciones is null || ubicaciones.Count == 0)
                return BadRequest(new { success = false, message = "Se requiere al menos una ubicación." });
            try
            {
                // Sin contexto de canal (payload externo genérico) — 0/0 no restringe por canal.
                var actualizados = await _svc.P_ActualizarUbicacionesGespoAsync(ubicaciones, 0, 0, ct);
                return Ok(new { success = true, actualizados, total = ubicaciones.Count });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ActualizarUbicacionesGespo error count={C}", ubicaciones?.Count);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        /// <summary>
        /// Sincroniza el GPS de las patrullas activas de un canal bajo demanda —
        /// pull directo a Oracle GESPO solo para los medios de ese canal/fuerza en
        /// turno, sin ningún proceso de fondo permanente. Pensado para llamarse
        /// desde el frontend de Eventos, en el mismo tick que ya refresca los
        /// recursos del canal (mientras el operador tiene un canal seleccionado);
        /// deja de llamarse en cuanto sale de esa pantalla o cambia de canal.
        /// Turnos no llama a este endpoint — ese módulo no hace georreferenciación.
        ///
        /// Nunca falla de forma visible: si el canal no tiene medios activos ahora
        /// mismo, si otra sincronización de este canal corrió hace muy poco
        /// (throttle interno), o si Oracle está lento/caído, responde 200 con
        /// actualizados=0.
        /// </summary>
        /// <remarks>
        /// POST api/Turnos/gespo/sincronizar?canalCodigo=5&amp;canalFuerzaId=1
        ///
        /// canalFuerzaId es obligatorio para evitar mezclar canales homónimos de otra
        /// fuerza (cad_canales.codigo no es único por sí solo). Si se omite, se resuelve
        /// desde el claim "fuerza_id" del JWT del usuario autenticado.
        /// </remarks>
        [HttpPost("gespo/sincronizar")]
        public async Task<IActionResult> SincronizarGps(
            [FromQuery] int  canalCodigo,
            [FromQuery] int? canalFuerzaId = null,
            CancellationToken ct           = default)
        {
            try
            {
                var resolvedFuerza = canalFuerzaId ?? GetIntClaim("fuerza_id");
                var actualizados = await _svc.P_SincronizarGpsBajoDemandaAsync(canalCodigo, resolvedFuerza, ct);
                return Ok(new { success = true, actualizados });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "SincronizarGps error canal={C}", canalCodigo);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }
}
