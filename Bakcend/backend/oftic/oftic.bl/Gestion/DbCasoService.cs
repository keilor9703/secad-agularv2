using Comun.Dtos.Administracion;
using Datos.Interfaz;
using Negocio.Interfaz;

namespace Negocio.Gestion
{
    public class DbCasoService : IDbCasoService
    {
        private const int MaxCodigoLen      = 50;
        private const int MaxDescripcionLen = 300;

        private readonly IDbCasoRepository _repo;

        public DbCasoService(IDbCasoRepository repo) => _repo = repo;

        public Task<List<DtoCaso>> GetAllAsync(string? busqueda, CancellationToken ct)
            => _repo.GetAllAsync(busqueda?.Trim(), ct);

        public async Task<DtoCasoResult> CrearAsync(DtoCasoRequest request, CancellationToken ct)
        {
            var codigo      = request.Codigo?.Trim() ?? "";
            var descripcion = request.Descripcion?.Trim() ?? "";

            if (string.IsNullOrWhiteSpace(codigo))
                return new DtoCasoResult { Success = false, Message = "El código es obligatorio." };
            if (codigo.Length > MaxCodigoLen)
                return new DtoCasoResult { Success = false, Message = $"El código no puede superar {MaxCodigoLen} caracteres." };
            if (string.IsNullOrWhiteSpace(descripcion))
                return new DtoCasoResult { Success = false, Message = "La descripción es obligatoria." };
            if (descripcion.Length > MaxDescripcionLen)
                return new DtoCasoResult { Success = false, Message = $"La descripción no puede superar {MaxDescripcionLen} caracteres." };

            if (await _repo.ExisteAsync(codigo, ct))
                return new DtoCasoResult { Success = false, Message = $"Ya existe un caso con el código \"{codigo}\"." };

            await _repo.CrearAsync(
                new DtoCasoRequest { Codigo = codigo, Descripcion = descripcion, Vigente = request.Vigente, IdCategoriaAsistente = request.IdCategoriaAsistente },
                ct);

            return new DtoCasoResult { Success = true, Message = "Código de caso creado correctamente." };
        }

        public async Task<DtoCasoResult> ActualizarAsync(DtoCasoRequest request, CancellationToken ct)
        {
            var codigo      = request.Codigo?.Trim() ?? "";
            var descripcion = request.Descripcion?.Trim() ?? "";

            if (string.IsNullOrWhiteSpace(descripcion))
                return new DtoCasoResult { Success = false, Message = "La descripción es obligatoria." };
            if (descripcion.Length > MaxDescripcionLen)
                return new DtoCasoResult { Success = false, Message = $"La descripción no puede superar {MaxDescripcionLen} caracteres." };

            var actualizado = await _repo.ActualizarAsync(
                new DtoCasoRequest { Codigo = codigo, Descripcion = descripcion, Vigente = request.Vigente, IdCategoriaAsistente = request.IdCategoriaAsistente },
                ct);

            return actualizado
                ? new DtoCasoResult { Success = true, Message = "Código de caso actualizado correctamente." }
                : new DtoCasoResult { Success = false, Message = $"No se encontró el código \"{codigo}\"." };
        }

        public async Task<DtoCasoResult> SetVigenteAsync(string codigo, bool vigente, CancellationToken ct)
        {
            var actualizado = await _repo.SetVigenteAsync(codigo, vigente, ct);
            return actualizado
                ? new DtoCasoResult { Success = true, Message = vigente ? "Caso activado." : "Caso inactivado." }
                : new DtoCasoResult { Success = false, Message = $"No se encontró el código \"{codigo}\"." };
        }

        /// <summary>
        /// Valida, depura duplicados (última fila del archivo gana — es la
        /// corrección esperada si el usuario repitió un código con otra
        /// descripción) y hace un único upsert masivo. Pensado para archivos
        /// de cientos/miles de filas exportados de Excel.
        /// </summary>
        public async Task<DtoImportarCasosResult> ImportarAsync(List<DtoCasoImportItem> items, CancellationToken ct)
        {
            var errores = new List<string>();
            var porCodigo = new Dictionary<string, DtoCasoImportItem>();
            var duplicados = 0;

            for (var i = 0; i < items.Count; i++)
            {
                var fila = i + 2; // fila 1 = encabezado en el Excel
                var codigo = items[i].Codigo?.Trim() ?? "";
                var descripcion = items[i].Descripcion?.Trim() ?? "";

                if (string.IsNullOrWhiteSpace(codigo))
                {
                    errores.Add($"Fila {fila}: sin código, omitida.");
                    continue;
                }
                if (codigo.Length > MaxCodigoLen)
                {
                    errores.Add($"Fila {fila}: código \"{codigo}\" supera {MaxCodigoLen} caracteres, omitida.");
                    continue;
                }
                if (string.IsNullOrWhiteSpace(descripcion))
                {
                    errores.Add($"Fila {fila}: código \"{codigo}\" sin descripción, omitida.");
                    continue;
                }
                if (descripcion.Length > MaxDescripcionLen)
                {
                    errores.Add($"Fila {fila}: la descripción del código \"{codigo}\" supera {MaxDescripcionLen} caracteres, omitida.");
                    continue;
                }

                if (porCodigo.ContainsKey(codigo)) duplicados++;
                porCodigo[codigo] = new DtoCasoImportItem { Codigo = codigo, Descripcion = descripcion };
            }

            if (duplicados > 0)
                errores.Add($"{duplicados} código(s) aparecían repetidos en el archivo — se usó la última fila de cada uno.");

            if (porCodigo.Count == 0)
            {
                return new DtoImportarCasosResult
                {
                    Success = false,
                    Message = "No se importó ninguna fila válida.",
                    Errores = errores
                };
            }

            var (creados, actualizados) = await _repo.ImportarMasivoAsync(porCodigo.Values.ToList(), ct);

            return new DtoImportarCasosResult
            {
                Success      = true,
                Message      = $"Importación completa: {creados} creado(s), {actualizados} actualizado(s).",
                Creados      = creados,
                Actualizados = actualizados,
                Errores      = errores
            };
        }
    }
}
