#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Junta lo que midió el navegador con el mapa del lector de referencia y saca la
latencia.

  latencia = hora en que el navegador MOSTRÓ el contador n
           - hora en que el contador n LLEGÓ al lector de referencia

Los dos números salen del mismo contador quemado en la imagen y de la misma
máquina, así que no hay que sincronizar relojes ni leer texto con OCR.
"""
import json, os, statistics, sys

BANCO = os.environ.get("BANCO", "/tmp/banco-gateway")
SALIDA = os.path.join(BANCO, "salida")

nav = json.load(open(os.path.join(SALIDA, "navegador.json")))
mapa = dict(json.load(open(os.path.join(SALIDA, "mapa.json"))))

lat = sorted((m["t"] - mapa[m["n"]]) * 1000 for m in nav["muestras"] if m["n"] in mapa)
print(f'emparejadas {len(lat)}/{len(nav["muestras"])}')
if not lat:
    print("Sin coincidencias: el mapa de referencia no cubre esos contadores.")
    sys.exit(1)

print(f"  mediana {statistics.median(lat):+.0f} ms")
print(f"  media   {statistics.mean(lat):+.0f} ms")
print(f"  rango   {lat[0]:+.0f} a {lat[-1]:+.0f} ms")
e = nav["estadisticas"]
if e.get("bufer"):
    print(f'  bufer de jitter: {e["retrasoDelBufer"] / e["bufer"] * 1000:.0f} ms/fotograma')
print(f'  fotogramas {e.get("fotogramasDecodificados")}, perdidos {e.get("perdidos")}')
print("\nPositivo = el navegador va DETRÁS del lector de referencia.")
