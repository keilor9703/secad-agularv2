-- ============================================================
-- V37 – Restringir cad_pedidos.estado a los valores válidos
--
-- cad_pedidos.estado (VARCHAR(20)) no tenía CHECK constraint —
-- cualquier string de hasta 20 caracteres era aceptado por
-- PUT api/Evento/{id}/estado. Los valores realmente usados por
-- el módulo de Eventos son:
--   A = Activo, P = Pendiente, E = En proceso,
--   T = Seguimiento, R = Para revisión, C = Cerrado
--
-- La validación equivalente ya se agrega en EventoController.SetEstado
-- (devuelve 400 antes de llegar a la BD); este constraint es la
-- segunda línea de defensa a nivel de datos.
--
-- Se agrega NOT VALID a propósito: como el campo nunca tuvo validación,
-- no se puede garantizar desde aquí que no existan filas legadas con
-- valores fuera de este set en algún tenant. NOT VALID activa el
-- constraint para todo INSERT/UPDATE nuevo sin bloquear el despliegue
-- validando retroactivamente todas las filas existentes. Una vez
-- confirmado que los datos históricos están limpios en cada tenant,
-- se puede correr:
--   ALTER TABLE cad_pedidos VALIDATE CONSTRAINT chk_cad_pedidos_estado;
-- ============================================================

-- Postgres no soporta ADD CONSTRAINT IF NOT EXISTS de forma nativa —
-- se comprueba a mano para que el script sea seguro de re-correr.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_cad_pedidos_estado'
    ) THEN
        ALTER TABLE cad_pedidos
            ADD CONSTRAINT chk_cad_pedidos_estado
            CHECK (estado IN ('A','P','E','T','R','C')) NOT VALID;
    END IF;
END $$;
