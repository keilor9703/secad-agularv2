# Integraciones entrantes: llaves de API

Todo lo que **entra** a SECAD desde un sistema externo —la planta telefónica,
un bot de WhatsApp, un proveedor de SMS, una agencia que devuelve el estado de
un caso— se autentica con una **llave de API**, y esa llave decide a qué CAD
pertenece la petición.

## Por qué la llave y no una cabecera

Hasta V73 había **una sola clave** en `appsettings.json`
(`RecepcionExterna:ApiKey`), compartida por todos los CAD del país, y el CAD
destino lo decidía la cabecera `X-Cod-Dane`. Juntando las dos cosas: quien
tuviera esa clave escribía en el CAD que quisiera cambiando una cabecera.

Ahora cada llave pertenece a un CAD, así que resolverla resuelve el tenant.
`X-Cod-Dane` ya no hace falta y, cuando la petición trae una llave válida, se
ignora: no se puede saltar de un CAD a otro.

## Dónde vive la tabla, y por qué en la maestra

`secad_api_keys` está en la **base maestra**, no en la del tenant. No es una
preferencia: la petición llega sin JWT, y para abrir la base de un tenant hay
que saber cuál es. Si la llave viviera ahí, para validarla habría que abrir la
base que todavía no se sabe cuál es.

De cada llave se guardan dos cosas, por motivos distintos:

| | Qué es | Para qué |
|---|---|---|
| `huella` | SHA-256 de la llave | Se busca en **cada** petición entrante. Indexada. |
| `clave_cifrada` | La llave cifrada con AES-GCM | Solo se descifra cuando alguien pulsa «Ver», y queda auditado. |

Una consecuencia buena de separarlas: **la autenticación no depende de la clave
de cifrado**. Si `ApiKeys:ClaveCifrado` falta o está mal, las integraciones
siguen funcionando y lo único que deja de servir es el botón «Ver».

## Configuración del servidor

```jsonc
// appsettings.json
"ApiKeys": {
  // 32 bytes en base64. Genérela con:  openssl rand -base64 32
  "ClaveCifrado": "…"
}
```

No la guarde junto a la copia de seguridad de la base: quien tenga las dos
cosas puede recuperar todas las llaves.

## Operación

**Administración → Hub de Integraciones**, pestaña del canal.

- **Emitir.** «Nueva llave», con un nombre que diga de quién es («Planta Avaya
  — proveedor XYZ»). El alcance acota lo que puede hacer: la llave de la planta
  no debería poder crear casos por chat.
- **Entregar.** La ficha técnica del canal sale con la llave puesta en las
  cabeceras y en el `curl`; «Copiar todo» la deja lista para un correo.
- **Ver otra vez.** El ojo la revela. Cada revelado queda en
  `secad_api_keys_auditoria` con usuario, IP y fecha.
- **Probar.** Llama al endpoint real desde el servidor y enseña qué respondió.
  No registra nada en la operación: `/verificar` solo dice qué reconoció.
- **Rotar.** «Regenerar» emite una nueva y deja la anterior viva **24 horas**,
  para que al proveedor le dé tiempo de reconfigurar su equipo.
- **Si una llave se filtra.** «Revocar»: corta en el acto y anula también
  cualquier periodo de gracia pendiente. Luego emita otra.

## El alcance

| Alcance | Endpoint |
|---|---|
| `PBX` | `POST /api/RecepcionExterna/plantatel` |
| `CHAT` | `POST /api/RecepcionExterna/chat` |
| `SMS` | `POST /api/RecepcionExterna/sms` |
| `ACTUALIZACION` | `POST /api/ActualizacionExterna/{casoId}` |
| `TODO` | comodín — solo para pruebas |

Cualquier llave sirve para `POST /api/RecepcionExterna/verificar`, que es la
prueba de credenciales y no escribe nada.

El alcance **no se edita** después de emitida: ampliarlo en caliente le daría
más permisos a un secreto que ya está en manos de un tercero. Si hace falta
otro alcance, se emite otra llave.

## La unidad por defecto

Cada llave lleva una unidad (sitio de grabación). Si el sistema externo no
manda `sitioGraba`, se usa esa: un CAD de una sola unidad no debería tener que
conocer ese número. En un CAD que aloja varias —Barranquilla, con MEBAR y
DEATA— se emite **una llave por unidad**.

## Migración desde la clave global

La clave global de `appsettings.json` **sigue funcionando** para no dejar
tiradas las integraciones ya configuradas, pero cada vez que se usa deja un
aviso en el log:

```
Integración entrante autenticada con la clave GLOBAL de appsettings
(cod_dane=…, ip=…). Emita una llave propia del CAD en Hub de Integraciones:
la global no distingue tenants.
```

Ese log es la lista de trabajo: mientras aparezca, hay un sistema externo
pendiente de migrar. Cuando no aparezca en ningún CAD, quite
`RecepcionExterna:ApiKey` de la configuración y el camino queda cerrado.

## Antes de que exista la tabla

El despliegue levanta la API **antes** de correr el SQL. Entre esos dos
momentos `secad_api_keys` no existe todavía; todas las consultas lo contemplan
y responden «no hay llaves», así que las integraciones siguen entrando por la
clave global y nada se cae. Emitir una llave sí avisa de que falta aplicar V73.
