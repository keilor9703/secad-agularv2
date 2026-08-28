# Monitor de Salud de CADs — Documentación técnica

**Servicio:** `CadHealthMonitorService`  
**Archivo:** `backend/oftic/oftic/BackgroundServices/CadHealthMonitorService.cs`  
**Configuración:** sección `HealthMonitor` en `appsettings.json`

---

## ¿Qué hace este servicio?

Es un proceso interno que corre en segundo plano dentro del mismo backend .NET, desde el momento en que la aplicación arranca hasta que se detiene. Su única responsabilidad es **verificar periódicamente si cada CAD registrado está funcionando bien** y guardar el resultado en la base de datos maestra.

No requiere ningún agente externo, ningún script adicional, ninguna tarea programada en el sistema operativo. Vive dentro del proceso de la API.

---

## Cómo funciona (flujo completo)

```
App arranca
    │
    └── espera StartupDelaySeconds (por defecto 30s)
         │
         └── cada IntervalSeconds (por defecto 60s):
              │
              ├── 1. Lee todos los tenants activos de secad_tenants
              │
              ├── 2. Sondea cada CAD en paralelo (máximo MaxParallelProbes a la vez)
              │        abre conexión real a su PostgreSQL
              │        ejecuta: SELECT 1
              │        mide el tiempo que tarda
              │
              ├── 3. Clasifica el resultado:
              │        < DegradedLatencyMs ms  →  Nivel 1: Normal   ✅
              │        ≥ DegradedLatencyMs ms  →  Nivel 2: Degradado ⚠
              │        fallo de conexión       →  candidato a Offline
              │
              └── 4. Persiste en:
                       secad_tenants          (columnas nivel_operacion, latencia_ms, ultima_sincro)
                       secad_salud_historial  (registro histórico, uno por ciclo)
```

El dashboard "Salud CADs" del frontend lee `GET /api/super/salud` cada 30 segundos y muestra estos datos en tiempo real.

---

## Niveles de operación

| Nivel | Nombre    | Significado                                                  |
|-------|-----------|--------------------------------------------------------------|
| 1     | Normal    | Conexión OK y latencia dentro del umbral aceptable           |
| 2     | Degradado | Conexión OK pero lenta — el CAD responde pero está sobrecargado |
| 3     | Offline   | No se pudo establecer conexión después de N intentos fallidos |

---

## Parámetros de configuración

### `Enabled`
**Tipo:** booleano — **Defecto:** `true`

Enciende o apaga el monitor sin necesidad de tocar el código ni reiniciar con cambios.  
Útil durante ventanas de mantenimiento planificadas para no generar alertas falsas.

```json
"Enabled": false   // apaga el monitor completamente
```

---

### `IntervalSeconds`
**Tipo:** entero (segundos) — **Defecto:** `60`

Cada cuántos segundos se ejecuta un ciclo completo de sondeo sobre todos los CADs activos.

```
IntervalSeconds: 60  →  se sondea cada 1 minuto
IntervalSeconds: 30  →  se sondea cada 30 segundos (más reactivo, más carga de red)
IntervalSeconds: 120 →  se sondea cada 2 minutos (menos carga, reacción más lenta)
```

El tiempo del ciclo anterior se descuenta, por lo que el intervalo es entre el *fin* de un ciclo y el *inicio* del siguiente.

---

### `StartupDelaySeconds`
**Tipo:** entero (segundos) — **Defecto:** `30`

Cuántos segundos esperar tras el arranque de la aplicación antes del primer sondeo.  
Evita que el monitor empiece a trabajar mientras la app todavía está inicializando conexiones, cargando configuración, etc.

---

### `ProbeTimeoutSeconds`
**Tipo:** entero (segundos) — **Defecto:** `5`

Tiempo máximo que se espera para que la conexión al CAD se establezca y devuelva resultado.  
Si se supera, el intento cuenta como fallo.

