import { Component, ChangeDetectionStrategy, ElementRef, OnDestroy, OnInit, inject, signal, viewChild } from '@angular/core';

import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import * as signalR from '@microsoft/signalr';
import { environment } from '../../../../../environments/environment';

interface DtoVideoSesionPublica {
  valido: boolean;
  estado: string;
  mensaje: string;
  sesionId: string;
}

/** Payload de chat tal como lo emite VideoSignalingHub (ya persistido). */
interface DtoChatHub {
  id: string;
  emisor: 'DESPACHADOR' | 'CIUDADANO';
  texto: string;
  usuario: string | null;
  fecha: string;
}

interface ChatMensaje {
  texto: string;
  propio: boolean;
  hora: string;
}

type EstadoPagina =
  | 'validando' | 'invalido' | 'pidiendo-permiso' | 'permiso-denegado'
  | 'esperando' | 'conectada' | 'finalizada' | 'error';

/**
 * Página pública a la que llega el ciudadano al tocar el enlace de la
 * videollamada (/video/:token). Sin autenticación — su única credencial es el
 * token de un solo uso incluido en la URL, validado en el backend antes de
 * pedir cámara/micrófono. Es el lado "responde" del WebRTC punto-a-punto:
 * recibe la oferta SDP del despachador y contesta con su answer.
 */
