using Comun.Dtos.Dominio;
using Comun.Dtos.LineasMando;
using Datos.Interfaz;
using Negocio.Interfaz;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Negocio.Gestion
{
    public class DbDominioService : IDbDominioService
    {
        private readonly IDbDominioRepository _repository;

        public DbDominioService(IDbDominioRepository repository)
        {
            _repository = repository;
        }
        public async Task<List<DtoDominio>> GetAllAsync(CancellationToken ct)
        {
            return await _repository.GetAllAsync(ct);
        }
        public async Task<DtoDominioResult> CreateAsync(DtoDominioRequest request, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        {
            if (request == null)
            {
                return new DtoDominioResult
                {
                    Success = false,
                    Message = "Los datos son requeridos"
                };
            }

            if (string.IsNullOrWhiteSpace(request.Descripcion))
            {
                return new DtoDominioResult
                {
                    Success = false,
                    Message = "La descripción es requerida"
                };
            }

            return await _repository.CreateAsync(request, usuarioAuditoria, maquinaAuditoria, ct);
        }
        public async Task<DtoDominioResult> UpdateAsync(long id, DtoDominioRequest request, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        {
            if (id <= 0)
            {
                return new DtoDominioResult
                {
                    Success = false,
                    Message = "ID inválido"
                };
            }

            if (request == null)
            {
                return new DtoDominioResult
                {
                    Success = false,
                    Message = "Los datos son requeridos"
                };
            }

            if (string.IsNullOrWhiteSpace(request.Descripcion))
            {
                return new DtoDominioResult
                {
                    Success = false,
                    Message = "La descripción es requerida"
                };
            }

            return await _repository.UpdateAsync(id, request, usuarioAuditoria, maquinaAuditoria, ct);
        }
        public async Task<DtoDominioResult> DeletelogicalAsync(long id, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        {
            if (id <= 0)
            {
                return new DtoDominioResult
                {
                    Success = false,
                    Message = "ID inválido"
                };
            }

            return await _repository.DeletelogicalAsync(id, usuarioAuditoria, maquinaAuditoria, ct);
        }
    }
}
