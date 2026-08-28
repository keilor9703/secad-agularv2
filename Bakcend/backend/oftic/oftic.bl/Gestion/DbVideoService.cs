using Negocio.Interfaz;
using Comun.Dtos.Videos;
using Datos.Interfaz;

namespace Negocio.Gestion
{
    public class DbVideoService : IDbVideoService
    {
        private readonly IDbVideoRepository _repository;

        public DbVideoService(IDbVideoRepository repository)
        {
            _repository = repository;
        }

        public Task<List<DtoVideo>> GetAllAsync(CancellationToken ct)
            => _repository.GetAllAsync(ct);

        public async Task<DtoVideo?> GetByIdAsync(long id, CancellationToken ct)
        {
            if (id <= 0) return null;
            return await _repository.GetByIdAsync(id, ct);
        }

        public async Task<DtoVideoResult> CreateAsync(DtoVideoRequest request, string usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        {
            var validation = Validate(request);
            if (!validation.Success) return validation;

            // Desactivar videos activos previos (solo uno activo a la vez)
            var activos = await _repository.GetAllAsync(ct);
            foreach (var v in activos)
            {
                await _repository.DeleteAsync(v.IdVideo, usuarioAuditoria, maquinaAuditoria, ct);
            }

            return await _repository.CreateAsync(request, usuarioAuditoria, maquinaAuditoria, ct);
        }

        public async Task<DtoVideoResult> UpdateAsync(long id, DtoVideoRequest request, string usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        {
            if (id <= 0)
                return new DtoVideoResult { Success = false, Message = "ID inválido." };

            var validation = Validate(request);
            if (!validation.Success) return validation;

            return await _repository.UpdateAsync(id, request, usuarioAuditoria, maquinaAuditoria, ct);
        }

        public async Task<DtoVideoResult> DeleteAsync(long id, string usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        {
            if (id <= 0)
                return new DtoVideoResult { Success = false, Message = "ID inválido." };

            return await _repository.DeleteAsync(id, usuarioAuditoria, maquinaAuditoria, ct);
        }

        private static DtoVideoResult Validate(DtoVideoRequest request)
        {
            if (request is null)
                return new DtoVideoResult { Success = false, Message = "Payload requerido." };

            if (string.IsNullOrWhiteSpace(request.Descripcion))
                return new DtoVideoResult { Success = false, Message = "La descripción es requerida." };

            if (string.IsNullOrWhiteSpace(request.RutaVideo))
                return new DtoVideoResult { Success = false, Message = "La ruta del video es requerida." };

            return new DtoVideoResult { Success = true, Message = "OK" };
        }
    }
}
