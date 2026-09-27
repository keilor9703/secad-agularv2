import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, OnDestroy,
  computed, effect, inject, input, output, signal, untracked, viewChild,
} from '@angular/core';
import Hls from 'hls.js';
import {
  CamaraService, DtoCamara, DtoStreamCamara, PTZ,
} from '../../../../core/services/operacion/camara.service';
import * as jsDecoder from './jsdecoder';
import { conectar as conectarWhep, SesionWhep } from './whep';

/**
 * Reproduce una cámara CCTV en vivo.
 *
 * El video va del navegador AL VMS, sin pasar por el backend de SECAD: el
 * backend solo autoriza y entrega la URL. Meter el stream por
 * Kestrel tumbaría el servidor con tres operadores mirando.
 *
 * Se usa hls.js y no el <video> a secas porque Chrome y Firefox no reproducen
 * HLS de forma nativa; Safari sí, y ahí se prefiere el camino nativo, que
 * gasta menos batería.
 */
@Component({
  selector: 'app-camara-visor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './camara-visor.component.html',
  styleUrl: './camara-visor.component.scss',
})
export class CamaraVisorComponent implements OnDestroy {
  private readonly svc = inject(CamaraService);

  /** Cámara a reproducir. null = el visor está cerrado. */
  readonly camara   = input<DtoCamara | null>(null);
  readonly eventoId = input<string | number | null>(null);

  readonly cerrar = output<void>();

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');

  readonly cargando = signal(false);
  readonly error    = signal('');
  readonly nodo     = signal('');
  readonly urlActual = signal('');
  /** Respuesta completa del backend: dice también con qué reproducirla. */
  private readonly stream = signal<DtoStreamCamara | null>(null);

  /** Contenedor donde pinta el jsDecoder; el SDK exige un div, no un <video>. */
  private readonly lienzo = viewChild<ElementRef<HTMLElement>>('lienzo');

  /**
   * true = este stream lo pinta el jsDecoder sobre un div. HLS y WebRTC van los
   * dos al <video>: uno por MSE y el otro por srcObject.
   */
  readonly usaJsDecoder = computed(() => this.stream()?.reproductor === 'jsdecoder');

  // ── Ventana flotante ─────────────────────────────────────────────────────
  // Antes el visor era un modal con fondo oscuro: abrir una cámara dejaba el
  // resto del módulo inservible, que es justo lo contrario de lo que necesita
  // un despachador —mirar la cámara MIENTRAS trabaja el caso—.
  private static readonly ANCHO_MIN = 320;
  private static readonly CLAVE_GEOMETRIA = 'secad_camara_visor_geo';

  readonly pos        = signal<{ x: number; y: number }>({ x: 0, y: 0 });
  readonly ancho      = signal(640);
  readonly minimizada = signal(false);
  readonly moviendo   = signal(false);

  private readonly ventana = viewChild<ElementRef<HTMLElement>>('ventana');

  // ── Control PTZ ──────────────────────────────────────────────────────────
  // El backend mueve UN PASO por llamada: arranca el giro y lo para él mismo
  // antes de responder. Aquí eso se traduce en mantener pulsado = encadenar
  // pasos, esperando cada respuesta antes de pedir el siguiente. Nunca hay dos
  // comandos en vuelo sobre la misma cámara (el backend los rechaza) y ningún
  // fallo del navegador puede dejar la cámara girando.
  private static readonly PASO_MS   = 350;
  private static readonly MAX_PASOS = 20;   // ~7 s manteniendo pulsado

  /** Comando que se está ejecutando, o '' si ninguno. Bloquea los botones. */
  readonly ptzEnCurso  = signal('');
  readonly ptzAviso    = signal('');
  readonly panelPtz    = signal(false);
  readonly ptzVelocidad = signal(40);
  readonly preset      = signal<number | null>(null);

  readonly PTZ = PTZ;

