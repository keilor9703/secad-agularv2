using Comun.Dtos.Menu;
using Datos.Interfaz;
using Datos.Tenant;
using Npgsql;

namespace Datos.Gestion
{
    public class DbMenuRepository : IDbMenuRepository
    {
        private readonly TenantContext _tenant;

        public DbMenuRepository(TenantContext tenant)
        {
            _tenant = tenant;
        }

        public async Task<List<DtoMenuItem>> GetMyMenuAsync(long idUsuario, CancellationToken ct)
        {
            var result = new List<DtoMenuItem>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
WITH RECURSIVE
-- 1. Roles activos del usuario
roles_vigentes AS (
    SELECT DISTINCT rua.id_rol
    FROM ctr_roles_user_admin rua
    WHERE rua.id_usuario = @pIdUsuario
      AND COALESCE(rua.vigente, 0) = 1
      AND (rua.fecha_fin IS NULL OR rua.fecha_fin >= CURRENT_DATE)
),
-- 2. Ítems asignados explícitamente a los roles del usuario
menus_asignados AS (
    SELECT DISTINCT mr.id_menu
    FROM ctr_menu_roles mr
    JOIN roles_vigentes rv ON rv.id_rol = mr.id_rol
    JOIN ctr_menu       m  ON m.id_menu = mr.id_menu AND m.vigente = 1
),
-- 3. Árbol hacia arriba: ítems asignados + todos sus grupos padre
--    (necesario para que el sidebar renderice el nodo contenedor)
menu_tree AS (
    -- Ancla: ítems directamente asignados
    SELECT m.id_menu, m.descripcion, m.idpadre, m.posicion,
           m.tipo, m.icono, m.vigente, m.detalle
    FROM ctr_menu m
    WHERE m.id_menu IN (SELECT id_menu FROM menus_asignados)
      AND m.vigente = 1

    UNION

    -- Recursivo: sube al grupo padre de cada ítem ya incluido
    SELECT p.id_menu, p.descripcion, p.idpadre, p.posicion,
           p.tipo, p.icono, p.vigente, p.detalle
    FROM ctr_menu p
    INNER JOIN menu_tree t
           ON  p.id_menu   = t.idpadre
           AND t.id_menu  <> t.idpadre   -- detiene la recursión en nodos raíz (idpadre=id_menu)
           AND t.idpadre  <> 0           -- no sube si no hay padre
)
SELECT DISTINCT id_menu, descripcion, idpadre, posicion, tipo, icono, vigente, detalle
FROM menu_tree
ORDER BY idpadre, posicion, id_menu";
            cmd.Parameters.AddWithValue("pIdUsuario", idUsuario);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
                result.Add(MapMenuItem(reader));

            return result;
        }

        public async Task<List<DtoMenuItem>> GetAdminMenuAsync(CancellationToken ct)
        {
            var result = new List<DtoMenuItem>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
SELECT id_menu, descripcion, idpadre, posicion, tipo, icono, vigente, detalle
FROM ctr_menu
ORDER BY idpadre, posicion, id_menu";

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
                result.Add(MapMenuItem(reader));

            return result;
        }

