-- ══════════════════════════════════════════════════════════════════════════════
-- V74: El canal de despacho de una integración entrante lo fija SECAD
--
-- Problema:
--   Los endpoints entrantes (/api/RecepcionExterna/chat y /sms) aceptaban un
--   array «canales» en el cuerpo de la petición. Es decir: el sistema externo
--   —una app ciudadana, un bot de WhatsApp, una pasarela de SMS— decidía a qué
--   fuerza y a qué canal de despacho entraba el caso.
--
--   Eso está mal por tres razones:
--     1. El proveedor externo no conoce —ni tiene por qué conocer— el catálogo
--        de fuerzas y canales del CAD, que además cambia con el tiempo.
--     2. Es un agujero: con una llave de alcance CHAT se podía inyectar casos
--        en CUALQUIER canal del CAD, incluido el de otra unidad.
--     3. En la práctica siempre llegaba vacío, así que todos los casos de
--        integración caían en la bandeja sin despachar.
--
-- Solución:
--   El canal (o los canales) se configuran en SECAD al crear o editar la
--   integración entrante, eligiendo primero la fuerza y luego su canal. Pueden
--   ser varios, incluso de fuerzas distintas. El payload externo pierde el
--   campo «canales».
--
-- Qué crea:
--   · cad_integraciones_entrantes.api_key_id — la llave con la que entra ese
--     proveedor. Es lo que permite saber QUÉ integración está escribiendo
--     cuando llega una petición, y por tanto qué canales aplicarle.
--   · cad_integraciones_entrantes_canales — los canales destino de cada
--     integración.
--
-- Base: TENANT (una por CAD). No toca la maestra.
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'cad_integraciones_entrantes') THEN
        RAISE NOTICE 'V74: no existe cad_integraciones_entrantes — nada que hacer.';
        RETURN;
    END IF;

    -- ── 1. La llave que identifica al proveedor ───────────────────────────────
    -- Vive en la maestra (secad_api_keys), así que aquí se guarda solo el id:
    -- una FK entre bases no es posible y tampoco haría falta, porque la llave
    -- ya se validó antes de llegar a la base del tenant.
    ALTER TABLE cad_integraciones_entrantes
        ADD COLUMN IF NOT EXISTS api_key_id BIGINT;

    COMMENT ON COLUMN cad_integraciones_entrantes.api_key_id IS
        'Id de secad_api_keys (base maestra) con la que autentica este proveedor. '
        'Es lo que empareja una petición entrante con su ficha de integración.';

    RAISE NOTICE 'V74: columna api_key_id lista.';
END $$;

-- ── 2. Canales destino ────────────────────────────────────────────────────────
-- La llave de un canal es (codigo, cadfuerz_id): el código NO es único, dos
-- fuerzas distintas pueden tener el canal 1. Guardar solo el código —como hacía
-- el payload externo— era ambiguo por diseño.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'cad_integraciones_entrantes')
    OR NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'cad_canales') THEN
        RAISE NOTICE 'V74: faltan tablas base — se omite cad_integraciones_entrantes_canales.';
        RETURN;
    END IF;

    CREATE TABLE IF NOT EXISTS cad_integraciones_entrantes_canales (
        integracion_id  BIGINT   NOT NULL
            REFERENCES cad_integraciones_entrantes(id) ON DELETE CASCADE,
        cadfuerz_id     INTEGER  NOT NULL,
        canal_codigo    INTEGER  NOT NULL,
        fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (integracion_id, cadfuerz_id, canal_codigo),
        FOREIGN KEY (canal_codigo, cadfuerz_id)
            REFERENCES cad_canales(codigo, cadfuerz_id)
    );

    CREATE INDEX IF NOT EXISTS idx_int_ent_canales_int
        ON cad_integraciones_entrantes_canales (integracion_id);

    RAISE NOTICE 'V74: cad_integraciones_entrantes_canales lista.';
END $$;

-- Índice para el emparejamiento petición → integración. Parcial sobre las
-- activas: es la única consulta que se hace en caliente, en cada caso que
-- entra por chat o SMS.
CREATE INDEX IF NOT EXISTS idx_int_entrantes_apikey
    ON cad_integraciones_entrantes (api_key_id)
    WHERE activa = TRUE AND api_key_id IS NOT NULL;

-- ── 3. Limpiar la documentación sembrada por V27 ──────────────────────────────
-- V27 dejó en ejemplo_payload un «canales» que ya no existe en el contrato, y
-- unos headers que hablan de la clave global de appsettings y de X-Cod-Dane,
-- ambos sustituidos por las llaves por CAD de V73. Dejarlos ahí es documentar
-- una API que no es la que hay.
DO $$
DECLARE
    v_filas INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'cad_integraciones_entrantes') THEN
        RETURN;
    END IF;

    UPDATE cad_integraciones_entrantes
    SET    ejemplo_payload = ejemplo_payload - 'canales'
    WHERE  ejemplo_payload ? 'canales';
    GET DIAGNOSTICS v_filas = ROW_COUNT;
    RAISE NOTICE 'V74: «canales» retirado de % ejemplo(s) de payload.', v_filas;

    UPDATE cad_integraciones_entrantes
    SET    headers_requeridos = headers_requeridos - 'X-Cod-Dane'
    WHERE  headers_requeridos ? 'X-Cod-Dane';
    GET DIAGNOSTICS v_filas = ROW_COUNT;
    RAISE NOTICE 'V74: «X-Cod-Dane» retirado de % juego(s) de headers.', v_filas;
END $$;

COMMENT ON TABLE cad_integraciones_entrantes_canales IS
  'Canales de despacho a los que entra un caso recibido por esta integración. '
  'Los decide el CAD, no el sistema externo: el proveedor ya no manda «canales» '
  'en el cuerpo de la petición.';
