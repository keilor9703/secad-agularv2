-- ═══════════════════════════════════════════════════════════════════════════
--  Verificación de esquema del TENANT: ¿qué migraciones le faltan?
--
--  No existe tabla que registre las migraciones aplicadas, así que se
--  comprueba al revés: se busca cada objeto que crea cada script de
--  docs/sql/master/ y se informa si está o no. Sirve para ver de una vez
--  dónde se quedó la base, en lugar de descubrirlo un error 42703 a la vez.
--
--  SOLO LEE. Ejecutar conectado a la base DEL TENANT (p. ej. 11001).
--
--  Alcance y límites:
--    · Los objetos de la base MAESTRA (secad_*) quedan fuera a propósito.
--    · Los scripts que solo siembran datos (menús, catálogos, permisos) no
--      crean objetos, así que no aparecen: esto verifica esquema, no
--      contenido.
--    · Dos objetos de V4 se comprueban por el nombre que les dejó V38
--      (cad_interfaz_cti → cad_plantatel, y su índice): buscarlos por el
--      nombre original los daría por perdidos en una base al día.
--    · Los objetos marcados como condicionales solo se crean si PostGIS está
--      instalado. V40 documenta que esa extensión no está disponible en estos
--      tenants, de modo que su ausencia es lo esperado y no cuenta como
--      migración incompleta.
--
--  Todas las migraciones son idempotentes: volver a ejecutar una ya aplicada
--  no hace nada. Comprobado aplicando las 55 sobre una base vacía.
--
--  Generado a partir de los 55 scripts de docs/sql/master/.
-- ═══════════════════════════════════════════════════════════════════════════

