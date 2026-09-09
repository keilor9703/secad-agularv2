-- ═══════════════════════════════════════════════════════════════════════════
--  V73: una llave de API por CAD, y la llave dice a qué CAD pertenece
--
--  Apply to: la BD MAESTRA (Secad). No aplica a las bases de tenant.
--
--  El problema que cierra
--  ──────────────────────
--  Hasta hoy la autenticación de las integraciones entrantes era UNA sola
--  clave en appsettings.json (RecepcionExterna:ApiKey), compartida por todos
--  los CAD del país, y el CAD destino lo decidía la cabecera X-Cod-Dane.
--  Súmelo: quien tuviera esa clave escribía en el CAD que quisiera cambiando
--  una cabecera. El proveedor de la planta telefónica de Cali podía crear
--  casos en Bogotá.
--
--  Por qué la tabla va en la MAESTRA y no en la del tenant
--  ───────────────────────────────────────────────────────
--  La petición llega SIN JWT. Para abrir la base de un tenant hay que saber
--  cuál es; si la llave viviera en esa base, para validarla habría que abrir
--  la base que todavía no se sabe cuál es. Huevo y gallina. La única salida
--  sería seguir creyéndole a X-Cod-Dane, que es justo el agujero.
--
--  Poniéndola aquí se da la vuelta al problema: la llave ES la identidad del
--  tenant. X-Cod-Dane deja de hacer falta y, por tanto, deja de poder
--  falsificarse.
--
--  Por qué hay huella Y copia cifrada
--  ──────────────────────────────────
--  Son para dos cosas distintas:
--    · huella = SHA-256 de la llave. Es lo que se busca en CADA petición
--      entrante, indexado. Descifrar fila por fila para encontrar una
--      coincidencia sería inviable.
--    · clave_cifrada = la llave, cifrada de forma reversible (AES-GCM). Solo
--      se descifra cuando un administrador pide verla, y ese acto queda en
--      secad_api_keys_auditoria.
--
--  Lo ortodoxo sería guardar solo la huella y enseñar la llave una única vez.
--  Aquí se guarda también cifrada a propósito: rotar la llave de una planta
--  telefónica obliga a que alguien vaya a reconfigurar el equipo, y perderla
--  significa coordinar una ventana con el proveedor. El precio es que quien
--  tenga acceso a la maestra Y a la clave de cifrado puede recuperarlas; a
--  cambio, cada revelado queda registrado con usuario, IP y fecha.
--
--  Rotación con gracia
--  ───────────────────
--  Al regenerar, la anterior sigue sirviendo hasta `anterior_expira`. Sin eso,
--  el segundo en que alguien pulsa «Regenerar» dejan de entrar las llamadas
--  hasta que el proveedor actualice su configuración.
--
--  Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS secad_api_keys (
    id                     BIGINT       PRIMARY KEY,          -- Snowflake
    cod_dane               VARCHAR(10)  NOT NULL,
    nombre                 VARCHAR(120) NOT NULL,
    -- Qué puede hacer esta llave. La de la planta telefónica no debe servir
    -- para crear casos por chat.
    alcance                VARCHAR(20)  NOT NULL
                             CHECK (alcance IN ('PBX','CHAT','SMS','ACTUALIZACION','TODO')),
    -- Trozo visible para reconocerla en la lista sin revelarla entera.
    prefijo                VARCHAR(32)  NOT NULL,
    -- SHA-256 en hexadecimal de la llave completa. Lo que se busca en cada
    -- petición.
    huella                 CHAR(64)     NOT NULL,
    -- La llave cifrada (AES-GCM, base64). Solo para el botón «Ver».
    clave_cifrada          TEXT         NOT NULL,
    -- Unidad policial por defecto cuando el sistema externo no la manda.
    sitio_graba_defecto    INTEGER      NOT NULL DEFAULT 0,
    activa                 BOOLEAN      NOT NULL DEFAULT TRUE,

    -- ── Rotación con periodo de gracia ────────────────────────────────────
    huella_anterior        CHAR(64),
    clave_anterior_cifrada TEXT,
    anterior_expira        TIMESTAMPTZ,

    -- ── Uso, para saber si la integración está viva ───────────────────────
    ultimo_uso             TIMESTAMPTZ,
    ultimo_uso_ip          VARCHAR(64),
    total_usos             BIGINT       NOT NULL DEFAULT 0,

    notas                  TEXT,
    fecha_creacion         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    usuario_creacion       VARCHAR(100),
    fecha_modificacion     TIMESTAMPTZ,
    usuario_modifica       VARCHAR(100),
    fecha_revocacion       TIMESTAMPTZ
);

-- La huella es única entre las llaves activas: dos llaves vivas no pueden
-- resolver al mismo secreto. Las revocadas quedan fuera del índice para poder
-- conservar el histórico.
CREATE UNIQUE INDEX IF NOT EXISTS uq_api_keys_huella
    ON secad_api_keys (huella) WHERE activa;

-- La anterior en gracia también se busca en cada petición.
CREATE INDEX IF NOT EXISTS idx_api_keys_huella_anterior
    ON secad_api_keys (huella_anterior)
    WHERE huella_anterior IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_api_keys_cod_dane
    ON secad_api_keys (cod_dane);

COMMENT ON TABLE secad_api_keys IS
    'Llaves de API de las integraciones entrantes, una por CAD y alcance. La llave '
    'identifica al tenant: por eso vive en la maestra y no en la base del tenant, '
    'donde no se podría consultar sin saber antes cuál es el tenant.';


-- ── Bitácora: quién vio, regeneró o revocó una llave ───────────────────────
-- Guardar la llave de forma recuperable solo es defendible si cada recuperación
-- deja rastro.
CREATE TABLE IF NOT EXISTS secad_api_keys_auditoria (
    id             BIGINT      PRIMARY KEY,                   -- Snowflake
    api_key_id     BIGINT      NOT NULL,
    cod_dane       VARCHAR(10) NOT NULL,
    accion         VARCHAR(20) NOT NULL
                     CHECK (accion IN ('CREADA','REVELADA','REGENERADA','REVOCADA','REACTIVADA','PROBADA')),
    usuario        VARCHAR(100),
    ip             VARCHAR(64),
    detalle        TEXT,
    fecha          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_aud_llave
    ON secad_api_keys_auditoria (api_key_id, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_api_keys_aud_dane
    ON secad_api_keys_auditoria (cod_dane, fecha DESC);

COMMENT ON TABLE secad_api_keys_auditoria IS
    'Cada creación, revelado, rotación y revocación de una llave de API, con '
    'usuario e IP. Es la contrapartida de poder volver a ver una llave.';
