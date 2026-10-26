# TURN (coturn) con credenciales efímeras

> **Qué resuelve.** Hasta ahora la videollamada con el ciudadano usaba una
> credencial TURN **permanente escrita en `environment.prod.ts`**. Todo lo que
> hay en ese archivo viaja en el JavaScript público de la aplicación, así que
> cualquiera podía sacarla de las herramientas del navegador y usar nuestro
> servidor como retransmisor propio, a nuestra costa. Ahora el backend firma
> credenciales que **caducan** (1 hora por defecto) y no hay nada permanente
> que robar.

---

## 1. Cómo funciona, en cinco líneas

1. coturn y la API comparten un **secreto** que nunca sale del servidor.
2. Cuando el despachador inicia la llamada, el navegador pide
   `GET /api/VideoLlamada/ice` (con su sesión). Al ciudadano le llegan los
   mismos datos dentro de la respuesta que valida su enlace.
3. Cada credencial es `usuario = "<expiración>:<quién>"` y
   `contraseña = Base64(HMAC-SHA1(secreto, usuario))`.
4. coturn recalcula el HMAC con el mismo secreto y rechaza lo que ya expiró.
5. Una credencial robada deja de servir cuando vence. No se guarda en ninguna
   parte.

El código está en `Services/TurnCredentialService.cs`; las pruebas, en
`oftic.tests/TurnCredentialServiceTests.cs`.

---

## 2. Lo que hay que hacer en el servidor

### Orden recomendado (una ventana corta)

> Durante unos minutos el relevo TURN no funcionará para llamadas nuevas. Quien
> tenga conexión directa (WiFi sin NAT restrictivo) no lo nota; quien llame
> desde datos móviles sí. Hágalo en un momento de poco uso.
>
> **No verifiqué** que su versión de coturn acepte a la vez usuarios fijos
> (`user=`) y el secreto (`use-auth-secret`). Por eso el plan no depende de eso.

**Paso 1 — Genere el secreto y póngalo en el `.env` de la aplicación.**

```bash
openssl rand -base64 32        # copie la salida
cd ~/secad
nano .env
```

Agregue (con SUS valores; la IP o el nombre es el de su servidor TURN):

```bash
TURN_URLS=turn:129.80.243.118:3478?transport=udp,turn:129.80.243.118:3478?transport=tcp
TURN_SECRET=PEGUE_AQUI_EL_SECRETO
TURN_TTL_SECONDS=3600
```

**Paso 2 — Despliegue la aplicación** (API y frontend, porque cambian los dos):

```bash
cd ~/secad
git pull
docker compose build api frontend
docker compose up -d api frontend
docker compose logs --tail 30 api       # no debe haber errores
```

**Paso 3 — Cambie coturn para que acepte el secreto y deje de aceptar la
credencial vieja.**

Ubique cómo corre (no sé si es un servicio del sistema o un contenedor):

```bash
systemctl status coturn --no-pager 2>/dev/null | head -5
docker ps --format '{{.Names}}' | grep -i turn
```

Edite su `turnserver.conf` (suele estar en `/etc/turnserver.conf`) con estas
líneas. **Cambie** `realm`, `external-ip` y `static-auth-secret`:

```ini
listening-port=3478
fingerprint
lt-cred-mech
use-auth-secret
static-auth-secret=EL_MISMO_VALOR_DE_TURN_SECRET
realm=secad.appjeylor.com

# OCI: el servidor ve una IP privada y publica otra. PÚBLICA/PRIVADA:
external-ip=129.80.243.118/IP_PRIVADA_DEL_SERVIDOR

# Puertos de relevo (deben coincidir con lo que abra en el paso 4)
min-port=49152
max-port=49500

# Acotar el abuso
total-quota=100
user-quota=12
stale-nonce
no-cli
no-multicast-peers

# Que el relevo NO pueda alcanzar redes internas del servidor
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
```

**Y elimine la credencial permanente.** Esta es la parte que revoca la que
estuvo publicada:

- Si hay una línea `user=secad:...` en el archivo: **bórrela**.
- Si los usuarios están en una base (`userdb`, SQLite, Redis): `turnadmin -L`
  los lista y `turnadmin -d -u secad -r secad.appjeylor.com` borra ese.