```
ProbeTimeoutSeconds: 5
→ si el CAD no responde en 5 segundos, se toma como fallo
→ el ciclo no se bloquea esperando indefinidamente un CAD caído
```

**Importante:** este timeout es independiente para cada CAD y corre en paralelo. Si hay 10 CADs todos caídos, el ciclo tarda ~5 segundos, no 50.

---

### `DegradedLatencyMs`
**Tipo:** entero (milisegundos) — **Defecto:** `300`

**Qué mide:** el tiempo total que tarda en abrirse la conexión al PostgreSQL del CAD y ejecutar `SELECT 1`.

**Qué decide:** el umbral entre **Normal (nivel 1)** y **Degradado (nivel 2)**.

```
Latencia medida: 120ms  →  120 < 300  →  Normal    ✅
Latencia medida: 480ms  →  480 ≥ 300  →  Degradado ⚠
```

**Por qué importa:** un CAD puede estar "conectado" pero tan lento que las operaciones críticas (despacho de patrullas, registro de incidentes) lleguen con retardo. Esta métrica detecta esa situación *antes* de que sea un fallo completo y permite intervenir preventivamente.

**Ejemplo real:** un CAD normalmente responde en 80 ms. Hoy responde en 480 ms. Probablemente tiene sobrecarga de CPU, una consulta bloqueada, o la red está saturada. El sistema lo marca Degradado y el operador puede investigar antes de que caiga por completo.

**Ajuste por entorno:**
```
Red LAN rápida y estable     →  DegradedLatencyMs: 200
Red WAN o enlaces lentos     →  DegradedLatencyMs: 500 o 600
```

---

### `OfflineThreshold`
**Tipo:** entero (número de fallos) — **Defecto:** `2`

**Qué cuenta:** cuántos fallos de conexión **consecutivos** deben acumularse antes de declarar oficialmente un CAD como **Offline (nivel 3)** y persistir ese estado.

**Por qué no marcar Offline al primer fallo:**

```
Fallo #1  →  no se persiste todavía  (puede ser micro-corte de red de 2 segundos)
Fallo #2  →  SE PERSISTE como Offline  🔴
```

Con `OfflineThreshold: 2` e `IntervalSeconds: 60`, el CAD tiene hasta **1 minuto** para recuperarse de un fallo transitorio antes de que el sistema lo marque oficialmente como caído.

Con `OfflineThreshold: 3`, tiene hasta **2 minutos**.

**Problema que resuelve sin este parámetro:** cada vez que el administrador reinicia el servidor de un CAD para aplicar un parche (operación que tarda ~30 segundos), el dashboard mostraría una alerta roja falsa. Con el umbral configurado correctamente, el reinicio pasa desapercibido.

**Ajuste por entorno:**
```
Red estable, mantenimientos planificados    →  OfflineThreshold: 2
Red inestable o mantenimientos frecuentes  →  OfflineThreshold: 3 o 4
Criticidad máxima, alerta inmediata        →  OfflineThreshold: 1
```

---

### `OfflineBackoffSeconds`
**Tipo:** entero (segundos) — **Defecto:** `120`

**Qué controla:** cuántos segundos esperar antes de volver a intentar sondear un CAD que **ya fue confirmado como Offline**.

**Por qué es necesario — el problema sin back-off:**

```
CAD caído + IntervalSeconds: 60  →  1.440 intentos de conexión por día
                                  →  ruido excesivo en los logs
                                  →  satura la red o el servidor caído con paquetes TCP
                                  →  si hay 10 CADs caídos, el problema se multiplica por 10
```

**Con `OfflineBackoffSeconds: 120`:**

```
CAD confirmado Offline
    │
    └── back-off de 120s activo
         │
         ├── ciclos siguientes: el CAD se omite (no se sondea)
         │
         └── pasados 120s: se intenta nuevamente
              ├── sigue caído  →  back-off se restablece otros 120s
              └── responde OK  →  back-off se cancela, vuelve al ciclo normal (cada 60s)
```

