# Licencia de prueba de HikCentral — qué es y qué hacer con ella

> **Situación:** Hikvision entregó un **código de activación de prueba** de
> HikCentral Professional para la demo de integración con SECAD. Este documento
> explica qué es, dónde se pone y qué sigue después.

---

## 1. Qué es lo que llegó

El archivo `.txt` (y el `.zip`, que trae el mismo `.txt`) contiene cuatro líneas:

| Campo (original en chino) | Valor |
|---|---|
| 产品型号 · Producto | HikCentral Professional |
| 产品版本 · Versión | **3.1.1** |
| 对应激活码 · Código de activación | `fe62-…-b151` (ver `90-CREDENCIALES`) |
| 激活码类型 · Tipo | **试用 = prueba / trial** |

El nombre del archivo confirma para qué se emitió:
`…_demo_ponal_integracion_secad_…`

> **El código de activación no se guarda en este repositorio.** Va en tu archivo
> de credenciales, junto con el resto de secretos.

---

## 2. Qué NO es

- **No es un archivo que se instale.** Es una cadena de texto que se escribe en
  una pantalla de HikCentral.
- **No va en SECAD.** Ni en un `.env`, ni en `appsettings.json`, ni en la
  pantalla de integraciones. SECAD nunca ve esta licencia: SECAD solo consume el
  **AppKey/AppSecret** que se generan *después*, dentro de HikCentral.
- **No es la licencia del HikCentral de la Policía.** Es para **tu** servidor de
  pruebas.

---

## 3. Para qué sirve, y por qué importa

Hasta ahora el plan de pruebas dependía de que la Policía nos diera acceso a su
HikCentral (ver `CCTV_ARQUITECTURA_Y_PRUEBAS.md`). Con esta licencia puedes
**montar tu propio HikCentral Professional 3.1.1** y probar la integración de
punta a punta sin depender de nadie.

Y la versión coincide exactamente con la que implementamos: **3.1.1** es la que
agregó `hls_s` (HLS sobre TLS), que es el protocolo que el driver pide por
defecto. Lo que pruebes contra este servidor es lo que va a pasar en producción.

---

## 4. Antes de activar — tres decisiones que no se deshacen

1. **En qué máquina.** HikCentral Professional es software **Windows** (el
   manual instala en `C:\Program Files (x86)\VMSPlatform\…` y el componente de
   OpenAPI es `VMSPlatform_OpenAPI.exe`). Los servidores Oracle que tienes son
   Ubuntu: **no sirven** para esto. Opciones, de más simple a más formal:
   un PC o portátil con Windows 10/11 Pro · una VM de Windows en tu equipo ·
   un Windows Server.

2. **La activación se amarra a esa máquina.** HikCentral genera una huella de
   hardware y el código admite un número limitado de activaciones. **No la
   quemes** en una máquina que vas a borrar o reinstalar. Si usas una VM, toma
   un *snapshot* justo antes de activar.

3. **El reloj del trial arranca cuando actives**, no cuando te la enviaron. No
   actives "para ver qué pasa": hazlo el día que tengas el servidor listo, al
   menos una cámara disponible y tiempo para las pruebas.

---

## 5. Dónde se pone la licencia — paso a paso

### Paso 1 — Descargar el instalador de la **misma** versión

> ⚠️ **No es en el TPP.** El Technology Partner Portal (`tpp.hikvision.com`) es
> para recursos de integración —SDKs, guías ISAPI/OTAP, casos de soporte, demo
> room—, **no** para el instalador de la plataforma. Ahí no está.

El instalador vive en el **centro de descargas público** de Hikvision:

**hikvision.com → Support → Download → Software → HikCentral Professional V3.1.1**
<https://www.hikvision.com/en/support/download/software/hikcentral-professional-v3-1-1/>

