# Cómo crear el "Partner" (OpenAPI) en HikCentral Professional — para obtener AppKey/AppSecret

> **Para:** administradores del HikCentral de Tunja (Policía).
> **Objetivo:** habilitar la OpenAPI de HikCentral y crear un "Integration Partner"
> para que SECAD pueda integrarse con las cámaras. Al finalizar se obtiene un
> **AppKey** y un **AppSecret** que deben entregarse al equipo de SECAD.
> **Fuente:** HikCentral Professional OpenAPI V3.1.0 Developer Guide (cap. 2).
>
> Todo se hace desde el **Web Client** de HikCentral (y, si hace falta, desde el
> servidor). No requiere ingenieros de Hikvision, **salvo** que falte la licencia
> (ver "Antes de empezar").

---

## Antes de empezar (verificar 3 cosas)

1. **Licencia de "Third-Party Integration" / OpenAPI activa.** ⚠️ **Este es el
   posible bloqueo.** La OpenAPI es un módulo **licenciado** de HikCentral. Si el
   HikCentral de Tunja no tiene esa licencia, hay que **adquirirla/activarla** con
   Hikvision o el integrador antes de continuar. Verificar en el Web Client:
   menú → **License** (o *About/Acerca de*) → confirmar que aparece habilitado
   *Third-Party Integration / OpenAPI*.
2. **Componente OpenAPI instalado.** Si al buscar el menú de OpenAPI (Paso 1) no
   aparece, hay que instalar el componente ejecutando **`VMSPlatform_OpenAPI.exe`
   como administrador** en el servidor de HikCentral (viene con el instalador de
   la plataforma).
3. **Acceso de administrador** al Web Client de HikCentral (ya lo tienen).

---

## Paso 1 — Habilitar la Open Platform (OpenAPI)

Por defecto la OpenAPI viene **deshabilitada**.

1. Iniciar sesión en el **Web Client** de HikCentral como administrador.
2. Ir al menú (ícono ☰ / ⚙ arriba) → **System Configuration** → **Third-Party
   Integration** → **OpenAPI Gateway**.
3. Poner el interruptor **Open API** en **ON** (encendido).
4. En "deployment": si la OpenAPI corre en el **mismo servidor** (lo normal),
   dejar **Dual-Server Deployment DESACTIVADO**. (Solo si estuviera en 2
   servidores se activa y se pone la IP + puerto de gestión, por defecto 8208.)

---

## Paso 2 — (Recomendado) Crear un usuario dedicado para la integración

Buena práctica de seguridad: el Partner llama a las APIs **con los permisos de un
usuario**. Conviene crear un usuario específico para SECAD, con permiso solo a lo
necesario (ver las cámaras), en vez de usar un administrador.

- Menú → **Security** / **Users** → crear un usuario (ej. `svc_secad_cctv`) con
  acceso a **las cámaras** que SECAD debe consultar (o a todas, según se decida).
- Anotar ese usuario para vincularlo en el Paso 3.

*(Si prefieren, pueden vincular el Partner a un usuario administrador existente,
pero lo recomendable es el usuario dedicado.)*

---

## Paso 3 — Crear el Partner (Integration Partner)

Dentro de **OpenAPI Gateway / Open Platform**:

1. Clic en **Add** (Agregar).
2. **Partner name** y **description**: ej. nombre `SECAD` y descripción
   "Integración CAD SECAD - Policía Nacional".
3. **Select the user**: vincular el **usuario del Paso 2** (los permisos de ese
   usuario son los que tendrá la integración).
4. **Domain ID**: seleccionar **0 = LAN** (el cliente —el edge de SECAD— está en
   la red local, en la misma sede).
5. **Effective period** (opcional): dejar sin fecha de expiración, o una fecha
   amplia. Si se pone fecha, al vencer deja de funcionar la integración.
6. **Check APIs** (marcar las APIs permitidas): habilitar, como mínimo, las que
   SECAD usa:
   - **Resource / cámaras** → `POST /artemis/api/resource/v1/cameras`
     (y `/artemis/api/resource/v1/regions/{regionIndexCode}/cameras` si aplica).
   - **Video / preview** → `POST /artemis/api/video/v2/cameras/previewURLs`.
   - *(Opcional a futuro: `playbackURLs` para video grabado, `ptzs/controlling`
     para cámaras móviles.)*
   Si es más fácil, pueden marcar todas las de **Resource** y **Video**.
7. Clic en **Save** (Guardar).

---

## Paso 4 — Copiar el AppKey y el AppSecret ⚠️

Al guardar, HikCentral genera y muestra el **AppKey** y el **AppSecret** del
Partner.

- **Cópienlos de inmediato y guárdenlos de forma segura.** El **AppSecret** suele
  mostrarse una sola vez.
- Si se pierde el AppSecret, hay que **resetearlo** (genera uno nuevo) desde el
  mismo Partner.
- **Entregar al equipo de SECAD:** AppKey, AppSecret, la **IP y puerto** del
  HikCentral (ej. `https://172.19.x.x:443`), y el **usuario** vinculado.

---

## Paso 5 — (Opcional) Probar que quedó bien

HikCentral trae un probador integrado:

1. En Open Platform, panel izquierdo → **API List**.
2. Elegir una URL (ej. la de cámaras) → **Online Debug**.
   - Entrar por `https://<IP-del-HikCentral>/artemis-portal`.
3. Ingresar el **AppKey/AppSecret** y ejecutar. Si responde, la OpenAPI y el
   Partner quedaron bien configurados.

---

## Qué entregar al equipo de SECAD (resumen)

- ✅ **AppKey**
- ✅ **AppSecret**
- ✅ **URL del HikCentral** (IP + puerto TLS, ej. `https://172.19.x.x:443`)
- ✅ **Usuario** vinculado al Partner (userId)
- ✅ Lista de **coordenadas de las cámaras** (`cameraIndexCode`/nombre → lat/lng)
  — la API no expone la ubicación de cámaras fijas, se siembra en SECAD.
- ✅ Confirmar que las cámaras tienen **sub-stream en H.264**.

---

## Si algo falla

- **No aparece "OpenAPI Gateway" en el menú** → falta instalar el componente
  (`VMSPlatform_OpenAPI.exe`) o falta la **licencia** de Third-Party Integration.
- **Se puede crear el Partner pero las llamadas fallan con permisos** → el
  **usuario vinculado** no tiene acceso a las cámaras; ajustar sus permisos.
- **Se perdió el AppSecret** → resetearlo en el Partner (genera uno nuevo; hay que
  actualizarlo en SECAD).
