-- =============================================================================
-- V38 — Renombrar "CTI" a "PlantaTel" en todo el esquema
-- El término "CTI" no es el correcto para este sistema; la interfaz recibe
-- llamadas desde la central telefónica (PBX), correctamente llamada
-- "PlantaTel". Renombra la tabla de interfaz, su índice, y el valor de
-- origen almacenado en cad_eventos.origen (incluidas las filas existentes).
-- Idempotente: se puede volver a ejecutar sin efecto tras la primera corrida.
-- =============================================================================

-- ── 1. Renombrar tabla + índice ─────────────────────────────────────────────
-- Si cad_plantatel ya existe (el renombre ya ocurrió en una corrida
-- anterior) y cad_interfaz_cti TAMBIÉN existe, es una tabla vacía huérfana
-- recreada por una corrida vieja de V4 que nunca llegó a este punto (p.ej.
-- se cortó antes por otro error) — se descarta en vez de intentar
-- renombrarla, porque el nombre destino ya está ocupado por la tabla real.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'cad_plantatel')
       AND EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'cad_interfaz_cti') THEN
        DROP TABLE cad_interfaz_cti;
    END IF;
END $$;

ALTER TABLE  IF EXISTS cad_interfaz_cti RENAME TO cad_plantatel;
ALTER INDEX  IF EXISTS idx_cti_sitio_acd_reg RENAME TO idx_plantatel_sitio_acd_reg;

COMMENT ON TABLE cad_plantatel IS
  'Cola de eventos de telefonía entrantes desde la central telefónica (PlantaTel/PBX). Antes: cad_interfaz_cti.';

-- ── 2. Renombrar el valor 'CTI' → 'PLANTATEL' en cad_eventos.origen ────────
-- El DROP va primero: el constraint original (V7b) solo admite 'CTI', no
-- 'PLANTATEL' — si el UPDATE corriera antes de soltar ese constraint viejo,
-- violaría chk_eventos_origen en cada fila con origen='CTI'.
ALTER TABLE cad_eventos DROP CONSTRAINT IF EXISTS chk_eventos_origen;

UPDATE cad_eventos SET origen = 'PLANTATEL' WHERE origen = 'CTI';

ALTER TABLE cad_eventos
    ADD CONSTRAINT chk_eventos_origen
    CHECK (origen IN (
        'PLANTATEL','RECEPCION','APP_MOVIL','INTEGRACION',
        'SIEDCO','INTERNO','MANUAL','CHAT','SMS'
    ));

COMMENT ON COLUMN cad_eventos.origen IS
  'Canal de origen del evento: PLANTATEL (antes CTI — planta telefónica/PBX) | RECEPCION | APP_MOVIL | INTEGRACION | SIEDCO | INTERNO | MANUAL | CHAT | SMS';