De esa página se baja el **Base Pack** (el servidor). El *Control Client* es el
cliente de escritorio de Hikvision: **no hace falta** para SECAD, que trabaja
contra la OpenAPI, pero sirve para verificar que las cámaras se ven bien sin
meter a SECAD en el medio.

La versión debe coincidir con la del código: **un código de 3.1.1 no activa un
3.0.x ni un 2.x**. Si el sitio de tu región no muestra la 3.1.1, usa el global
(`/en/`). Verifica el **MD5** que publica la página al terminar la descarga.

El componente de **OpenAPI** (`VMSPlatform_OpenAPI.exe`) suele venir con el
paquete de la plataforma; si no aparece, se baja del TPP en
**Integration Support → Download Integration Resources**. Esa —y las guías de
desarrollo— sí es la parte que corresponde al TPP.

### Paso 2 — Instalar
Ejecutar el instalador como administrador en la máquina Windows elegida.
Instalación **centralizada** (todo en un mismo servidor) salvo que tengas razón
para separar.

### Paso 3 — Entrar al Web Client y crear la contraseña de `admin`
Desde el navegador: `https://<ip-del-servidor>` (el instalador indica el puerto).
En el primer ingreso aparece **Create Password**: es la contraseña del usuario
`admin`, que tiene todos los permisos del sistema.

- El sistema exige fuerza **Medium** y recomienda **Strong**: 8+ caracteres con
  mayúsculas, minúsculas, números y un símbolo.
- **Guárdala en el archivo de credenciales en ese mismo momento.** Recuperar la
  contraseña de `admin` de HikCentral no es un "olvidé mi clave": exige un
  procedimiento de reseteo con soporte de Hikvision.

Tres cosas que conviene dejar resueltas aquí mismo:

1. **`127.0.0.1` no sirve para SECAD.** Si abriste el Web Client desde el propio
   servidor verás esa dirección, pero es local a esa máquina. Anota la **IP de
   la red** (`ipconfig` en Windows) — esa es la que va en el campo *URL del
   HikCentral* de la integración.
2. **Firewall de Windows**: hay que permitir el puerto (443 por defecto) para
   que SECAD y el navegador del despachador alcancen el servidor desde otra
   máquina de la red.
3. **El certificado es autofirmado** (el navegador dirá "No seguro"). Para el
   backend de SECAD **no es problema**: el cliente HTTP del driver acepta
   certificado propio (`Vms:AceptarCertificadoPropio`, por defecto `true` —
   los HikCentral institucionales se despliegan igual). Para el navegador del
   despachador sí implica aceptar la excepción la primera vez, o instalarle un
   certificado válido al servidor.

### Paso 4 — Activar

Al entrar arranca un asistente de cuatro pasos: **Activate License → Storage on
SYS Server → User Preference → More**. El primero es el que importa, y tiene
tres decisiones que conviene no equivocar:

| Campo | Qué poner |
|---|---|
| **Activation Type** | *Online* si el servidor llega a internet; si no, *Offline* |
| **Machine Environment Type** | **Physical Machine** solo si es un equipo físico. Si HikCentral está sobre VMware/Hyper-V/VirtualBox hay que marcar **Virtual Machine**: la huella con la que se amarra la licencia se calcula distinto y equivocarse aquí es de las cosas que obligan a reactivar |
| **Hot Spare** | **Apagado.** Es para un par de servidores SYS redundantes; no aplica a un servidor de pruebas |

El botón **`+`** al lado del código sirve para agregar *varios* códigos (base y
complementos). Con un solo código de prueba se ignora.

Los dos pasos siguientes del asistente no tienen misterio para lo nuestro:
*Storage on SYS Server* configura dónde se graba —la integración con SECAD solo
usa video en vivo, así que los valores por defecto sirven— y *User Preference*
es idioma y formato de fecha.

**Formas de activar:**

- **Online Activation** (lo normal): pegar el código de activación. El servidor
  necesita salida a internet para hablar con el servicio de licencias de
  Hikvision.
