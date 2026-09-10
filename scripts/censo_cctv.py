# -*- coding: utf-8 -*-
"""
Normaliza el censo CCTV institucional para sembrarlo en SECAD.

Dos problemas del archivo de origen, ambos del export a Excel:

1. Las coordenadas perdieron el punto decimal y llevan separadores de miles.
   «5.541.527.737.486.400» es 5.5415277374864 y «-7.363.273.906.987.800» es
   -73.632739069878. Se recuperan los dígitos y se prueba a poner el punto tras
   1 o 2 enteros, quedándose con la lectura que cae dentro del departamento.
2. En 129 filas la latitud y la longitud vienen intercambiadas.

Además el archivo es un registro ACUMULADO por periodo (ANIO/MES): la misma
cámara puede aparecer en varios cortes. Gana siempre la fila más reciente.
"""
import csv, re, collections

LAT_RNG = (-4.30, 13.60)
LON_RNG = (-82.00, -66.80)

# Banda de latitud real por departamento. Es lo único que hace falta para
# decidir si la coordenada tiene 1 o 2 dígitos enteros: en la costa (Atlántico,
# Guajira, Magdalena, San Andrés) son 2; en el sur (Putumayo, Nariño, Vaupés,
# Caquetá, Amazonas) es 1, y ambas lecturas caen dentro de Colombia.
BANDA_LAT = {
    'AMAZONAS':                                (-4.30,  -0.50),
    'ANTIOQUIA':                               ( 5.40,   8.90),
    'ARAUCA':                                  ( 6.00,   7.10),
    'ATLANTICO':                               (10.20,  11.10),
    'BOGOTÁ, D.C.':                            ( 3.70,   4.85),
    'BOLIVAR':                                 ( 7.00,  10.90),
    'BOYACA':                                  ( 4.60,   7.10),
    'CALDAS':                                  ( 4.80,   5.80),
    'CAQUETA':                                 (-0.90,   2.90),
    'CASANARE':                                ( 4.20,   6.40),
    'CAUCA':                                   ( 0.50,   3.30),
    'CESAR':                                   ( 7.40,  10.90),
    'CHOCO':                                   ( 3.90,   8.70),
    'CORDOBA':                                 ( 7.30,   9.50),
    'CUNDINAMARCA':                            ( 3.70,   5.90),
    'GUAINIA':                                 ( 1.00,   4.10),
    'GUAJIRA':                                 (10.80,  12.60),
    'GUAVIARE':                                ( 0.60,   3.00),
    'HUILA':                                   ( 1.50,   3.90),
    'MAGDALENA':                               ( 8.90,  11.40),
    'META':                                    ( 1.60,   4.90),
    'NARIÑO':                                  ( 0.30,   2.70),
    'NORTE DE SANTANDER':                      ( 6.80,   9.40),
    'PUTUMAYO':                                (-0.60,   1.50),
    'QUINDIO':                                 ( 4.00,   4.80),
    'RISARALDA':                               ( 4.60,   5.60),
    'SAN ANDRES PROVIDENCIA Y SANTA CATALINA': (12.40,  13.50),
    'SANTANDER':                               ( 5.70,   8.20),
    'SUCRE':                                   ( 8.10,  10.20),
    'TOLIMA':                                  ( 2.80,   5.40),
    'VALLE DEL CAUCA':                         ( 3.00,   5.10),
    'VAUPES':                                  (-1.70,   1.90),
    'VICHADA':                                 ( 2.20,   6.40),
}

def lecturas(v, rng):
    """Valores plausibles al recolocar el punto decimal tras 1 o 2 enteros."""
    v = (v or '').strip()
    if not v:
        return []
    neg = v.lstrip().startswith('-')
    d = re.sub(r'\D', '', v)
    if not d:
        return []
    out = []
    for k in (1, 2):
        if len(d) < k:
            continue
        val = float(d[:k] + '.' + d[k:]) if len(d) > k else float(d[:k])
        if neg:
            val = -val
        if rng[0] <= val <= rng[1]:
            out.append(round(val, 7))
    return sorted(set(out))

def cargar(path):
    return list(csv.DictReader(open(path, encoding='latin-1', newline=''), delimiter=';'))

def _elegir(cands, banda):
    if len(cands) == 1:
        return cands[0], 'directa'
    if not cands:
        return None, 'ilegible'
    if banda:
        dentro = [c for c in cands if banda[0] - 0.5 <= c <= banda[1] + 0.5]
        if len(dentro) == 1:
            return dentro[0], 'por departamento'
    return None, 'ambigua'

