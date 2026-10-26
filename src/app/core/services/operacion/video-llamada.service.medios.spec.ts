import { HttpClient } from '@angular/common/http';
import * as signalR from '@microsoft/signalr';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ESPERA_MEDIOS_MS, VideoLlamadaService } from './video-llamada.service';

/**
 * EL CABLE de la videollamada en negro: candidatos tempranos, pista sin stream
 * y aviso cuando «conecta» pero no llega imagen.
 */
describe('VideoLlamadaService — medios', () => {
  let manejadores: Record<string, (...a: any[]) => Promise<void> | void>;
  let pc: any;
  let aplicados: unknown[];
  let estadisticas: Record<string, unknown>[];

  function armar() {
    manejadores = {};
    aplicados = [];
    estadisticas = [];
    class ConexionFalsa {
      remoteDescription: unknown = null;
      ontrack: ((e: unknown) => void) | null = null;
      onicecandidate = null;
      onconnectionstatechange = null;
      connectionState = 'new';
      constructor() { pc = this; }
      close(): void { /* nada */ }
      async setRemoteDescription(d: unknown) { this.remoteDescription = d; }
      async addIceCandidate(c: unknown) {
        if (!this.remoteDescription) throw new DOMException('x', 'InvalidStateError');
        aplicados.push(c);
      }
      async getStats() { return { forEach: (fn: (v: unknown) => void) => estadisticas.forEach(fn) }; }
    }
    class FlujoFalso {
      pistas: unknown[] = [];
      addTrack(t: unknown) { this.pistas.push(t); }
      getTracks() { return this.pistas; }
    }
    vi.stubGlobal('RTCPeerConnection', ConexionFalsa);
    vi.stubGlobal('MediaStream', FlujoFalso);
    const hub = {
      on: (n: string, f: (...a: any[]) => void) => { manejadores[n] = f; },
      start: async () => undefined,
      invoke: async () => undefined,
      stop: async () => undefined,
    };
    vi.spyOn(signalR.HubConnectionBuilder.prototype, 'build').mockReturnValue(hub as never);
    const http = { get: () => of([]) } as unknown as HttpClient;
    return new VideoLlamadaService(http, { getToken: () => 'jwt' } as never);
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('un candidato que llega antes de la respuesta se aplica después, no se pierde', async () => {
    const s = armar();
    await s.iniciar('7');

    await manejadores['ice-candidate'](JSON.stringify({ candidate: 'candidate:1' }));
    expect(aplicados).toHaveLength(0);

    await manejadores['answer']('sdp');
    expect(aplicados).toEqual([{ candidate: 'candidate:1' }]);
  });

  it('una pista sin stream asociado igual llega al <video>', async () => {
    const s = armar();
    await s.iniciar('7');
    let flujo: any = null;
    s.remoteStream$.subscribe((v) => (flujo = v));

    const pista = { kind: 'video' };
    pc.ontrack({ track: pista, streams: [] });

    expect(flujo).not.toBeNull();
    expect(flujo.getTracks()).toEqual([pista]);
  });

  it('conecta pero sin imagen: avisa al operador pasados los segundos de espera', async () => {
    vi.useFakeTimers();
    const s = armar();
    await s.iniciar('7');
    let error = '';
    s.error$.subscribe((v) => (error = v));
    vi.spyOn(console, 'info').mockImplementation(() => undefined);

    pc.ontrack({ track: {}, streams: [] });
    await vi.advanceTimersByTimeAsync(ESPERA_MEDIOS_MS - 1);
    expect(error).toBe('');

    await vi.advanceTimersByTimeAsync(2);
    expect(error).toContain('no se pudo establecer una ruta de medios');
  });

  it('si la imagen sí llega, no avisa nada', async () => {
    vi.useFakeTimers();
    const s = armar();
    await s.iniciar('7');
    let error = '';
    s.error$.subscribe((v) => (error = v));
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    estadisticas.push({ id: 'V', type: 'inbound-rtp', kind: 'video', bytesReceived: 9000, framesDecoded: 50 });

    pc.ontrack({ track: {}, streams: [] });
    await vi.advanceTimersByTimeAsync(ESPERA_MEDIOS_MS + 10);

    expect(error).toBe('');
  });
});
