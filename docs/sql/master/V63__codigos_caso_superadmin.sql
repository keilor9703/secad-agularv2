-- ══════════════════════════════════════════════════════════════════════════
-- V63: Centralización de Códigos de Caso en Super Admin y soporte de ámbito CAD
--
-- 1. Agrega la columna `cod_dane` a la tabla `cad_casos` para soportar tanto
--    códigos de caso nacionales (cod_dane IS NULL) como específicos de un CAD.
-- 2. Inserta el submódulo de gestión centralizada en Super Admin:
--    /super/casos, asegurando permisos para SuperAdministrador (id_rol = 2).
-- 3. Actualiza la descripción del módulo en Administración a consulta de lectura.
-- Idempotente.
-- ══════════════════════════════════════════════════════════════════════════

-- 1. Agregar columna cod_dane en cad_casos si no existe
ALTER TABLE cad_casos
    ADD COLUMN IF NOT EXISTS cod_dane VARCHAR(10) NULL;

COMMENT ON COLUMN cad_casos.cod_dane IS
    'Código DANE de la unidad/municipio al que aplica el código de caso. Si es NULL, aplica a nivel nacional para todos los tenants.';

-- 2. Actualizar descripción en menú de administración para reflejar política institucional
UPDATE ctr_menu
   SET descripcion = 'Códigos de Caso (Consulta)'
 WHERE detalle = '/administracion/casos';

-- 3. Registrar /super/casos bajo el grupo "Super Admin"
DO $$
DECLARE
    v_id_super BIGINT;
BEGIN
    SELECT id_menu INTO v_id_super
      FROM ctr_menu
     WHERE tipo = 'GRUPO'
       AND (UPPER(descripcion) LIKE '%SUPER%ADMIN%' OR detalle = '/super')
     LIMIT 1;

    IF v_id_super IS NOT NULL THEN
        INSERT INTO ctr_menu (descripcion, idpadre, posicion, tipo, icono, vigente, detalle, usuario_creacion, fecha_creacion, maquina_creacion)
        SELECT 'Gestión de Códigos de Caso', v_id_super, 35, 'ENLACE', 'fa-solid fa-list-check', 1, '/super/casos', 1, NOW(), 'migration-V63'
        WHERE NOT EXISTS (
            SELECT 1 FROM ctr_menu m WHERE m.idpadre = v_id_super AND m.detalle = '/super/casos'
        );
    END IF;
END $$;

-- Otorgar acceso al rol SuperAdministrador (id_rol = 2) y Administrador General (id_rol = 1)
INSERT INTO ctr_menu_roles (id_rol, id_menu, usuario_creacion, fecha_creacion, maquina_creacion)
SELECT r.id_rol, m.id_menu, 1, NOW(), 'migration-V63'
FROM ctr_menu m
CROSS JOIN (VALUES (1),(2)) AS r(id_rol)
WHERE m.detalle = '/super/casos'
  AND NOT EXISTS (SELECT 1 FROM ctr_menu_roles mr WHERE mr.id_menu = m.id_menu AND mr.id_rol = r.id_rol);
