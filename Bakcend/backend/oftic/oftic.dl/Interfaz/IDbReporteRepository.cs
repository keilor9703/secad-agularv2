using Comun.Dtos.Reportes;

namespace Datos.Interfaz
{
    public interface IDbReporteRepository
    {
        /// <summary>Dashboard: resumen, por origen, por fuerza, top casos, tiempos, SLA y distribución horaria.</summary>
        Task<DtoReporteCompleto> GetReporteCompletoAsync(DtoReporteParams p, CancellationToken ct);

        /// <summary>R1 — Distribución de llamadas por calidad (cali_pedido).</summary>
        Task<List<DtoPorCalidad>> GetPorCalidadAsync(DtoReporteParams p, CancellationToken ct);

        /// <summary>R2 — Tabla detallada de pedidos con filtro opcional de calidad, paginada.</summary>
        Task<DtoPagedResult<DtoPedidoEfectivo>> GetEfectivosAsync(DtoReporteParamsEx p, CancellationToken ct);

        /// <summary>R3 — Resumen de tiempos de atención por unidad, paginado.</summary>
        Task<DtoPagedResult<DtoTiempoDetalleItem>> GetTiemposDetalleAsync(DtoReporteParamsEx p, CancellationToken ct);

        /// <summary>R4 — Trabajo de operadores y despachadores en el período.</summary>
        Task<List<DtoTrabajoOperador>> GetTrabajoOperadoresAsync(DtoReporteParams p, CancellationToken ct);

        /// <summary>R5 — Llamadas por código de caso (lista completa, top configurable).</summary>
        Task<List<DtoTopCaso>> GetPorCodigoAsync(DtoReporteParamsEx p, CancellationToken ct);
    }
}