def resolver(rows):
    for r in rows:
        banda = BANDA_LAT.get(r['DEPARTAMENTO'])
        cl = lecturas(r['LATITUD'], LAT_RNG)
        co = lecturas(r['LONGITUD'], LON_RNG)

        # Columnas intercambiadas: la «latitud» sirve como longitud y viceversa.
        # Se detecta porque cada una solo es legible en el rango de la otra.
        if not cl and not co:
            cl2 = lecturas(r['LONGITUD'], LAT_RNG)
            co2 = lecturas(r['LATITUD'], LON_RNG)
            if cl2 and co2:
                cl, co = cl2, co2
                r['_swap'] = True

        r['_lat'], r['_qlat'] = _elegir(cl, banda)
        r['_lon'], r['_qlon'] = _elegir(co, None)
    return rows

def clave(r):
    """No hay id de cámara en el origen; esta combinación sí identifica una."""
    return (r['UNIDAD'], r['MUNICIPIO'], r['NUMEROCAMARA'], r['NOMBRECAMARA'])

def periodo(r):
    return (int(r['ANIO']), int(r['MES']))

def vigentes(rows):
    mejor = {}
    for r in rows:
        k = clave(r)
        if k not in mejor or periodo(r) > periodo(mejor[k]):
            mejor[k] = r
    return list(mejor.values())


# ══════════════════════════════════════════════════════════════════════════════
# Emisión del SQL de siembra
# ══════════════════════════════════════════════════════════════════════════════

def _sql(v):
    if v is None: return 'NULL'
    if isinstance(v, bool): return 'TRUE' if v else 'FALSE'
    if isinstance(v, (int, float)): return repr(v)
    return "'" + str(v).replace("'", "''") + "'"

def _ptz(nombre):
    """El censo no tiene columna de PTZ, pero el nombre casi siempre lo dice."""
    return bool(re.search(r'\bPTZ\b|\bDOMO\b', nombre or '', re.I))

CABECERA = """\
-- ══════════════════════════════════════════════════════════════════════════════
-- Siembra del censo institucional de cámaras CCTV — unidad {unidad}
--
-- GENERADO por scripts/censo_cctv.py. No editar a mano: vuelva a generarlo.
--   python3 scripts/censo_cctv.py <censo.csv> --unidad {unidad} > este_archivo.sql
--
-- Origen : censo CCTV de la Policía Nacional, corte {corte}
-- Cámaras: {n} ({operativas} operativas) · {municipios} municipio(s)
--
-- Correr contra la base del TENANT correspondiente, DESPUÉS de V76.
-- Es repetible: ON CONFLICT sobre la clave natural del censo actualiza en vez
-- de duplicar, y respeta lo que ya se haya emparejado con el VMS.
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'cad_camaras')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='cad_camaras' AND column_name='unidad') THEN
        RAISE EXCEPTION 'Falta V76: cad_camaras todavía no acepta el censo.';
    END IF;
END $$;

-- Los ids son Snowflake generados por el propio script para que la siembra sea
-- reproducible; el ON CONFLICT los ignora si la cámara ya estaba.
INSERT INTO cad_camaras (
    id, unidad, sitio_graba, region, departamento, municipio,
    numero_censo, nombre, direccion, latitud, longitud, coord_calidad,
    tiene_ptz, operativa, activa, censo_periodo, origen, fecha_sync
) VALUES
"""

