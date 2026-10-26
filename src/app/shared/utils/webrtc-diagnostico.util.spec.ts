import { describe, expect, it } from 'vitest';

import { mensajeSinImagen, resumirEstadisticas } from './webrtc-diagnostico.util';

/** Construye un informe como el de getStats(): una lista de entradas con id y type. */
function informe(entradas: Record<string, unknown>[]) {
  return { forEach: (fn: (v: Record<string, unknown>) => void) => entradas.forEach(fn) };
}

const candidatos = (local: string, remoto: string): Record<string, unknown>[] => [
  { id: 'L', type: 'local-candidate', candidateType: local },
  { id: 'R', type: 'remote-candidate', candidateType: remoto },
  { id: 'P', type: 'candidate-pair', localCandidateId: 'L', remoteCandidateId: 'R', nominated: true, state: 'succeeded' },
  { id: 'T', type: 'transport', selectedCandidatePairId: 'P' },
];
const video = (bytes: number, frames: number) =>
  ({ id: 'V', type: 'inbound-rtp', kind: 'video', bytesReceived: bytes, framesDecoded: frames });

describe('resumirEstadisticas', () => {
  it('ruta directa: ningún candidato es relay', () => {
    const r = resumirEstadisticas(informe([...candidatos('host', 'srflx'), video(5000, 40)]));
    expect(r).toMatchObject({ ruta: 'directa', tipoLocal: 'host', tipoRemoto: 'srflx', bytesVideo: 5000, fotogramas: 40 });
  });

  it('ruta por relevo: basta con que UN extremo sea relay', () => {
    expect(resumirEstadisticas(informe(candidatos('relay', 'srflx'))).ruta).toBe('relay');
    expect(resumirEstadisticas(informe(candidatos('srflx', 'relay'))).ruta).toBe('relay');
  });

  it('sin par elegido no hay ruta, y los bytes se siguen contando', () => {
    const r = resumirEstadisticas(informe([video(0, 0)]));
    expect(r).toMatchObject({ ruta: 'sin-ruta', bytesVideo: 0, fotogramas: 0 });
  });

  it('formato de Firefox: el par se marca con selected, sin transport', () => {
    const sinTransport = candidatos('host', 'relay').filter((e) => e['type'] !== 'transport');
    sinTransport.find((e) => e['id'] === 'P')!['selected'] = true;

    expect(resumirEstadisticas(informe(sinTransport)).ruta).toBe('relay');
  });

  it('solo cuenta el video: el audio no suma bytes ni fotogramas', () => {
    const audio = { id: 'A', type: 'inbound-rtp', kind: 'audio', bytesReceived: 99999, framesDecoded: 0 };
    const r = resumirEstadisticas(informe([...candidatos('host', 'host'), audio]));

    expect(r.bytesVideo).toBe(0);
  });

  it('acepta mediaType además de kind (versiones antiguas)', () => {
    const viejo = { id: 'V', type: 'inbound-rtp', mediaType: 'video', bytesReceived: 10, framesDecoded: 1 };
    expect(resumirEstadisticas(informe([...candidatos('host', 'host'), viejo])).bytesVideo).toBe(10);
  });

  it('un informe vacío no revienta', () => {
    expect(resumirEstadisticas(informe([]))).toEqual({ ruta: 'sin-ruta', bytesVideo: 0, fotogramas: 0 });
  });
});

describe('mensajeSinImagen', () => {
  const base = { bytesVideo: 0, fotogramas: 0 } as const;

  it('si la imagen llega no hay mensaje', () => {
    expect(mensajeSinImagen({ ruta: 'relay', bytesVideo: 1000, fotogramas: 30 })).toBeNull();
  });

  it('cada causa lleva su propio texto, que apunta a dónde mirar', () => {
    const sinRuta = mensajeSinImagen({ ...base, ruta: 'sin-ruta' })!;
    const relay = mensajeSinImagen({ ...base, ruta: 'relay' })!;
    const directa = mensajeSinImagen({ ...base, ruta: 'directa' })!;
    const codec = mensajeSinImagen({ ruta: 'directa', bytesVideo: 500, fotogramas: 0 })!;

    expect(sinRuta).toContain('TURN');
    expect(relay).toContain('coturn');
    expect(directa).toContain('cámara');
    expect(codec).toContain('códec');
    expect(new Set([sinRuta, relay, directa, codec]).size).toBe(4);
  });

  it('bytes sin fotogramas NO se da por buena: llega algo pero no se ve', () => {
    expect(mensajeSinImagen({ ruta: 'relay', bytesVideo: 800, fotogramas: 0 })).not.toBeNull();
  });
});
