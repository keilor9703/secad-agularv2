import { HttpClient } from '@angular/common/http';
import * as signalR from '@microsoft/signalr';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { environment } from '../../../../environments/environment';
import { ICE_RESPALDO } from '../../../shared/utils/webrtc-ice.util';
import { VideoLlamadaService } from './video-llamada.service';

/**
 * EL CABLE: que el servicio de verdad use lo que entrega la API.
 *
 * webrtc-ice.util.spec.ts prueba la conversión, pero nada impediría que el
 * servicio dejara de llamarla y la videollamada siguiera abriendo… solo con
 * STUN, que es justo la avería que esto vino a resolver y que no se ve en una
 * red WiFi: falla únicamente en datos móviles.
 */
describe('VideoLlamadaService — servidores ICE', () => {
  const turn = { urls: ['turn:turn.ejemplo.test:3478'], username: '1700003600:despachador1', credential: 'abc=' };
  const stun = { urls: ['stun:stun.ejemplo.test:3478'] };

  let configuraciones: RTCConfiguration[];

  /** Prepara el entorno de navegador que jsdom no trae y devuelve el servicio. */
  function armar(get: (url: string) => unknown): { servicio: VideoLlamadaService; pedidos: string[] } {
    configuraciones = [];
    const pedidos: string[] = [];

    class ConexionFalsa {
      constructor(config: RTCConfiguration) { configuraciones.push(config); }
      close(): void { /* nada */ }
    }
    vi.stubGlobal('RTCPeerConnection', ConexionFalsa);

    const hubFalso = {
      on: () => undefined,
      start: async () => undefined,
      invoke: async () => undefined,
      stop: async () => undefined,
    };
    vi.spyOn(signalR.HubConnectionBuilder.prototype, 'build').mockReturnValue(hubFalso as never);

    const http = { get: (url: string) => { pedidos.push(url); return get(url); } } as unknown as HttpClient;
    const servicio = new VideoLlamadaService(http, { getToken: () => 'jwt' } as never);
    return { servicio, pedidos };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('pide los servidores a la API y se los entrega a la conexión', async () => {
    const { servicio, pedidos } = armar(() => of([stun, turn]));

    await servicio.iniciar('7');

    expect(pedidos).toEqual([`${environment.apiBaseUrl}/VideoLlamada/ice`]);
    expect(configuraciones).toHaveLength(1);
    expect(configuraciones[0].iceServers).toEqual([stun, turn]);
  });

  it('si la API falla la llamada igual se prepara, con el STUN de respaldo', async () => {
    const { servicio } = armar(() => throwError(() => new Error('500')));

    await servicio.iniciar('7');

    expect(configuraciones).toHaveLength(1);
    expect(configuraciones[0].iceServers).toEqual([...ICE_RESPALDO]);
  });

  it('al reconectar vuelve a pedirlos: las credenciales caducan', async () => {
    const { servicio, pedidos } = armar(() => of([stun, turn]));
    // reconectar() negocia una oferta real; aquí solo importa qué ICE se usó.
    (servicio as unknown as { crearOferta: () => Promise<void> }).crearOferta = async () => undefined;

    await servicio.iniciar('7');
    await servicio.reconectar('7');

    expect(pedidos).toHaveLength(2);
    expect(configuraciones).toHaveLength(2);
  });
});
