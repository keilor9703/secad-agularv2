# El nodo edge de cámaras — diseño y configuración

> **Qué resuelve:** el VMS de cada municipio vive en la red de cámaras de ese
> municipio, y el backend central de Bogotá no la alcanza. El nodo edge —un
> servidor de SECAD dentro de la sede— sí alcanza las dos redes.

---

## 1. Qué viaja por dónde

Son dos flujos distintos y conviene no confundirlos:

| Flujo | Recorrido | Quién lo inicia |
|---|---|---|
| **API** (catálogo, pedir URL de video) | Backend central → **edge** → VMS | El servidor |
| **Video** (`.m3u8` y segmentos) | Navegador del despachador → **edge** → VMS | El puesto de trabajo |

**El video no pasa por Bogotá en ningún momento.** El edge, el VMS y los
despachadores están en el mismo municipio, así que el salto extra son
milisegundos. Mandar el video al nodo central y devolverlo sería lo peor de
ambos mundos: latencia, ancho de banda, y un CAD que se queda sin cámaras cada
vez que se cae el enlace con el central.

## 2. Por qué basta con un proxy transparente

La firma AK/SK de HikCentral (§3.2 del manual) se calcula sobre:

```
MÉTODO \n Accept \n Content-MD5 \n Content-Type \n Date \n
cabeceras-firmadas
URI
```

**El host no entra en la firma**, y `Host` está además en la lista de cabeceras
que el gateway excluye explícitamente del cálculo. De ahí se sigue algo muy
conveniente: una petición **ya firmada** puede enviarse a un proxy que la
reenvíe tal cual al VMS, y la firma sigue siendo válida.

La consecuencia importante es de seguridad: **el edge no necesita conocer el
AppSecret**. Firma el nodo central; el edge solo reenvía bytes. Un servidor en
una sede regional no custodia la credencial del VMS, y comprometerlo no permite
emitir peticiones nuevas contra las cámaras.

## 3. Lo que hace SECAD

En la ficha de la integración, el campo **Nodo edge**:

- **Vacío** → el backend que atiende la petición habla directo con el VMS. Es lo
  correcto cuando SECAD corre dentro del municipio.
- **Con URL** → las peticiones al VMS se mandan a esa URL conservando la ruta
  (`/artemis/api/...`), y la URL de video que devuelve el VMS se reescribe para
  que apunte al edge, conservando ruta y query —que es donde viaja el token del
  stream—.

Todo está en `Servicios.Vms.NodoEdge`.

## 4. Configuración del nodo edge (nginx)

```nginx
# /etc/nginx/sites-available/secad-edge-camaras
server {
    listen 443 ssl;
    server_name edge-tunja.policia.gov.co;

    # Certificado válido del dominio institucional. Es una de las razones de
    # ser del edge: el VMS tiene certificado autofirmado y así el despachador
    # no tiene que aceptar excepciones en su navegador.
    ssl_certificate     /etc/ssl/certs/edge-tunja.crt;
    ssl_certificate_key /etc/ssl/private/edge-tunja.key;

    # Solo el backend central y los puestos de despacho del municipio.
    # Un proxy abierto hacia la red de cámaras es exactamente lo que no
    # queremos construir.
    allow  10.0.0.0/8;          # ajustar a la red institucional real
    deny   all;

    # ── API firmada: llega del backend central y se reenvía tal cual ────────
    # No se toca ninguna cabecera X-Ca-*: la firma va calculada sobre ellas.
    location /artemis/ {
        proxy_pass https://10.51.85.131:443;
        proxy_ssl_verify off;             # el VMS usa certificado propio
        proxy_set_header Host $proxy_host;
        proxy_pass_request_headers on;
        proxy_read_timeout 30s;
    }

    # ── Video: lo pide el navegador del despachador ─────────────────────────
    # HikCentral sirve el HLS bajo /proxy/<ip>:<puerto>/sms/...
    location /proxy/ {
        proxy_pass https://10.51.85.131:443;
        proxy_ssl_verify off;
        proxy_set_header Host $proxy_host;

        # HLS en vivo: sin buffering intermedio y con margen para segmentos.
        proxy_buffering    off;
        proxy_read_timeout 300s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/secad-edge-camaras /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 5. Lo que el edge arregla de paso

Dos problemas que aparecieron probando contra un HikCentral real, y que
desaparecen cuando el video sale por el edge:

1. **La Content Security Policy.** Si el navegador habla con el VMS,
   `connect-src` tiene que listar la IP del HikCentral de cada municipio —que
   además cambia—. Con el edge lista **dominios de SECAD**, fijos y conocidos:

   ```
   connect-src 'self' ... https://edge-tunja.policia.gov.co https://edge-mebog.policia.gov.co
   ```

2. **El certificado.** El del VMS es autofirmado y cada despachador tendría que
   aceptar la excepción en su navegador. El del edge es un certificado válido
   del dominio institucional y no hay nada que aceptar.

Y como efecto secundario, **cada segmento de video pasa por infraestructura de
SECAD**: la auditoría deja de ser solo del momento en que se pidió la URL.

## 6. Verificación

```bash
# Desde el nodo central: ¿el edge reenvía la API?
python3 scripts/hikcentral_probar.py --url https://edge-tunja.policia.gov.co \
    --app-key AK... --app-secret SK... --user-id svc_secad_cctv
```

Si eso lista cámaras, el reenvío funciona: la petición se firmó en el central,
viajó por el edge y el VMS la aceptó.

Después, en SECAD: poner la URL del edge en el campo **Nodo edge** de la
integración y abrir una cámara desde un evento. La URL del `.m3u8` que pida el
navegador debe empezar por el dominio del edge.

---

## Estado

| Pieza | Estado |
|---|---|
| Enrutado de la API por el edge | ✔ implementado (`NodoEdge.Destino`) |
| Reescritura de la URL de video | ✔ implementado (`NodoEdge.ReescribirOrigen`) |
| Configuración nginx del edge | documentada aquí; falta desplegarla |
| CSP con los dominios del edge | pendiente de decidir cómo se configura por despliegue |
| Operación degradada (datos/BD en el edge) | fuera del alcance de este documento |
