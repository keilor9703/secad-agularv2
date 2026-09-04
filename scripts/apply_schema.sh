#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
# Aplica los scripts de docs/sql/master/ contra un Postgres de SECAD, en el
# orden correcto y respetando la separación maestra/tenant que cada archivo
# declara en su propio encabezado ("Apply to: MASTER" vs "apply to each
# tenant/CAD database"). No hay runner de migraciones automático — este
# script solo automatiza aplicar la lista completa una vez, en orden; no
# lleva registro de qué ya se aplicó (no lo vuelvas a correr sobre una BD que
# ya tiene el esquema, o usarás CREATE/ALTER que ya corrieron — la mayoría
# son idempotentes con IF NOT EXISTS/ON CONFLICT, pero no todos).
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

# Únicos 3 archivos que van a la base MAESTRA (secad_tenants vive ahí) — el
# resto son todos de tenant. Ver encabezado de cada archivo para confirmar.
MASTER_FILES=(
  "V1__master_schema.sql"
  "V23__master_salud_cad.sql"
  "V41__tenant_gespo_sigla_unidad.sql"
  # V31 toca secad_tenants (master) Y cad_sitios_grabacion (tenant) en el
  # mismo archivo — cada bloque se protege comprobando que su tabla exista,
  # así que es seguro correrlo contra ambas bases (ver el archivo).
  "V31__tenant_sitio_grabacion_codane.sql"
  "V60__master_unidades.sql"
)

# Todos los demás, EN ORDEN — aplican a cada base de datos de tenant/CAD.
TENANT_FILES=(
  "V2__tenant_schema.sql"
  "V3__incidents_schema.sql"
  "V4__reception_tables.sql"
  "V5__eventos_canal.sql"
  "V6__snowflake_id.sql"
  "V7b__cad_eventos_alter.sql"
  "V7__cad_eventos.sql"
  "V8__cad_actuaciones.sql"
  "V9__turnos.sql"
  "V10 Menú de Operación – Recepción, Eventos y Turnos.sql"
  "V12__actividades_delitos.sql"
  "V13__snowflake_pedidos.sql"
  "V14__sla_auditoria_acceso.sql"
  "V15__gestion_documental_correos.sql"
  "V15__pedidos_username_creacion.sql"
  "V16__anotaciones_turno.sql"
  "V17__asistente_inteligente.sql"
  "V18__casos_categoria_asistente.sql"
  "V19__civil_usuarios.sql"
  "V20__menu_entidades_fuerzas.sql"
  "V21__roles_user_auditoria.sql"
  "V22__super_admin_rbac.sql"
  "V24__multicanal_adjuntos.sql"
  "V25__agencias_externas.sql"
  "V26__pedidos_canales_unique.sql"
  "V27__integraciones_entrantes.sql"
  "V28__menu_reportes.sql"
  "V29__agencias_auth_modes.sql"
  "V30__actualizacion_externa_entrante.sql"
  "V31__tenant_sitio_grabacion_codane.sql"
  "V32__agencia_formato_payload.sql"
  "V33__mfa_integracion_nota.sql"
  "V34__menu_mapa_incidentes.sql"
  "V35__ampliar_cedu_empleado.sql"
  "V36__menu_mapa_estadistico.sql"
  "V37__eventos_estado_check.sql"
  "V38__rename_cti_a_plantatel.sql"
  "V40__postgis_medios_geo.sql"
  "V42__medios_origen.sql"
  "V43__eventos_operador_mejoras.sql"
  "V44__camaras_integracion.sql"
  "V45__video_llamadas.sql"
  "V46__adjuntos_canal_videollamada.sql"
  "V47__menu_completo.sql"
  "V48__menu_ajustes_reales.sql"
  "V49__video_sesion_telefono.sql"
  "V50__menu_codigos_caso.sql"
  "V51__config_sms_proveedor.sql"
  "V52__menu_proveedor_sms.sql"
  "V53__video_sesion_ubicacion.sql"
  "V54__video_grabacion_resiliente.sql"
  "V55__video_chat_mensajes.sql"
  "V56__menu_admin_faltantes.sql"
  "V57__reparar_menu_v56.sql"
  "V58__unificar_menu_duplicado.sql"
  "V59__menu_grupos_a_raiz.sql"
)

case "$SCOPE" in
  master) FILES=("${MASTER_FILES[@]}") ;;
  tenant) FILES=("${TENANT_FILES[@]}") ;;
  *) echo "Scope inválido: $SCOPE (usa 'master' o 'tenant')"; exit 1 ;;
esac

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
