# Censo institucional de cámaras CCTV — cómo se siembra en SECAD

> El inventario nacional de cámaras lo lleva **otro sistema institucional**, no
> el VMS. De ahí salen las **coordenadas**, que la OpenAPI de HikCentral no
> expone para cámaras fijas (§5 de `CCTV_HIKCENTRAL_DISENO_TECNICO.md`). Este
> documento explica qué trae ese archivo, qué se guarda y cómo se carga.
>
> Piezas: `scripts/censo_cctv.py` · `docs/sql/master/V76__camaras_censo_institucional.sql`
> · `docs/sql/censo-camaras/censo_camaras_<UNIDAD>.sql`

---

## 1. Qué trae el archivo de origen

Un CSV `;` en Latin-1 con **29.127 filas**, todo el país: 33 departamentos, 439
municipios, 52 unidades policiales. Columnas: año y mes del corte, región,
unidad, departamento, municipio, tipo de territorio, nombre y número de cámara,
estado de funcionamiento, latitud, longitud, dirección, y tres campos de la
entrega administrativa a la Policía.

Dos cosas que hay que saber antes de usarlo:

**No es un censo, es un acumulado.** Hay 39 cortes (ANIO/MES) desde 2022-11
hasta 2026-07, y la misma cámara puede aparecer en varios. La carga se queda
siempre con la fila más reciente.

**No hay identificador de cámara.** No trae el `cameraIndexCode` de HikCentral
ni ningún id propio. La combinación `UNIDAD + MUNICIPIO + NUMEROCAMARA +
NOMBRECAMARA` sí identifica una cámara (verificado: 29.122 claves distintas
sobre 29.127 filas, y las 5 repeticiones son la misma cámara en dos cortes), así
que esa es la clave natural de la siembra. **Consecuencia importante: emparejar
estas cámaras con las del VMS no se puede hacer por id; habrá que hacerlo por
nombre y revisarlo a mano.**

---

## 2. Las coordenadas venían destrozadas

El export a Excel perdió el punto decimal y metió separadores de miles. Tal cual
llegan, ninguna coordenada es utilizable:

| En el archivo | Lo que significa |
|---|---|
| `5.541.527.737.486.400` | `5.5415277374864` |
| `-7.363.273.906.987.800` | `-73.632739069878` |
| `580.439.845.840.189` | `5.80439845840189` |
| `2,385597452` | `2.385597452` (esta sí venía bien) |

`scripts/censo_cctv.py` las reconstruye: se queda con los dígitos y prueba a
poner el punto tras 1 o 2 enteros, escogiendo la lectura que cae dentro de
Colombia. Cuando las dos caben —Atlántico 10.9 vs 1.09, San Andrés 12.5 vs
1.25— desempata con la **banda de latitud del departamento**, que está en el
propio script.

También detecta **85 filas con latitud y longitud intercambiadas** (Marmato,
Aguadas): se reconocen porque cada valor solo es legible en el rango de la otra
columna.

**Resultado: 29.098 de 29.122 cámaras (99,9 %) con coordenada usable.**
Verificado comparando el centroide calculado de cada departamento contra su
posición real conocida — los diez comprobados caen a menos de 8 km.

Cada fila guarda en `coord_calidad` cómo se obtuvo su punto (`directa`,
`por departamento`, `volteada`), para poder auditar después cualquier cámara que
aparezca fuera de sitio en el mapa.

---

## 3. Qué se guarda y qué no

Todo va a `cad_camaras` (V76). **No** se crea una tabla aparte: es una sola
cámara del mundo real, con un registro de inventario y —cuando se logre
emparejar— un enlace al VMS. Por eso `integracion_id` pasó a ser opcional.