**Consecuencia importante:** la detección de la *recuperación* tiene un retardo máximo igual a `OfflineBackoffSeconds`. Con 120 segundos, el sistema detectará la recuperación en un plazo de hasta 2 minutos.

**Ajuste por entorno:**
```
Alta criticidad, quiero saber rápido cuando vuelve   →  OfflineBackoffSeconds: 60
Balance entre ruido y velocidad de detección         →  OfflineBackoffSeconds: 120
Muchos CADs, red saturada, quiero menos ruido        →  OfflineBackoffSeconds: 180 o 300
```

---

### `MaxParallelProbes`
**Tipo:** entero — **Defecto:** `8`

Máximo de CADs sondeados en paralelo dentro de un mismo ciclo.  
Evita saturar la red o el servidor maestro cuando hay muchos tenants registrados.

```
MaxParallelProbes: 8  →  sondea de a 8 CADs a la vez
                       →  con 40 CADs: 5 rondas de 8 en paralelo
```

---

## Los tres parámetros clave juntos — escenario real

Configuración: `DegradedLatencyMs: 300`, `OfflineThreshold: 2`, `OfflineBackoffSeconds: 120`

```
09:00:00  CAD Medellín responde en 820ms  → 820 ≥ 300  → Degradado ⚠  (persiste)
09:01:00  CAD Medellín: timeout           → fallo #1  → no persiste todavía
09:02:00  CAD Medellín: timeout           → fallo #2  → OFFLINE 🔴  (persiste) + back-off inicia
09:02:00  (back-off activo: 120s)
09:04:00  (ciclo omite a Medellín, back-off no ha expirado)
09:04:00  (ciclo omite a Medellín)
09:04:00  back-off expira (120s cumplidos) → próximo ciclo sondea
09:05:00  CAD Medellín: timeout           → sigue Offline (persiste) → back-off reinicia
09:07:00  back-off expira → sondeo
09:07:00  CAD Medellín responde en 95ms   → RECUPERADO ✅ Normal  (persiste)
             back-off cancelado, vuelve al ciclo normal
```

**Resultado:** en esos 7 minutos el dashboard mostró la progresión completa y el historial tiene registros limpios y significativos — no 7 minutos de intentos fallidos cada 60 segundos.

---

## Referencia rápida — ¿qué cambiar según la situación?

| Situación | Parámetro a ajustar | Valor sugerido |
|-----------|---------------------|----------------|
| Muchas alertas falsas por reinicios de servidores | `OfflineThreshold` | Subir a 3 o 4 |
| Necesito saber al instante si un CAD cae | `OfflineThreshold` | Bajar a 1 |
| La red es lenta (WAN, enlaces satelitales) | `DegradedLatencyMs` | Subir a 500–600 |
| El dashboard tarda mucho en reflejar la recuperación | `OfflineBackoffSeconds` | Bajar a 60 |
| Los logs están llenos de intentos a CADs caídos | `OfflineBackoffSeconds` | Subir a 180–300 |
| Mantenimiento programado (no quiero alertas) | `Enabled` | `false` temporalmente |
| Muchos CADs y la red se satura durante el sondeo | `MaxParallelProbes` | Bajar a 4 o 5 |

---

## Dónde ver los resultados

- **Base de datos:** tabla `secad_tenants` (columnas `nivel_operacion`, `latencia_ms`, `ultima_sincro`, `observaciones`)
- **Historial:** tabla `secad_salud_historial` (un registro por cada sondeo que produce cambio)
- **API:** `GET /api/super/salud` (requiere rol SuperAdministrador)
- **Frontend:** módulo *Salud CADs* — panel con tarjetas por CAD, se refresca automáticamente cada 30 segundos
- **Logs de la app:** prefijo `[HealthMonitor]` en todos los mensajes del servicio
