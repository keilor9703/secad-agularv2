using Npgsql;

namespace Datos.Gestion
{
    /// <summary>
    /// Red de seguridad compartida: promueve cad_pedidos.estado a 'E' (En proceso)
    /// cuando el pedido seguía en 'P'/'A' y alguien acaba de hacer una gestión real
    /// sobre él (abrir el evento, agregar una nota, asignar un recurso, despachar una
    /// actuación). Normalmente no hace nada porque el pedido ya está en 'E' desde que
    /// se abrió el evento (ver DbPedidoRepository.RegistrarAccesoAsync) — este UPDATE
    /// solo actúa si quedó atrás manualmente (p.ej. alguien lo devolvió a Pendiente
    /// sin volver a abrirlo). Antes vivía duplicado en 4 sitios de dos repositorios
    /// distintos; se centraliza aquí para que la regla de promoción sea una sola.
    /// </summary>
    internal static class EstadoPedidoHelper
    {
        /// <summary>Promueve por el ID directo de cad_pedidos.</summary>
        public static async Task<string?> PromoverPorPedidoIdAsync(
            NpgsqlConnection conn, NpgsqlTransaction? tx, long pedidoId, CancellationToken ct)
        {
            await using var cmd = conn.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = @"
UPDATE cad_pedidos SET estado = 'E', fecha_modifica = NOW()
WHERE id = @pedidoId AND estado IN ('P','A')
RETURNING estado";
            cmd.Parameters.AddWithValue("pedidoId", pedidoId);
            var raw = await cmd.ExecuteScalarAsync(ct);
            return raw is null or DBNull ? null : raw.ToString();
        }

        /// <summary>
        /// Promueve resolviendo el pedido dueño de una actuación
        /// (cad_actuaciones.evento_id → cad_eventos.pedido_id).
        /// </summary>
        public static async Task<string?> PromoverPorActuacionIdAsync(
            NpgsqlConnection conn, NpgsqlTransaction tx, long actuacionId, CancellationToken ct)
        {
            await using var cmd = conn.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = @"
UPDATE cad_pedidos SET estado = 'E', fecha_modifica = NOW()
WHERE estado IN ('P','A')
  AND id = (
      SELECT ev.pedido_id FROM cad_actuaciones a
      JOIN   cad_eventos ev ON ev.id = a.evento_id
      WHERE  a.id = @actuacionId
  )
RETURNING estado";
            cmd.Parameters.AddWithValue("actuacionId", actuacionId);
            var raw = await cmd.ExecuteScalarAsync(ct);
            return raw is null or DBNull ? null : raw.ToString();
        }
    }
}
