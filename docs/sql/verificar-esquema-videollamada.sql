-- ═══════════════════════════════════════════════════════════════════════════
--  Verificación: ¿qué le falta a este tenant para la videollamada?
--
--  Síntoma que resuelve: al oprimir «Iniciar videollamada» el backend responde
--  500 y el log dice  42703: no existe la columna «ultima_lat».  No es un bug
--  del código: la base de ese tenant se quedó en una versión anterior a las
--  migraciones V53–V55, y el repositorio ya consulta esas columnas.
--
--  SOLO LEE. Ejecutar conectado a la base DEL TENANT (p. ej. 11001), no a la
--  base maestra.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
    v.migracion,
    v.objeto,
    CASE WHEN v.existe THEN 'OK' ELSE 'FALTA' END AS estado
FROM (
    -- V53 — última ubicación GPS del ciudadano
    SELECT 'V53' AS migracion, 'cad_video_sesiones.ultima_lat'             AS objeto,
           EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cad_video_sesiones' AND column_name='ultima_lat') AS existe, 1 AS orden
    UNION ALL SELECT 'V53', 'cad_video_sesiones.ultima_lng',
           EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cad_video_sesiones' AND column_name='ultima_lng'), 2
    UNION ALL SELECT 'V53', 'cad_video_sesiones.ultima_precision',
           EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cad_video_sesiones' AND column_name='ultima_precision'), 3
    UNION ALL SELECT 'V53', 'cad_video_sesiones.ultima_ubicacion_fecha',
           EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cad_video_sesiones' AND column_name='ultima_ubicacion_fecha'), 4

    -- V54 — grabación resiliente por trozos
    UNION ALL SELECT 'V54', 'cad_video_sesiones.grabacion_estado',
           EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cad_video_sesiones' AND column_name='grabacion_estado'), 5
    UNION ALL SELECT 'V54', 'cad_video_sesiones.grabacion_archivo_temp',
           EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cad_video_sesiones' AND column_name='grabacion_archivo_temp'), 6
    UNION ALL SELECT 'V54', 'cad_video_sesiones.grabacion_bytes',
           EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cad_video_sesiones' AND column_name='grabacion_bytes'), 7
    UNION ALL SELECT 'V54', 'cad_video_sesiones.grabacion_inicio',
           EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cad_video_sesiones' AND column_name='grabacion_inicio'), 8
    UNION ALL SELECT 'V54', 'cad_video_sesiones.grabacion_ultimo_chunk',
           EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cad_video_sesiones' AND column_name='grabacion_ultimo_chunk'), 9
    UNION ALL SELECT 'V54', 'cad_video_sesiones.grabacion_usuario',
           EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cad_video_sesiones' AND column_name='grabacion_usuario'), 10
    UNION ALL SELECT 'V54', 'índice idx_video_grabacion_abierta',
           EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_video_grabacion_abierta'), 11
    UNION ALL SELECT 'V54', 'índice idx_video_sesion_pedido_activa',
           EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_video_sesion_pedido_activa'), 12

    -- V55 — chat de la videollamada
    UNION ALL SELECT 'V55', 'tabla cad_video_chat_mensajes',
           EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='cad_video_chat_mensajes'), 13
) AS v
ORDER BY v.orden;

-- Si alguna fila dice FALTA, aplicar en orden las migraciones correspondientes
-- de docs/sql/master/ sobre ESTA base:
--     V53__video_sesion_ubicacion.sql
--     V54__video_grabacion_resiliente.sql
--     V55__video_chat_mensajes.sql
-- Las tres son idempotentes (ADD COLUMN IF NOT EXISTS / CREATE ... IF NOT
-- EXISTS), así que volver a ejecutar una ya aplicada no hace nada.
