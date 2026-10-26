import { environment as desarrollo } from './environment';
import { environment as produccion } from './environment.prod';

/**
 * TODO lo que hay en `environment` viaja en el JavaScript público de la
 * aplicación: cualquiera lo lee desde las herramientas del navegador. Aquí hubo
 * una credencial permanente del servidor TURN, y con ella cualquiera podía usar
 * nuestro retransmisor a nuestra costa. Esta prueba existe para que no vuelva a
 * ocurrir: no se trata de recordar «no pongas secretos», sino de que el
 * pipeline avise.
 *
 * Las credenciales de la videollamada se piden a la API, que las firma y las
 * hace caducar (ver webrtc-ice.util.ts y docs/turn-coturn.md).
 */
const NOMBRE_DE_SECRETO = /(credential|secret|password|passwd|api_?key|token|private)/i;
const NOMBRE_DE_TURN = /^turn/i;

const ARCHIVOS = [
  ['environment.ts', desarrollo],
  ['environment.prod.ts', produccion],
] as const;

describe('environment: nada secreto en el JavaScript público', () => {
  for (const [archivo, entorno] of ARCHIVOS) {
    const claves = Object.keys(entorno);

    it(`${archivo} se está leyendo de verdad (esta prueba no es vacía)`, () => {
      expect(claves).toContain('production');
      expect(claves).toContain('apiBaseUrl');
    });

    it(`${archivo} no tiene claves con nombre de secreto`, () => {
      expect(claves.filter((k) => NOMBRE_DE_SECRETO.test(k))).toEqual([]);
    });

    it(`${archivo} no configura el TURN: lo entrega la API con credenciales efímeras`, () => {
      expect(claves.filter((k) => NOMBRE_DE_TURN.test(k))).toEqual([]);
    });
  }
});