- **Offline Activation** (si el servidor no tiene internet): HikCentral genera
  un **archivo de solicitud**, se sube al portal de licencias de Hikvision desde
  otro equipo, se descarga el **archivo de respuesta** y se importa en
  HikCentral.

Escribe el código **con los guiones, tal como llegó**.

### Resultado de la activación — 26/09/2026

La licencia quedó activada en el servidor de pruebas. Lo que trae:

| Recurso | Cantidad |
|---|---|
| **Cámaras** | **36** (y 36 ONVIF) |
| Personas / Vehículos / Usuarios | 100.000 / 500.000 / 10.000 |
| Cámaras ANPR · AcuSeek · AcuSeek Advanced | 10 · 10 · 10 |
| Puntos de acceso · Puertas | 10 · 10 |
| Terminales de visitante · Dispositivos portátiles | 32 · 10 |

> ⏳ **Vence el 26/12/2026** — 90 días exactos desde la activación. Esa es la
> ventana real para montar las cámaras, terminar la integración y dejar
> registrada la demo con la Policía.

36 cámaras sobran para el piloto de Tunja, donde el censo se empareja contra un
catálogo mucho menor.

> ⚠️ **Esta lista no responde la pregunta de la OpenAPI.** Son los recursos
> *contables* de la licencia; los módulos funcionales —entre ellos
> **Third-Party Integration**— viven en otra pantalla, y ahí es donde hay que
> mirar. Ver el paso siguiente.

### Paso 5 — Verificar que quedó bien
En el Web Client, abre **License Details**. Debe verse:

- La pestaña **License Expiry Date** con la fecha de vencimiento del trial.
- En la lista de *Authorization Details*, la fila
  **`Third-Party Integration` → `Enabled`**.

> Esa fila es la que decide si la integración es posible. El manual la marca
> explícitamente como requisito previo: *"Make sure you have enabled the License
> of Third-Party Integration function"*
> (OpenAPI V3.1.1 Developer Guide, §2.1, Figura 2-1, pág. 18).
>
> **Si dice `Disabled` o no aparece**, el trial no incluye el módulo de
> integración y hay que volver donde el ingeniero de Hikvision a pedir un código
> que sí lo traiga. Todo lo demás de la integración queda bloqueado hasta
> entonces, así que verifícalo **antes** de seguir.

---

## 5b. El paso "More" del asistente

Seis pestañas que el asistente deja al final. Para lo nuestro:

| Pestaña | Qué hacer |
|---|---|
| **WAN Access** | **Apagado.** Es para publicar servidores de una LAN hacia internet con mapeos NAT. En la red de pruebas no aplica |
| **NTP** | **Vale la pena configurarlo** (ver abajo) |
| **Transport Protocol** | Por defecto. Solo se toca si un dispositivo concreto exige otra cosa |
| **Email Settings** | Opcional, solo para notificaciones |
| **Person Picture Data** | No aplica: es de control de acceso y rostros |
| **Address for Receiving Device Info** | La dirección a la que los dispositivos reportan. Si la máquina tiene varias interfaces —Wi-Fi, Ethernet y los adaptadores virtuales que dejan VirtualBox, VMware o Docker— hay que confirmar que sea la IP de la LAN donde están las cámaras, no una virtual |

### Por qué el NTP importa para *esta* integración

SECAD firma cada llamada con AK/SK y envía `x-ca-timestamp` y `x-ca-nonce`. El
manual describe ese par como el mecanismo **anti-replay** de la plataforma
(§3.2): el timestamp es el número de milisegundos desde 1970 en el momento de
llamar. Si el reloj del servidor de HikCentral y el de quien llama quedan
corridos entre sí, ese mecanismo puede rechazar peticiones perfectamente
firmadas — y el síntoma es un 401 sin explicación, de los que cuestan horas.

Con sincronizar la hora de ambas máquinas y dejar la zona horaria correcta
(Colombia, UTC-5) se evita por completo.

