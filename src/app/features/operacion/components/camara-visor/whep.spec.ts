// Contrato del cliente WHEP. Lo que se comprueba aquí es lo que un navegador de
// pruebas sí puede comprobar: que la petición sale como manda el protocolo y que
// cada fallo se traduce a algo que el operador pueda accionar.
//
// Que el video LLEGUE se comprueba aparte, contra un MediaMTX de verdad:
// Bakcend/backend/oftic/pruebas/gateway-medios/. Las dos cosas hacen falta —una
// prueba con todo simulado no habría detectado, por ejemplo, que el gateway
// pregunta la autorización a SECAD antes de negociar—.
import { conectar } from './whep';

/** RTCPeerConnection mínima: registra lo que le piden y no abre nada. */
class PeerFalsa {
  static ultima: PeerFalsa | null = null;
  transceptores: string[] = [];
  descripcionRemota: RTCSessionDescriptionInit | null = null;
  cerrada = false;
  connectionState = 'connected';
  iceGatheringState = 'complete';
  localDescription = { sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n', type: 'offer' };
  private oyentes: Record<string, Array<(e: unknown) => void>> = {};

  constructor(public config: RTCConfiguration) { PeerFalsa.ultima = this; }
  addTransceiver(tipo: string, _o: unknown) { this.transceptores.push(tipo); }
  addEventListener(n: string, f: (e: unknown) => void) { (this.oyentes[n] ??= []).push(f); }
  removeEventListener() { /* nada */ }
  createOffer() { return Promise.resolve(this.localDescription); }
  setLocalDescription() { return Promise.resolve(); }
  setRemoteDescription(d: RTCSessionDescriptionInit) { this.descripcionRemota = d; return Promise.resolve(); }
  getStats() { return Promise.resolve(new Map() as unknown as RTCStatsReport); }
  close() { this.cerrada = true; }
  disparar(n: string, e: unknown) { (this.oyentes[n] ?? []).forEach(f => f(e)); }
}

describe('cliente WHEP', () => {
  let peticiones: Array<{ url: string; init: RequestInit }>;
  const original = { pc: globalThis.RTCPeerConnection, fetch: globalThis.fetch };

  const responder = (estado: number, cuerpo = 'v=0\r\ns=respuesta\r\n') => {
    globalThis.fetch = ((url: string, init: RequestInit) => {
      peticiones.push({ url, init });
      return Promise.resolve(new Response(cuerpo, { status: estado }));
    }) as typeof fetch;
  };

  const video = () => ({ play: () => Promise.resolve(), srcObject: null }) as unknown as HTMLVideoElement;

  beforeEach(() => {
    peticiones = [];
    (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection = PeerFalsa as unknown;
    (globalThis as { MediaStream?: unknown }).MediaStream = class { addTrack() {} } as unknown;
  });

  afterEach(() => {
    globalThis.RTCPeerConnection = original.pc;
    globalThis.fetch = original.fetch;
  });

  it('manda la oferta como SDP y solo pide recibir', async () => {
    responder(201);
    await conectar({ url: 'http://gw/cam-1/whep', video: video() });

    expect(peticiones.length).toBe(1);
    const { url, init } = peticiones[0];
    expect(url).toBe('http://gw/cam-1/whep');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/sdp');
    // El despachador nunca publica: si se pidiera enviar, el navegador pediría
    // permiso de cámara y micrófono al operador.
    expect(PeerFalsa.ultima!.transceptores).toEqual(['video', 'audio']);
  });

  it('lleva el token que autoriza la lectura', async () => {
    responder(201);
    await conectar({ url: 'http://gw/cam-1/whep', token: 'abc.def', video: video() });
    expect((peticiones[0].init.headers as Record<string, string>)['Authorization'])
      .toBe('Bearer abc.def');
  });

  it('aplica la respuesta del gateway', async () => {
    responder(201, 'v=0\r\ns=contestada\r\n');
    await conectar({ url: 'http://gw/cam-1/whep', video: video() });
    expect(PeerFalsa.ultima!.descripcionRemota?.type).toBe('answer');
    expect(PeerFalsa.ultima!.descripcionRemota?.sdp).toContain('contestada');
  });

  it('un 403 se cuenta como problema de autorización, no como caída', async () => {
    responder(403, 'no');
    await expect(conectar({ url: 'http://gw/cam-1/whep', video: video() }))
      .rejects.toThrow(/autorizaci/i);
    // Y no se deja una conexión colgando.
    expect(PeerFalsa.ultima!.cerrada).toBe(true);
  });

  it('otro error incluye el motivo que dio el gateway', async () => {
    // Sin el cuerpo, un 400 no dice nada: puede ser el códec, la oferta o la
    // ruta, y son arreglos distintos.
    responder(400, '{"error":"source of path \'cam-1\' has timed out"}');
    await expect(conectar({ url: 'http://gw/cam-1/whep', video: video() }))
      .rejects.toThrow(/timed out/);
  });

  it('si la conexión se cae después, se avisa', async () => {
    responder(201);
    let aviso = '';
    await conectar({ url: 'http://gw/cam-1/whep', video: video(), alFallar: m => (aviso = m) });
    PeerFalsa.ultima!.connectionState = 'failed';
    PeerFalsa.ultima!.disparar('connectionstatechange', {});
    expect(aviso).toContain('conexión');
  });

  it('destruir cierra la conexión y suelta el <video>', async () => {
    responder(201);
    const v = video();
    const sesion = await conectar({ url: 'http://gw/cam-1/whep', video: v });
    sesion.destruir();
    expect(PeerFalsa.ultima!.cerrada).toBe(true);
    expect(v.srcObject).toBeNull();
  });
});
