import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import * as signalR from '@microsoft/signalr';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../auth/auth.service';

export interface DtoCrearVideoSesionRequest {
  pedidoId: string;
  numeroTelefono: string;
}

export interface DtoCrearVideoSesionResult {
  success: boolean;
  message: string;
  sesionId: string;
  sessionToken: string;
  fechaExpira: string;
  smsEnviado: boolean;
}

export type EstadoLlamada = 'inactiva' | 'esperando' | 'conectando' | 'conectada' | 'finalizada' | 'error';

/** Payload de chat tal como lo emite VideoSignalingHub (ya persistido). */
interface DtoChatHub {
  id: string;
  emisor: 'DESPACHADOR' | 'CIUDADANO';
  texto: string;
  usuario: string | null;
  fecha: string;
}

export interface ChatMensaje {
  texto: string;
  propio: boolean;
  hora: string;
}

export interface UbicacionCiudadano {
  lat: number;
  lng: number;
  precision?: number;
}

/** Videollamada vigente de un caso — permite reconectarse sin generar otro enlace. */
/** Un mensaje del chat tal como quedó registrado en el caso. */
export interface DtoVideoChatMensaje {
  id: string;
  emisor: 'DESPACHADOR' | 'CIUDADANO';
  texto: string;
  usuario: string | null;
  fecha: string;
}

/**
 * Trazabilidad de una videollamada para la revisión del caso cerrado: quién la
 * atendió, cuándo, cuánto duró, si dejó grabación y cuál, y la transcripción.
 */
export interface DtoVideoSesionResumen {
  sesionId: string;
  estado: string;
  usuarioDespachador: string;
  numeroTelefono: string | null;
  fechaCreacion: string;
  fechaConectado: string | null;
  fechaFinalizado: string | null;
  duracionSegundos: number | null;
  ipCiudadano: string | null;
  tieneGrabacion: boolean;
  adjuntoGrabacionId: string | null;
  grabacionUrl: string | null;
  grabacionNombre: string | null;
  grabacionEstado: string | null;
  ultimaLat: number | null;
  ultimaLng: number | null;
  chat: DtoVideoChatMensaje[];
}

export interface DtoVideoSesionActiva {
  hay: boolean;
  sesionId: string;
  estado: string;
  sessionToken: string;
  fechaExpira: string;
  numeroTelefono?: string;
  grabando: boolean;
}

/**
 * Lado despachador de la videollamada WebRTC punto-a-punto con el ciudadano.
 * Se conecta al mismo VideoSignalingHub que la página pública del ciudadano
 * (ver video-ciudadano.ts), pero autenticado con el JWT normal de SECAD.
 *
 * Maneja un solo RTCPeerConnection a la vez — cada caso solo tiene un
 * despachador y un ciudadano en la sesión (sin SFU, ver decisión de diseño).
 */
@Injectable({ providedIn: 'root' })
export class VideoLlamadaService {

  private readonly base = `${environment.apiBaseUrl}/VideoLlamada`;
  private readonly hubUrl = `${environment.apiBaseUrl}/hubs/video`;

  private hub: signalR.HubConnection | null = null;
  private pc: RTCPeerConnection | null = null;
  private sesionId = '';

  // Micrófono propio del despachador (se captura al crear la oferta).
  // El chat ya no usa RTCDataChannel: viaja por el Hub para quedar registrado.
  private micStream: MediaStream | null = null;

  private readonly estadoSubject = new BehaviorSubject<EstadoLlamada>('inactiva');
  readonly estado$: Observable<EstadoLlamada> = this.estadoSubject.asObservable();

  private readonly remoteStreamSubject = new BehaviorSubject<MediaStream | null>(null);
  readonly remoteStream$: Observable<MediaStream | null> = this.remoteStreamSubject.asObservable();

  private readonly errorSubject = new BehaviorSubject<string>('');
  readonly error$: Observable<string> = this.errorSubject.asObservable();

  private readonly microfonoActivoSubject = new BehaviorSubject<boolean>(true);
  readonly microfonoActivo$: Observable<boolean> = this.microfonoActivoSubject.asObservable();

  private readonly chatDisponibleSubject = new BehaviorSubject<boolean>(false);
  readonly chatDisponible$: Observable<boolean> = this.chatDisponibleSubject.asObservable();