## 6. Lo que sigue, una vez activada

1. **Instalar el componente OpenAPI**: `VMSPlatform_OpenAPI.exe` como
   administrador (§2.1 del manual).
2. **Encender la Open Platform**: System Configuration → Third-Party Integration
   → OpenAPI Gateway → **ON**.
3. **Crear el usuario dedicado y el Partner** → obtienes **AppKey** y
   **AppSecret**. Todo el detalle está en `CCTV_HIKCENTRAL_CREAR_PARTNER.md`.
4. **Agregar al menos una cámara** al HikCentral. Sin cámaras no hay nada que
   sincronizar: el catálogo llegaría vacío y no se podría probar el video. Sirve
   una cámara Hikvision, un NVR, o cualquier cámara ONVIF de la red.
5. **Registrar la integración en SECAD**: Administración → Integraciones →
   pestaña Cámaras → *Nueva integración*, driver **HikCentral Professional**,
   con la URL, el `userId`, el AppKey/AppSecret, calidad **sub-stream** y
   protocolo **hls_s**. Botón **Probar conexión**: si responde con el número de
   cámaras detectadas, la integración quedó viva.
6. **Sincronizar y emparejar** con el censo, y probar el visor desde un evento.

---

## 6a. El componente de OpenAPI: saber si está y de dónde sale

### ¿Ya está instalado?

Instalarlo genera servicios propios —el manual nombra *OpenAPI Translation
Service*, *artemis* y *artemis-portal* (§2.1)—, así que la comprobación es
directa. En PowerShell, en el servidor:

```powershell
Get-Service | Where-Object { $_.Name -match 'artemis|OpenAPI' -or $_.DisplayName -match 'artemis|OpenAPI' }
dir "C:\Program Files (x86)\VMSPlatform\VSM Servers\OpenAPI"
```

Esa ruta es el directorio por defecto que indica el manual, pero la plataforma
puede haber quedado en otro sitio. Para saber dónde está de verdad y con qué
versión exacta —que es la que debe coincidir con el paquete de OpenAPI—:

```powershell
Get-Service | Where-Object { $_.DisplayName -match 'HikCentral|VMS' } |
    Select-Object Name, DisplayName, Status

Get-ItemProperty HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*,
                 HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\* |
    Where-Object DisplayName -match 'HikCentral|VMS' |
    Select-Object DisplayName, DisplayVersion, InstallLocation
``` Y en el Web Client:
si **System Configuration → Third-Party Integration → OpenAPI Gateway** ya
aparece, el componente está y solo falta encenderlo.

Una prueba más, que además confirma que el gateway responde:

```powershell
curl.exe -sk -i -X POST https://127.0.0.1/artemis/api/resource/v1/cameras `
  -H "Content-Type: application/json;charset=UTF-8" -d "{}"
