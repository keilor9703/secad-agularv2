import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ICE_RESPALDO } from '../../../../shared/utils/webrtc-ice.util';
import { VideoCiudadanoPageComponent } from './video-ciudadano-page.component';

/**
 * EL CABLE DEL LADO DEL CIUDADANO.
 *
 * Es el lado que se usa desde un celular, en datos móviles, que es justo
 * donde hace falta TURN. Si esta página dejara de usar lo que entrega la API,
 * la llamada seguiría abriendo en WiFi y fallaría solo en la calle, donde
 * nadie la prueba.
 */
describe('VideoCiudadanoPageComponent — servidores ICE', () => {
  const stun = { urls: ['stun:stun.ejemplo.test:3478'] };
  const turn = { urls: ['turn:turn.ejemplo.test:3478'], username: '1700003600:ciudadano-7', credential: 'abc=' };

  let configuraciones: RTCConfiguration[];

  /** Monta el componente con la respuesta que la API daría al validar el enlace. */
  function montar(respuesta: unknown): VideoCiudadanoPageComponent {
    configuraciones = [];
    class ConexionFalsa {
      constructor(config: RTCConfiguration) { configuraciones.push(config); }
      close(): void { /* nada */ }
    }
    vi.stubGlobal('RTCPeerConnection', ConexionFalsa);

    TestBed.configureTestingModule({
      providers: [
        { provide: HttpClient, useValue: { get: () => of(respuesta) } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'token-de-prueba' } } } },
      ],
    });

    const componente = TestBed.createComponent(VideoCiudadanoPageComponent).componentInstance;
    // No se piden cámara ni micrófono: en esta prueba solo importa el ICE.
    (componente as unknown as { pedirPermisos: () => Promise<void> }).pedirPermisos = async () => undefined;
    return componente;
  }

  function crearConexion(componente: VideoCiudadanoPageComponent): void {
    (componente as unknown as { prepararPeerConnection: () => void }).prepararPeerConnection();
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('usa los servidores que entrega la API al validar el enlace', () => {
    const componente = montar({ valido: true, estado: 'PENDIENTE', mensaje: '', sesionId: '7', iceServers: [stun, turn] });

    componente.ngOnInit();
    crearConexion(componente);

    expect(configuraciones).toHaveLength(1);
    expect(configuraciones[0].iceServers).toEqual([stun, turn]);
  });

  it('si la API no entrega servidores, se queda con el STUN de respaldo', () => {
    const componente = montar({ valido: true, estado: 'PENDIENTE', mensaje: '', sesionId: '7' });

    componente.ngOnInit();
    crearConexion(componente);

    expect(configuraciones[0].iceServers).toEqual([...ICE_RESPALDO]);
  });

  it('un TURN sin credenciales no llega a la conexión, que fallaría al crearse', () => {
    const componente = montar({
      valido: true, estado: 'PENDIENTE', mensaje: '', sesionId: '7',
      iceServers: [stun, { urls: ['turn:turn.ejemplo.test:3478'] }],
    });

    componente.ngOnInit();
    crearConexion(componente);

    expect(configuraciones[0].iceServers).toEqual([stun]);
  });
});
