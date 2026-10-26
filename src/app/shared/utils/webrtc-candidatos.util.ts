/**
 * Cola de candidatos ICE que llegan ANTES de que la conexión tenga su
 * descripción remota.
 *
 * <b>El problema.</b> La señalización es un relevo: los candidatos del otro
 * extremo llegan por el Hub mientras esta conexión todavía está procesando la
 * oferta (o la respuesta). `addIceCandidate` antes de `setRemoteDescription`
 * lanza `InvalidStateError`, y el código lo atrapaba con un `catch` vacío:
 * el candidato se perdía en silencio. En un celular lento puede ser justo el
 * que habría conectado la llamada, y el síntoma es una videollamada que
 * «conecta» y se queda en negro, sin ningún error.
 *
 * Aquí se guardan y se aplican en cuanto hay descripción remota.
 */
export class ColaDeCandidatos {
  private pendientes: string[] = [];

  /** Cuántos esperan. Solo para pruebas y diagnóstico. */
  get cantidad(): number {
    return this.pendientes.length;
  }

  /** Aplica el candidato si ya se puede; si no, lo guarda para después. */
  async recibir(pc: RTCPeerConnection, candidatoJson: string): Promise<void> {
    if (!pc.remoteDescription) {
      this.pendientes.push(candidatoJson);
      return;
    }
    await this.aplicar(pc, candidatoJson);
  }

  /** Guarda sin intentar aplicar: aún no existe ni la conexión. */
  guardar(candidatoJson: string): void {
    this.pendientes.push(candidatoJson);
  }

  /** Aplica los guardados. Se llama justo después de `setRemoteDescription`. */
  async vaciar(pc: RTCPeerConnection): Promise<void> {
    const lote = this.pendientes.splice(0);
    for (const candidato of lote) {
      await this.aplicar(pc, candidato);
    }
  }

  /**
   * Descarta lo pendiente. Se llama al crear una conexión NUEVA: los
   * candidatos guardados pertenecían a la anterior y no sirven.
   */
  reiniciar(): void {
    this.pendientes = [];
  }

  private async aplicar(pc: RTCPeerConnection, candidatoJson: string): Promise<void> {
    try {
      await pc.addIceCandidate(JSON.parse(candidatoJson));
    } catch {
      // Un candidato que ya no corresponde (conexión renegociada, llegada
      // tardía). Ya no es el caso de «todavía no hay descripción remota», que
      // se resuelve arriba: lo que cae aquí sí es descartable.
    }
  }
}
