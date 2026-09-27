// Prueba de extremo a extremo de la ruta de baja latencia:
//
//   navegador (whep.ts de producción) → MediaMTX real → SECAD real → PostgreSQL
//
// Lo que se comprueba, y es lo que no se puede comprobar leyendo el código:
//   1. Con el token que emite SECAD, el video llega y se decodifica.
//   2. SIN token, MediaMTX no sirve el video —porque SECAD le dice que no—.
//   3. Con un token de OTRA cámara tampoco.
// El (2) y el (3) son el control de acceso: sin ellos, cualquiera que alcance
// el puerto del gateway vería cualquier cámara.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

// Rutas y URLs por variable de entorno, con valores por defecto del banco que
// monta montar_banco.sh:
//   BANCO    directorio de trabajo del banco (por defecto /tmp/banco-gateway)
//   WHEP     endpoint WHEP a probar
//   CHROMIUM binario de Chromium
const BANCO    = process.env.BANCO    ?? '/tmp/banco-gateway';
const CHROMIUM = process.env.CHROMIUM
  ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const token = readFileSync(`${BANCO}/tokengw.txt`, 'utf8').trim();
const WHEP  = process.env.WHEP ?? 'http://127.0.0.1:8889/cam-1003/whep';

const navegador = await chromium.launch({
  executablePath: CHROMIUM,
  args: ['--proxy-bypass-list=<-loopback>', '--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
});

const fallos = [];
const afirmar = (ok, q) => { console.log(`  ${ok ? '✓' : '✗'} ${q}`); if (!ok) fallos.push(q); };

async function intentar(nombre, tk) {
  const pagina = await navegador.newPage();
  const url = `http://127.0.0.1:5630/pagina_whep.html?whep=${encodeURIComponent(WHEP)}`
            + (tk ? `&token=${encodeURIComponent(tk)}` : '');
  await pagina.goto(url, { waitUntil: 'load' });
  let listo = false;
  try {
    await pagina.waitForFunction(() => window.__estado?.listoWebrtc, null, { timeout: 20_000 });
    listo = true;
  } catch { /* no arrancó: es un resultado, no un error */ }
  const estado = await pagina.evaluate(() => window.__estado);
  let metricas = null;
  if (listo) {
    // Se deja correr un par de segundos: medir en el instante en que arranca
    // solo contaría el primer fotograma, y lo que interesa es que el video
    // SIGA llegando.
    await pagina.waitForTimeout(2500);
    metricas = await pagina.evaluate(async () => {
      const s = await window.__metricas(); const r = {};
      s.forEach(x => { if (x.type === 'inbound-rtp' && x.kind === 'video')
        Object.assign(r, { fotogramas: x.framesDecoded, perdidos: x.packetsLost }); });
      return r;
    });
  }
  await pagina.close();
  return { nombre, listo, estado, metricas };
}

console.log('1) Con el token que emitió SECAD');
const conToken = await intentar('con token', token);
afirmar(conToken.listo, `el video llega y se reproduce${conToken.listo ? '' : ' — ' + JSON.stringify(conToken.estado)}`);
if (conToken.metricas)
  afirmar((conToken.metricas.fotogramas ?? 0) > 10,
    `se decodificaron ${conToken.metricas.fotogramas} fotogramas, ${conToken.metricas.perdidos} perdidos`);

console.log('\n2) Sin token: el gateway tiene que negarse');
const sinToken = await intentar('sin token', null);
afirmar(!sinToken.listo, `no se sirve video sin autorización de SECAD`);
afirmar(/rechaz|autoriza/i.test(sinToken.estado?.error ?? ''),
  `y el motivo se dice claro: «${sinToken.estado?.error ?? '(ninguno)'}»`);

console.log('\n3) Con un token válido pero de OTRA cámara');
const otra = await intentar('otra cámara', readFileSync(`${BANCO}/tokenotra.txt`, 'utf8').trim());
afirmar(!otra.listo, 'un token de otra cámara no sirve para esta');

await navegador.close();
console.log(fallos.length === 0
  ? '\n────────── TODO EN VERDE ──────────'
  : `\n────────── ${fallos.length} FALLO(S) ──────────\n  - ` + fallos.join('\n  - '));
process.exit(fallos.length === 0 ? 0 : 1);
