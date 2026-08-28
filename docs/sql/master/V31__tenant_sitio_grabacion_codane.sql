-- ══════════════════════════════════════════════════════════════════════════════
-- V31: Vinculación bidireccional Tenant ↔ Sitio de Grabación
--
-- Problema actual:
--   - secad_tenants (master) no sabe qué sitio_graba le corresponde.
--   - cad_sitios_grabacion (tenant) no sabe a qué CAD/tenant pertenece.
--
-- Solución:
--   A. secad_tenants.sitio_graba   → el consecutivo del sitio principal del CAD.
--   B. cad_sitios_grabacion.cod_dane → el código DANE del CAD al que pertenece.
--
-- Relación resultante:
--   secad_tenants.cod_dane = cad_sitios_grabacion.cod_dane
--   secad_tenants.sitio_graba = cad_sitios_grabacion.consecutivo
-- ══════════════════════════════════════════════════════════════════════════════

-- Este script se corre tanto contra la BD maestra como contra cada BD tenant
-- (única forma de tocar ambas tablas, que viven en bases distintas) — cada
-- bloque se protege comprobando que su tabla exista, así la mitad que no
-- aplica en esa base simplemente no hace nada, en vez de fallar con
-- "relation ... does not exist".

-- ── A. TABLA MAESTRA: agregar sitio_graba ────────────────────────────────────
-- Se aplica a la BD maestra donde vive secad_tenants.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'secad_tenants') THEN
        ALTER TABLE secad_tenants
            ADD COLUMN IF NOT EXISTS sitio_graba INTEGER;

        COMMENT ON COLUMN secad_tenants.sitio_graba IS
            'Código del sitio de grabación principal de este CAD (consecutivo en cad_sitios_grabacion). '
            'Permite relacionar el tenant master con su sitio de grabación en el schema tenant.';
    END IF;
END $$;


-- ── B. TABLA TENANT: agregar cod_dane ────────────────────────────────────────
-- Se aplica a cada BD tenant donde vive cad_sitios_grabacion.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cad_sitios_grabacion') THEN
        ALTER TABLE cad_sitios_grabacion
            ADD COLUMN IF NOT EXISTS cod_dane VARCHAR(10);

        COMMENT ON COLUMN cad_sitios_grabacion.cod_dane IS
            'Código DANE del CAD/tenant al que pertenece este sitio de grabación. '
            'Permite identificar qué SECAD gestiona este sitio. '
            'Referencia lógica a secad_tenants.cod_dane en la BD maestra.';

        CREATE INDEX IF NOT EXISTS idx_sitios_grabacion_cod_dane
            ON cad_sitios_grabacion(cod_dane)
            WHERE cod_dane IS NOT NULL;
    END IF;
END $$;
