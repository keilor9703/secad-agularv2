import { describe, expect, it } from 'vitest';

import { ColaDeCandidatos } from './webrtc-candidatos.util';

/** Una conexión falsa: registra los candidatos aplicados y exige descripción remota, como la real. */
function conexion(conRemota: boolean) {
  const aplicados: unknown[] = [];
  const pc = {
    remoteDescription: conRemota ? ({ type: 'offer' } as RTCSessionDescription) : null,
    addIceCandidate: async (c: unknown) => {
      if (!pc.remoteDescription) throw new DOMException('sin descripción remota', 'InvalidStateError');
      aplicados.push(c);
    },
  };
  const conectar = () => { pc.remoteDescription = { type: 'answer' } as RTCSessionDescription; };
  return { pc: pc as unknown as RTCPeerConnection, aplicados, conectar };
}

const c = (n: number) => JSON.stringify({ candidate: `candidate:${n}`, sdpMid: '0' });

describe('ColaDeCandidatos', () => {
  it('con descripción remota aplica el candidato de inmediato', async () => {
    const cola = new ColaDeCandidatos();
    const { pc, aplicados, conectar } = conexion(true);

    await cola.recibir(pc, c(1));

    expect(aplicados).toEqual([{ candidate: 'candidate:1', sdpMid: '0' }]);
    expect(cola.cantidad).toBe(0);
  });

  it('sin descripción remota lo guarda en vez de perderlo', async () => {
    const cola = new ColaDeCandidatos();
    const { pc, aplicados, conectar } = conexion(false);

    await cola.recibir(pc, c(1));
    await cola.recibir(pc, c(2));

    expect(aplicados).toEqual([]);
    expect(cola.cantidad).toBe(2);
  });

  it('al vaciar aplica los guardados, en el orden en que llegaron', async () => {
    const cola = new ColaDeCandidatos();
    const { pc, aplicados, conectar } = conexion(false);
    await cola.recibir(pc, c(1));
    await cola.recibir(pc, c(2));
    await cola.recibir(pc, c(3));

    conectar();
    await cola.vaciar(pc);

    expect(aplicados.map((a) => (a as { candidate: string }).candidate))
      .toEqual(['candidate:1', 'candidate:2', 'candidate:3']);
    expect(cola.cantidad).toBe(0);
  });

  it('vaciar dos veces no repite nada', async () => {
    const cola = new ColaDeCandidatos();
    const { pc, aplicados, conectar } = conexion(false);
    await cola.recibir(pc, c(1));
    conectar();

    await cola.vaciar(pc);
    await cola.vaciar(pc);

    expect(aplicados).toHaveLength(1);
  });

  it('reiniciar descarta lo que pertenecía a la conexión anterior', async () => {
    const cola = new ColaDeCandidatos();
    const { pc, aplicados, conectar } = conexion(false);
    await cola.recibir(pc, c(1));

    cola.reiniciar();
    conectar();
    await cola.vaciar(pc);

    expect(aplicados).toEqual([]);
  });

  it('un candidato inválido no impide aplicar los demás', async () => {
    const cola = new ColaDeCandidatos();
    const { pc, aplicados, conectar } = conexion(false);
    await cola.recibir(pc, '{esto no es json');
    await cola.recibir(pc, c(2));
    conectar();

    await cola.vaciar(pc);

    expect(aplicados).toHaveLength(1);
  });

  it('guardar() conserva candidatos que llegan antes de que exista la conexión', async () => {
    const cola = new ColaDeCandidatos();
    cola.guardar(c(1));
    const { pc, aplicados, conectar } = conexion(false);
    conectar();
    await cola.vaciar(pc);
    expect(aplicados).toEqual([JSON.parse(c(1))]);
  });
});
