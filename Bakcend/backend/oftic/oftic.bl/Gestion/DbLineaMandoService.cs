using Comun.Dtos.LineasMando;
using Datos.Interfaz;
using Negocio.Interfaz;
using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace Negocio.Gestion
{
    public class DbLineaMandoService : IDbLineaMandoService
    {
        private readonly IDbLineaMandoRepository _repository;

        public DbLineaMandoService(IDbLineaMandoRepository repository)
        {
            _repository = repository;
        }

        public async Task<List<DtoLineaMando>> GetAllAsync(CancellationToken ct)
        {
            return await _repository.GetAllAsync(ct);
        }

        public async Task<DtoLineaMando?> GetByIdAsync(long id, CancellationToken ct)
        {
            if (id <= 0)
            {
                return null;
            }

            return await _repository.GetByIdAsync(id, ct);
        }

        public async Task<DtoLineaMando?> GetByIdentificacionAsync(string identificacion, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(identificacion))
            {
                return null;
            }

            return await _repository.GetByIdentificacionAsync(identificacion.Trim(), ct);
        }

        public async Task<DtoLineaMandoResult> CreateAsync(DtoLineaMandoRequest request, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        {
            if (request == null)
            {
                return new DtoLineaMandoResult
                {
                    Success = false,
                    Message = "Los datos son requeridos"
                };
            }

            if (string.IsNullOrWhiteSpace(request.Identificacion))
            {
                return new DtoLineaMandoResult
                {
                    Success = false,
                    Message = "La identificación es requerida"
                };
            }

            if (string.IsNullOrWhiteSpace(request.Nombre))
            {
                return new DtoLineaMandoResult
                {
                    Success = false,
                    Message = "El nombre es requerido"
                };
            }

            if (!string.IsNullOrEmpty(request.FotoBase64) && !EsBase64Valido(request.FotoBase64))
            {
                return new DtoLineaMandoResult
                {
                    Success = false,
                    Message = "El formato de la imagen es inválido"
                };
            }

            return await _repository.CreateAsync(request, usuarioAuditoria, maquinaAuditoria, ct);
        }

        public async Task<DtoLineaMandoResult> UpdateAsync(long id, DtoLineaMandoRequest request, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        {
            if (id <= 0)
            {
                return new DtoLineaMandoResult
                {
                    Success = false,
                    Message = "ID inválido"
                };
            }

            if (request == null)
            {
                return new DtoLineaMandoResult
                {
                    Success = false,
                    Message = "Los datos son requeridos"
                };
            }

            if (string.IsNullOrWhiteSpace(request.Identificacion))
            {
                return new DtoLineaMandoResult
                {
                    Success = false,
                    Message = "La identificación es requerida"
                };
            }

            if (!string.IsNullOrEmpty(request.FotoBase64) && !EsBase64Valido(request.FotoBase64))
            {
                return new DtoLineaMandoResult
                {
                    Success = false,
                    Message = "El formato de la imagen es inválido"
                };
            }

            return await _repository.UpdateAsync(id, request, usuarioAuditoria, maquinaAuditoria, ct);
        }

        private static bool EsBase64Valido(string base64)
        {
            if (string.IsNullOrWhiteSpace(base64))
                return true;

            var cleanBase64 = base64.Trim();

            if (!cleanBase64.StartsWith("data:image/"))
                return false;

            var commaIndex = cleanBase64.IndexOf(',');
            if (commaIndex < 0 || commaIndex >= cleanBase64.Length - 1)
                return false;

            var dataPart = cleanBase64.Substring(commaIndex + 1);

            try
            {
                Convert.FromBase64String(dataPart);
                return true;
            }
            catch
            {
                return false;
            }
        }

        public async Task<DtoLineaMandoResult> DeleteAsync(long id, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        {
            if (id <= 0)
            {
                return new DtoLineaMandoResult
                {
                    Success = false,
                    Message = "ID inválido"
                };
            }

            return await _repository.DeleteAsync(id, usuarioAuditoria, maquinaAuditoria, ct);
        }

        public async Task<DtoLineaMandoResult> SetVigenteAsync(long id, int vigente, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        {
            if (id <= 0)
            {
                return new DtoLineaMandoResult
                {
                    Success = false,
                    Message = "ID inválido"
                };
            }

            if (vigente == 0)
            {
                return await _repository.DeleteAsync(id, usuarioAuditoria, maquinaAuditoria, ct);
            }

            return await _repository.SetVigenteAsync(id, vigente, usuarioAuditoria, maquinaAuditoria, ct);
        }
    }
}
