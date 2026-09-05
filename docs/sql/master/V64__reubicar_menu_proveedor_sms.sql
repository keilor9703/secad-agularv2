-- ══════════════════════════════════════════════════════════════════════════
-- V64: Reubicar Proveedor SMS dentro de Hub de Integraciones
--
-- (Nació como V62 y se renumeró: ya existía otra V62, la de los tipos de
--  menú, y dos archivos con el mismo número rompen el único orden que
--  tenemos —no hay tabla de migraciones aplicadas, solo el nombre—. El
--  contenido no cambió; si ya se aplicó como V62 en algún servidor, volver a
--  pasarla no hace nada.)
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