PIE = """
ON CONFLICT (unidad, municipio, numero_censo, nombre) WHERE origen = 'CENSO'
DO UPDATE SET
    region        = EXCLUDED.region,
    departamento  = EXCLUDED.departamento,
    direccion     = EXCLUDED.direccion,
    latitud       = EXCLUDED.latitud,
    longitud      = EXCLUDED.longitud,
    coord_calidad = EXCLUDED.coord_calidad,
    tiene_ptz     = EXCLUDED.tiene_ptz,
    operativa     = EXCLUDED.operativa,
    censo_periodo = EXCLUDED.censo_periodo,
    fecha_sync    = NOW()
-- Un censo más viejo no pisa uno más nuevo ya cargado.
WHERE cad_camaras.censo_periodo IS NULL
   OR cad_camaras.censo_periodo <= EXCLUDED.censo_periodo;

-- ── Enlazar con el sitio de grabación de este CAD ────────────────────────────
-- La unidad del censo (METUN, MEBOG…) es la misma noción que el sitio de
-- grabación de SECAD, pero el número lo decide cada base. Se resuelve aquí
-- contra el catálogo en vez de clavarlo en el archivo: emparejar por
-- abreviatura, y si no, por el nombre del sitio.
UPDATE cad_camaras c
SET    sitio_graba = s.consecutivo
FROM   cad_sitios_grabacion s
WHERE  c.origen = 'CENSO'
  AND  c.unidad = {unidad}
  AND  c.sitio_graba = 0
  AND  s.vigente = 'S'
  AND  (UPPER(TRIM(s.abreviatura)) = {unidad}
        OR UPPER(TRIM(s.descripcion)) LIKE '%' || {unidad} || '%');

DO $$
DECLARE v_sin INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_sin FROM cad_camaras
    WHERE origen = 'CENSO' AND unidad = {unidad} AND sitio_graba = 0;
    IF v_sin > 0 THEN
        RAISE WARNING 'Quedan % cámaras de % sin sitio de grabación: no habrá quién las vea. '
                      'Cree el sitio con abreviatura % o asigne el consecutivo a mano.',
                      v_sin, {unidad}, {unidad};
    END IF;
END $$;

-- Resumen de lo sembrado.
SELECT unidad, municipio,
       MIN(sitio_graba)                            AS sitio_graba,
       COUNT(*)                                    AS camaras,
       COUNT(*) FILTER (WHERE operativa)           AS operativas,
       COUNT(*) FILTER (WHERE latitud IS NOT NULL) AS con_coordenada,
       COUNT(*) FILTER (WHERE tiene_ptz)           AS ptz
FROM   cad_camaras
WHERE  origen = 'CENSO' AND unidad = {unidad}
GROUP  BY unidad, municipio
ORDER  BY camaras DESC;
"""

def emitir(rows, unidad, sitio_graba=0, base_id=None):
    """SQL de siembra para una unidad policial."""
    sel = [r for r in rows if r['UNIDAD'] == unidad]
    if not sel:
        raise SystemExit(f"La unidad {unidad!r} no aparece en el censo.")

    # Snowflake-like: prefijo fijo por unidad para que regenerar dé los mismos
    # ids y la siembra sea de verdad repetible.
    if base_id is None:
        base_id = 900_000_000_000_000_000 + (abs(hash(unidad)) % 1_000_000) * 100_000

    corte = max((int(r['ANIO']), int(r['MES'])) for r in sel)
    filas = []
    for n, r in enumerate(sorted(sel, key=lambda x: (x['MUNICIPIO'], x['NUMEROCAMARA'], x['NOMBRECAMARA']))):
        cal = 'volteada' if r.get('_swap') else (
              r['_qlat'] if r['_lat'] is not None else 'sin coordenada')
        filas.append('    (' + ', '.join(_sql(x) for x in [
            base_id + n,
            r['UNIDAD'], sitio_graba, r['REGION'], r['DEPARTAMENTO'], r['MUNICIPIO'],
            r['NUMEROCAMARA'], r['NOMBRECAMARA'], (r['DIRECCION'] or '').strip() or None,
            r['_lat'], r['_lon'], cal,
            _ptz(r['NOMBRECAMARA']), r['ESTADOFUNCIONAMIENTO'] == 'SI', True,
            f"{r['ANIO']}-{int(r['MES']):02d}-01", 'CENSO', None,
        ]) + ')')

    cab = CABECERA.format(
        unidad=unidad, corte=f"{corte[0]}-{corte[1]:02d}", n=len(sel),
        operativas=sum(1 for r in sel if r['ESTADOFUNCIONAMIENTO'] == 'SI'),
        municipios=len({r['MUNICIPIO'] for r in sel}))
    return cab + ',\n'.join(filas) + PIE.format(unidad=_sql(unidad))

if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser(description='Normaliza el censo CCTV y emite la siembra.')
    ap.add_argument('csv')
    ap.add_argument('--unidad', help='Unidad policial a emitir (ej. METUN). Sin ella solo informa.')
    ap.add_argument('--sitio-graba', type=int, default=0,
                    help='Sitio de grabación de SECAD al que pertenece esa unidad.')
    a = ap.parse_args()

    rows = vigentes(resolver(cargar(a.csv)))
    if a.unidad:
        print(emitir(rows, a.unidad.upper(), a.sitio_graba))
    else:
        import sys as _s
        con = [r for r in rows if r['_lat'] is not None]
        print(f"cámaras vigentes : {len(rows)}", file=_s.stderr)
        print(f"con coordenada   : {len(con)} ({100*len(con)/len(rows):.1f}%)", file=_s.stderr)
        print(f"operativas       : {sum(1 for r in rows if r['ESTADOFUNCIONAMIENTO']=='SI')}", file=_s.stderr)
        print("\nunidades disponibles:", file=_s.stderr)
        cnt = collections.Counter(r['UNIDAD'] for r in rows)
        for u, c in cnt.most_common():
            print(f"   {u:8} {c:6}", file=_s.stderr)
