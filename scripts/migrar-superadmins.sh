#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
#  Siembra secad_super_admins (base MAESTRA) con quien hoy tiene el rol de
#  SuperAdministrador en algún tenant.
#
#  Es el paso del medio de la mudanza:
#
#      V66 (maestra)  →  ESTE SCRIPT  →  V67 (cada tenant)
#
#  Sin él, V67 borra el rol 2 de los tenants y nadie vuelve a entrar a /super:
#  la tabla nueva quedaría vacía y no habría de dónde reconstruir la lista.
#
#  Qué hace: lee los tenants de la maestra, se conecta a la base de cada uno
#  con las credenciales que la propia maestra guarda, busca los usuarios con
#  el rol 2 vigente, y los inserta en secad_super_admins.
#
#  Uso — desde el servidor, con el stack en marcha:
#
#      docker compose cp scripts/migrar-superadmins.sh postgres:/tmp/
#      docker compose exec -T postgres bash /tmp/migrar-superadmins.sh \
#          "postgresql://secad_app:LACLAVE@localhost:5432/Secad"
#
#  Se ejecuta DENTRO del contenedor de Postgres porque los db_host de
#  secad_tenants son nombres de servicio de Docker («postgres»,
#  «postgres-cali»), que solo resuelven dentro de la red del compose.
#
#  Con --simular no escribe nada: solo enseña a quién encontraría.
#  Es idempotente: volver a pasarlo no duplica ni pisa lo ya registrado.
# ══════════════════════════════════════════════════════════════════════════
set -euo pipefail

MAESTRA="${1:-}"
SIMULAR="${2:-}"

if [[ -z "$MAESTRA" ]]; then
    sed -n '2,26p' "$0" >&2
    exit 2
fi

# El rol que se está jubilando. Es el 2 por convención de V2/V22.
ROL_SUPERADMIN=2

psql_maestra() { psql "$MAESTRA" -v ON_ERROR_STOP=1 -tA "$@"; }

echo "── Tenants activos en la maestra ──"
TENANTS=$(psql_maestra -F'|' -c "
    SELECT cod_dane, nombre, db_host, db_port, db_name, db_username, db_password
    FROM   secad_tenants
    WHERE  activo
    ORDER  BY cod_dane")

if [[ -z "$TENANTS" ]]; then
    echo "No hay tenants activos. Nada que migrar." >&2
    exit 0
fi

ENCONTRADOS=0
INSERTADOS=0

while IFS='|' read -r COD_DANE NOMBRE HOST PORT DB USR PASS; do
    [[ -z "$COD_DANE" ]] && continue
    printf '\n  %s — %s (%s@%s:%s/%s)\n' "$COD_DANE" "$NOMBRE" "$USR" "$HOST" "$PORT" "$DB"

    # Se buscan las DOS tablas de roles: el histórico manda, pero un tenant que
    # no lo tenga poblado todavía puede llevar la concesión solo en la plana.
    USUARIOS=$(PGPASSWORD="$PASS" psql \
        -h "$HOST" -p "$PORT" -U "$USR" -d "$DB" -v ON_ERROR_STOP=1 -tA 2>/dev/null <<SQL || true
SELECT DISTINCT LOWER(TRIM(u.username))
FROM   ctr_usuarios u
WHERE  TRIM(COALESCE(u.username, '')) <> ''
  AND (
        EXISTS (SELECT 1 FROM ctr_roles_user_admin a
                WHERE a.id_usuario = u.id_usuario
                  AND a.id_rol = ${ROL_SUPERADMIN}
                  AND COALESCE(a.vigente, 0) = 1
                  AND (a.fecha_fin IS NULL OR a.fecha_fin >= CURRENT_DATE))
     OR EXISTS (SELECT 1 FROM ctr_roles_user r
                WHERE r.id_usuario = u.id_usuario
                  AND r.id_rol = ${ROL_SUPERADMIN}
                  AND NOT EXISTS (SELECT 1 FROM ctr_roles_user_admin a2
                                  WHERE a2.id_usuario = u.id_usuario))
      )
ORDER  BY 1
SQL
)

    if [[ -z "$USUARIOS" ]]; then
        echo "      (ninguno)"
        continue
    fi

    while read -r USERNAME; do
        [[ -z "$USERNAME" ]] && continue
        ENCONTRADOS=$((ENCONTRADOS + 1))
        echo "      → $USERNAME"

        if [[ "$SIMULAR" == "--simular" ]]; then
            continue
        fi

        # ON CONFLICT DO NOTHING: si ya está registrado —por otro tenant o por
        # una pasada anterior— se respeta lo que haya, incluida una posible
        # desactivación hecha a mano.
        psql_maestra -c "
            INSERT INTO secad_super_admins
                (username, cod_dane_origen, activo, observacion, usuario_creacion)
            VALUES
                ('${USERNAME}', '${COD_DANE}', TRUE,
                 'Migrado del rol de tenant por migrar-superadmins.sh', 'migracion-V66')
            ON CONFLICT (username) DO NOTHING" >/dev/null
        INSERTADOS=$((INSERTADOS + 1))
    done <<< "$USUARIOS"
done <<< "$TENANTS"

echo ""
if [[ "$SIMULAR" == "--simular" ]]; then
    printf '── Simulación: se encontraron %d concesión(es). No se escribió nada.\n' "$ENCONTRADOS"
    exit 0
fi

printf '── %d concesión(es) encontrada(s); la maestra queda así:\n\n' "$ENCONTRADOS"
psql "$MAESTRA" -c "
    SELECT username, cod_dane_origen, activo, fecha_creacion::date AS desde
    FROM   secad_super_admins ORDER BY username"

TOTAL=$(psql_maestra -c "SELECT COUNT(*) FROM secad_super_admins WHERE activo")
if [[ "$TOTAL" == "0" ]]; then
    echo ""
    echo "⚠ NO HAY NINGÚN SUPERADMINISTRADOR ACTIVO." >&2
    echo "  NO apliques V67 todavía: quedarías sin acceso a /super." >&2
    echo "  Registra al menos uno a mano:" >&2
    echo "" >&2
    echo "    INSERT INTO secad_super_admins (username, cod_dane_origen, usuario_creacion)" >&2
    echo "    VALUES ('<usuario.de.oud>', '<dane>', 'alta-manual');" >&2
    exit 1
fi