  /**
   * La cruceta. Se declara aquí y no en la plantilla para que el orden del
   * grid y los nombres de los comandos vivan en un solo sitio.
   */
  readonly botonera = [
    { cmd: PTZ.arribaIzq, area: '1 / 1', icono: 'fa-arrow-up-left',    titulo: 'Arriba e izquierda' },
    { cmd: PTZ.arriba,    area: '1 / 2', icono: 'fa-arrow-up',         titulo: 'Arriba' },
    { cmd: PTZ.arribaDer, area: '1 / 3', icono: 'fa-arrow-up-right',   titulo: 'Arriba y derecha' },
    { cmd: PTZ.izquierda, area: '2 / 1', icono: 'fa-arrow-left',       titulo: 'Izquierda' },
    { cmd: PTZ.derecha,   area: '2 / 3', icono: 'fa-arrow-right',      titulo: 'Derecha' },
    { cmd: PTZ.abajoIzq,  area: '3 / 1', icono: 'fa-arrow-down-left',  titulo: 'Abajo e izquierda' },
    { cmd: PTZ.abajo,     area: '3 / 2', icono: 'fa-arrow-down',       titulo: 'Abajo' },
    { cmd: PTZ.abajoDer,  area: '3 / 3', icono: 'fa-arrow-down-right', titulo: 'Abajo y derecha' },
  ] as const;

  /** Se pone a false al soltar el botón; corta la cadena de pasos. */
  private manteniendo = false;

  private hls: Hls | null = null;
  private decodificador: jsDecoder.Reproductor | null = null;
  private whep: SesionWhep | null = null;

  readonly titulo = computed(() => {
    const c = this.camara();
    if (!c) return '';
    return c.numeroCenso ? `${c.nombre} · ${c.numeroCenso}` : c.nombre;
  });

  /** URL ya enganchada al <video>, para no volver a engancharla. */
  private urlEnganchada = '';

  constructor() {
    // Dos efectos y no uno, y el cuerpo va en untracked(), por una razón que
    // costó encontrar: el efecto que reacciona al cambio de cámara llamaba a
    // soltarReproductor(), que LEE el viewChild video(). Leer una señal de
    // viewChild dentro de un efecto lo hace depender de ella, así que cuando
    // el <video> se renderizaba —justo después de abrir el visor— el efecto
    // volvía a correr, destruía el reproductor recién creado y pedía la URL
    // por segunda vez. En la práctica: el video nunca cargaba y cada apertura
    // dejaba DOS entradas en la auditoría, porque pedir la URL cuenta como
    // consultar la cámara.
    effect(() => {
      const c = this.camara();
      untracked(() => {
        this.soltarReproductor();
        this.manteniendo = false;
        this.ptzEnCurso.set('');
        this.ptzAviso.set('');
        this.panelPtz.set(false);
        this.urlEnganchada = '';
        this.error.set('');
        this.urlActual.set('');
        this.stream.set(null);
        this.nodo.set('');
        if (c?.camaraCodigo) {
          // Al abrir se recupera dónde y de qué tamaño la dejó el operador la
          // última vez: mover la ventana a su sitio en cada apertura sería
          // tratar al despachador como si no supiera lo que quiere.
          this.restaurarGeometria();
          this.pedirUrl(c.camaraCodigo);
        }
      });
    });

    // Engancha en cuanto coexisten la URL y el elemento. Cuál de los dos llega
    // primero depende del navegador, así que se espera a los dos en vez de
    // suponer un orden.
    effect(() => {
      const url = this.urlActual();
      // Según el protocolo, el destino es el <video> (HLS) o el div del
      // jsDecoder: se espera al elemento que toque, no a uno fijo.
      const el  = this.usaJsDecoder() ? this.lienzo()?.nativeElement : this.video()?.nativeElement;
      if (!url || !el || this.urlEnganchada === url) return;
      this.urlEnganchada = url;
      untracked(() => this.abrirReproductor(el, url));
    });
  }