@Component({
  selector:    'app-video-ciudadano',
  standalone:  true,
  imports: [],
  templateUrl: './video-ciudadano-page.component.html',
  styleUrls: ['./video-ciudadano-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VideoCiudadanoPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);

  readonly videoLocalRef = viewChild<ElementRef<HTMLVideoElement>>('videoLocal');
  readonly audioRemotoRef = viewChild<ElementRef<HTMLAudioElement>>('audioRemoto');

  readonly estado = signal<EstadoPagina>('validando');
  readonly mensajeError = signal('');
  readonly camaraFrontal = signal(false);
  readonly cambiandoCamara = signal(false);
  readonly errorCamara = signal('');
  /** Aviso al ciudadano mientras el despachador se cae y vuelve — no se corta la llamada. */
  readonly mensajeEspera = signal('');
  readonly chatMensajes = signal<ChatMensaje[]>([]);
  readonly chatDisponible = signal(false);
  readonly chatAbierto = signal(false);
  readonly chatTexto = signal('');
  /** true mientras el navegador está reportando la posición GPS al despachador. */
  readonly ubicacionActiva = signal(false);

  private readonly token: string;
  private sesionId = '';
  private hub: signalR.HubConnection | null = null;
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private facingModeActual: 'environment' | 'user' = 'environment';
  private watchId: number | null = null;

  /** Ver comentario equivalente en video-llamada.service.ts (lado despachador). */
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

  constructor() {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
  }

  ngOnInit(): void {
    if (!this.token) { this.estado.set('invalido'); return; }

    this.http.get<DtoVideoSesionPublica>(`${environment.apiBaseUrl}/VideoLlamada/publico/${this.token}`)
      .subscribe({
        next: (r) => {
          if (!r.valido) {
            this.estado.set('invalido');
            this.mensajeError.set(r.mensaje || 'Este enlace ya no es válido.');
            return;
          }
          this.sesionId = r.sesionId;
          this.pedirPermisos();
        },
        error: () => {
          this.estado.set('invalido');
          this.mensajeError.set('No fue posible validar el enlace.');
        }
      });
  }

  ngOnDestroy(): void {
    this.finalizarLocal();
  }

  private async pedirPermisos(): Promise<void> {
    this.estado.set('pidiendo-permiso');

    if (!navigator.mediaDevices?.getUserMedia) {
      // Los navegadores solo exponen getUserMedia en un "contexto seguro"
      // (HTTPS, o localhost) — si el enlace se abrió por HTTP en un host
      // distinto de localhost, la API ni siquiera existe y nunca se llega a
      // pedir el permiso nativo.
      this.mensajeError.set(
        'Este enlace debe abrirse con conexión segura (https://). Contacte al despachador para que verifique el enlace enviado.'
      );
      this.estado.set('permiso-denegado');
      return;
    }

    try {
      // La cámara trasera (environment) es la útil para mostrar la escena al
      // despachador — la frontal (selfie) es la que activan los navegadores
      // por defecto si no se pide explícitamente. "ideal" (no "exact") para
      // no fallar en equipos con una sola cámara (ej. laptops/PCs).
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: true
      });
    } catch (err) {
      const nombre = err instanceof DOMException ? err.name : '';
      // eslint-disable-next-line no-console
      console.error('[video-ciudadano] getUserMedia falló:', nombre, err);
      this.mensajeError.set(
        nombre === 'NotFoundError' || nombre === 'DevicesNotFoundError'
          ? 'No se encontró una cámara o micrófono en este dispositivo.'
          : nombre === 'NotReadableError' || nombre === 'TrackStartError'
            ? 'La cámara o el micrófono ya están siendo usados por otra aplicación (cierre otras videollamadas y vuelva a intentar).'
            : nombre === 'NotAllowedError' || nombre === 'PermissionDeniedError'
              ? 'El navegador o el sistema operativo bloquearon el acceso a la cámara/micrófono. Revise el ícono de candado junto a la dirección para habilitar ambos permisos, y también los ajustes de privacidad de cámara/micrófono del sistema operativo — luego recargue esta página.'
              : `No fue posible acceder a su cámara y micrófono (detalle técnico: ${nombre || 'desconocido'}). Verifique los permisos del navegador y vuelva a abrir el enlace.`
      );
      this.estado.set('permiso-denegado');
      return;
    }

    const videoLocalRef = this.videoLocalRef();
    if (videoLocalRef) {
      // El atributo HTML "muted" ya está puesto en la plantilla, pero se
      // fuerza también por JS (defensivo): algunos navegadores móviles no
      // garantizan que la propiedad quede en sync con el atributo cuando el
      // srcObject se asigna dinámicamente después del render inicial, lo que
      // puede hacer que el ciudadano escuche su propia voz por el parlante.
      videoLocalRef.nativeElement.muted = true;
      videoLocalRef.nativeElement.srcObject = this.localStream;
    }

    await this.conectar();
  }

  private async conectar(): Promise<void> {
    this.estado.set('esperando');

    this.hub = new signalR.HubConnectionBuilder()
      .withUrl(`${environment.apiBaseUrl}/hubs/video`)
      .withAutomaticReconnect()
      .build();

    this.hub.on('error', (msg: string) => {
      this.mensajeError.set(msg);
      this.estado.set('error');
    });

    // Puede llegar MÁS DE UNA oferta: si el despachador refresca, cambia de
    // pestaña o se reconecta tras una caída, renegocia desde cero. El ciudadano
    // debe aceptar la oferta nueva y seguir en la misma llamada, sin tener que
    // volver a abrir el enlace ni volver a dar permisos.
    this.hub.on('offer', async (sdp: string) => {
      this.prepararPeerConnection();   // cierra la anterior si existía
      await this.pc!.setRemoteDescription({ type: 'offer', sdp });
      const answer = await this.pc!.createAnswer();
      await this.pc!.setLocalDescription(answer);
      await this.hub!.invoke('SendAnswer', this.sesionId, answer.sdp);
      this.mensajeEspera.set('');
    });

    this.hub.on('ice-candidate', async (candidateJson: string) => {
      if (!this.pc) return;
      try { await this.pc.addIceCandidate(JSON.parse(candidateJson)); } catch { /* candidato tardío, ignorar */ }
    });

    // El despachador se cayó SIN colgar. La llamada no se termina: él puede
    // volver a entrar a esta misma sesión. Se mantiene la cámara encendida y se
    // informa al ciudadano en vez de cortarle la transmisión.
    this.hub.on('participante-desconectado', (rol: string) => {
      if (rol !== 'despachador') return;
      this.estado.set('esperando');
      this.mensajeEspera.set('Se perdió la conexión con el despachador. No cuelgue, se está reconectando…');
    });

    this.hub.on('despachador-conectado', () => {
      this.mensajeEspera.set('El despachador se está reconectando…');
    });

    // Solo un EndSession explícito termina la llamada del lado del ciudadano.
    this.hub.on('sesion-finalizada', () => this.finalizarLocal());

    // El chat llega por el Hub (ya guardado en el caso) y el servidor lo reenvía
    // al grupo completo, emisor incluido: por eso los mensajes propios también
    // entran por aquí y no se agregan a mano al enviarlos.
    this.hub.on('chat', (msg: DtoChatHub) => {
      const propio = msg?.emisor === 'CIUDADANO';
      this.chatMensajes.update(actuales => [
        ...actuales,
        { texto: String(msg?.texto ?? ''), propio, hora: this.horaDe(msg?.fecha) }
      ]);
      // Si escribe el CAD, abrir el chat solo: el ciudadano puede no estar
      // mirando la pantalla y ese mensaje puede ser lo importante.
      if (!propio) this.chatAbierto.set(true);
    });

    try {
      await this.hub.start();
      await this.hub.invoke('JoinAsCiudadano', this.token);

      // El chat depende solo de la señalización: sirve aunque el video P2P
      // todavía no se haya establecido (o no llegue a establecerse nunca).
      this.chatDisponible.set(true);
      this.iniciarUbicacion();
    } catch {
      this.estado.set('error');
      this.mensajeError.set('No fue posible conectar con el despachador.');
    }
  }

  /**
   * Comparte la posición GPS en vivo con el despachador (además del video) para
   * que pueda ubicar al ciudadano y despachar recursos con precisión. Es
   * best-effort: si el navegador no soporta geolocalización o el ciudadano
   * niega el permiso, la llamada sigue funcionando igual, solo sin este dato
   * — el mismo criterio que ya se aplica al micrófono del despachador.
   */
  private iniciarUbicacion(): void {
    if (!navigator.geolocation) return;

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.ubicacionActiva.set(true);
        const { latitude, longitude, accuracy } = pos.coords;
        this.hub?.invoke('EnviarUbicacion', this.sesionId, latitude, longitude, accuracy).catch(() => { /* conexión caída, se reintentará con la próxima posición */ });
      },
      (err) => {
        // eslint-disable-next-line no-console
        console.warn('[video-ciudadano] geolocalización no disponible:', err.message);
        this.ubicacionActiva.set(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  }

  private prepararPeerConnection(): void {
    // Renegociación: si el despachador vuelve tras caerse, llega una oferta
    // nueva y la conexión anterior ya está muerta. Cerrarla antes de crear la
    // siguiente evita dejar transceivers y candidatos huérfanos.
    this.pc?.close();
    this.pc = new RTCPeerConnection({ iceServers: this.construirIceServers() });

    this.localStream?.getTracks().forEach(track => this.pc!.addTrack(track, this.localStream!));

    // Audio del despachador (el CAD le habla al ciudadano) — sin este
    // handler el audio entrante llega por WebRTC pero nunca se reproduce en
    // ningún lado: el ciudadano nunca escucha nada del CAD.
    this.pc.ontrack = (ev) => {
      const audioRef = this.audioRemotoRef();
      if (!audioRef) return;
      audioRef.nativeElement.srcObject = ev.streams[0] ?? new MediaStream([ev.track]);
      audioRef.nativeElement.play().catch(err => {
        // eslint-disable-next-line no-console
        console.error('[video-ciudadano] no se pudo reproducir el audio del despachador:', err);
      });
    };

    this.pc.onicecandidate = (ev) => {
      if (ev.candidate && this.hub) {
        this.hub.invoke('SendIceCandidate', this.sesionId, JSON.stringify(ev.candidate));
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (this.pc?.connectionState === 'connected') this.estado.set('conectada');
    };
  }

  async cambiarCamara(): Promise<void> {
    if (!this.localStream || this.cambiandoCamara()) return;
    this.cambiandoCamara.set(true);
    this.errorCamara.set('');

    const nuevoFacingMode: 'environment' | 'user' = this.facingModeActual === 'environment' ? 'user' : 'environment';
    const trackViejo = this.localStream.getVideoTracks()[0];

    try {
      // Libera la cámara actual ANTES de pedir la otra. La mayoría de
      // celulares (Android/iOS) exponen un solo handle de hardware de cámara
      // a la vez — pedir la nueva mientras la vieja seguía activa (como se
      // hacía antes) hace que getUserMedia falle con NotReadableError en la
      // práctica, y como el error solo quedaba en console.error, el botón se
      // veía como si "no hiciera nada".
      if (trackViejo) {
        this.localStream.removeTrack(trackViejo);
        trackViejo.stop();
      }

      const nuevoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: nuevoFacingMode } },
        audio: false
      });
      const nuevoTrack = nuevoStream.getVideoTracks()[0];
      this.localStream.addTrack(nuevoTrack);

      const sender = this.pc?.getSenders().find(s => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(nuevoTrack);

      const videoLocalRef = this.videoLocalRef();
      if (videoLocalRef) {
        videoLocalRef.nativeElement.muted = true;
        videoLocalRef.nativeElement.srcObject = this.localStream;
      }

      this.facingModeActual = nuevoFacingMode;
      this.camaraFrontal.set(nuevoFacingMode === 'user');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[video-ciudadano] no se pudo cambiar de cámara:', err);
      this.mostrarErrorCamara('No se pudo cambiar de cámara.');

      // Ya se liberó la cámara vieja — si la nueva falló, intenta recuperar
      // AL MENOS la que tenía antes, para no dejar al ciudadano sin video.
      if (this.localStream.getVideoTracks().length === 0) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: this.facingModeActual } },
            audio: false
          });
          const track = stream.getVideoTracks()[0];
          this.localStream.addTrack(track);
          const sender = this.pc?.getSenders().find(s => s.track?.kind === 'video');
          if (sender) await sender.replaceTrack(track);
          const videoLocalRef = this.videoLocalRef();
          if (videoLocalRef) videoLocalRef.nativeElement.srcObject = this.localStream;
        } catch {
          // eslint-disable-next-line no-console
          console.error('[video-ciudadano] no se pudo recuperar ninguna cámara.');
        }
      }
    } finally {
      this.cambiandoCamara.set(false);
    }
  }

  private mostrarErrorCamara(mensaje: string): void {
    this.errorCamara.set(mensaje);
    setTimeout(() => this.errorCamara.set(''), 4000);
  }

  private horaDe(fecha: string | undefined): string {
    const d = fecha ? new Date(fecha) : new Date();
    return (isNaN(d.getTime()) ? new Date() : d)
      .toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  toggleChat(): void {
    this.chatAbierto.update(v => !v);
  }

  /**
   * Va por el Hub —no por un canal P2P— para que la conversación quede
   * registrada en el caso: en una emergencia el chat suele ser donde está lo
   * crítico. El mensaje se pinta cuando vuelve del servidor, ya guardado.
   */
  enviarChat(): void {
    const texto = this.chatTexto().trim();
    if (!texto || !this.hub || !this.sesionId) return;
    this.hub.invoke('EnviarChat', this.sesionId, texto);
    this.chatTexto.set('');
  }

  colgar(): void {
    if (this.hub && this.sesionId) {
      try { this.hub.invoke('EndSession', this.sesionId); } catch { /* la conexión ya pudo haberse caído */ }
    }
    this.finalizarLocal();
  }

  private finalizarLocal(): void {
    this.pc?.close();
    this.pc = null;
    this.hub?.stop();
    this.hub = null;
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.ubicacionActiva.set(false);
    const audioRef = this.audioRemotoRef();
    if (audioRef) audioRef.nativeElement.srcObject = null;
    if (this.estado() !== 'invalido' && this.estado() !== 'permiso-denegado') this.estado.set('finalizada');
  }
}