  private readonly chatMensajesSubject = new BehaviorSubject<ChatMensaje[]>([]);
  readonly chatMensajes$: Observable<ChatMensaje[]> = this.chatMensajesSubject.asObservable();

  /** Última ubicación GPS reportada por el ciudadano — null si no ha compartido (o no ha llegado) ninguna. */
  private readonly ubicacionSubject = new BehaviorSubject<UbicacionCiudadano | null>(null);
  readonly ubicacion$: Observable<UbicacionCiudadano | null> = this.ubicacionSubject.asObservable();

  /**
   * Servidores ICE — STUN público de Google siempre incluido; el TURN propio
   * (coturn) se agrega solo si viene configurado en environment.ts. Sin TURN,
   * muchas redes celulares con NAT simétrico de operador no logran completar
   * el flujo real de medios aunque el ICE parezca "conectado".
   */
  private construirIceServers(): RTCIceServer[] {
    const servers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
    const turnUrls = (environment as Partial<{ turnUrls: string[] }>).turnUrls;
    const turnUsername = (environment as Partial<{ turnUsername: string }>).turnUsername;
    const turnCredential = (environment as Partial<{ turnCredential: string }>).turnCredential;
    if (turnUrls?.length) {
      servers.push({ urls: turnUrls, username: turnUsername, credential: turnCredential });
    }
    return servers;
  }

  constructor(private http: HttpClient, private authService: AuthService) {}

  crearSesion(pedidoId: string, numeroTelefono: string): Promise<DtoCrearVideoSesionResult> {
    return firstValueFrom(
      this.http.post<DtoCrearVideoSesionResult>(this.base, { pedidoId, numeroTelefono })
    );
  }

  /**
   * ¿Este caso tiene una videollamada en curso? Se consulta al abrir el caso
   * para ofrecer RECONECTARSE en vez de generar otro enlace — necesario tras un
   * F5, un cambio de pestaña, una caída de red o un relevo de turno.
   */
  getSesionActiva(pedidoId: string): Promise<DtoVideoSesionActiva> {
    return firstValueFrom(
      this.http.get<DtoVideoSesionActiva>(`${this.base}/activa/${pedidoId}`)
    );
  }

  /**
   * Trazabilidad de las videollamadas de un caso — para la revisión del
   * incidente ya cerrado (módulo Pedido), donde esto es todo lo que queda de la
   * llamada: quién atendió, duración, grabación y transcripción del chat.
   */
  getSesionesPorPedido(pedidoId: string): Observable<DtoVideoSesionResumen[]> {
    return this.http.get<DtoVideoSesionResumen[]>(`${this.base}/pedido/${pedidoId}`);
  }

  /**
   * Vuelve a entrar a una llamada que ya estaba en curso. Reusa la misma sesión
   * (el ciudadano no tiene que hacer nada) y renegocia WebRTC desde cero,
   * porque la RTCPeerConnection anterior murió con la pestaña.
   */
  async reconectar(sesionId: string): Promise<void> {
    await this.iniciar(sesionId);

    // El ciudadano ya está dentro, así que no llegará ningún 'ciudadano-conectado'
    // que dispare la oferta: hay que iniciar la renegociación desde aquí.
    this.estadoSubject.next('conectando');
    await this.crearOferta();
  }

