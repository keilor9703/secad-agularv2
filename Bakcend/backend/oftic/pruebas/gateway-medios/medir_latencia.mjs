// Mide la latencia ABSOLUTA del video por WebRTC en un navegador de verdad.
//
// Método: la fuente lleva un contador binario de 10 bits quemado en la imagen.
// Un lector de referencia lee el mismo stream por RTSP y anota a qué hora llegó
// cada contador —su propio retraso es de ~30 ms, medido—. Entonces:
//
//   latencia = (hora en que el navegador muestra el contador n)
//            - (hora en que el contador n salió de la cámara)
//
// No hace falta OCR ni sincronizar relojes: todo ocurre en la misma máquina y
// los dos números vienen del mismo contador.
import { chromium } from 'playwright-core';
import { writeFileSync, readFileSync } from 'node:fs';

// Rutas y URLs por variable de entorno, con valores por defecto del banco que
// monta montar_banco.sh:
//   BANCO    directorio de trabajo del banco (por defecto /tmp/banco-gateway)
//   WHEP     endpoint WHEP a probar
//   CHROMIUM binario de Chromium
const BANCO    = process.env.BANCO    ?? '/tmp/banco-gateway';
const CHROMIUM = process.env.CHROMIUM
  ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const WHEP = process.env.WHEP ?? 'http://127.0.0.1:8889/cam-1003/whep';
const TK   = readFileSync(`${BANCO}/tokengw.txt`, 'utf8').trim();
const PAG  = `http://127.0.0.1:5630/pagina_whep.html?whep=${encodeURIComponent(WHEP)}&token=${encodeURIComponent(TK)}`;

const navegador = await chromium.launch({
  executablePath: CHROMIUM,
  args: ['--proxy-bypass-list=<-loopback>', '--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
});
const pagina = await navegador.newPage();
pagina.on('console', m => console.log('  [navegador]', m.text()));
await pagina.goto(PAG, { waitUntil: 'load' });

try {
  await pagina.waitForFunction(() => window.__estado?.listoWebrtc, null, { timeout: 45_000 });
} catch {
  console.log('WebRTC no arrancó:', JSON.stringify(await pagina.evaluate(() => window.__estado)));
  await navegador.close(); process.exit(1);
}
console.log('WebRTC reproduciendo. Estabilizando 5 s…');
await pagina.waitForTimeout(5000);

const muestras = [];
for (let i = 0; i < 40; i++) {
  // Se lee el contador y se sella la hora en el MISMO instante, dentro de la
  // página: hacerlo desde Node añadiría el viaje del protocolo de Playwright.
  const m = await pagina.evaluate(() => {
    const n = window.__leer();
    return { n, t: Date.now() / 1000 };
  });
  if (m.n !== null) muestras.push(m);
  await pagina.waitForTimeout(200);
}
const estadisticas = await pagina.evaluate(async () => {
  const s = await window.__metricas();
  const r = {};
  s.forEach(x => {
    if (x.type === 'inbound-rtp' && x.kind === 'video')
      Object.assign(r, {
        fotogramasDecodificados: x.framesDecoded,
        retrasoDelBufer: x.jitterBufferDelay, bufer: x.jitterBufferEmittedCount,
        codec: x.codecId, perdidos: x.packetsLost,
      });
  });
  return r;
});
await navegador.close();
writeFileSync(`${BANCO}/salida/navegador.json`,
  JSON.stringify({ muestras, estadisticas }, null, 1));
console.log(`${muestras.length} muestras del navegador guardadas`);
console.log('estadísticas WebRTC:', JSON.stringify(estadisticas));