```

- Responde **401** o un JSON con `code` → el gateway **está ahí** (rechaza por
  firma, que es lo correcto sin credenciales).
- Responde **502 Bad Gateway** → la plataforma **ya tiene reservada la ruta
  `/artemis`** en su proxy, pero detrás no hay nada escuchando: el componente
  **no está instalado**. Es lo que se ve en una 3.1.1 recién instalada
  (verificado el 26/09/2026).
- Responde **404** o la página del Web Client → tampoco está, y además la ruta
  ni siquiera está mapeada.

Después de instalar el componente, ese mismo `curl` debe pasar de **502** a
**401**: ese cambio es la señal de que el gateway quedó vivo.

### Si no está: de dónde se baja

No viene en el instalador de la plataforma. Está en el **Technology Partner
Portal**, que es justo lo contrario del instalador del servidor:

| Qué | Dónde |
|---|---|
| HikCentral Professional (el servidor) | Centro de descargas público de hikvision.com |
| **Componente de OpenAPI** (`VMSPlatform_OpenAPI.exe`) | **TPP → Resource** (`tpp.hikvision.com/tpp/Resource`), o *Integration Support → Download Integration Resources* en el panel del TPP |

En el TPP, sección **HikCentral**, hay que bajar el paquete de OpenAPI de la
**misma versión de la plataforma** (3.1.1). Trae, además del instalador, los
SDKs: WebSDK, C++, C#, HttpUtillib y **jsDecoder** —este último es el
reproductor sin plugin, el plan B si alguna cámara solo tiene H.265—.

### Después de instalarlo

Solo hay que encender la Open Platform (§2.2.2). El paso de **autenticar el
certificado de servicio** (§2.2.1) aplica **únicamente al modo distribuido**,
con la OpenAPI en otro servidor. En instalación centralizada, que es la nuestra,
se salta.

## 6b. Probar la OpenAPI sin SECAD

Cuando algo no funciona hay tres culpables posibles y se confunden entre sí: la
red, las credenciales o SECAD. `scripts/hikcentral_probar.py` deja fuera a
SECAD — firma igual que el driver y dice qué respondió el VMS:

```bash
python3 scripts/hikcentral_probar.py \
    --url https://192.168.1.50:443 \
    --app-key AK... --app-secret SK... --user-id svc_secad_cctv
```

Solo usa la biblioteca estándar de Python 3, así que corre en la misma máquina
del HikCentral sin instalar nada más.

- **Lista cámaras** → la red y las credenciales están bien; si SECAD falla, el
  problema es de SECAD.
- **401** → firma rechazada: AppKey/AppSecret, Partner deshabilitado o relojes
  corridos.
- **403** → firma correcta pero el usuario no tiene permiso sobre las cámaras.
- **404** → el gateway de OpenAPI no está instalado o está apagado.
- **Sin respuesta** → firewall, IP o red.

Con `--camara <codigo>` pide además la URL de video, que es la que el navegador
del despachador tiene que poder abrir.

> Verificado contra `scripts/hikcentral_simulador.py`, que implementa la
> verificación de la §3.2 por separado: lista cámaras con credenciales buenas y
> da 401 con un secreto equivocado.

## 7. Qué pedirle al ingeniero de Hikvision ahora

La lista completa está en `CCTV_HIKCENTRAL_CREAR_PARTNER.md`. Con la licencia ya
en mano, lo que falta preguntar es:

| # | Pregunta | Por qué |
|---|---|---|
| 1 | ¿El trial incluye **Third-Party Integration**? | Sin ese módulo no hay OpenAPI y la integración no arranca |
| 2 | ¿Cuántos **días** dura y cuántos **canales/cámaras** cubre? | Define la ventana de pruebas y cuántas cámaras podemos montar |
| 3 | Enlace al instalador de **3.1.1 exacto** (y al paquete OpenAPI) | El código no activa otra versión |
| 4 | ¿Cuántas **activaciones** admite el código? | Para saber si podemos reinstalar si algo sale mal |
| 5 | Si vence, ¿se **extiende** el mismo código o emiten uno nuevo? | Para no quedarnos a mitad de camino |
| 6 | **Requisitos de hardware** para 3.1.1 con pocas cámaras | Para elegir la máquina sin quedarnos cortos |

---

## 8. Errores típicos

| Síntoma | Causa probable |
|---|---|
| El código es rechazado al activar | Versión del instalador distinta a 3.1.1, o el código ya se usó en otra máquina |
| Activó, pero no aparece el menú de OpenAPI | Falta instalar `VMSPlatform_OpenAPI.exe` |
| El menú aparece pero las llamadas dan 401 | La Open Platform está apagada, o el Partner no quedó vinculado a un usuario |
| La API responde pero el catálogo llega vacío | No hay cámaras agregadas al HikCentral, o el usuario del Partner no tiene permiso sobre ellas |
| El catálogo llega pero el video no se ve | La cámara no tiene sub-stream H.264 (HLS solo admite H.264), o el navegador no alcanza el servidor de streaming |
