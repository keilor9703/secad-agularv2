# @policia/mfa — paquete distribuible (2FA institucional para Angular)

Esta carpeta contiene la librería de doble autenticación **ya empaquetada** en un
solo archivo `.tgz`, lista para instalar en cualquier sistema Angular **sin
necesidad de un registro npm**. Es la forma más simple de repartirla: se comparte
el archivo (por este repo, una carpeta compartida o Teams) y cada equipo lo
instala localmente.

| Archivo | Versión | Qué es |
|---|---|---|
| `policia-mfa-1.0.0.tgz` | 1.0.0 | Librería completa: servicio + modelos + configuración + componente de UI `<pmfa-flow>` (todas las modales 2FA). |

> SECAD consume este mismo `.tgz` como dependencia (`file:dist-libs/...`) — es el
> primer sistema que lo usa "como si fuera nuevo", así que sirve de ejemplo vivo.

---

## Guía de instalación (para un sistema Angular consumidor)

**Requisitos:** Angular 20+ con componentes standalone, y un backend que exponga
los endpoints 2FA (ver el último apartado).

### Paso 1 — Obtener el archivo
Descargar `policia-mfa-1.0.0.tgz` y ponerlo dentro del proyecto (p. ej. en una
carpeta `libs/` en la raíz del frontend).

### Paso 2 — Instalar
```bash
npm install ./libs/policia-mfa-1.0.0.tgz
```
Esto agrega `@policia/mfa` a tu `package.json` y lo instala en `node_modules`.
A partir de aquí se importa como cualquier librería: `import { ... } from '@policia/mfa'`.

### Paso 3 — Registrar la configuración (una vez, en `app.config.ts`)
```ts
import { providePoliciaMfa } from '@policia/mfa';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    // ...lo que ya tengas...
    providePoliciaMfa({
      apiBaseUrl: environment.apiBaseUrl,   // la API de TU sistema
      issuer:     'NOMBRE_DE_TU_SISTEMA',   // lo que se ve en Google/Microsoft Authenticator
    }),
  ]
};
```
Opciones de `providePoliciaMfa(config)`:
- `apiBaseUrl` (obligatorio) — base de la API de tu sistema.
- `issuer` — emisor mostrado en la app de autenticación (default `SECAD`).
- `controlador` — controlador backend con los endpoints MFA (default `Cuenta`).
- `deviceStorageKey` — clave de localStorage del dispositivo recordado
  (default `policia_mfa_device`).

### Paso 4 — Usarlo en el login

En el `.ts` del login:
```ts
import { MfaLoginChallenge, PoliciaMfaFlowComponent } from '@policia/mfa';
// imports: [ ..., PoliciaMfaFlowComponent ]

mfaChallenge: MfaLoginChallenge | null = null;

// tras validar usuario+contraseña, si el backend pide 2FA:
if (resp?.requiresMfa) { this.mfaChallenge = resp as MfaLoginChallenge; }

// cuando el 2FA termina bien, el componente entrega el token ya validado:
onMfaOk(token: string): void {
  this.authService.storeLoginData(token, this.usuario);  // cada sistema a su manera
  this.router.navigate(['/home']);
}
```

En el `.html` del login:
```html
<pmfa-flow
  [challenge]="mfaChallenge"
  [usuario]="usuario"
  (autenticado)="onMfaOk($event)"
  (cancelado)="mfaChallenge = null">
</pmfa-flow>
```

Eso es **todo** en el frontend. No hay pantallas que diseñar ni lógica de OTP,
QR, reset o bloqueo que escribir — todo viene dentro del componente.

---

## Requisito del backend (no es opcional)

La librería es solo el frente. El backend de tu sistema debe exponer los 4
endpoints que hablan con el servidor 2FA central:
`MfaVerify`, `MfaEnrollConfirm`, `MfaResetRequest`, `MfaResetConfirm`.
En SECAD los provee `CuentaController` + `MfaCentralService`. (Este wrapper de
servidor se empaquetará aparte como un NuGet para los sistemas .NET.)

---

## Actualizar a una versión nueva

Cuando salga una versión nueva (p. ej. `policia-mfa-1.0.1.tgz`), reemplaza el
archivo e instala de nuevo:
```bash
npm install ./libs/policia-mfa-1.0.1.tgz
```
Una sola línea y quedas actualizado — sin copiar/pegar código.
