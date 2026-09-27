#!/bin/bash
# Monta el banco de pruebas del gateway de medios: una «cámara» falsa con un
# contador quemado en la imagen, MediaMTX de verdad, y la autorización delegada
# a la API de SECAD.
#
# Ver README.md para qué mide cada cosa y qué se encontró con esto.
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
TRABAJO="${1:-/tmp/banco-gateway}"
API="${API_SECAD:-http://127.0.0.1:5224}"

mkdir -p "$TRABAJO/salida"
cp "$AQUI/referencia.py" "$AQUI/pagina_whep.html" "$TRABAJO/"
sed "s|http://127.0.0.1:5224|$API|" "$AQUI/mediamtx.prueba.yml" > "$TRABAJO/mediamtx.yml"

echo "── MediaMTX ──"
docker rm -f mtx-prueba >/dev/null 2>&1 || true
docker run -d --name mtx-prueba --network host \
  -v "$TRABAJO/mediamtx.yml:/mediamtx.yml:ro" \
  bluenviron/mediamtx:latest-ffmpeg >/dev/null
sleep 3

echo "── Ruta del origen (hace de cámara) ──"
for ruta in origen origen-vp8; do
  curl -sS -o /dev/null -X POST "http://127.0.0.1:9997/v3/config/paths/add/$ruta" \
    -H 'Content-Type: application/json' -d '{}' || true
done

echo "── Cámara falsa: contador binario de 10 bits, H264 y VP8 ──"
# El contador es lo que permite medir latencia sin OCR y sin sincronizar
# relojes: el navegador lee los mismos 10 recuadros que el lector de referencia.
FILTRO="$(cat "$AQUI/filtro_contador.txt")"
docker rm -f camara-prueba >/dev/null 2>&1 || true
docker run -d --restart unless-stopped --name camara-prueba --network host --entrypoint ffmpeg \
  bluenviron/mediamtx:latest-ffmpeg \
  -re -f lavfi -i "testsrc2=size=640x360:rate=25" \
  -filter_complex "[0:v]$FILTRO,split=2[a][b]" \
  -map "[a]" -c:v libx264 -preset ultrafast -tune zerolatency -g 25 -pix_fmt yuv420p \
    -f rtsp -rtsp_transport tcp rtsp://127.0.0.1:8554/origen \
  -map "[b]" -c:v libvpx -deadline realtime -cpu-used 8 -g 25 -b:v 1500k -pix_fmt yuv420p \
    -f rtsp -rtsp_transport tcp rtsp://127.0.0.1:8554/origen-vp8 >/dev/null
sleep 6

echo "── Lector de referencia ──"
cat > "$TRABAJO/referencia.sh" <<FIN
#!/bin/bash
docker run --rm --name referencia-prueba --network host --entrypoint ffmpeg \\
  bluenviron/mediamtx:latest-ffmpeg \\
  -fflags nobuffer -flags low_delay -rtsp_transport tcp -i rtsp://127.0.0.1:8554/origen-vp8 \\
  -vf crop=248:28:0:0,format=gray -f rawvideo - 2>/dev/null \\
  | python3 $TRABAJO/referencia.py $TRABAJO/salida/mapa.json
FIN
chmod +x "$TRABAJO/referencia.sh"
docker rm -f referencia-prueba >/dev/null 2>&1 || true
setsid nohup "$TRABAJO/referencia.sh" > "$TRABAJO/referencia.log" 2>&1 < /dev/null &
sleep 6

echo "── Cliente WHEP: se compila el MÓDULO DEL REPO ──"
# Se empaqueta whep.ts tal cual está en src/, no una copia: la prueba tiene que
# ejercitar el código que va a producción. Si se copiara a mano, podría divergir
# y la prueba seguiría pasando mientras el visor está roto.
RAIZ="$(cd "$AQUI/../../../../.." && pwd)"
if [ -f "$RAIZ/src/app/features/operacion/components/camara-visor/whep.ts" ]; then
  (cd "$RAIZ" && npx esbuild \
    src/app/features/operacion/components/camara-visor/whep.ts \
    --bundle --format=esm --outfile="$TRABAJO/whep.js" >/dev/null)
  echo "  whep.js compilado desde src/"
else
  echo "  ¡ojo! no se encontró whep.ts en $RAIZ; la página no va a cargar"
fi

echo "── Servidor de la página ──"
setsid nohup python3 -m http.server 5630 --bind 127.0.0.1 --directory "$TRABAJO" \
  > "$TRABAJO/servidor.log" 2>&1 < /dev/null &
sleep 2

echo
echo "Banco montado en $TRABAJO"
docker logs mtx-prueba 2>&1 | grep -E "available and online" || echo "  (aún sin stream: revise docker logs camara-prueba)"
echo
echo "Siguiente paso: registre en SECAD una integración con"
echo "  protocol      = rtsp_s"
echo "  gatewayUrl    = http://127.0.0.1:8889"
echo "  gatewayApiUrl = http://127.0.0.1:9997"
echo "y apunte una cámara al RTSP del simulador:"
echo "  python3 scripts/hikcentral_simulador.py --puerto 5610 \\"
echo "    --rtsp-destino rtsp://127.0.0.1:8554/origen-vp8"
