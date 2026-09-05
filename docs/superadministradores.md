# Superadministradores del sistema

Un **superadministrador** administra SECAD *por encima* de los CAD: da de alta
tenants, conmuta de contexto y ve la salud de la red nacional. No es un rol de
ningún CAD, y desde V66 tampoco se guarda como tal.

## Dónde vive

En la tabla `secad_super_admins` de la base **maestra**. Es la única fuente:
ningún rol de ningún tenant lo concede, y ya no existe la lista
`Menu:SuperUserIds` del `appsettings.json`.

La clave es el **username de OUD**, no el `id_usuario`: ese id es local a cada
tenant —el mismo número es otra persona en otro CAD— mientras que el username
identifica a la persona en todos. Se guarda en minúsculas.

```
login  →  ¿está el username en secad_super_admins y activo?  →  es_super_admin
```

Ese claim es el que leen `superAdminGuard` en el frontend y la política
`SuperAdministrador` de la API. Al conmutar de CAD se vuelve a comprobar contra
la maestra, para que una sesión abierta no sobreviva a un retiro.

## Administrarlos

**Super Admin → Superadministradores** (`/super/super-admins`). Solo entra
quien ya lo es. La pantalla no deja retirar ni desactivar al último activo:
quedarse sin ninguno cierra `/super` para todos y solo se reabre con SQL a mano
contra la maestra.

## Migración desde el modelo anterior — EN ESTE ORDEN

Antes, ser superadministrador era tener el rol 2 en la base de un tenant. La
mudanza tiene tres pasos y **el orden importa**: el tercero borra la única
pista de quién lo era.

```bash
# 1. La tabla en la maestra (queda vacía: todavía nadie es superadministrador)
./scripts/apply_schema.sh master secad-postgres secad_app Secad

# 2. Traer a quien tenga hoy el rol 2 en cualquier tenant.
#    Se ejecuta DENTRO del contenedor de Postgres: los db_host de
#    secad_tenants son nombres de servicio de Docker.
docker compose cp scripts/migrar-superadmins.sh postgres:/tmp/
docker compose exec -T postgres bash /tmp/migrar-superadmins.sh \
    "postgresql://secad_app:LACLAVE@localhost:5432/Secad" --simular   # ensayo
docker compose exec -T postgres bash /tmp/migrar-superadmins.sh \
    "postgresql://secad_app:LACLAVE@localhost:5432/Secad"             # de verdad

# 3. COMPROBAR que hay al menos uno antes de seguir
docker compose exec -T postgres psql -U secad_app -d Secad \
    -c "SELECT username, activo FROM secad_super_admins"

# 4. Solo entonces: retirar el rol de los tenants y sembrar el menú
./scripts/apply_schema.sh tenant secad-postgres secad_app Secad_Bogota
```

Si el paso 2 no encuentra a nadie —porque el rol se concedía por
`Menu:SuperUserIds` y no por el rol 2—, regístralo a mano **antes** del paso 4:

```sql
INSERT INTO secad_super_admins (username, cod_dane_origen, usuario_creacion)
VALUES ('<usuario.de.oud>', '<dane>', 'alta-manual');
```

Y hay que **redesplegar la API**: hasta entonces sigue firmando el claim con el
código viejo.

## Después de migrar

- Los usuarios afectados deben **volver a iniciar sesión**: su token actual
  sigue firmado con el criterio anterior hasta que expire.
- En cada CAD, el rol 2 queda desactivado y renombrado
  «SuperAdministrador (se administra desde la maestra)». Las filas históricas de
  `ctr_roles_user_admin` se conservan como auditoría.
- Si en algún CAD el rol 2 era otra cosa —un «Jefe de Turno», por ejemplo—,
  V67 lo detecta por el nombre y no lo toca.
