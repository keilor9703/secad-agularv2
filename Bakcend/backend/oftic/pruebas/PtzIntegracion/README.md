# Prueba de integración del control PTZ

Recorre el camino real del PTZ —`DbCamaraService` → `HikCentralVmsReader`
(firmando AK/SK de verdad, por HTTP de verdad) → VMS, y `DbCamaraRepository` →
PostgreSQL de verdad— y comprueba lo que de esas piezas no se puede comprobar
leyendo el código: que **a cada arranque le sigue una parada**, cuánto tiempo
pasa entre las dos, y qué queda en la bitácora.

Lo único simulado es el HikCentral. El simulador verifica la firma
**reimplementada desde cero** según §3.2 del manual y valida el cuerpo con los
límites de §5.4.23, así que no es un «sí a todo»: si el driver firmara mal o
mandara una velocidad fuera de rango, sale rechazado.

## Qué comprueba

| # | Propiedad |
|---|---|
| 1 | A un `action=0` le sigue **siempre** un `action=1`, y con el retardo pedido |
| 2 | Una cámara sin PTZ se rechaza **antes** de tocar el VMS |
| 3 | Fronteras: otro `sitio_graba`, comando inventado, cámara inexistente |
| 4 | Velocidad y duración absurdas se acotan antes de salir a la red |
| 5 | Un preset manda **una sola** llamada (no se para un recorrido) |
| 6 | Dos comandos a la vez: el segundo se rechaza; al terminar, se libera |
| 7 | **Petición cancelada a mitad: la parada llega igual** |
| 8 | La bitácora queda completa, con y sin la migración V77 |
| 9 | El simulador validó todas las firmas |

La 7 es la importante: si la llamada de parada viajara con el token del cliente,
cancelar la petición dejaría la cámara girando. Se comprobó que la prueba lo
detecta saboteando el código a propósito.

## Cómo se corre

1. **PostgreSQL** con el esquema de un tenant aplicado
   (`docs/sql/master/_orden.tenant.txt`). Por defecto busca
   `Host=127.0.0.1;Port=5432;Database=Secad_Bogota;Username=postgres`; se
   cambia con la variable `PG`.

   > La prueba **borra** `cad_camaras`, `cad_camara_integracion` y
   > `cad_camaras_visualizacion` de esa base. Apúntela a una base de pruebas.

2. **El simulador**, en otra terminal:

   ```bash
   python3 scripts/hikcentral_simulador.py --puerto 5610
   ```

   Se cambia con la variable `SIM`. Las credenciales que espera son las que el
   simulador trae por defecto (`AK-simulador` / `SK-simulador` /
   `svc_secad_cctv`).

3. **La prueba:**

   ```bash
   cd Bakcend/backend/oftic
   dotnet run --project pruebas/PtzIntegracion/PtzIntegracion.csproj
   ```

   Termina con `TODO EN VERDE` y código de salida 0, o lista los fallos y sale
   con 1.

Para probar también el respaldo de la migración, córrala **antes** de aplicar
`V77__camaras_ptz_auditoria.sql` y otra vez después: la primera vez ejercita el
camino de `42703` (columna inexistente) y la segunda las columnas `accion` y
`detalle`. La prueba dice en la cabecera en qué estado encontró el esquema.
