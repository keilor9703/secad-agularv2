-- ══════════════════════════════════════════════════════════════════════════════
-- V26: Constraint UNIQUE en cad_pedidos_canales (codigo + fuerza_id)
--
-- Sin este constraint, ON CONFLICT DO NOTHING no tiene target y el INSERT
-- puede duplicar filas o fallar silenciosamente.
-- La llave de un canal es (codigo, fuerza_id), no solo codigo.
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE  conname   = 'uq_pedcanales_pedido_canal'
      AND  conrelid  = 'cad_pedidos_canales'::regclass
  ) THEN
    -- Eliminar duplicados previos antes de crear el constraint
    DELETE FROM cad_pedidos_canales
    WHERE id NOT IN (
      SELECT MIN(id)
      FROM   cad_pedidos_canales
      GROUP  BY cadpedi_sitiograba, cadpedi_numellamada,
                cadcana_fuerz_id,   cadcana_codigo
    );

    ALTER TABLE cad_pedidos_canales
      ADD CONSTRAINT uq_pedcanales_pedido_canal
      UNIQUE (cadpedi_sitiograba, cadpedi_numellamada, cadcana_fuerz_id, cadcana_codigo);

    RAISE NOTICE 'V26: Constraint uq_pedcanales_pedido_canal creado.';
  ELSE
    RAISE NOTICE 'V26: Constraint uq_pedcanales_pedido_canal ya existe.';
  END IF;
END $$;

-- Índice adicional para la consulta del módulo Eventos (filtro por canal+fuerza)
CREATE INDEX IF NOT EXISTS idx_pedcanales_canal_fuerza
    ON cad_pedidos_canales (cadcana_codigo, cadcana_fuerz_id, enviar);
