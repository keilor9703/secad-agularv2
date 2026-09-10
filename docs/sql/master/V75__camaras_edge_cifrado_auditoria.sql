-- ══════════════════════════════════════════════════════════════════════════════
-- V75: Correcciones de diseño de la integración VMS (cámaras CCTV)
--
-- V44 dejó lista la CONFIGURACIÓN de integraciones a sistemas de video. Al
-- retomar el módulo con el diseño técnico de HikCentral en la mano
-- (docs/Documentacion/CCTV_HIKCENTRAL_DISENO_TECNICO.md) aparecieron tres
-- huecos que hay que cerrar antes de escribir el driver:
--
--   1. El driver NO corre en Bogotá. Por segmentación de VLAN los servidores
--      centrales no alcanzan la red de cámaras del municipio (172.19.x.x); solo
--      el nodo edge de la sede lo hace (§2.1 del diseño). La ficha tiene que
--      decir a qué nodo dirigir las operaciones de video, y hoy no hay dónde
--      guardarlo.
--
--   2. El AppSecret se guarda en texto plano. Cuando se escribió V44 no había
--      alternativa; V73 trajo cifrado AES-GCM reversible para las llaves de API
--      y sirve igual aquí. Quien lea la base no debe poder firmar peticiones al
--      VMS del municipio.
--
--   3. Ver una cámara es un acto sensible y la especificación exige registrarlo
--      (quién, qué cámara, cuándo, con qué caso). No existía la tabla.
--
-- Base: TENANT (una por CAD). No toca la maestra.
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'cad_camara_integracion') THEN
        RAISE NOTICE 'V75: no existe cad_camara_integracion (falta V44) — nada que hacer.';
        RETURN;
    END IF;

    -- ── 1. Nodo que atiende el plano de datos ────────────────────────────────
    -- Vacío = el mismo backend que atiende la petición. Es lo correcto para un
    -- CAD cuyo servidor ya alcanza las cámaras; Tunja necesitará su edge.
    ALTER TABLE cad_camara_integracion
        ADD COLUMN IF NOT EXISTS nodo_edge_url VARCHAR(300);

    COMMENT ON COLUMN cad_camara_integracion.nodo_edge_url IS
        'Base URL del nodo SECAD que SÍ alcanza la red de cámaras y firma contra '
        'el VMS (ej. https://edge-tunja.local:8443). Vacío = lo atiende este '
        'mismo backend. El video nunca pasa por el central.';

    -- ── 2. El secreto pasa a estar cifrado ───────────────────────────────────
    -- Se guarda como texto (AES-GCM en base64), no como JSONB: un blob cifrado
    -- no es un documento y fingir que lo es solo invita a consultarlo por clave.
    -- La columna vieja se conserva hasta que el backend termine de migrar cada
    -- fila; ver ICifradoSecretos.
    ALTER TABLE cad_camara_integracion
        ADD COLUMN IF NOT EXISTS config_secreto_cifrado TEXT;

    COMMENT ON COLUMN cad_camara_integracion.config_secreto_cifrado IS
        'config_secreto cifrado con AES-GCM (misma clave que las llaves de API: '
        'ApiKeys:ClaveCifrado). El backend lo migra al guardar o al leer; '
        'config_secreto queda como respaldo de lo ya escrito en claro.';

    RAISE NOTICE 'V75: columnas de edge y cifrado listas.';
END $$;

-- ── 3. Auditoría de visualización ────────────────────────────────────────────
-- Una fila por cada vez que alguien pide ver una cámara. No guarda el video ni
-- la URL firmada —que es un secreto de corta vida—, solo el hecho.
CREATE TABLE IF NOT EXISTS cad_camaras_visualizacion (
    id              BIGINT       NOT NULL PRIMARY KEY,   -- Snowflake
    camara_id       BIGINT,                              -- cad_camaras.id, si estaba en catálogo
    camara_codigo   VARCHAR(64),                         -- id en el VMS, tal como se pidió
    integracion_id  BIGINT,
    -- Con qué caso se justificó la consulta. Nulo = el operador miró el mapa
    -- sin un caso abierto, que también es legítimo y también se registra.
    pedido_id       BIGINT,
    evento_id       BIGINT,
    sitio_graba     INTEGER      NOT NULL DEFAULT 0,
    usuario         VARCHAR(100) NOT NULL,
    ip              VARCHAR(64),
    -- true = se entregó la URL; false = se negó (sin permiso, cámara offline…).
    concedido       BOOLEAN      NOT NULL DEFAULT TRUE,
    motivo          VARCHAR(300),
    fecha           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE cad_camaras_visualizacion IS
    'Quién vio qué cámara, cuándo y con qué caso. Exigido por la especificación: '
    'el acceso a video es un dato sensible. Registra también los intentos negados.';

CREATE INDEX IF NOT EXISTS idx_camvis_fecha   ON cad_camaras_visualizacion (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_camvis_usuario ON cad_camaras_visualizacion (usuario, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_camvis_camara  ON cad_camaras_visualizacion (camara_codigo, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_camvis_pedido  ON cad_camaras_visualizacion (pedido_id)
    WHERE pedido_id IS NOT NULL;