```bash
sudo systemctl restart coturn          # o: docker restart <nombre-del-contenedor>
```

> **Aunque la quite del archivo, esa credencial ya fue pública**: estuvo en el
> JavaScript servido y sigue en el historial de git. Lo que la neutraliza es
> que coturn deje de aceptarla, no que desaparezca del repositorio.

**Paso 4 — Abra los puertos.** En Oracle hay **dos** capas y hacen falta las dos.

1. **En la consola de OCI**: la lista de seguridad (o el grupo de seguridad de
   red) de la subred del servidor. Reglas de **entrada** desde `0.0.0.0/0`:

   | Protocolo | Puertos |
   |---|---|
   | UDP | 3478 |
   | TCP | 3478 |
   | UDP | 49152–49500 |

2. **En el propio servidor** (las imágenes de Ubuntu de OCI traen reglas de
   `iptables` que bloquean todo lo demás):

   ```bash
   sudo iptables -I INPUT -p udp --dport 3478 -j ACCEPT
   sudo iptables -I INPUT -p tcp --dport 3478 -j ACCEPT
   sudo iptables -I INPUT -p udp --dport 49152:49500 -j ACCEPT
   sudo netfilter-persistent save
   ```

---

## 3. Cómo comprobar que quedó bien

**a) La API entrega credenciales.** Con una sesión iniciada, desde el navegador
(F12 → Red) busque la llamada `ice`, o desde la terminal con su token:

```bash
curl -s -H "Authorization: Bearer $TOKEN" https://secad.appjeylor.com/api/VideoLlamada/ice
```

Debe haber dos servidores: uno `stun:` sin usuario y uno `turn:` con `username`
que **empieza por un número grande** (la expiración, en segundos desde 1970) y
una `credential`.

**b) coturn la acepta.** Abra la página de prueba de WebRTC
*Trickle ICE* (`https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/`),
pegue una de las URLs `turn:`, el `username` y la `credential` del paso (a), y
pulse **Gather candidates**. Tiene que aparecer al menos un candidato
**`typ relay`**. Si solo salen `host` y `srflx`, coturn no aceptó la credencial
o los puertos no están abiertos.

**c) La credencial vieja ya no sirve.** Repita (b) con el usuario y la
contraseña que estaban en `environment.prod.ts`: **no** debe aparecer ningún
`relay` (suele salir un error 401).

**d) La prueba que importa: datos móviles.** Apague el WiFi de un celular, abra
el enlace de una videollamada de prueba y confirme que hay video en los dos
lados. En WiFi casi siempre funciona aunque el TURN esté roto; el problema solo
aparece en la calle.

---

## 4. Si algo sale mal

| Síntoma | Causa probable |
|---|---|
| La llamada abre en WiFi pero queda en negro con datos móviles | TURN sin configurar o sin puertos abiertos. Verifique (a) y (b). |
| `docker compose logs api` dice «Turn:Urls está configurado pero Turn:Secret no» | Falta `TURN_SECRET` en el `.env`; se entrega solo STUN. |
| La llamada se corta a la hora exacta | Dura más que `TURN_TTL_SECONDS`. Súbalo. |
| Con `typ relay` en (b) pero la llamada real no | Los puertos de relevo de OCI e `iptables` no coinciden con `min-port`/`max-port`. |
| `denied-peer-ip` bloquea a un cliente legítimo | Un despachador que llega por una red privada o VPN. Ajuste la lista. |

---

## 5. Lo que cambió en el código

- **Eliminado** `turnUrls`, `turnUsername` y `turnCredential` de
  `src/environments/*.ts`, y una prueba (`environment.spec.ts`) que falla si
  alguien vuelve a escribir allí algo con nombre de secreto o de TURN.
- **Nuevo** `GET /api/VideoLlamada/ice` (autenticado) y `iceServers` en la
  respuesta de `GET /api/VideoLlamada/publico/{token}`.
- **Si la API no responde** o entrega un TURN sin credenciales, el navegador
  sigue con STUN y la llamada abre donde el NAT lo permite. Un TURN sin
  credenciales NO se pasa al navegador: lanzaría `InvalidAccessError` y la
  llamada ni siquiera empezaría.
