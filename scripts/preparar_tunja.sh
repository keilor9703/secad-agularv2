#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
# Deja listo el CAD de TUNJA: base de datos, esquema, registro en la maestra
# y siembra de sus 229 cámaras del censo institucional.
#
# Es repetible de principio a fin: si algo falla a mitad, se corrige y se
# vuelve a correr entero.
#
# Uso:
#   ./scripts/preparar_tunja.sh <contenedor-postgres> <usuario-admin> [cod_dane]
#
# Ejemplo:
#   ./scripts/preparar_tunja.sh secad-postgres postgres 15001
#
# El cod_dane de Tunja es 15001. La unidad policial en el censo es METUN.
# ══════════════════════════════════════════════════════════════════════════
set -euo pipefail

CONTAINER="${1:-}"
ADMIN="${2:-postgres}"
COD_DANE="${3:-15001}"

DB_TENANT="Secad_Tunja"
DB_USER="secad_tunja_app"
DB_MASTER="${DB_MASTER:-Secad}"          # base maestra; exportar si se llama distinto
UNIDAD="METUN"

if [[ -z "$CONTAINER" ]]; then
    echo "Uso: $0 <contenedor-postgres> <usuario-admin> [cod_dane]"; exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# La contraseña se genera sola y se muestra UNA vez: no debe quedar escrita en
# el repositorio ni en el historial de comandos.
DB_PASS="${SECAD_TUNJA_PASS:-$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)}"

psql_admin() { docker exec -i "$CONTAINER" psql -U "$ADMIN" -v ON_ERROR_STOP=1 "$@"; }

echo "══════════════════════════════════════════════════════════════"
echo "  Preparando el CAD de Tunja"
echo "    contenedor : $CONTAINER"
echo "    base tenant: $DB_TENANT      usuario: $DB_USER"
echo "    base maestra: $DB_MASTER     cod_dane: $COD_DANE"
echo "══════════════════════════════════════════════════════════════"

# ── 1. Rol y base de datos ────────────────────────────────────────────────
echo
echo "▶ 1/5 · Rol y base de datos"
psql_admin -d postgres <<SQL
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER') THEN
        CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASS';
        RAISE NOTICE 'Rol $DB_USER creado.';
    ELSE
        ALTER ROLE $DB_USER PASSWORD '$DB_PASS';
        RAISE NOTICE 'Rol $DB_USER ya existía; contraseña actualizada.';
    END IF;
END \$\$;
SQL
if ! docker exec -i "$CONTAINER" psql -U "$ADMIN" -lqt | cut -d'|' -f1 | grep -qw "$DB_TENANT"; then
    psql_admin -d postgres -c "CREATE DATABASE \"$DB_TENANT\" OWNER $DB_USER"
    echo "   base $DB_TENANT creada."
else
    echo "   base $DB_TENANT ya existía."
fi
psql_admin -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE \"$DB_TENANT\" TO $DB_USER"

# ── 2. Esquema del tenant ─────────────────────────────────────────────────
echo
echo "▶ 2/5 · Esquema del tenant (70 migraciones, repetible)"
"$SCRIPT_DIR/apply_schema.sh" tenant "$CONTAINER" "$ADMIN" "$DB_TENANT"

# ── 3. Maestra: la columna de llaves de API y el registro del CAD ─────────
# La maestra es UNA sola para todo el país. Correr su lista aquí es inocuo
# —es repetible— y garantiza que V73 (secad_api_keys) exista antes de que
# alguien intente emitir la llave del HikCentral de Tunja.
echo
echo "▶ 3/5 · Maestra al día y registro del CAD"
"$SCRIPT_DIR/apply_schema.sh" master "$CONTAINER" "$ADMIN" "$DB_MASTER"

psql_admin -d "$DB_MASTER" <<SQL
INSERT INTO secad_tenants
    (cod_dane, cod_unidad, nombre, departamento, municipio,
     db_host, db_port, db_name, db_username, db_password, activo)
VALUES
    ('$COD_DANE', '$UNIDAD', 'CAD Tunja', 'BOYACA', 'TUNJA',
     'localhost', 5432, '$DB_TENANT', '$DB_USER', '$DB_PASS', TRUE)
ON CONFLICT (cod_dane) DO UPDATE SET
    db_host     = EXCLUDED.db_host,
    db_port     = EXCLUDED.db_port,
    db_name     = EXCLUDED.db_name,
    db_username = EXCLUDED.db_username,
    db_password = EXCLUDED.db_password,
    activo      = TRUE;
SQL
echo "   tenant $COD_DANE registrado en la maestra."
echo "   OJO: db_host quedó en 'localhost'. Si PostgreSQL de Tunja está en otro"
echo "        servidor, corríjalo con un UPDATE sobre secad_tenants."

# ── 4. Sitio de grabación y siembra del censo ─────────────────────────────
# La siembra empareja la unidad del censo con el sitio por su ABREVIATURA, así
# que el sitio tiene que existir antes y llamarse METUN.
echo
echo "▶ 4/5 · Sitio de grabación METUN y las 229 cámaras del censo"
psql_admin -d "$DB_TENANT" <<SQL
INSERT INTO cad_sitios_grabacion (consecutivo, descripcion, abreviatura, vigente)
VALUES ($COD_DANE, 'Metropolitana de Tunja', '$UNIDAD', 'S')
ON CONFLICT (consecutivo) DO UPDATE SET abreviatura = EXCLUDED.abreviatura;
SQL
psql_admin -d "$DB_TENANT" -f - < "$SCRIPT_DIR/../docs/sql/censo-camaras/censo_camaras_${UNIDAD}.sql"

# ── 5. Comprobación ───────────────────────────────────────────────────────
echo
echo "▶ 5/5 · Comprobación"
"$SCRIPT_DIR/verificar_migraciones.sh" tenant "$CONTAINER" "$ADMIN" "$DB_TENANT" || true

echo
echo "══════════════════════════════════════════════════════════════"
echo "  Tunja lista."
echo
echo "  GUARDE ESTA CONTRASEÑA — no vuelve a mostrarse:"
echo "    usuario: $DB_USER"
echo "    clave  : $DB_PASS"
echo
echo "  Siguiente paso, desde la interfaz:"
echo "    Administración → Hub de Integraciones → Cámaras (VMS) → Nueva"
echo "    y luego «Sincronizar y emparejar cámaras»."
echo "══════════════════════════════════════════════════════════════"