        public async Task<DtoMenuResult> SaveMenuAsync(DtoMenuSaveRequest request, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx = await conn.BeginTransactionAsync(ct);

            try
            {
                var isUpdate = request.IdMenu.HasValue && request.IdMenu.Value > 0;

                if (isUpdate)
                {
                    var idMenu = request.IdMenu!.Value;
                    var idPadre = request.IdPadre <= 0 ? idMenu : request.IdPadre;

                    await using var cmd = conn.CreateCommand();
                    cmd.Transaction = tx;
                    cmd.CommandText = @"
UPDATE ctr_menu
   SET descripcion      = @pDescripcion,
       idpadre          = @pIdPadre,
       posicion         = @pPosicion,
       tipo             = @pTipo,
       icono            = @pIcono,
       vigente          = @pVigente,
       detalle          = @pDetalle,
       usuario_modifica = @pUsuarioModifica,
       fecha_modifica   = NOW(),
       maquina_modifica = @pMaquinaModifica
 WHERE id_menu = @pIdMenu";
                    BindSaveParams(cmd, request, idPadre, usuarioAuditoria, maquinaAuditoria);
                    cmd.Parameters.AddWithValue("pIdMenu", idMenu);

                    var rows = await cmd.ExecuteNonQueryAsync(ct);
                    if (rows <= 0)
                    {
                        await tx.RollbackAsync(ct);
                        return new DtoMenuResult { Id = 0, Message = "No se encontró el menú a actualizar." };
                    }

                    await tx.CommitAsync(ct);
                    return new DtoMenuResult { Id = idMenu, Message = "Menú actualizado correctamente." };
                }

                // Insert: use RETURNING to get generated id
                long newId;
                await using (var cmdInsert = conn.CreateCommand())
                {
                    cmdInsert.Transaction = tx;
                    var idPadre = request.IdPadre <= 0 ? 0L : request.IdPadre;
                    cmdInsert.CommandText = @"
INSERT INTO ctr_menu
  (descripcion, idpadre, posicion, tipo, icono, vigente, detalle,
   usuario_creacion, fecha_creacion, maquina_creacion)
VALUES
  (@pDescripcion, @pIdPadre, @pPosicion, @pTipo, @pIcono, @pVigente, @pDetalle,
   @pUsuarioCreacion, NOW(), @pMaquinaCreacion)
RETURNING id_menu";

                    cmdInsert.Parameters.AddWithValue("pDescripcion", request.Descripcion!.Trim());
                    cmdInsert.Parameters.AddWithValue("pIdPadre", idPadre);
                    cmdInsert.Parameters.AddWithValue("pPosicion", request.Posicion);
                    cmdInsert.Parameters.AddWithValue("pTipo", request.Tipo!.Trim());
                    cmdInsert.Parameters.AddWithValue("pIcono", AsDbValue(request.Icono));
                    cmdInsert.Parameters.AddWithValue("pVigente", request.Vigente is 0 ? 0 : 1);
                    cmdInsert.Parameters.AddWithValue("pDetalle", AsDbValue(request.Detalle));
                    cmdInsert.Parameters.AddWithValue("pUsuarioCreacion", usuarioAuditoria);
                    cmdInsert.Parameters.AddWithValue("pMaquinaCreacion", AsDbValue(maquinaAuditoria));

                    newId = Convert.ToInt64(await cmdInsert.ExecuteScalarAsync(ct));
                }

                // If idpadre was 0 (root), update to self-reference
                if (request.IdPadre <= 0)
                {
                    await using var cmdSelf = conn.CreateCommand();
                    cmdSelf.Transaction = tx;
                    cmdSelf.CommandText = "UPDATE ctr_menu SET idpadre = @id WHERE id_menu = @id";
                    cmdSelf.Parameters.AddWithValue("id", newId);
                    await cmdSelf.ExecuteNonQueryAsync(ct);
                }

                await tx.CommitAsync(ct);
                return new DtoMenuResult { Id = newId, Message = "Menú creado correctamente." };
            }
            catch
            {
                await tx.RollbackAsync(ct);
                throw;
            }
        }

        public async Task<DtoMenuResult> SetEstadoMenuAsync(long idMenu, int vigente, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
UPDATE ctr_menu
   SET vigente          = @pVigente,
       usuario_modifica = @pUsuarioModifica,
       fecha_modifica   = NOW(),
       maquina_modifica = @pMaquinaModifica
 WHERE id_menu = @pIdMenu";
            cmd.Parameters.AddWithValue("pVigente", vigente is 0 ? 0 : 1);
            cmd.Parameters.AddWithValue("pUsuarioModifica", usuarioAuditoria);
            cmd.Parameters.AddWithValue("pMaquinaModifica", AsDbValue(maquinaAuditoria));
            cmd.Parameters.AddWithValue("pIdMenu", idMenu);

            var rows = await cmd.ExecuteNonQueryAsync(ct);
            if (rows <= 0)
                return new DtoMenuResult { Id = 0, Message = "No se encontró el menú." };

            return new DtoMenuResult { Id = idMenu, Message = vigente == 1 ? "Menú activado." : "Menú desactivado." };
        }