WITH esperado(orden, migracion, tipo, objeto, condicional) AS (
  VALUES
    (  1, 'V2', 'TABLA', 'ctr_usuarios', false),
    (  2, 'V2', 'TABLA', 'ctr_roles', false),
    (  3, 'V2', 'TABLA', 'ctr_roles_user', false),
    (  4, 'V2', 'TABLA', 'ctr_roles_user_admin', false),
    (  5, 'V2', 'TABLA', 'ctr_menu', false),
    (  6, 'V2', 'TABLA', 'ctr_menu_roles', false),
    (  7, 'V2', 'TABLA', 'ctr_auditoria', false),
    (  8, 'V2', 'TABLA', 'ctr_dominio', false),
    (  9, 'V2', 'TABLA', 'ctr_video', false),
    ( 10, 'V2', 'TABLA', 'ctr_linea_mando', false),
    ( 11, 'V3', 'TABLA', 'cad_pedidos', false),
    ( 12, 'V3', 'TABLA', 'cad_anotaciones', false),
    ( 13, 'V3', 'INDICE', 'idx_pedidos_estado', false),
    ( 14, 'V3', 'INDICE', 'idx_pedidos_hora', false),
    ( 15, 'V3', 'INDICE', 'idx_pedidos_codi', false),
    ( 16, 'V3', 'INDICE', 'idx_pedidos_sitio', false),
    ( 17, 'V3', 'INDICE', 'idx_anotaciones_pedido', false),
    ( 18, 'V4', 'TABLA', 'cad_sitios_grabacion', false),
    ( 19, 'V4', 'TABLA', 'cad_lugares_geograficos', false),
    ( 20, 'V4', 'TABLA', 'cad_barrios', false),
    ( 21, 'V4', 'TABLA', 'cad_casos', false),
    ( 22, 'V4', 'TABLA', 'cad_fuerzas', false),
    ( 23, 'V4', 'TABLA', 'cad_canales', false),
    ( 24, 'V4', 'TABLA', 'cad_plantatel', false),
    ( 25, 'V4', 'TABLA', 'cad_referencias_secad', false),
    ( 26, 'V4', 'TABLA', 'cad_eventos', false),
    ( 27, 'V4', 'TABLA', 'cad_pedidos_canales', false),
    ( 28, 'V4', 'COLUMNA', 'cad_pedidos.luge_codigo', false),
    ( 29, 'V4', 'COLUMNA', 'cad_pedidos.codi_barrio', false),
    ( 30, 'V4', 'COLUMNA', 'cad_pedidos.luge_barrio', false),
    ( 31, 'V4', 'COLUMNA', 'cad_pedidos.fech_caso', false),
    ( 32, 'V4', 'COLUMNA', 'cad_pedidos.cadpedi_sitio_graba', false),
    ( 33, 'V4', 'COLUMNA', 'cad_pedidos.cadpedi_nume_llamada', false),
    ( 34, 'V4', 'COLUMNA', 'cad_pedidos.total_canales', false),
    ( 35, 'V4', 'COLUMNA', 'cad_pedidos.cadusua_usuario', false),
    ( 36, 'V4', 'COLUMNA', 'cad_pedidos.cadpoli_cedu_empleado', false),
    ( 37, 'V4', 'COLUMNA', 'ctr_usuarios.sitio_grabacion', false),
    ( 38, 'V4', 'COLUMNA', 'ctr_usuarios.acd', false),
    ( 39, 'V4', 'COLUMNA', 'ctr_usuarios.cadcana_fuerza_id', false),
    ( 40, 'V4', 'COLUMNA', 'ctr_usuarios.cadcana_codigo', false),
    ( 41, 'V4', 'INDICE', 'idx_casos_desc', false),
    ( 42, 'V4', 'INDICE', 'idx_fuerzas_sitio', false),
    ( 43, 'V4', 'INDICE', 'idx_canales_fuerza', false),
    ( 44, 'V4', 'INDICE', 'idx_plantatel_sitio_acd_reg', false),
    ( 45, 'V4', 'INDICE', 'idx_referencias_nombre', false),
    ( 46, 'V4', 'INDICE', 'idx_eventos_llamada', false),
    ( 47, 'V4', 'INDICE', 'idx_pedcanales_llamada', false),
    ( 48, 'V5', 'INDICE', 'idx_pedcanales_canal', false),
    ( 49, 'V5', 'INDICE', 'idx_pedidos_enviar', false),
    ( 50, 'V7', 'TABLA', 'cad_integraciones_clientes', false),
    ( 51, 'V7', 'TABLA', 'cad_eventos_codigos_cierre', false),
    ( 52, 'V7', 'INDICE', 'idx_eventos_pedido', false),
    ( 53, 'V7', 'INDICE', 'idx_eventos_sitio_estado', false),
    ( 54, 'V7', 'INDICE', 'idx_eventos_canal', false),
    ( 55, 'V7', 'INDICE', 'idx_eventos_origen', false),
    ( 56, 'V7', 'INDICE', 'idx_eventos_cierre', false),
    ( 57, 'V7', 'INDICE', 'idx_codigos_cierre_evento', false),
    ( 58, 'V7b', 'COLUMNA', 'cad_eventos.sitio_graba', false),
    ( 59, 'V8', 'TABLA', 'cad_actuaciones', false),
    ( 60, 'V8', 'TABLA', 'cad_actuaciones_codigos', false),
    ( 61, 'V8', 'TABLA', 'cad_actuaciones_unidades', false),
    ( 62, 'V8', 'TABLA', 'cad_actuaciones_notas', false),
    ( 63, 'V8', 'INDICE', 'idx_actuaciones_evento', false),
    ( 64, 'V8', 'INDICE', 'idx_actuaciones_pedido', false),
    ( 65, 'V8', 'INDICE', 'idx_actuaciones_canal', false),
    ( 66, 'V8', 'INDICE', 'idx_actuaciones_estado', false),
    ( 67, 'V8', 'INDICE', 'idx_actuaciones_unidades', false),
    ( 68, 'V8', 'INDICE', 'idx_actuaciones_notas', false),
    ( 69, 'V8', 'FUNCION', 'fn_recalcular_estado_evento', false),
    ( 70, 'V8', 'FUNCION', 'trg_actuacion_estado_change', false),
    ( 71, 'V9', 'TABLA', 'cad_turnos', false),
    ( 72, 'V9', 'TABLA', 'cad_turnos_unidades', false),
    ( 73, 'V9', 'TABLA', 'cad_medios_disponibles', false),
    ( 74, 'V9', 'TABLA', 'cad_personal_disponible', false),
    ( 75, 'V9', 'TABLA', 'cad_medios_estado_log', false),
    ( 76, 'V9', 'INDICE', 'idx_turnos_fuerza_dia', false),
    ( 77, 'V9', 'INDICE', 'idx_turnos_sitio_estado', false),
    ( 78, 'V9', 'INDICE', 'idx_turnos_unidades_turno', false),
    ( 79, 'V9', 'INDICE', 'idx_medios_turno', false),
    ( 80, 'V9', 'INDICE', 'idx_medios_canal', false),
    ( 81, 'V9', 'INDICE', 'idx_medios_estado', false),
    ( 82, 'V9', 'INDICE', 'idx_medios_evento', false),
    ( 83, 'V9', 'INDICE', 'idx_personal_medio', false),
    ( 84, 'V9', 'INDICE', 'idx_medios_log_medio', false),
    ( 85, 'V9', 'FUNCION', 'fn_turnos_set_dia_inicia', false),
    ( 86, 'V9', 'FUNCION', 'fn_medios_activos_por_canal', false),
    ( 87, 'V9', 'FUNCION', 'fn_cambiar_estado_medio', false),
    ( 88, 'V12', 'TABLA', 'cad_act_policial', false),
    ( 89, 'V12', 'TABLA', 'cad_delitos', false),
    ( 90, 'V12', 'TABLA', 'cad_actuaciones_resultados', false),
    ( 91, 'V12', 'INDICE', 'idx_delitos_texto', false),
    ( 92, 'V12', 'INDICE', 'idx_act_res_actividad', false),
    ( 93, 'V12', 'INDICE', 'idx_act_res_delito', false),
    ( 94, 'V12', 'INDICE', 'idx_act_res_tipo', false),
    ( 95, 'V14', 'TABLA', 'cad_config_sla', false),
    ( 96, 'V14', 'TABLA', 'cad_auditoria_acceso_evento', false),
    ( 97, 'V14', 'COLUMNA', 'cad_pedidos.fecha_primer_acceso', false),
    ( 98, 'V14', 'INDICE', 'idx_audit_pedido_id', false),
    ( 99, 'V14', 'INDICE', 'idx_audit_fecha_acceso', false),
    (100, 'V15', 'TABLA', 'ctr_cuenta_email', false),
    (101, 'V15', 'TABLA', 'ctr_cuenta_email_usuario', false),
    (102, 'V15', 'TABLA', 'ctr_correos_enviados', false),
    (103, 'V15', 'TABLA', 'ctr_cuenta_email_radicado', false),
    (104, 'V15', 'INDICE', 'idx_cte_vigente', false),
    (105, 'V15', 'INDICE', 'idx_cteu_cuenta', false),
    (106, 'V15', 'INDICE', 'idx_cteu_usuario', false),
    (107, 'V15', 'INDICE', 'idx_ce_fecha', false),
    (108, 'V15', 'INDICE', 'idx_ce_cuenta', false),
    (109, 'V15', 'INDICE', 'idx_ce_usuario', false),
    (110, 'V15', 'COLUMNA', 'cad_pedidos.username_creacion', false),
    (111, 'V15', 'INDICE', 'idx_cad_pedidos_username_creacion', false),
    (112, 'V16', 'TABLA', 'cad_anotaciones_turno', false),
    (113, 'V16', 'INDICE', 'idx_anot_turno_canal', false),
    (114, 'V16', 'INDICE', 'idx_anot_turno_fecha', false),
    (115, 'V16', 'INDICE', 'idx_anot_turno_tipo', false),
    (116, 'V16', 'INDICE', 'idx_anot_turno_sitio', false),
    (117, 'V17', 'TABLA', 'cad_asistente_categorias', false),
    (118, 'V17', 'TABLA', 'cad_asistente_preguntas', false),
    (119, 'V17', 'INDICE', 'idx_asistente_cat_orden', false),
    (120, 'V17', 'INDICE', 'idx_asistente_preg_cat', false),
    (121, 'V17', 'INDICE', 'idx_asistente_preg_tipo', false),
    (122, 'V18', 'COLUMNA', 'cad_casos.id_categoria_asistente', false),
    (123, 'V18', 'INDICE', 'idx_casos_cat_asistente', false),
    (124, 'V19', 'COLUMNA', 'ctr_usuarios.tipo_usuario', false),
    (125, 'V19', 'COLUMNA', 'ctr_usuarios.email', false),
    (126, 'V19', 'COLUMNA', 'ctr_usuarios.entidad', false),
    (127, 'V21', 'COLUMNA', 'ctr_roles_user.usuario_creacion', false),
    (128, 'V22', 'COLUMNA', 'ctr_roles_user.vigente', false),
    (129, 'V24', 'TABLA', 'cad_adjuntos', false),
    (130, 'V24', 'TABLA', 'cad_recepciones_externas', false),
    (131, 'V24', 'INDICE', 'idx_cad_adjuntos_pedido', false),
    (132, 'V24', 'INDICE', 'idx_cad_adjuntos_tipo', false),
    (133, 'V24', 'INDICE', 'idx_rec_ext_canal', false),
    (134, 'V24', 'INDICE', 'idx_rec_ext_pedido', false),
    (135, 'V25', 'TABLA', 'cad_agencias_externas', false),
    (136, 'V25', 'TABLA', 'cad_despachos_externos', false),
    (137, 'V25', 'INDICE', 'idx_cad_agencias_externas_activa', false),
    (138, 'V25', 'INDICE', 'idx_cad_despachos_externos_pedido', false),
    (139, 'V25', 'INDICE', 'idx_cad_despachos_externos_agencia', false),
    (140, 'V26', 'INDICE', 'idx_pedcanales_canal_fuerza', false),
    (141, 'V27', 'TABLA', 'cad_integraciones_entrantes', false),
    (142, 'V27', 'INDICE', 'idx_int_entrantes_tipo', false),
    (143, 'V29', 'COLUMNA', 'cad_agencias_externas.tipo_auth', false),
    (144, 'V30', 'TABLA', 'cad_auditoria_actualizacion_externa', false),
    (145, 'V30', 'INDICE', 'idx_audit_actxext_caso', false),
    (146, 'V30', 'INDICE', 'idx_audit_actxext_fecha', false),
    (147, 'V31', 'COLUMNA', 'cad_sitios_grabacion.cod_dane', false),
    (148, 'V31', 'INDICE', 'idx_sitios_grabacion_cod_dane', false),
    (149, 'V32', 'COLUMNA', 'cad_agencias_externas.formato_payload', false),
    (150, 'V33', 'TABLA', 'cad_mfa_auditoria_local', false),
    (151, 'V33', 'INDICE', 'idx_mfa_aud_usuario', false),
    (152, 'V40', 'INDICE', 'idx_medios_lat_lng', false),
    (153, 'V40', 'INDICE', 'idx_medios_canal_estado_turno', false),
    (154, 'V42', 'COLUMNA', 'cad_medios_disponibles.origen', false),
    (155, 'V43', 'TABLA', 'cad_pedidos_estado_historial', false),
    (156, 'V43', 'COLUMNA', 'cad_actuaciones.solicita_apoyo', false),
    (157, 'V43', 'INDICE', 'idx_pedidos_estado_historial_pedido', false),
    (158, 'V43', 'INDICE', 'idx_actuaciones_solicita_apoyo', false),
    (159, 'V44', 'TABLA', 'cad_camara_integracion', false),
    (160, 'V44', 'TABLA', 'cad_camaras', false),
    (161, 'V44', 'COLUMNA', 'cad_camaras.geo', true),
    (162, 'V44', 'INDICE', 'idx_camara_integracion_activa', false),
    (163, 'V44', 'INDICE', 'idx_camaras_integracion', false),
    (164, 'V44', 'INDICE', 'idx_camaras_geo', true),
    (165, 'V45', 'TABLA', 'cad_video_sesiones', false),
    (166, 'V45', 'INDICE', 'idx_video_sesion_pedido', false),
    (167, 'V49', 'COLUMNA', 'cad_video_sesiones.numero_telefono', false),
    (168, 'V51', 'TABLA', 'ctr_config_sms', false),
    (169, 'V53', 'COLUMNA', 'cad_video_sesiones.ultima_lat', false),
    (170, 'V53', 'COLUMNA', 'cad_video_sesiones.ultima_lng', false),
    (171, 'V53', 'COLUMNA', 'cad_video_sesiones.ultima_precision', false),
    (172, 'V53', 'COLUMNA', 'cad_video_sesiones.ultima_ubicacion_fecha', false),
    (173, 'V54', 'COLUMNA', 'cad_video_sesiones.grabacion_estado', false),
    (174, 'V54', 'COLUMNA', 'cad_video_sesiones.grabacion_archivo_temp', false),
    (175, 'V54', 'COLUMNA', 'cad_video_sesiones.grabacion_bytes', false),
    (176, 'V54', 'COLUMNA', 'cad_video_sesiones.grabacion_inicio', false),
    (177, 'V54', 'COLUMNA', 'cad_video_sesiones.grabacion_ultimo_chunk', false),
    (178, 'V54', 'COLUMNA', 'cad_video_sesiones.grabacion_usuario', false),
    (179, 'V54', 'INDICE', 'idx_video_grabacion_abierta', false),
    (180, 'V54', 'INDICE', 'idx_video_sesion_pedido_activa', false),
    (181, 'V55', 'TABLA', 'cad_video_chat_mensajes', false),
    (182, 'V55', 'INDICE', 'idx_video_chat_pedido', false),
    (183, 'V55', 'INDICE', 'idx_video_chat_sesion', false)
),
evaluado AS (
  SELECT
      e.orden, e.migracion, e.tipo, e.objeto, e.condicional,
      CASE e.tipo
        WHEN 'TABLA' THEN EXISTS (
            SELECT 1 FROM information_schema.tables t
            WHERE t.table_name = e.objeto)
        WHEN 'COLUMNA' THEN EXISTS (
            SELECT 1 FROM information_schema.columns c
            WHERE c.table_name  = split_part(e.objeto, '.', 1)
              AND c.column_name = split_part(e.objeto, '.', 2))
        WHEN 'INDICE' THEN EXISTS (
            SELECT 1 FROM pg_indexes i WHERE i.indexname = e.objeto)
        WHEN 'FUNCION' THEN EXISTS (
            SELECT 1 FROM pg_proc p WHERE p.proname = e.objeto)
      END AS existe
  FROM esperado e
)
-- ── Estado de cada migración ──────────────────────────────────────────────
--  Aplicar, en orden de número, las que no salgan APLICADA.
SELECT
    migracion,
    COUNT(*) FILTER (WHERE NOT condicional)                            AS objetos,
    COUNT(*) FILTER (WHERE NOT condicional AND NOT existe)             AS faltan,
    CASE
      WHEN COUNT(*) FILTER (WHERE NOT condicional AND NOT existe) = 0 THEN 'APLICADA'
      WHEN COUNT(*) FILTER (WHERE NOT condicional AND     existe) = 0 THEN 'SIN APLICAR'
      ELSE 'INCOMPLETA'
    END                                                                AS estado,
    STRING_AGG(objeto, ', ') FILTER (WHERE NOT condicional AND NOT existe) AS objetos_faltantes
FROM evaluado
GROUP BY migracion
ORDER BY MIN(orden);


-- ═══════════════════════════════════════════════════════════════════════════
--  Comprobaciones que no se ven en el listado de arriba
--
--  Algunas migraciones no crean objetos: cambian un CHECK o siembran datos.
--  Aquí van las que afectan a flujos concretos y cuya ausencia se manifiesta
--  como un 500 genérico.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
    'V46' AS migracion,
    'cad_adjuntos admite canal_origen = VIDEOLLAMADA' AS comprobacion,
    CASE WHEN EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'cad_adjuntos'::regclass
          AND contype  = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%canal_origen%'
          AND pg_get_constraintdef(oid) ILIKE '%VIDEOLLAMADA%'
    ) THEN 'OK' ELSE 'FALTA' END AS estado,
    'Sin esto, guardar la grabación de una videollamada viola el CHECK y '
    'el endpoint responde 500 «Error interno al subir la grabación».' AS consecuencia;
