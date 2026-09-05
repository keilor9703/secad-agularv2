using Comun.Dtos.Administracion;
using Datos.Interfaz;
using Datos.Tenant;

namespace Datos.Gestion
{
    public class DbCasoRepository : IDbCasoRepository
    {
        private readonly TenantContext _tenant;

        public DbCasoRepository(TenantContext tenant) => _tenant = tenant;

        public async Task<List<DtoCaso>> GetAllAsync(string? busqueda, CancellationToken ct)
        {
            var list = new List<DtoCaso>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = """
                SELECT c.codigo, c.descripcion, c.vigente,
                       c.id_categoria_asistente,
                       cat.descripcion AS categoria_descripcion,
                       c.cod_dane
                FROM   cad_casos c
                LEFT   JOIN cad_asistente_categorias cat ON cat.id = c.id_categoria_asistente
                WHERE  (@b = '' OR UPPER(c.codigo) LIKE '%' || UPPER(@b) || '%'
                                 OR UPPER(c.descripcion) LIKE '%' || UPPER(@b) || '%')
                ORDER  BY c.codigo
                """;
            cmd.Parameters.AddWithValue("@b", busqueda ?? "");
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                list.Add(new DtoCaso
                {
                    Codigo               = reader.GetString(0),
                    Descripcion          = reader.GetString(1),
                    Vigente              = reader.GetString(2) == "S",
                    IdCategoriaAsistente = reader.IsDBNull(3) ? null : reader.GetInt64(3).ToString(),
                    CategoriaDescripcion = reader.IsDBNull(4) ? null : reader.GetString(4),
                    CodDane              = reader.IsDBNull(5) ? null : reader.GetString(5),
                });
            }
            return list;
        }

        public async Task<bool> ExisteAsync(string codigo, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = "SELECT 1 FROM cad_casos WHERE codigo = @codigo";
            cmd.Parameters.AddWithValue("@codigo", codigo);
            var val = await cmd.ExecuteScalarAsync(ct);
            return val is not null;
        }

        public async Task CrearAsync(DtoCasoRequest request, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = """
                INSERT INTO cad_casos (codigo, descripcion, vigente, id_categoria_asistente, cod_dane)
                VALUES (@codigo, @descripcion, @vigente, @idCategoria, @codDane)
                """;
            cmd.Parameters.AddWithValue("@codigo",      request.Codigo);
            cmd.Parameters.AddWithValue("@descripcion", request.Descripcion);
            cmd.Parameters.AddWithValue("@vigente",     request.Vigente ? "S" : "N");
            cmd.Parameters.AddWithValue("@idCategoria",
                (object?)ParseCategoriaId(request.IdCategoriaAsistente) ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@codDane",
                string.IsNullOrWhiteSpace(request.CodDane) ? DBNull.Value : (object)request.CodDane.Trim());
            await cmd.ExecuteNonQueryAsync(ct);
        }

        public async Task<bool> ActualizarAsync(DtoCasoRequest request, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = """
                UPDATE cad_casos
                SET    descripcion = @descripcion,
                       vigente     = @vigente,
                       id_categoria_asistente = @idCategoria,
                       cod_dane    = @codDane
                WHERE  codigo = @codigo
                """;
            cmd.Parameters.AddWithValue("@codigo",      request.Codigo);
            cmd.Parameters.AddWithValue("@descripcion", request.Descripcion);
            cmd.Parameters.AddWithValue("@vigente",     request.Vigente ? "S" : "N");
            cmd.Parameters.AddWithValue("@idCategoria",
                (object?)ParseCategoriaId(request.IdCategoriaAsistente) ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@codDane",
                string.IsNullOrWhiteSpace(request.CodDane) ? DBNull.Value : (object)request.CodDane.Trim());
            var rows = await cmd.ExecuteNonQueryAsync(ct);
            return rows > 0;
        }

        public async Task<bool> SetVigenteAsync(string codigo, bool vigente, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = "UPDATE cad_casos SET vigente = @vigente WHERE codigo = @codigo";
            cmd.Parameters.AddWithValue("@codigo",  codigo);
            cmd.Parameters.AddWithValue("@vigente", vigente ? "S" : "N");
            var rows = await cmd.ExecuteNonQueryAsync(ct);
            return rows > 0;
        }

        public async Task<(int creados, int actualizados)> ImportarMasivoAsync(
            List<DtoCasoImportItem> items, CancellationToken ct)
        {
            if (items.Count == 0) return (0, 0);

            var codigos       = items.Select(i => i.Codigo).ToArray();
            var descripciones = items.Select(i => i.Descripcion).ToArray();
            var codsDane      = items.Select(i => string.IsNullOrWhiteSpace(i.CodDane) ? null : i.CodDane.Trim()).ToArray();

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd  = conn.CreateCommand();
            cmd.CommandText = """
                INSERT INTO cad_casos (codigo, descripcion, vigente, cod_dane)
                SELECT codigo, descripcion, 'S', cod_dane
                FROM   UNNEST(@codigos, @descripciones, @codsDane) AS t(codigo, descripcion, cod_dane)
                ON CONFLICT (codigo) DO UPDATE
                SET    descripcion = EXCLUDED.descripcion,
                       vigente     = 'S',
                       cod_dane    = COALESCE(EXCLUDED.cod_dane, cad_casos.cod_dane)
                RETURNING (xmax = 0) AS es_nuevo
                """;
            cmd.Parameters.AddWithValue("@codigos",       codigos);
            cmd.Parameters.AddWithValue("@descripciones", descripciones);
            cmd.Parameters.AddWithValue("@codsDane",      codsDane);

            var creados = 0;
            var actualizados = 0;
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                if (reader.GetBoolean(0)) creados++;
                else actualizados++;
            }
            return (creados, actualizados);
        }

        private static long? ParseCategoriaId(string? raw)
            => long.TryParse(raw, out var id) ? id : null;
    }
}
