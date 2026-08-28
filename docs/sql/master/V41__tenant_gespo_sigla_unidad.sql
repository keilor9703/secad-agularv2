-- ══════════════════════════════════════════════════════════════════════════════
-- V41 – secad_tenants.gespo_sigla_unidad
--
-- Se aplica a la BD MAESTRA donde vive secad_tenants (no a las BD de tenant).
--
-- Problema: la vista GESPO V_CONSULTA_GPS_SECAD trae la georreferenciación de
-- TODAS las patrullas del país en una sola consulta. Sin un filtro, cada tenant
-- recibiría (y descartaría en memoria) las patrullas de todos los demás
-- tenants — carga de red/memoria innecesaria y, sobre todo, cada tenant no
-- tiene por qué ver datos de otras ciudades.
--
-- Solución: guardar en secad_tenants la sigla con la que GESPO identifica a la
-- unidad/ciudad de ese tenant (columna SIGLA_PAPA_UNIDAD de la vista Oracle).
-- GespoOracleReader usa este valor para agregar "WHERE sigla_papa_unidad = :sigla"
-- a la consulta — así cada tenant solo trae sus propias patrullas.
--
-- ⚠️ Es un campo DISTINTO de secad_tenants.cod_unidad (que viene de la
-- integración de login OUD/WebToken, no de GESPO) — aunque coincida en valor
-- para algunos tenants, se define aparte para no acoplar esta característica a
-- un campo de otra integración cuyo significado podría cambiar.
--
-- Debe completarse manualmente por tenant (no hay forma de derivarlo
-- automáticamente): UPDATE secad_tenants SET gespo_sigla_unidad = 'XXX' WHERE
-- cod_dane = '...'; — el valor correcto es el que aparece en la columna
-- SIGLA_PAPA_UNIDAD de V_CONSULTA_GPS_SECAD para las patrullas de ese CAD.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE secad_tenants
    ADD COLUMN IF NOT EXISTS gespo_sigla_unidad VARCHAR(20);

COMMENT ON COLUMN secad_tenants.gespo_sigla_unidad IS
    'Sigla de la unidad tal como aparece en GESPO (SIGLA_PAPA_UNIDAD de '
    'V_CONSULTA_GPS_SECAD). Filtra la consulta a Oracle para que este tenant '
    'reciba solo sus propias patrullas. NULL = GPS deshabilitado para el '
    'tenant hasta que se configure.';

-- ── Verificación ───────────────────────────────────────────────────────────
SELECT cod_dane, nombre, gespo_sigla_unidad
FROM   secad_tenants
ORDER BY cod_dane;