        public async Task<List<DtoMenuRolCatalogItem>> GetRolesCatalogAsync(CancellationToken ct)
        {
            var result = new List<DtoMenuRolCatalogItem>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
SELECT r.id_rol, r.descripcion
FROM ctr_roles r
WHERE COALESCE(r.vigente, 1) = 1
ORDER BY r.descripcion";

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
                result.Add(new DtoMenuRolCatalogItem
                {
                    IdRol = reader.GetInt32(0),
                    Descripcion = reader.IsDBNull(1) ? string.Empty : reader.GetString(1)
                });

            return result;
        }

        public async Task<List<DtoMenuRolItem>> GetRolesByMenuAsync(long idMenu, CancellationToken ct)
        {
            var result = new List<DtoMenuRolItem>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
SELECT mr.id_menurol, mr.id_rol, COALESCE(r.descripcion, 'Rol ' || mr.id_rol) AS descripcion_rol
FROM ctr_menu_roles mr
LEFT JOIN ctr_roles r ON r.id_rol = mr.id_rol
WHERE mr.id_menu = @pIdMenu
ORDER BY descripcion_rol, mr.id_menurol";
            cmd.Parameters.AddWithValue("pIdMenu", idMenu);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
                result.Add(new DtoMenuRolItem
                {
                    IdMenuRol = reader.GetInt64(0),
                    IdRol = reader.GetInt32(1),
                    DescripcionRol = reader.IsDBNull(2) ? string.Empty : reader.GetString(2)
                });

            return result;
        }

        public async Task<DtoMenuResult> AssignRolToMenuAsync(long idMenu, int idRol, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx = await conn.BeginTransactionAsync(ct);

            try
            {
                await using (var cmdCheck = conn.CreateCommand())
                {
                    cmdCheck.Transaction = tx;
                    cmdCheck.CommandText = @"
SELECT COUNT(1) FROM ctr_menu_roles WHERE id_menu = @pIdMenu AND id_rol = @pIdRol";
                    cmdCheck.Parameters.AddWithValue("pIdMenu", idMenu);
                    cmdCheck.Parameters.AddWithValue("pIdRol", idRol);

                    var count = Convert.ToInt32(await cmdCheck.ExecuteScalarAsync(ct));
                    if (count > 0)
                    {
                        await tx.RollbackAsync(ct);
                        return new DtoMenuResult { Id = 0, Message = "El rol ya está asignado al menú." };
                    }
                }

                long nextId;
                await using (var cmdInsert = conn.CreateCommand())
                {
                    cmdInsert.Transaction = tx;
                    cmdInsert.CommandText = @"
INSERT INTO ctr_menu_roles (id_rol, id_menu, usuario_creacion, fecha_creacion, maquina_creacion)
VALUES (@pIdRol, @pIdMenu, @pUsuarioCreacion, NOW(), @pMaquinaCreacion)
RETURNING id_menurol";
                    cmdInsert.Parameters.AddWithValue("pIdRol", idRol);
                    cmdInsert.Parameters.AddWithValue("pIdMenu", idMenu);
                    cmdInsert.Parameters.AddWithValue("pUsuarioCreacion", usuarioAuditoria);
                    cmdInsert.Parameters.AddWithValue("pMaquinaCreacion", AsDbValue(maquinaAuditoria));

                    nextId = Convert.ToInt64(await cmdInsert.ExecuteScalarAsync(ct));
                }

                await tx.CommitAsync(ct);
                return new DtoMenuResult { Id = nextId, Message = "Rol asignado al menú correctamente." };
            }
            catch
            {
                await tx.RollbackAsync(ct);
                throw;
            }
        }

