-- ══════════════════════════════════════════════════════════════════════════════
-- V27: Configuración de integraciones entrantes (Chat, SMS, etc.)
--
-- Propósito:
--   Centraliza la configuración de los canales por los que el sistema RECIBE
--   casos desde sistemas externos (WhatsApp, SMS, apps móviles, portales web).
--   La autenticación usa X-Api-Key global (appsettings.json), pero este catálogo
--   permite documentar, activar/desactivar y auditar cada canal.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cad_integraciones_entrantes (
    id                  BIGINT        NOT NULL PRIMARY KEY,    -- Snowflake
    nombre              VARCHAR(100)  NOT NULL,
    descripcion         TEXT,
    tipo_canal          VARCHAR(20)   NOT NULL
                            CHECK (tipo_canal IN ('CHAT','SMS','API_FOTO','OTRA')),
    -- Endpoint relativo que expone el sistema para este canal
    endpoint_relativo   VARCHAR(200)  NOT NULL,
    -- Headers requeridos por el cliente externo (informativo)
    headers_requeridos  JSONB,
    -- Ejemplo de payload (para documentación)
    ejemplo_payload     JSONB,
    -- Sitio de grabación por defecto cuando no viene en el payload
    sitio_graba_defecto INTEGER       NOT NULL DEFAULT 0,
    activa              BOOLEAN       NOT NULL DEFAULT TRUE,
    notas               TEXT,
    fecha_creacion      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    fecha_modificacion  TIMESTAMPTZ,
    usuario_creacion    VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_int_entrantes_tipo
    ON cad_integraciones_entrantes (tipo_canal)
    WHERE activa = TRUE;

-- ── Seed: canales preconfigurados ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cad_integraciones_entrantes LIMIT 1) THEN
    INSERT INTO cad_integraciones_entrantes
        (id, nombre, descripcion, tipo_canal, endpoint_relativo,
         headers_requeridos, ejemplo_payload, activa, usuario_creacion)
    VALUES
    (
      1720000000000001,
      'Canal Chat (WhatsApp / Telegram)',
      'Recibe mensajes de plataformas de chat. El sistema crea un pedido de recepción con origen=CHAT.',
      'CHAT',
      '/api/RecepcionExterna/chat',
      '{"X-Api-Key": "<clave-configurada-en-appsettings>", "X-Cod-Dane": "<codigo-DANE-del-CAD>", "Content-Type": "application/json"}'::jsonb,
      '{"sitioGraba":1,"nombreReportante":"Juan García","contactoId":"3001234567","mensaje":"Hay un hurto en la Cra 7 con 32","direccionCaso":"Carrera 7 # 32-15","ciudad":"Bogotá","barrio":"Candelaria","codigoCaso":"120","caliPedido":"01","canales":[{"codigo":1,"fuerzaId":1}]}'::jsonb,
      TRUE,
      'migration-V27'
    ),
    (
      1720000000000002,
      'Canal SMS',
      'Recibe mensajes SMS de ciudadanos. El sistema crea un pedido de recepción con origen=SMS.',
      'SMS',
      '/api/RecepcionExterna/sms',
      '{"X-Api-Key": "<clave-configurada-en-appsettings>", "X-Cod-Dane": "<codigo-DANE-del-CAD>", "Content-Type": "application/json"}'::jsonb,
      '{"sitioGraba":1,"numeroCelular":"+573001234567","nombreReportante":"CIUDADANO","mensajeSms":"Accidente en Av El Dorado con Cra 50","direccionCaso":"Av El Dorado con Cra 50","ciudad":"Bogotá","barrio":"Fontibón","codigoCaso":"300","caliPedido":"01","canales":[{"codigo":1,"fuerzaId":1}]}'::jsonb,
      TRUE,
      'migration-V27'
    );

    RAISE NOTICE 'V27: Canales entrantes de ejemplo insertados.';
  ELSE
    RAISE NOTICE 'V27: cad_integraciones_entrantes ya tiene datos — sin inserción.';
  END IF;
END $$;

-- ── Ítem de menú: Hub de Integraciones ────────────────────────────────────────
DO $$
DECLARE
  v_id_admin  BIGINT;
  v_id_item   BIGINT;
BEGIN
  SELECT id_menu INTO v_id_admin
  FROM ctr_menu
  WHERE LOWER(descripcion) LIKE '%administraci%' AND vigente = 1
  ORDER BY id_menu LIMIT 1;

  IF v_id_admin IS NOT NULL THEN
    -- Eliminar el ítem antiguo "Agencias Externas" si existe con la ruta vieja
    DELETE FROM ctr_menu_roles mr
    USING ctr_menu m
    WHERE mr.id_menu = m.id_menu
      AND m.detalle  = '/administracion/agencias-externas';

    DELETE FROM ctr_menu
    WHERE detalle = '/administracion/agencias-externas';

    -- Crear nuevo ítem "Hub de Integraciones"
    SELECT id_menu INTO v_id_item
    FROM ctr_menu
    WHERE idpadre = v_id_admin AND detalle = '/administracion/integraciones'
    LIMIT 1;

    IF v_id_item IS NULL THEN
      INSERT INTO ctr_menu
        (descripcion, idpadre, posicion, tipo, icono, vigente, detalle,
         usuario_creacion, fecha_creacion, maquina_creacion)
      VALUES
        ('Hub de Integraciones', v_id_admin, 60, 'ENLACE',
         'fa-solid fa-plug-circle-bolt', 1, '/administracion/integraciones',
         1, NOW(), 'migration-V27')
      RETURNING id_menu INTO v_id_item;

      INSERT INTO ctr_menu_roles (id_rol, id_menu, usuario_creacion, fecha_creacion, maquina_creacion)
      SELECT r.id_rol, v_id_item, 1, NOW(), 'migration-V27'
      FROM (VALUES (1),(2)) AS r(id_rol)
      WHERE NOT EXISTS (
        SELECT 1 FROM ctr_menu_roles mr
        WHERE mr.id_rol = r.id_rol AND mr.id_menu = v_id_item
      );

      RAISE NOTICE 'V27: Ítem "Hub de Integraciones" creado con id = %', v_id_item;
    END IF;
  END IF;
END $$;

COMMENT ON TABLE cad_integraciones_entrantes IS
  '§6.7 Catálogo de canales entrantes configurados en el sistema. '
  'Cada fila documenta un endpoint REST que recibe casos externos (Chat, SMS, etc.).';
