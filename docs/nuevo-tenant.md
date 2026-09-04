# Dar de alta un CAD nuevo (tenant)

Un tenant en SECAD es **un CAD con su propia base de datos**. Nada se comparte
entre CADs salvo la base maestra, que solo guarda el registro de tenants y por
dónde se llega a cada uno.

Son cuatro capas, y en este orden. Saltarse el orden es la causa habitual de
«el usuario entra pero no ve nada»:

1. La base de datos del CAD (crearla y ponerle el esquema).
2. Los catálogos que llegan vacíos (sitios, fuerzas, canales, casos…).
3. El registro en la base maestra (`secad_tenants`).
4. Los usuarios y su configuración operativa.

---

## 0. Decidir dónde vive la base

Dos opciones, y la primera es casi siempre la buena:

**a) Una base más dentro de un Postgres que ya existe.** Un `CREATE DATABASE`
en `secad-postgres`. Sin tocar `docker-compose.yml`, sin volumen nuevo, sin
memoria extra. Un CAD son decenas de despachadores, no miles.

**b) Un contenedor Postgres propio.** Solo si hace falta aislar de verdad —
copias de seguridad independientes, o un CAD que no puede compartir instancia
con otro por política. Cuesta un servicio nuevo en `docker-compose.yml`, con su
volumen con `name:` explícito (ver la cabecera del compose: sin eso, mover el
stack arranca contra bases vacías).

El resto de esta guía usa la opción (a) con un CAD de ejemplo:
**Cúcuta, DANE 54001, base `Secad_Cucuta`**.

---

## 1. Crear la base y su usuario

```bash
cd ~/secad-agularv2

# El usuario de la aplicación para ese CAD, y su base.
docker compose exec -T postgres psql -U secad_app -d postgres <<'SQL'
CREATE ROLE secad_cucuta_app LOGIN PASSWORD 'UNA_CLAVE_LARGA_Y_UNICA';
CREATE DATABASE "Secad_Cucuta" OWNER secad_cucuta_app;
SQL
```

Una clave distinta por CAD. Se guarda en `secad_tenants.db_password` **en
claro** (columna `VARCHAR(500)`, sin cifrar): quien lea la base maestra lee las
credenciales de todos los CADs. Es la razón por la que pgAdmin se publica solo
en `127.0.0.1` y se llega por túnel SSH.

---

## 2. Aplicar el esquema

No hay tabla de migraciones aplicadas. La forma correcta —para una base nueva
**y** para poner al día una que ya está en producción— es pasar la lista
completa en orden:

```bash
./scripts/apply_schema.sh tenant secad-postgres secad_cucuta_app Secad_Cucuta
```

Son 57 scripts. El orden importa (`V10` va después de `V2`, no antes: por eso
el script lleva la lista escrita a mano y no un `ls`). Repetirlo es seguro:
verificado sobre PostgreSQL 16, tres pasadas seguidas sobre la misma base, cero
errores y sin filas duplicadas.

Los otros cinco scripts van a la **maestra**, y ya están aplicados si el sistema
funciona. Solo hacen falta al montar un servidor desde cero:

```bash
./scripts/apply_schema.sh master secad-postgres secad_app Secad
```

### Comprobar que quedó completo

```bash
docker compose exec -T postgres psql -U secad_cucuta_app -d Secad_Cucuta \
  -f - < docs/sql/verificar-esquema-tenant.sql
```

Lista objeto por objeto lo que debería existir y lo que falta. Verifica
**esquema, no contenido**: los scripts que solo siembran datos no aparecen ahí.

---

## 3. Cargar los catálogos

Un CAD recién creado trae el menú, los roles, los 42 delitos y 5 dominios. Todo
lo demás llega **vacío** y sin ello la operación no arranca:

| Catálogo | Se carga desde | Sin esto… |
|---|---|---|
| `cad_sitios_grabacion` | **SQL** — no hay pantalla | el tenant no puede apuntar a un sitio válido |
| `cad_lugares_geograficos`, `cad_barrios` | **SQL** — la app solo los lee | Recepción no resuelve ciudad ni barrio |
| `cad_fuerzas` y `cad_canales` | Administración → Entidades | no hay canal de despacho que elegir |
| `cad_casos` | Administración → Códigos de Caso (importa Excel) | no se puede tipificar un pedido |
| `cad_medios_disponibles` | Turnos (alta manual o importación SIVICC) | no hay recursos que despachar |
| `secad_unidades` (maestra, común) | Super Admin → Unidades | — |

El sitio de grabación es el primero, porque el paso 4 lo necesita:

