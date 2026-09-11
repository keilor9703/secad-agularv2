#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
# Dice qué migraciones FALTAN en una base, mirando el esquema real.
#
# No hay tabla de migraciones aplicadas en este proyecto, así que no se puede
# preguntar «¿corriste V75?». Lo que sí se puede es comprobar si existe lo que
# cada migración crea. Eso es lo que hace este script: comprueba señales
# concretas (tablas y columnas) y dice qué falta y con qué archivo se arregla.
#
# Uso:
#   ./scripts/verificar_migraciones.sh master <contenedor> <usuario> <bd>
#   ./scripts/verificar_migraciones.sh tenant <contenedor> <usuario> <bd>
# ══════════════════════════════════════════════════════════════════════════
set -uo pipefail

SCOPE="${1:-}"; CONTAINER="${2:-}"; DBUSER="${3:-}"; DBNAME="${4:-}"
if [[ -z "$SCOPE" || -z "$CONTAINER" || -z "$DBUSER" || -z "$DBNAME" ]]; then
    echo "Uso: $0 <master|tenant> <contenedor-postgres> <usuario> <base-de-datos>"; exit 1
fi

q() { docker exec -i "$CONTAINER" psql -U "$DBUSER" -d "$DBNAME" -tAc "$1" 2>/dev/null; }

hay_tabla()  { [[ "$(q "SELECT 1 FROM pg_tables WHERE tablename='$1'")" == "1" ]]; }
hay_columna(){ [[ "$(q "SELECT 1 FROM information_schema.columns WHERE table_name='$1' AND column_name='$2'")" == "1" ]]; }

FALTAN=0
ok()    { printf '  \033[32m✓\033[0m %-44s %s\n' "$1" "$2"; }
falta() { printf '  \033[31m✗\033[0m %-44s %s\n' "$1" "$2"; FALTAN=$((FALTAN+1)); }
rev()   { if $1; then ok "$2" "$3"; else falta "$2" "$3"; fi; }

echo "═══ $DBNAME ($SCOPE) ═══"

if [[ "$SCOPE" == "master" ]]; then
    rev "hay_tabla secad_tenants"                        "secad_tenants"              "V1"
    rev "hay_tabla secad_salud_historial"                "historial de salud de CADs" "V23"
    rev "hay_columna secad_tenants nivel_operacion"      "nivel de operación del CAD" "V23"
    rev "hay_columna secad_tenants latitud"              "centro del mapa del tenant" "V72"
    rev "hay_tabla secad_api_keys"                       "llaves de API por CAD"      "V73"
    rev "hay_tabla secad_api_keys_auditoria"             "bitácora de las llaves"     "V73"
else
    rev "hay_tabla cad_pedidos"                          "esquema base"               "V2-V9"
    rev "hay_tabla cad_sitios_grabacion"                 "sitios de grabación"        "V70"
    rev "hay_columna cad_sitios_grabacion latitud"       "centro del mapa por sitio"  "V72"
    rev "hay_tabla cad_integraciones_entrantes"          "integraciones entrantes"    "V27"
    rev "hay_tabla cad_integraciones_entrantes_canales"  "canales de la integración"  "V74"
    rev "hay_tabla cad_camara_integracion"               "integraciones de video"     "V44"
    rev "hay_columna cad_camara_integracion nodo_edge_url" "nodo edge de video"       "V75"
    rev "hay_columna cad_camara_integracion config_secreto_cifrado" "secreto cifrado" "V75"
    rev "hay_tabla cad_camaras_visualizacion"            "auditoría de video"         "V75"
    rev "hay_columna cad_camaras unidad"                 "censo en cad_camaras"       "V76"

    CAM=$(q "SELECT COUNT(*) FROM cad_camaras WHERE origen='CENSO'" || echo 0)
    echo "  · cámaras del censo sembradas: ${CAM:-0}"
fi

echo
if [[ $FALTAN -eq 0 ]]; then
    echo "Todo al día. Nada que correr."
else
    echo "Faltan $FALTAN pieza(s). Corra la lista completa, que es repetible:"
    echo "   ./scripts/apply_schema.sh $SCOPE $CONTAINER $DBUSER $DBNAME"
fi