        /// <summary>
        /// Deja el rol con exactamente los menús recibidos. Se hace en una
        /// transacción y con dos sentencias de conjunto —no un bucle de
        /// llamadas— porque el administrador está guardando UNA decisión: si
        /// algo falla a medias, el rol no puede quedar con media lista.
        ///
        /// Solo se guardan PANTALLAS. Los grupos no se conceden: la consulta
        /// del lateral (GetMenuByUsuarioAsync) sube sola a los grupos padre de
        /// lo concedido, y un grupo sin pantallas dentro ni siquiera se pinta.
        /// Concederlo por separado no añadiría nada y solo ensuciaría la
        /// tabla; el filtro va en la pantalla y también aquí, por si alguien
        /// llama al endpoint a mano.
        /// </summary>
        public async Task<DtoMenuResult> ReemplazarMenusDeRolAsync(
            int idRol, IReadOnlyCollection<long> idMenus,
            long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        {
            var deseados = idMenus.Where(id => id > 0).Distinct().ToArray();

            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx   = await conn.BeginTransactionAsync(ct);

            try
            {
                int retirados;
                await using (var cmd = conn.CreateCommand())
                {
                    cmd.Transaction = tx;
                    cmd.CommandText = @"
DELETE FROM ctr_menu_roles
 WHERE id_rol = @pIdRol
   AND NOT (id_menu = ANY(@pIdMenus))";
                    cmd.Parameters.AddWithValue("pIdRol",   idRol);
                    cmd.Parameters.AddWithValue("pIdMenus", deseados);
                    retirados = await cmd.ExecuteNonQueryAsync(ct);
                }

                int concedidos = 0;
                if (deseados.Length > 0)
                {
                    await using var cmd = conn.CreateCommand();
                    cmd.Transaction = tx;
                    // Solo pantallas vigentes: un id inventado, uno de un menú
                    // dado de baja o un GRUPO no entra.
                    cmd.CommandText = @"
INSERT INTO ctr_menu_roles (id_rol, id_menu, usuario_creacion, fecha_creacion, maquina_creacion)
SELECT @pIdRol, m.id_menu, @pUsuario, NOW(), @pMaquina
FROM   ctr_menu m
WHERE  m.id_menu = ANY(@pIdMenus)
  AND  m.vigente = 1
  AND  UPPER(COALESCE(m.tipo, '')) <> 'GRUPO'
  AND  COALESCE(TRIM(m.detalle), '') <> ''
  AND  NOT EXISTS (SELECT 1 FROM ctr_menu_roles mr
                   WHERE mr.id_rol = @pIdRol AND mr.id_menu = m.id_menu)";
                    cmd.Parameters.AddWithValue("pIdRol",   idRol);
                    cmd.Parameters.AddWithValue("pIdMenus", deseados);
                    cmd.Parameters.AddWithValue("pUsuario", usuarioAuditoria);
                    cmd.Parameters.AddWithValue("pMaquina", maquinaAuditoria ?? "");
                    concedidos = await cmd.ExecuteNonQueryAsync(ct);
                }

                await tx.CommitAsync(ct);

                var partes = new List<string>();
                if (concedidos > 0) partes.Add($"{concedidos} concedida(s)");
                if (retirados  > 0) partes.Add($"{retirados} retirada(s)");

                return new DtoMenuResult
                {
                    Id      = idRol,
                    Message = partes.Count == 0
                        ? "No había cambios que guardar."
                        : $"Permisos actualizados: {string.Join(", ", partes)}."
                };
            }
            catch
            {
                await tx.RollbackAsync(ct);
                throw;
            }
        }

        public async Task<DtoMenuResult> RemoveRolFromMenuAsync(long idMenu, int idRol, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
        {
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var tx = await conn.BeginTransactionAsync(ct);

            try
            {
                await using var cmd = conn.CreateCommand();
                cmd.Transaction = tx;
                cmd.CommandText = @"
DELETE FROM ctr_menu_roles WHERE id_menu = @pIdMenu AND id_rol = @pIdRol";
                cmd.Parameters.AddWithValue("pIdMenu", idMenu);
                cmd.Parameters.AddWithValue("pIdRol", idRol);

                var rows = await cmd.ExecuteNonQueryAsync(ct);
                if (rows <= 0)
                {
                    await tx.RollbackAsync(ct);
                    return new DtoMenuResult { Id = 0, Message = "No se encontró la asignación menú-rol." };
                }

                await tx.CommitAsync(ct);
                return new DtoMenuResult { Id = idMenu, Message = "Asignación menú-rol eliminada." };
            }
            catch
            {
                await tx.RollbackAsync(ct);
                throw;
            }
        }

        public async Task<List<DtoRoleMenuItem>> GetMenusByRolAsync(int idRol, CancellationToken ct)
        {
            var result = new List<DtoRoleMenuItem>();
            await using var conn = await _tenant.DataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
SELECT m.id_menu, m.descripcion, m.idpadre, m.posicion, m.tipo, m.detalle
FROM ctr_menu_roles mr
JOIN ctr_menu m ON m.id_menu = mr.id_menu
WHERE mr.id_rol = @pIdRol
ORDER BY m.idpadre, m.posicion, m.descripcion";
            cmd.Parameters.AddWithValue("pIdRol", idRol);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
                result.Add(new DtoRoleMenuItem
                {
                    IdMenu = reader.GetInt64(0),
                    DescripcionMenu = reader.IsDBNull(1) ? string.Empty : reader.GetString(1),
                    IdPadre = reader.IsDBNull(2) ? 0 : reader.GetInt64(2),
                    Posicion = reader.IsDBNull(3) ? 0 : reader.GetInt32(3),
                    Tipo = reader.IsDBNull(4) ? string.Empty : reader.GetString(4),
                    Detalle = reader.IsDBNull(5) ? null : reader.GetString(5)
                });

            return result;
        }

        public Task<DtoMenuResult> AssignMenuToRolAsync(int idRol, long idMenu, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
            => AssignRolToMenuAsync(idMenu, idRol, usuarioAuditoria, maquinaAuditoria, ct);

        public Task<DtoMenuResult> RemoveMenuFromRolAsync(int idRol, long idMenu, long usuarioAuditoria, string maquinaAuditoria, CancellationToken ct)
            => RemoveRolFromMenuAsync(idMenu, idRol, usuarioAuditoria, maquinaAuditoria, ct);

        private static void BindSaveParams(NpgsqlCommand cmd, DtoMenuSaveRequest request, long idPadre, long usuarioAuditoria, string maquinaAuditoria)
        {
            cmd.Parameters.AddWithValue("pDescripcion", request.Descripcion!.Trim());
            cmd.Parameters.AddWithValue("pIdPadre", idPadre);
            cmd.Parameters.AddWithValue("pPosicion", request.Posicion);
            cmd.Parameters.AddWithValue("pTipo", request.Tipo!.Trim());
            cmd.Parameters.AddWithValue("pIcono", AsDbValue(request.Icono));
            cmd.Parameters.AddWithValue("pVigente", request.Vigente is 0 ? 0 : 1);
            cmd.Parameters.AddWithValue("pDetalle", AsDbValue(request.Detalle));
            cmd.Parameters.AddWithValue("pUsuarioModifica", usuarioAuditoria);
            cmd.Parameters.AddWithValue("pMaquinaModifica", AsDbValue(maquinaAuditoria));
        }

        private static object AsDbValue(string? value)
        {
            var s = (value ?? string.Empty).Trim();
            return string.IsNullOrWhiteSpace(s) ? DBNull.Value : s;
        }

        private static DtoMenuItem MapMenuItem(NpgsqlDataReader reader) => new()
        {
            IdMenu = reader.GetInt64(0),
            Descripcion = reader.IsDBNull(1) ? string.Empty : reader.GetString(1),
            IdPadre = reader.GetInt64(2),
            Posicion = reader.GetInt32(3),
            Tipo = reader.IsDBNull(4) ? string.Empty : reader.GetString(4),
            Icono = reader.IsDBNull(5) ? null : reader.GetString(5),
            Vigente = reader.GetInt32(6),
            Detalle = reader.IsDBNull(7) ? null : reader.GetString(7)
        };
    }
}
