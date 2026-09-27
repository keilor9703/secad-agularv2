// ─────────────────────────────────────────────────────────────────────────────
// Cliente WHEP: video en vivo por WebRTC desde el gateway del nodo edge.
//
// ── Por qué esta ruta y no el jsDecoder de Hikvision ────────────────────────
// El HLS de HikCentral llega con ~7 s de retraso, y con el PTZ eso deja de ser
// una molestia: el operador corrige contra una imagen vieja y se pasa de largo.
// De las dos formas de bajarlo, esta no exige instalar nada en los puestos, no
// ata el despacho a Windows y no depende de un SDK propietario: WHEP es un
// estándar (draft del IETF, ya interoperable) y el gateway —MediaMTX— es
// software libre que corre en el nodo edge que de todos modos hay que poner.
// Ver docs/Documentacion/CCTV_LATENCIA.md.
//
// ── El protocolo, que es sorprendentemente pequeño ──────────────────────────
// 1. El navegador crea una RTCPeerConnection que solo RECIBE.
// 2. Genera una oferta SDP y la manda por POST al endpoint WHEP, con
//    Content-Type application/sdp.
// 3. El servidor responde 201 con la respuesta SDP en el cuerpo.
// 4. Se aplica la respuesta y el video empieza a llegar.
//
// No hace falta librería: son unas cuantas llamadas de la API del navegador.
// Por eso este archivo no tiene dependencias, ni de Angular: así la prueba de
// latencia puede ejercitar EXACTAMENTE este código en un navegador de verdad,
// en vez de una copia que podría divergir.
// ─────────────────────────────────────────────────────────────────────────────

export interface OpcionesWhep {
  /** Endpoint WHEP del gateway, tal como lo entrega el backend. */
  url: string;
  /** Token que autoriza la lectura; el gateway lo valida contra SECAD. */
  token?: string | null;
  /** <video> donde se pinta. */
  video: HTMLVideoElement;
  /** Se llama con el motivo cuando la conexión se cae o no se puede abrir. */
  alFallar?: (motivo: string) => void;
}

export interface SesionWhep {
  /** Cierra la conexión y suelta el <video>. */
  destruir(): void;
  /** Último estado de la conexión, para diagnóstico. */
  estado(): string;
  /**
   * Métricas de la conexión. Sirve para diagnosticar «el video se ve mal» en un
   * municipio concreto: dice si llegan fotogramas, cuántos se pierden y cuánto
   * está reteniendo el búfer, que son cosas distintas con arreglos distintos.
   */
  metricas(): Promise<RTCStatsReport>;
}

/** Espera máxima para el intercambio SDP. Un edge caído no debe colgar el visor. */
const TIMEOUT_MS = 12_000;

/**
 * Abre el stream. La promesa se resuelve cuando el gateway acepta la oferta;
 * que lleguen fotogramas es un paso posterior y lo avisa el propio <video>.
 */
export async function conectar(o: OpcionesWhep): Promise<SesionWhep> {
  const pc = new RTCPeerConnection({
    // Sin STUN/TURN: el navegador del despachador y el gateway están en la
    // misma red de la sede. Meter un STUN público aquí solo añadiría una
    // consulta a Internet que en la red de la Policía no va a salir.
    iceServers: [],
    bundlePolicy: 'max-bundle',
  });

  // Solo recepción: el despachador no publica nada.
  pc.addTransceiver('video', { direction: 'recvonly' });
  pc.addTransceiver('audio', { direction: 'recvonly' });

  const flujo = new MediaStream();
  pc.addEventListener('track', ev => {
    flujo.addTrack(ev.track);
    // Se reasigna en cada pista: con audio y video llegan dos eventos y el
    // <video> tiene que quedarse con el MediaStream que ya tiene las dos.
    o.video.srcObject = flujo;
    o.video.play().catch(() => { /* el navegador puede exigir un gesto */ });
  });

  pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected')
      o.alFallar?.('Se perdió la conexión con el servidor de video del municipio.');
  });

  const oferta = await pc.createOffer();
  await pc.setLocalDescription(oferta);

  // Se espera a que ICE termine de reunir candidatos antes de mandar la oferta.
  // Es el modo «vanilla ICE» de WHEP: una sola petición, sin trickle. Con una
  // red local los candidatos salen en milisegundos, y así no hay que mantener
  // un canal para ir mandándolos después.
  await esperarIce(pc);

  const cabeceras: Record<string, string> = { 'Content-Type': 'application/sdp' };
  if (o.token) cabeceras['Authorization'] = `Bearer ${o.token}`;

  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), TIMEOUT_MS);
  let respuesta: Response;
  try {
    respuesta = await fetch(o.url, {
      method: 'POST',
      headers: cabeceras,
      body: pc.localDescription?.sdp ?? oferta.sdp ?? '',
      signal: corte.signal,
    });
  } catch (e) {
    pc.close();
    throw new Error(
      (e as Error)?.name === 'AbortError'
        ? 'El servidor de video del municipio no respondió.'
        : 'No se pudo contactar el servidor de video del municipio.');
  } finally {
    clearTimeout(reloj);
  }

  if (!respuesta.ok) {
    pc.close();
    // 401/403 es lo que devuelve el gateway cuando SECAD le dice que no: es un
    // caso distinto de «el gateway está caído» y conviene no confundirlos.
    if (respuesta.status === 401 || respuesta.status === 403)
      throw new Error('El servidor de video rechazó la autorización de esta cámara.');

    // El motivo del gateway va en el cuerpo. Se incluye porque sin él un 400 no
    // dice nada: puede ser el códec, la oferta o la ruta, y son arreglos
    // distintos. Se recorta para que no acabe un SDP entero en la pantalla.
    const detalle = await respuesta.text().catch(() => '');
    throw new Error(
      `El servidor de video respondió ${respuesta.status}.` +
      (detalle ? ` ${detalle.slice(0, 200)}` : ''));
  }

  const sdp = await respuesta.text();
  await pc.setRemoteDescription({ type: 'answer', sdp });

  return {
    destruir() {
      try { pc.close(); } catch { /* ya cerrada */ }
      try { o.video.srcObject = null; } catch { /* nada que soltar */ }
    },
    estado: () => pc.connectionState,
    metricas: () => pc.getStats(),
  };
}

/**
 * Espera a que ICE acabe de reunir candidatos, con tope. El tope importa: si un
 * candidato se queda colgado, sin él el visor no abriría nunca, y con lo que ya
 * se reunió normalmente basta en una red local.
 */
function esperarIce(pc: RTCPeerConnection, topeMs = 1500): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise<void>(resolver => {
    const fin = () => {
      pc.removeEventListener('icegatheringstatechange', alCambiar);
      clearTimeout(reloj);
      resolver();
    };
    const alCambiar = () => { if (pc.iceGatheringState === 'complete') fin(); };
    const reloj = setTimeout(fin, topeMs);
    pc.addEventListener('icegatheringstatechange', alCambiar);
  });
}
