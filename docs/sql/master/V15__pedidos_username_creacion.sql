-- ══════════════════════════════════════════════════════════════════════════════
-- V15: Agrega username_creacion a cad_pedidos
-- Propósito: almacenar el nombre de usuario directamente en la tabla para que
--            el módulo de Seguimiento del Jefe de Turno siempre muestre quién
--            generó el incidente, sin depender del JOIN a ctr_usuarios.
-- Autor: SECAD / Modernización
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE cad_pedidos
    ADD COLUMN IF NOT EXISTS username_creacion VARCHAR(100);

-- Poblar histórico: resolución retroactiva vía JOIN a ctr_usuarios
UPDATE cad_pedidos p
SET    username_creacion = u.username
FROM   ctr_usuarios u
WHERE  u.id_usuario = p.usuario_creacion
  AND  p.username_creacion IS NULL;

-- Índice para búsquedas por usuario en Seguimiento CAD
CREATE INDEX IF NOT EXISTS idx_cad_pedidos_username_creacion
    ON cad_pedidos (username_creacion)
    WHERE username_creacion IS NOT NULL;

COMMENT ON COLUMN cad_pedidos.username_creacion
    IS 'Nombre de usuario (login) que creó el registro. Snapshot en el momento del INSERT para trazabilidad independiente del FK usuario_creacion.';