  /** Inicia la conexión de señalización y espera a que el ciudadano se conecte. */
  async iniciar(sesionId: string): Promise<void> {
    this.sesionId = sesionId;
    this.estadoSubject.next('esperando');
    this.errorSubject.next('');

    this.hub = new signalR.HubConnectionBuilder()
      .withUrl(this.hubUrl, { accessTokenFactory: () => this.authService.getToken() ?? '' })
      .withAutomaticReconnect()
      .build();

    this.hub.on('error', (msg: string) => {
      this.errorSubject.next(msg);
      this.estadoSubject.next('error');
    });

    this.hub.on('ciudadano-conectado', () => {
      this.estadoSubject.next('conectando');
      this.crearOferta();
    });

    this.hub.on('answer', async (sdp: string) => {
      if (!this.pc) return;
      await this.pc.setRemoteDescription({ type: 'answer', sdp });
    });

    this.hub.on('ice-candidate', async (candidateJson: string) => {
      if (!this.pc) return;
      try { await this.pc.addIceCandidate(JSON.parse(candidateJson)); } catch { /* candidato tardío, ignorar */ }
    });

    // El ciudadano colgó: hay que GUARDAR la grabación antes de desmontar todo.
    // Este era el agujero más grave — antes finalizarLocal() ni tocaba el
    // MediaRecorder y la grabación se perdía entera.
    this.hub.on('sesion-finalizada', () => { void this.cerrarTodo(); });

    // El otro extremo desapareció sin colgar (cerró la pestaña, se quedó sin
    // red). La sesión NO se da por terminada —puede volver— pero la grabación
    // sí se asegura ya, porque el video que llegaba dejó de llegar.
    this.hub.on('participante-desconectado', (rol: string) => {
      if (rol === 'ciudadano') {
        this.estadoSubject.next('esperando');
        this.errorSubject.next('El ciudadano se desconectó. La grabación se guardó automáticamente.');
        void this.finalizarGrabacion();
      }
    });

    this.hub.on('ubicacion', (lat: number, lng: number, precision: number | null) => {
      this.ubicacionSubject.next({ lat, lng, precision: precision ?? undefined });
    });

    // El chat llega por el Hub (ya persistido) y el servidor lo reenvía al GRUPO
    // completo, emisor incluido: por eso los mensajes propios también entran por
    // aquí y no se agregan a mano al enviarlos. Lo que se ve en pantalla es
    // exactamente lo que quedó registrado en el caso.
    this.hub.on('chat', (msg: DtoChatHub) => {
      this.chatMensajesSubject.next([
        ...this.chatMensajesSubject.value,
        {
          texto:  String(msg?.texto ?? ''),
          propio: msg?.emisor === 'DESPACHADOR',
          hora:   this.horaDe(msg?.fecha)
        }
      ]);
    });

    await this.hub.start();
    await this.hub.invoke('JoinAsDespachador', sesionId);

    // El chat depende solo de la señalización, no del enlace P2P: sigue
    // sirviendo aunque el video no logre establecerse.
    this.chatDisponibleSubject.next(true);

    this.prepararPeerConnection();
  }

  private prepararPeerConnection(): void {
    // Al reconectar, la conexión anterior quedó muerta: cerrarla antes de crear
    // la nueva o el navegador se queda con transceivers huérfanos.
    this.pc?.close();
    this.pc = new RTCPeerConnection({ iceServers: this.construirIceServers() });

    this.pc.ontrack = (ev) => {
      this.remoteStreamSubject.next(ev.streams[0] ?? null);
      this.estadoSubject.next('conectada');
    };

    this.pc.onicecandidate = (ev) => {
      if (ev.candidate && this.hub) {
        this.hub.invoke('SendIceCandidate', this.sesionId, JSON.stringify(ev.candidate));
      }
    };

    // Se cortó el flujo de medios (se cayó la red del ciudadano, se apagó el
    // celular). El video que se estaba grabando dejó de llegar, así que la
    // grabación se asegura de inmediato en vez de esperar a que alguien cuelgue.
    this.pc.onconnectionstatechange = () => {
      const st = this.pc?.connectionState;
      if (st === 'connected') {
        this.estadoSubject.next('conectada');
      } else if (st === 'failed' || st === 'disconnected') {
        if (this.grabacionActiva) {
          this.errorSubject.next('Se perdió la conexión con el ciudadano. La grabación se guardó automáticamente.');
          void this.finalizarGrabacion();
        }
        this.estadoSubject.next('esperando');
      }
    };
  }

