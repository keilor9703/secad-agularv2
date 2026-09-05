-- ══════════════════════════════════════════════════════════════════════════
-- V62: Reubicar Proveedor SMS dentro de Hub de Integraciones
--
-- El módulo Proveedor SMS deja de ser una opción de menú independiente en el
-- grupo Administración y pasa a integrarse como una pestaña dentro de Hub de
-- Integraciones (/administracion/integraciones).
-- Desactiva el ítem huérfano /administracion/sms de ctr_menu para no duplicar
-- opciones en la navegación.
-- Idempotente.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    -- Desactivar el ítem de menú de Proveedor SMS
    UPDATE ctr_menu
    SET vigente = 0,
        descripcion = 'Proveedor SMS (integrado en Hub)'
    WHERE detalle = '/administracion/sms';

    RAISE NOTICE 'V62: Menú Proveedor SMS reubicado en Hub de Integraciones y desactivado como menú independiente.';
END $$;
