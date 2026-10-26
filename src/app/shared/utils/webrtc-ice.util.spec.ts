import { HttpClient } from '@angular/common/http';
import { NEVER, of, throwError } from 'rxjs';

import { ICE_RESPALDO, aRtcIceServers, obtenerIceServers } from './webrtc-ice.util';

/**
 * Lo que decide si una videollamada abre en una red móvil es la lista de
 * servidores ICE. Estas pruebas fijan lo que NO puede pasar: que un TURN sin
 * credenciales llegue al navegador (lanza InvalidAccessError y la llamada ni
 * empieza) y que una lista vacía deje al ciudadano sin ningún servidor.
 */
describe('aRtcIceServers', () => {
  const stun = { urls: ['stun:stun.ejemplo.test:3478'] };
  const turn = { urls: ['turn:turn.ejemplo.test:3478'], username: '1700003600:ciudadano-42', credential: 'abc=' };

  it('conserva STUN sin credenciales y TURN con ellas', () => {
    expect(aRtcIceServers([stun, turn])).toEqual([
      { urls: ['stun:stun.ejemplo.test:3478'] },
      { urls: ['turn:turn.ejemplo.test:3478'], username: '1700003600:ciudadano-42', credential: 'abc=' },
    ]);
  });

  it('descarta un TURN sin credenciales, que haría fallar la conexión', () => {
    const sinClave = { urls: ['turn:turn.ejemplo.test:3478'] };
    const sinUsuario = { urls: ['turns:turn.ejemplo.test:5349'], credential: 'abc=' };
    const enBlanco = { urls: ['turn:turn.ejemplo.test:3478'], username: ' ', credential: ' ' };

    expect(aRtcIceServers([stun, sinClave, sinUsuario, enBlanco])).toEqual([
      { urls: ['stun:stun.ejemplo.test:3478'] },
    ]);
  });

  it('reconoce turn: y turns: sin importar las mayúsculas', () => {
    expect(aRtcIceServers([stun, { urls: ['TURN:turn.ejemplo.test'] }])).toEqual([
      { urls: ['stun:stun.ejemplo.test:3478'] },
    ]);
  });

  it('acepta urls como texto suelto y las recorta', () => {
    expect(aRtcIceServers([{ urls: '  stun:uno.test:3478  ' }])).toEqual([{ urls: ['stun:uno.test:3478'] }]);
  });

  it('un STUN sin credenciales no lleva las claves username ni credential, ni siquiera vacías', () => {
    const [servidor] = aRtcIceServers([stun]);

    // `{ urls, username: undefined }` parece inocuo, pero un TURN con esas
    // claves presentes y vacías es justo el que el navegador rechaza.
    expect(Object.keys(servidor)).toEqual(['urls']);
  });

  it('ignora entradas sin direcciones', () => {
    expect(aRtcIceServers([{ urls: [] }, { urls: ['', '  '] }, { urls: null }, {}, stun])).toEqual([
      { urls: ['stun:stun.ejemplo.test:3478'] },
    ]);
  });

  it('si no queda nada utilizable devuelve el STUN de respaldo, nunca una lista vacía', () => {
    for (const entrada of [null, undefined, [], [{ urls: [] }], [{ urls: ['turn:solo.test'] }]]) {
      expect(aRtcIceServers(entrada as never)).toEqual([...ICE_RESPALDO]);
    }
  });

  it('el respaldo devuelto es una copia: modificarlo no contamina al siguiente', () => {
    const a = aRtcIceServers(null);
    a.push({ urls: 'turn:intruso.test' });

    expect(aRtcIceServers(null)).toEqual([...ICE_RESPALDO]);
    expect(ICE_RESPALDO.length).toBe(1);
  });
});

describe('obtenerIceServers', () => {
  const URL = '/api/VideoLlamada/ice';
  const http = (get: () => unknown) => ({ get } as unknown as HttpClient);

  it('devuelve lo que entrega la API, ya convertido', async () => {
    const turn = { urls: ['turn:turn.ejemplo.test:3478'], username: 'u', credential: 'c' };
    const solicitudes: string[] = [];

    const r = await obtenerIceServers(
      { get: (u: string) => { solicitudes.push(u); return of([turn]); } } as unknown as HttpClient, URL);

    expect(solicitudes).toEqual([URL]);
    expect(r).toEqual([turn]);
  });

  it('ante un error de la API sigue con el respaldo en vez de lanzar', async () => {
    const r = await obtenerIceServers(http(() => throwError(() => new Error('500'))), URL);

    expect(r).toEqual([...ICE_RESPALDO]);
  });

  it('si la API no contesta a tiempo sigue con el respaldo en vez de quedarse esperando', async () => {
    const t0 = Date.now();

    const r = await obtenerIceServers(http(() => NEVER), URL, 30);

    expect(r).toEqual([...ICE_RESPALDO]);
    expect(Date.now() - t0).toBeLessThan(2000);   // la espera es la del parámetro, no la del servidor
  });

  it('una respuesta con TURN sin credenciales no llega al navegador', async () => {
    const r = await obtenerIceServers(http(() => of([{ urls: ['turn:turn.ejemplo.test:3478'] }])), URL);

    expect(r).toEqual([...ICE_RESPALDO]);
  });
});