  private async crearOferta(): Promise<void> {
    if (!this.pc || !this.hub) return;
    // Solo recibe video (el despachador no envía su propia cámara) — el video
    // es unidireccional ciudadano → despachador, ver decisión de diseño.
    // El audio sí es bidireccional: el despachador necesita poder hablarle
    // al ciudadano, así que captura su propio micrófono y lo conecta al
    // sender de este transceiver (antes solo se declaraba sendrecv sin
    // adjuntar ningún track real, por lo que el CAD nunca podía hablar).
    this.pc.addTransceiver('video', { direction: 'recvonly' });
    const audioTransceiver = this.pc.addTransceiver('audio', { direction: 'sendrecv' });

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      await audioTransceiver.sender.replaceTrack(this.micStream.getAudioTracks()[0]);
      this.microfonoActivoSubject.next(true);
    } catch (err) {
      // El despachador sigue pudiendo ver/oír al ciudadano aunque no
      // conceda su propio micrófono — solo no podrá hablar por audio (le
      // queda el chat de texto). Antes esto fallaba en silencio (solo
      // console.error) y la UI seguía mostrando "Silenciar mi micrófono"
      // como si estuviera activo, sin ninguna pista de por qué el
      // ciudadano no escuchaba nada — ahora se refleja en la UI y se avisa.
      // eslint-disable-next-line no-console
      console.error('[video-llamada] no se pudo capturar el micrófono del despachador:', err);
      this.microfonoActivoSubject.next(false);
      this.errorSubject.next(
        'No se pudo activar su micrófono — el ciudadano no lo escuchará. ' +
        'Revise el ícono de candado junto a la dirección para conceder el permiso de micrófono a este sitio y vuelva a iniciar la videollamada.'
      );
    }

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await this.hub.invoke('SendOffer', this.sesionId, offer.sdp);
  }

  private horaDe(fecha: string | undefined): string {
    const d = fecha ? new Date(fecha) : new Date();
    return (isNaN(d.getTime()) ? new Date() : d)
      .toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  /**
   * Envía un mensaje de chat al ciudadano. Va por el Hub —no por el canal P2P—
   * para que quede registrado en el caso: en una emergencia el chat suele ser
   * donde está lo crítico (una placa, "no puedo hablar") y al revisar el
   * incidente cerrado debe poder consultarse. El mensaje NO se pinta aquí: se
   * pinta cuando vuelve del servidor, ya persistido.
   */
  enviarChat(texto: string): void {
    const limpio = texto.trim();
    if (!limpio || !this.hub || !this.sesionId) return;
    this.hub.invoke('EnviarChat', this.sesionId, limpio)
      .catch(() => this.errorSubject.next('No se pudo enviar el mensaje de chat.'));
  }

  /** Silencia/reactiva el micrófono del despachador sin renegociar la conexión. */
  toggleMicrofono(): void {
    const track = this.micStream?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    this.microfonoActivoSubject.next(track.enabled);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  GRABACIÓN A PRUEBA DE FALLOS
  //
  //  Antes la grabación se acumulaba ENTERA en memoria y solo se subía si el
  //  despachador oprimía "Detener". Cualquier final abrupto —el ciudadano
  //  cuelga, se refresca la página, se cae la red, se cierra Chrome— perdía la
  //  grabación completa. Como esto puede ser material probatorio, no sirve.
  //
  //  Ahora MediaRecorder emite un trozo cada TROZO_MS y cada trozo se sube de
  //  inmediato. Lo que ya llegó al servidor está a salvo pase lo que pase aquí.
  //  Y el cierre se dispara desde TODOS los caminos de terminación, no solo
  //  desde el botón (ver registrarCierresAutomaticos y finalizarGrabacion).
  // ══════════════════════════════════════════════════════════════════════════

  private recorder: MediaRecorder | null = null;
  /** Cola secuencial: los trozos deben llegar EN ORDEN o el .webm sale corrupto. */
  private colaSubida: Promise<void> = Promise.resolve();
  private grabacionActiva = false;

  private static readonly TROZO_MS = 4000;

  private readonly grabandoSubject = new BehaviorSubject<boolean>(false);
  readonly grabando$: Observable<boolean> = this.grabandoSubject.asObservable();

  async iniciarGrabacion(): Promise<void> {
    const stream = this.remoteStreamSubject.value;
    if (!stream || this.grabacionActiva) return;

    // Avisar al backend ANTES de grabar: deja la sesión en estado GRABANDO, de
    // modo que si esta pestaña muere el sweeder del servidor sabe que hay una
    // grabación abierta que debe cerrar.
    await firstValueFrom(this.http.post(
      `${environment.apiBaseUrl}/Adjunto/grabacion/iniciar`, { sesionId: this.sesionId }));

    this.grabacionActiva = true;
    this.grabandoSubject.next(true);

    this.recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.encolarTrozo(e.data);
    };
    this.recorder.start(VideoLlamadaService.TROZO_MS);
  }

  /** Encola la subida de un trozo preservando el orden y sin bloquear al grabador. */
  private encolarTrozo(trozo: Blob): void {
    const sesion = this.sesionId;
    this.colaSubida = this.colaSubida.then(() => this.subirTrozo(trozo, sesion));
  }

  private async subirTrozo(trozo: Blob, sesionId: string): Promise<void> {
    const form = new FormData();
    form.append('file', trozo, `chunk_${sesionId}.webm`);
    form.append('sesionId', sesionId);

    // Un trozo perdido es un hueco en la evidencia: se reintenta antes de rendirse.
    for (let intento = 1; intento <= 3; intento++) {
      try {
        await firstValueFrom(
          this.http.post(`${environment.apiBaseUrl}/Adjunto/grabacion/chunk`, form));
        return;
      } catch {
        if (intento < 3) await new Promise(r => setTimeout(r, 500 * intento));
      }
    }
    // eslint-disable-next-line no-console
    console.error('[video-llamada] no se pudo subir un trozo de la grabación tras 3 intentos.');
  }

  /**
   * Cierra la grabación y la registra como adjunto del caso. Es idempotente y
   * segura de llamar desde cualquier camino de terminación (botón, colgar, el
   * ciudadano cuelga, se cae la conexión, se destruye el componente).
   */
  async finalizarGrabacion(): Promise<boolean> {
    if (!this.grabacionActiva) return false;
    this.grabacionActiva = false;
    this.grabandoSubject.next(false);

    const sesion = this.sesionId;

    if (this.recorder && this.recorder.state !== 'inactive') {
      // stop() dispara un último ondataavailable con la cola pendiente.
      const ultimoTrozo = new Promise<void>((resolve) => {
        this.recorder!.onstop = () => resolve();
      });
      this.recorder.stop();
      await ultimoTrozo;
    }
    this.recorder = null;

    // Esperar a que termine de subir todo lo encolado antes de cerrar.
    await this.colaSubida;

    try {
      await firstValueFrom(this.http.post(
        `${environment.apiBaseUrl}/Adjunto/grabacion/finalizar`, { sesionId: sesion }));
      return true;
    } catch {
      // Aunque falle el cierre, los trozos YA están en el servidor: el sweeper
      // del backend la finalizará solo. La evidencia no se pierde.
      // eslint-disable-next-line no-console
      console.error('[video-llamada] falló el cierre de la grabación; el servidor la finalizará automáticamente.');
      return false;
    }
  }

  get estaGrabando(): boolean { return this.grabacionActiva; }

  /**
   * Cierre completo y ordenado: primero se asegura la grabación, después se
   * cierra la sesión. El orden importa — si se desmontara la conexión antes,
   * el último trozo del video se perdería.
   */
  async colgar(): Promise<void> {
    await this.finalizarGrabacion();

    if (this.hub && this.sesionId) {
      try { await this.hub.invoke('EndSession', this.sesionId); } catch { /* la conexión ya pudo haberse caído */ }
    }
    this.finalizarLocal();
  }

  /** Cierre por evento externo (el ciudadano colgó): guarda la grabación y desmonta. */
  private async cerrarTodo(): Promise<void> {
    await this.finalizarGrabacion();
    this.finalizarLocal();
  }

  /**
   * Cierre de emergencia para cuando el componente se destruye o el usuario
   * abandona la página. No hay tiempo de esperar promesas, así que se dispara
   * el guardado en segundo plano; los trozos ya subidos están a salvo de todos
   * modos y el sweeper del servidor cierra lo que quede abierto.
   */
  abandonar(): void {
    if (this.grabacionActiva) void this.finalizarGrabacion();
    if (this.hub && this.sesionId) {
      try { this.hub.invoke('EndSession', this.sesionId); } catch { /* ya caída */ }
    }
    this.finalizarLocal();
  }

  private finalizarLocal(): void {
    this.pc?.close();
    this.pc = null;
    this.hub?.stop();
    this.hub = null;
    this.micStream?.getTracks().forEach(t => t.stop());
    this.micStream = null;
    this.remoteStreamSubject.next(null);
    this.chatMensajesSubject.next([]);
    this.chatDisponibleSubject.next(false);
    this.microfonoActivoSubject.next(true);
    this.ubicacionSubject.next(null);
    this.grabandoSubject.next(false);
    this.estadoSubject.next('finalizada');
  }
}