| Del archivo | En SECAD | Por qué |
|---|---|---|
| UNIDAD | `unidad` + `sitio_graba` | **Lo más importante.** Es lo que decide qué cámaras ve cada CAD |
| REGION, DEPARTAMENTO, MUNICIPIO | `region`, `departamento`, `municipio` | Filtros y ubicación administrativa |
| NOMBRECAMARA | `nombre` | Lo que ve el operador, y la única vía de emparejar con HikCentral |
| NUMEROCAMARA | `numero_censo` | Identificador local («32», «CAM 40»); segunda vía de emparejamiento. Texto, no siempre es numérico |
| DIRECCION | `direccion` | Ubica la cámara en palabras cuando el mapa no basta |
| LATITUD, LONGITUD | `latitud`, `longitud`, `coord_calidad` | El objetivo de todo esto |
| ESTADOFUNCIONAMIENTO | `operativa` | Una cámara fuera de servicio no se le ofrece al despachador |
| ANIO, MES | `censo_periodo` | Qué tan vieja es la información; evita que un corte viejo pise uno nuevo |
| *(deducido del nombre)* | `tiene_ptz` | El censo no tiene la columna, pero el nombre suele decir «PTZ»/«DOMO» |

**No se guardan** `ENTREGOPONAL`, `ACTOADMINISTRATIVO` ni `FECHAENTREGAPONAL`:
son la gestión jurídica de la entrega del bien, no sirven para despachar, y el
campo del acto administrativo está sucio (143 valores distintos entre `NO`,
`no`, `0`, `NO APLICA`, vacío…). Tampoco `TIPO`, que describe el territorio
(«Municipio», «Isla»), no la cámara.

`estado` (columna que ya existía) queda para el **online/offline en vivo** que
reporta el VMS. Es distinto de `operativa`: una cámara puede estar dada de alta
y operativa en el inventario y estar caída ahora mismo.

---

## 4. Cómo se carga

```bash
# 1. Ver qué hay en el archivo y qué unidades trae
python3 scripts/censo_cctv.py censo_camaras_CCTV.csv

# 2. Generar la siembra de una unidad
python3 scripts/censo_cctv.py censo_camaras_CCTV.csv --unidad METUN \
    > docs/sql/censo-camaras/censo_camaras_METUN.sql

# 3. Correrla contra la base del tenant, DESPUÉS de V76
psql -d Secad_Tunja -f docs/sql/censo-camaras/censo_camaras_METUN.sql
```

El archivo generado es **repetible**: `ON CONFLICT` sobre la clave natural
actualiza en vez de duplicar, y un corte más viejo nunca pisa uno más nuevo ya
cargado. Al final resuelve el `sitio_graba` contra `cad_sitios_grabacion`
emparejando por abreviatura, y **avisa** si quedan cámaras sin sitio — que es
como decir que nadie las verá.

Ya está generado el de **METUN (Tunja, el piloto)**: 229 cámaras, 221
operativas, 5 municipios (Tunja 206, Tuta 11, Cucaita 6, Siachoque 5, Cómbita 1),
corte 2024-08.

---

## 5. La integración con el sistema de origen (pendiente)

Esta siembra es una carga puntual. Cuando se diseñe la integración para
mantener el catálogo al día, lo que ya está resuelto y hay que conservar:

- **La clave natural** (`unidad + municipio + numero_censo + nombre`) y el
  `ON CONFLICT`: la sincronización es un *upsert* sobre ella, no un borrar y
  volver a cargar. Borrar perdería los emparejamientos con el VMS.
- **`censo_periodo`**: la regla «un corte viejo no pisa uno nuevo» ya está en
  el SQL y sirve igual para la sincronización.
- **`origen`**: distingue lo que vino del censo, del VMS o de un administrador,
  para que una recarga no arrase con lo cargado a mano.
- **La reconstrucción de coordenadas** de `scripts/censo_cctv.py` seguirá
  haciendo falta mientras el origen exporte por Excel. Si la integración es por
  API y entrega números de verdad, se puede saltar — pero hay que **verificarlo**,
  no suponerlo.

Lo que **falta preguntarle al dueño de ese sistema**:

1. ¿Expone API, o solo el export? Si hay API: ¿autenticación, formato, paginado?
2. ¿Da un **identificador estable** de cámara? Sin él seguimos emparejando por
   nombre, que es frágil.
3. ¿Publica **bajas** (cámaras retiradas), o solo el inventario vigente? Sin
   bajas explícitas, SECAD acumularía cámaras que ya no existen.
4. ¿Con qué frecuencia se actualiza de verdad? El corte más reciente de varias
   unidades es de 2022; el de Tunja, de 2024-08.
5. ¿Puede incluir el **`cameraIndexCode` del VMS**? Es el dato que cerraría el
   círculo y volvería automático el emparejamiento con HikCentral.
