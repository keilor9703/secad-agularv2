/**
 * Diagnóstico de una videollamada «conectada» donde no llega imagen.
 *
 * El estado de la conexión pasa a `connected` cuando el ICE encuentra una ruta,
 * y eso NO garantiza que fluya video: la cámara del ciudadano puede no haber
 * arrancado, el relevo TURN puede no estar entregando, o el códec no
 * decodificarse. En los tres casos el operador ve un rectángulo negro y nadie
 * sabe por dónde empezar. Esto lo traduce a una frase.
 */

export type RutaDeMedios = 'relay' | 'directa' | 'sin-ruta';

export interface ResumenMedios {
  ruta: RutaDeMedios;
  /** Tipo del candidato local y remoto de la ruta elegida (host, srflx, relay…). */
  tipoLocal?: string;
  tipoRemoto?: string;
  bytesVideo: number;
  fotogramas: number;
}

/** Lo mínimo de un RTCStatsReport que se usa; acepta también un Map de prueba. */
export interface InformeEstadisticas {
  forEach(fn: (valor: Record<string, unknown>) => void): void;
}

export function resumirEstadisticas(informe: InformeEstadisticas): ResumenMedios {
  const porId = new Map<string, Record<string, unknown>>();
  const pares: Record<string, unknown>[] = [];
  let transporteSeleccionado: string | undefined;
  let bytesVideo = 0;
  let fotogramas = 0;

  informe.forEach((s) => {
    if (typeof s['id'] === 'string') porId.set(s['id'], s);

    switch (s['type']) {
      case 'transport':
        if (typeof s['selectedCandidatePairId'] === 'string') transporteSeleccionado = s['selectedCandidatePairId'];
        break;
      case 'candidate-pair':
        pares.push(s);
        break;
      case 'inbound-rtp': {
        const esVideo = s['kind'] === 'video' || s['mediaType'] === 'video';
        if (esVideo) {
          bytesVideo += Number(s['bytesReceived'] ?? 0);
          fotogramas += Number(s['framesDecoded'] ?? 0);
        }
        break;
      }
    }
  });

  // Chrome lo declara en `transport`; Firefox marca el par con `selected` o
  // `nominated`. Se prueban las dos formas antes de rendirse.
  const elegido =
    (transporteSeleccionado ? porId.get(transporteSeleccionado) : undefined) ??
    pares.find((p) => p['selected'] === true) ??
    pares.find((p) => p['nominated'] === true && p['state'] === 'succeeded');

  if (!elegido) return { ruta: 'sin-ruta', bytesVideo, fotogramas };

  const tipoLocal = tipoDeCandidato(porId, elegido['localCandidateId']);
  const tipoRemoto = tipoDeCandidato(porId, elegido['remoteCandidateId']);
  const ruta: RutaDeMedios = tipoLocal === 'relay' || tipoRemoto === 'relay' ? 'relay' : 'directa';

  return { ruta, tipoLocal, tipoRemoto, bytesVideo, fotogramas };
}

function tipoDeCandidato(porId: Map<string, Record<string, unknown>>, id: unknown): string | undefined {
  const candidato = typeof id === 'string' ? porId.get(id) : undefined;
  const tipo = candidato?.['candidateType'];
  return typeof tipo === 'string' ? tipo : undefined;
}

/**
 * La frase para el operador, o `null` si la imagen sí está llegando.
 * Cada texto apunta al sitio donde mirar, no solo a «falló».
 */
export function mensajeSinImagen(r: ResumenMedios): string | null {
  if (r.bytesVideo > 0 && r.fotogramas > 0) return null;

  if (r.ruta === 'sin-ruta') {
    return 'La videollamada conectó, pero no se pudo establecer una ruta de medios. ' +
      'Casi siempre es el servidor TURN caído o con cerrados los puertos UDP 3478 y los de relevo.';
  }
  if (r.bytesVideo > 0) {
    return 'Llegan datos de video pero no se decodifican. Es un problema de códec del navegador: ' +
      'pruebe con otro navegador.';
  }
  if (r.ruta === 'relay') {
    return 'Los medios van por el relevo TURN, pero no llega imagen. Revise que coturn tenga abiertos ' +
      'los puertos de relevo y que su secreto coincida con el de la API.';
  }
  return 'La ruta de medios es directa, pero no llega imagen. Pídale al ciudadano que recargue el ' +
    'enlace y confirme que permitió la cámara, o que pruebe desde otra red.';
}
