#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
# Aplica los scripts de docs/sql/master/ contra un Postgres de SECAD, en el
# orden correcto y respetando la separación maestra/tenant que cada archivo
# declara en su propio encabezado ("Apply to: MASTER" vs "apply to each
# tenant/CAD database"). No hay runner de migraciones automático ni tabla de
# migraciones aplicadas: la forma de poner al día una base —nueva o ya en
# producción— es pasar la lista COMPLETA en orden.
#
# Es seguro repetirlo. Verificado sobre un PostgreSQL 16 real: tres pasadas
# seguidas de los 57 scripts sobre la misma base, cero errores y sin filas
# duplicadas. (Hasta esta comprobación no lo era del todo: la semilla del rol
# «Administrador» de V2 no llevaba guarda y cada pasada añadía otro rol
# huérfano. Corregido en V2.)
#
# Uso:
#   ./scripts/apply_schema.sh master   <container-postgres> <usuario> <bd>
#   ./scripts/apply_schema.sh tenant   <container-postgres> <usuario> <bd>
#
# Ejemplos (server OCI, según lo ya configurado en docker-compose.yml):
#   ./scripts/apply_schema.sh master secad-postgres      secad_app      Secad
#   ./scripts/apply_schema.sh tenant secad-postgres-cali  secad_cali_app Secad_Cali
# ══════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCOPE="${1:-}"
CONTAINER="${2:-}"
DBUSER="${3:-}"
DBNAME="${4:-}"

if [[ -z "$SCOPE" || -z "$CONTAINER" || -z "$DBUSER" || -z "$DBNAME" ]]; then
    echo "Uso: $0 <master|tenant> <contenedor-postgres> <usuario> <base-de-datos>"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_DIR="$SCRIPT_DIR/../docs/sql/master"

# El ORDEN vive en docs/sql/master/_orden.master.txt y _orden.tenant.txt —
# una sola fuente de verdad, que también lee el script de Windows. Antes
# estaban duplicados aquí como arrays; al añadir una migración había que
# acordarse de tocar los dos sitios.
leer_orden() {
    grep -v '^[[:space:]]*#' "$1" | grep -v '^[[:space:]]*$'
}

case "$SCOPE" in
  master) ORDEN="$SQL_DIR/_orden.master.txt" ;;
  tenant) ORDEN="$SQL_DIR/_orden.tenant.txt" ;;
  *) echo "Scope inválido: $SCOPE (usa 'master' o 'tenant')"; exit 1 ;;
esac

if [[ ! -f "$ORDEN" ]]; then
    echo "ERROR: no se encuentra el manifiesto $ORDEN"; exit 1
fi

mapfile -t FILES < <(leer_orden "$ORDEN")

echo "========================================="
echo "  Aplicando esquema '$SCOPE' a $DBNAME (@$CONTAINER)"
echo "  ${#FILES[@]} archivo(s)"
echo "========================================="

for name in "${FILES[@]}"; do
    f="$SQL_DIR/$name"
    if [[ ! -f "$f" ]]; then
        echo "ERROR: no se encuentra $f"
        exit 1
    fi
    echo "== $name =="
    docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DBUSER" -d "$DBNAME" < "$f"
done

echo ""
echo "========================================="
echo "  Esquema '$SCOPE' aplicado completo."
echo "========================================="