  private pedirUrl(codigo: string): void {
    this.cargando.set(true);
    this.svc.stream(codigo, this.eventoId() ?? undefined).subscribe({
      next: r => {
        this.cargando.set(false);
        if (!r.success || !r.data?.url) {
          this.error.set(r.message || 'El VMS no devolvió una URL de video.');
          return;
        }
        this.nodo.set(r.data.nodo ?? '');
        this.stream.set(r.data);
        // Escribir la URL es lo que dispara el enganche; no se llama aquí
        // directamente porque el elemento puede no existir todavía.
        this.urlActual.set(r.data.url);
      },
      error: e => {
        this.cargando.set(false);
        // El backend responde 422 con el motivo exacto cuando la cámara no se
        // puede ver; mostrarlo tal cual le ahorra al operador adivinar.
        this.error.set(e?.error?.message ?? 'No se pudo obtener el video de la cámara.');
      },
    });
  }

  /**
   * Abre el stream con el reproductor que corresponda. Quién decide es el
   * BACKEND, en el campo «reproductor» de la respuesta: el navegador no tiene
   * que deducirlo de la URL.
   */
  private abrirReproductor(el: HTMLElement, url: string): void {
    const datos = this.stream();

    if (datos?.reproductor === 'webrtc') {
      // Video por WebRTC desde el gateway del nodo edge: es la vía de latencia
      // mínima y no necesita nada instalado en el puesto. El token autoriza la
      // lectura y lo valida el gateway contra SECAD.
      void this.abrirWhep(el as HTMLVideoElement, url, datos.autenticacion);
      return;
    }

    if (datos?.reproductor === 'jsdecoder') {
      // Baja latencia por WebSocket. Hoy esto informa de qué falta en vez de
      // reproducir; ver jsdecoder.ts para el motivo y para dónde entra el SDK.
      const r = jsDecoder.reproducir(el, url, datos.autenticacion);
      if (!r.ok) this.error.set(r.mensaje);
      else this.decodificador = r.reproductor;
      return;
    }

    if (datos?.reproductor === 'ninguno') {
      this.error.set(
        `El VMS entregó el video por «${datos.protocolo}», que ningún navegador reproduce. ` +
        `Cambie el protocolo de la integración a HLS.`);
      return;
    }

    this.engancharVideo(el as HTMLVideoElement, url);
  }

  private engancharVideo(el: HTMLVideoElement, url: string): void {
    // hls.js PRIMERO, y el reproductor nativo solo como último recurso.
    //
    // Antes se probaba al revés, y eso rompía el video contra un HikCentral
    // real: los navegadores que dicen saber reproducir HLS de forma nativa
    // reciben la URL en el src del <video>, y entonces la petición la gobierna
    // «media-src» de la Content Security Policy, que no puede listar el host
    // del VMS porque es distinto en cada municipio. Con hls.js los segmentos
    // se descargan por XHR y se le entregan al <video> como «blob:», que la
    // CSP ya permite: así solo hace falta que «connect-src» conozca el VMS.
    if (Hls.isSupported()) {
      this.reproducirConHlsJs(el, url);
      return;
    }

    if (el.canPlayType('application/vnd.apple.mpegurl')) {
      el.src = url;
      el.play().catch(() => { /* el navegador puede exigir un gesto del usuario */ });
      return;
    }

    this.error.set('Este navegador no puede reproducir HLS. Use Chrome, Edge o Firefox actualizados.');
    return;
  }

