#!/usr/bin/env python3
"""
Lector de referencia: lee el stream RTSP en crudo y anota, para cada fotograma,
el contador binario que trae quemado y la hora de pared en que llegó.

Para qué: da el mapa «contador -> hora real», que es lo que permite convertir el
contador que muestra el navegador en una latencia absoluta. Su propia latencia
—decodificar y entregar un fotograma por RTSP/TCP en local— es la cota de error
de la medición, y son decenas de milisegundos, no segundos.

Lee de la entrada estándar un rawvideo gray de 248x28 (solo la banda del
contador), que es lo que le manda ffmpeg recortado.
"""
import json, sys, time

ANCHO, ALTO, BITS = 248, 28, 10
TAM = ANCHO * ALTO

mapa = []
crudo = sys.stdin.buffer

while True:
    datos = crudo.read(TAM)
    if len(datos) < TAM:
        break
    t = time.time()
    n = 0
    for i in range(BITS):
        # Mismo punto que lee el navegador: centro del recuadro i.
        x, y = i * 24 + 14, 14
        if datos[y * ANCHO + x] > 128:
            n |= (1 << i)
    mapa.append((n, round(t, 4)))
    # Se escribe en CADA fotograma: escribir cada 25 metía hasta un segundo de
    # retraso artificial en el propio mapa de referencia, y ese segundo se
    # confundía con latencia del stream.
    with open(sys.argv[1] + ".tmp", "w") as f:
        json.dump(mapa[-600:], f)
    import os; os.replace(sys.argv[1] + ".tmp", sys.argv[1])