```sql
-- En la base DEL TENANT
INSERT INTO cad_sitios_grabacion (consecutivo, descripcion)
VALUES (1, 'CAD Cúcuta')
ON CONFLICT (consecutivo) DO NOTHING;

-- V31 añadió esta columna para amarrar el sitio a su CAD
UPDATE cad_sitios_grabacion SET cod_dane = '54001' WHERE consecutivo = 1;
```

---

## 4. Registrar el tenant en la maestra

**Super Admin → Tenants → Nuevo.** El formulario escribe en `secad_tenants`; no
hace falta SQL. Los campos que deciden si el CAD funciona:

- **Código DANE** — la llave de todo. Tiene que ser exactamente el que
  devuelve OUD en `unde_laborando` para los policías de ese CAD. Si no coincide,
  el usuario se autentica y se queda sin tenant.
- **Código Unidad (SILOG)** — la sigla (`MEBOG`, `MECUC`). Es el segundo intento
  de resolución: si el DANE no casa, se busca por `sigla_laborando`. Ponerlo
  es barato y salva logins.
- **Host / Puerto / Nombre / Usuario / Contraseña BD** — el host es el **nombre
  del servicio de Docker** (`postgres`), no una IP ni `localhost`: la API
  resuelve por el DNS interno de la red del compose.
- **Código del sitio de grabación** — el `consecutivo` que se insertó en el
  paso 3. Es el sitio por defecto del CAD, el que se usa cuando entra algo sin
  usuario detrás (PlantaTel, SMS, callbacks de agencias externas).

**No hay que reiniciar la API.** El pool de conexiones se llena por fallo de
caché: la primera petición con ese DANE lee el tenant de la maestra y abre el
pool. Al *editar* un tenant, `SuperAdminController` invalida el pool de ese
DANE, así que un cambio de clave también entra en caliente.

---

## 5. Usuarios

Un policía que existe en OUD **no entra todavía**: el login resuelve el tenant
y después busca al usuario en `ctr_usuarios` de esa base. Si no está, no hay
roles y la sesión no sirve de nada.

1. **Alta del usuario** — Administración → Usuarios, con el `username` tal cual
   viene de OUD.
2. **Rol** — Administración → Roles. El CAD nuevo trae `Administrador` (1) y
   `SuperAdministrador` (2) y el menú ya está mapeado a ellos.
3. **Fuerza, canal y ACD** — Administración → Entidades → (fuerza) → pestaña
   Usuarios. Esto es lo que llena los claims con los que Eventos abre la cola.
4. **Sitio de grabación del usuario** — `ctr_usuarios.sitio_grabacion`. **La
   interfaz lo muestra pero no lo escribe** (`DtoUsuarioOperacionRequest` no lo
   incluye), así que hoy es SQL:

   ```sql
   UPDATE ctr_usuarios SET sitio_grabacion = 1 WHERE username = 'jperez';
   ```

   Sin esto el usuario trabaja con sitio 0 y no ve las llamadas de su CAD.

Los usuarios **civiles** (los que no existen en OUD) se dan de alta desde la
misma pantalla, con «Nuevo usuario civil». No hay que tocar SQL: el endpoint
escribe las dos mitades que necesitan —la fila en `ctr_usuarios` del tenant y
las credenciales en `secad_users_fallback` de la maestra, con la contraseña en
bcrypt. Si la segunda falla responde **207** y lo dice: el usuario queda creado
en el CAD pero sin poder entrar, y hay que reintentar el guardado.

---

## 6. Comprobar

Desde Super Admin, **cambiar de contexto** al CAD nuevo: emite un JWT contra ese
tenant sin cerrar sesión, y `home_cod_dane` conserva el de origen para volver.
Si el menú se pinta y Eventos ofrece un canal, el alta está bien.

Después, un login real de un usuario del CAD. Es la única prueba que ejercita el
camino completo — OUD → DANE → tenant → `ctr_usuarios` → roles → menú.

---

## Lo que se rompe más a menudo

| Síntoma | Causa |
|---|---|
| «Tenant no autorizado» (403) | el DANE del JWT no está en `secad_tenants`, o el tenant está inactivo |
| Entra pero el menú sale vacío | el usuario no existe en `ctr_usuarios` de ese CAD, o no tiene rol |
| Eventos dice «sin canal de despacho» | falta `cad_fuerzas`/`cad_canales`, o el usuario no tiene fuerza y canal asignados |
| La bandeja está siempre vacía | `sitio_grabacion` del usuario en 0, o `sitio_graba` del tenant apuntando a un consecutivo que no existe |
| Recepción no encuentra barrios | `cad_lugares_geograficos` / `cad_barrios` sin cargar |