  private reproducirConHlsJs(el: HTMLVideoElement, url: string): void {

    this.hls = new Hls({
      // ── Por qué NO se usa el modo de baja latencia ──────────────────────
      //
      // lowLatencyMode es para LL-HLS, que exige que el servidor publique
      // segmentos parciales (#EXT-X-PART). HikCentral no lo hace: emite HLS
      // normal. Con ese modo, y con liveSyncDurationCount en 2, el
      // reproductor se pega tanto al borde de la emisión que consume más
      // rápido de lo que el VMS publica, y se queda esperando el siguiente
      // segmento una y otra vez: el video se congela cada segundo con el
      // círculo de carga, aunque la red esté perfecta.
      //
      // Comprobado contra un HikCentral real: con estos valores tartamudea;
      // con los de abajo reproduce continuo. El precio son unos segundos más
      // de retraso respecto al directo, que para mirar una cámara del
      // municipio no cambia ninguna decisión del despachador.
      lowLatencyMode: false,
      liveSyncDurationCount: 3,
      // Techo de memoria: una cámara abierta mucho rato no debe crecer sin
      // límite en el navegador del despachador.
      backBufferLength: 30,
      // Reintentar eternamente solo esconde el fallo. Un reintento más en los
      // segmentos absorbe el tropiezo puntual de red sin llegar a tapar una
      // caída real.
      manifestLoadingMaxRetry: 2,
      levelLoadingMaxRetry: 2,
      fragLoadingMaxRetry: 4,
    });
    this.hls.on(Hls.Events.ERROR, (_e, data) => {
      // El detalle va siempre al log del navegador, fatal o no: cuando el
      // video no carga en un municipio, es lo único que permite distinguir un
      // certificado rechazado de un firewall o de un códec que no encaja.
      console.warn('[Cámaras] hls.js', data.type, data.details,
        'fatal=' + data.fatal, (data as { url?: string }).url ?? '');
      if (!data.fatal) return;
      // Un error fatal de red suele ser el certificado propio del VMS o que el
      // navegador no alcanza la red de cámaras. Decirlo es más útil que
      // «error desconocido».
      this.error.set(
        data.type === Hls.ErrorTypes.NETWORK_ERROR
          ? 'No se pudo abrir el video. Puede que este equipo no alcance la red de cámaras, o que el ' +
            'certificado del servidor de video no esté aceptado en el navegador.'
          : 'El video se interrumpió. Cierre y vuelva a abrir la cámara.');
      this.soltarReproductor();
    });
    this.hls.loadSource(url);
    this.hls.attachMedia(el);
    el.play().catch(() => { /* autoplay bloqueado: el usuario le dará al play */ });
  }

  private async abrirWhep(
    el: HTMLVideoElement, url: string, token: string | null,
  ): Promise<void> {
    try {
      this.whep = await conectarWhep({
        url, token, video: el,
        // Una caída posterior no puede quedarse callada: el operador tiene que
        // saber que lo que ve dejó de actualizarse.
        alFallar: motivo => this.error.set(motivo),
      });
    } catch (e) {
      this.error.set((e as Error)?.message ?? 'No se pudo abrir el video del municipio.');
    }
  }

  private soltarReproductor(): void {
    if (this.whep) {
      try { this.whep.destruir(); } catch { /* ya cerrada */ }
      this.whep = null;
    }
    if (this.decodificador) {
      try { this.decodificador.destruir(); } catch { /* ya destruido */ }
      this.decodificador = null;
    }
    if (this.hls) {
      try { this.hls.destroy(); } catch { /* ya destruido */ }
      this.hls = null;
    }
    const el = this.video()?.nativeElement;
    if (el) { try { el.pause(); el.removeAttribute('src'); el.load(); } catch { /* sin nada que soltar */ } }
  }

  reintentar(): void {
    const c = this.camara();
    if (!c?.camaraCodigo) return;
    this.error.set('');
    this.urlEnganchada = '';
    this.urlActual.set('');
    this.pedirUrl(c.camaraCodigo);
  }

  pantallaCompleta(): void {
    this.video()?.nativeElement.requestFullscreen?.().catch(() => { /* el navegador puede negarlo */ });
  }

  // ── PTZ ──────────────────────────────────────────────────────────────────

  alternarPanelPtz(): void {
    this.panelPtz.update(v => !v);
    this.ptzAviso.set('');
  }

  /**
   * Mantener pulsado mueve; soltar para. Se encadenan pasos cortos en vez de
   * mandar un «arranca» y confiar en que llegue el «para»: si el navegador se
   * cierra a mitad, lo único que pasa es que no se pide el paso siguiente.
   */
  empezarMovimiento(comando: string, ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    if (this.ptzEnCurso()) return;
    this.manteniendo = true;
    void this.cadenaDePasos(comando);
  }

  terminarMovimiento(): void { this.manteniendo = false; }

  private async cadenaDePasos(comando: string): Promise<void> {
    for (let n = 0; n < CamaraVisorComponent.MAX_PASOS; n++) {
      const seguir = await this.unPaso(comando);
      // Se para al soltar, al fallar, o al llegar al tope: mantener pulsado por
      // accidente no debe martillear el VMS indefinidamente —la propia OpenAPI
      // pide no llamar seguido—.
      if (!seguir || !this.manteniendo) return;
    }
    this.ptzAviso.set('Movimiento detenido por seguridad. Vuelva a pulsar para seguir.');
  }

  /** Un paso. Devuelve false si no conviene seguir. */
  private unPaso(comando: string, extra: { preset?: number } = {}): Promise<boolean> {
    const c = this.camara();
    if (!c?.camaraCodigo) return Promise.resolve(false);

    this.ptzEnCurso.set(comando);
    this.ptzAviso.set('');

    return new Promise<boolean>(resolver => {
      this.svc.ptz(c.camaraCodigo!, {
        comando,
        velocidad:  this.ptzVelocidad(),
        duracionMs: CamaraVisorComponent.PASO_MS,
        eventoId:   this.eventoId() ?? undefined,
        ...extra,
      }).subscribe({
        next: r => {
          this.ptzEnCurso.set('');
          // El backend avisa cuando el VMS aceptó el giro pero no confirmó la
          // parada. Callarlo sería lo peor: la cámara puede seguir moviéndose.
          if (r.data && !r.data.detenida) this.ptzAviso.set(r.message);
          resolver(!!r.success);
        },
        error: e => {
          this.ptzEnCurso.set('');
          this.ptzAviso.set(e?.error?.message ?? 'No se pudo mover la cámara.');
          resolver(false);
        },
      });
    });
  }

  /** Un toque = un paso, para quien prefiera pulsar en vez de mantener. */
  unToque(comando: string): void {
    if (this.ptzEnCurso()) return;
    this.manteniendo = false;
    void this.unPaso(comando);
  }

  irAPreset(): void {
    const n = this.preset();
    if (n == null || n < 1 || n > 256) {
      this.ptzAviso.set('El preset debe estar entre 1 y 256.');
      return;
    }
    if (this.ptzEnCurso()) return;
    this.manteniendo = false;
    void this.unPaso(PTZ.irAPreset, { preset: n });
  }

  // Soltar el ratón fuera de la ventana también tiene que cortar la cadena.
  @HostListener('window:pointerup')
  @HostListener('window:pointercancel')
  @HostListener('window:blur')
  alSoltarFuera(): void { this.terminarMovimiento(); }

  // ── Arrastrar y redimensionar ────────────────────────────────────────────
  //
  // Con eventos de puntero y no con la librería de arrastre de CDK a
  // propósito: aquí hace falta controlar también el recorte contra los bordes
  // de la pantalla y la persistencia, y mezclar el transform de CDK con una
  // posición guardada da más trabajo del que ahorra.

  empezarArrastre(ev: PointerEvent): void {
    if (ev.button !== 0) return;
    const inicio = { x: ev.clientX, y: ev.clientY };
    const desde  = this.pos();
    const asa    = ev.currentTarget as HTMLElement;

    this.moviendo.set(true);
    asa.setPointerCapture(ev.pointerId);

    const mover = (e: PointerEvent) =>
      this.pos.set(this.recortar(
        desde.x + (e.clientX - inicio.x),
        desde.y + (e.clientY - inicio.y)));

    const soltar = () => {
      this.moviendo.set(false);
      asa.removeEventListener('pointermove', mover);
      asa.removeEventListener('pointerup', soltar);
      asa.removeEventListener('pointercancel', soltar);
      this.guardarGeometria();
    };

    asa.addEventListener('pointermove', mover);
    asa.addEventListener('pointerup', soltar);
    asa.addEventListener('pointercancel', soltar);
    ev.preventDefault();
  }

  empezarRedimension(ev: PointerEvent): void {
    if (ev.button !== 0) return;
    const inicio = { x: ev.clientX, y: ev.clientY };
    const desde  = this.ancho();
    const asa    = ev.currentTarget as HTMLElement;

    asa.setPointerCapture(ev.pointerId);

    // Solo se gobierna el ancho; el alto lo fija el 16:9 del marco. Así la
    // imagen nunca queda con franjas negras. El gesto vertical también cuenta,
    // convertido a su equivalente horizontal, para que arrastrar la esquina en
    // diagonal se sienta natural.
    const mover = (e: PointerEvent) => {
      const dx = e.clientX - inicio.x;
      const dy = (e.clientY - inicio.y) * (16 / 9);
      this.ancho.set(this.anchoValido(desde + Math.max(dx, dy)));
      this.pos.set(this.recortar(this.pos().x, this.pos().y));
    };

    const soltar = () => {
      asa.removeEventListener('pointermove', mover);
      asa.removeEventListener('pointerup', soltar);
      asa.removeEventListener('pointercancel', soltar);
      this.guardarGeometria();
    };

    asa.addEventListener('pointermove', mover);
    asa.addEventListener('pointerup', soltar);
    asa.addEventListener('pointercancel', soltar);
    ev.preventDefault();
    ev.stopPropagation();
  }

  alternarMinimizada(): void {
    this.minimizada.update(v => !v);
    this.pos.set(this.recortar(this.pos().x, this.pos().y));
    this.guardarGeometria();
  }

  /** Si cambia el tamaño de la pantalla, la ventana no puede quedar fuera. */
  @HostListener('window:resize')
  alRedimensionarPantalla(): void {
    this.ancho.set(this.anchoValido(this.ancho()));
    this.pos.set(this.recortar(this.pos().x, this.pos().y));
  }

  private anchoValido(a: number): number {
    const tope = Math.max(CamaraVisorComponent.ANCHO_MIN,
                          Math.min(1280, window.innerWidth - 24));
    return Math.round(Math.min(tope, Math.max(CamaraVisorComponent.ANCHO_MIN, a)));
  }

  /**
   * Deja la ventana dentro de la pantalla. Se exige que quede visible al menos
   * la cabecera: una ventana arrastrada fuera del borde no se podría recuperar.
   */
  private recortar(x: number, y: number): { x: number; y: number } {
    const alto = this.ventana()?.nativeElement.offsetHeight ?? 260;
    const maxX = Math.max(8, window.innerWidth  - this.ancho() - 8);
    const maxY = Math.max(8, window.innerHeight - Math.min(alto, 120) - 8);
    return {
      x: Math.round(Math.min(maxX, Math.max(8, x))),
      y: Math.round(Math.min(maxY, Math.max(8, y))),
    };
  }

  /** Posición y tamaño sobreviven entre aperturas y entre sesiones. */
  private guardarGeometria(): void {
    try {
      localStorage.setItem(CamaraVisorComponent.CLAVE_GEOMETRIA, JSON.stringify({
        ...this.pos(), ancho: this.ancho(), minimizada: this.minimizada(),
      }));
    } catch { /* modo privado o almacenamiento lleno: no es motivo para fallar */ }
  }

  private restaurarGeometria(): void {
    let guardado: { x?: number; y?: number; ancho?: number; minimizada?: boolean } | null = null;
    try {
      const crudo = localStorage.getItem(CamaraVisorComponent.CLAVE_GEOMETRIA);
      guardado = crudo ? JSON.parse(crudo) : null;
    } catch { guardado = null; }

    this.ancho.set(this.anchoValido(guardado?.ancho ?? 640));
    this.minimizada.set(!!guardado?.minimizada);

    // Por defecto, abajo a la derecha: es donde menos tapa la consola.
    const x = guardado?.x ?? (window.innerWidth  - this.ancho() - 24);
    const y = guardado?.y ?? (window.innerHeight - 420);
    this.pos.set(this.recortar(x, y));
  }

  ngOnDestroy(): void {
    this.manteniendo = false;
    this.soltarReproductor();
  }
}
