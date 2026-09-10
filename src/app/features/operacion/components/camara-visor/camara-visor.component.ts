import {
  ChangeDetectionStrategy, Component, ElementRef, OnDestroy,
  computed, effect, inject, input, output, signal, untracked, viewChild,
} from '@angular/core';
import Hls from 'hls.js';
import { CamaraService, DtoCamara } from '../../../../core/services/operacion/camara.service';

/**
 * Reproduce una cámara CCTV en vivo.
 *
 * El video va del navegador AL VMS, sin pasar por el backend de SECAD: el
 * backend solo autoriza y entrega una URL de corta vida. Meter el stream por
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

  private hls: Hls | null = null;

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
        this.urlEnganchada = '';
        this.error.set('');
        this.urlActual.set('');
        this.nodo.set('');
        if (c?.camaraCodigo) this.pedirUrl(c.camaraCodigo);
      });
    });

    // Engancha en cuanto coexisten la URL y el elemento. Cuál de los dos llega
    // primero depende del navegador, así que se espera a los dos en vez de
    // suponer un orden.
    effect(() => {
      const url = this.urlActual();
      const el  = this.video()?.nativeElement;
      if (!url || !el || this.urlEnganchada === url) return;
      this.urlEnganchada = url;
      untracked(() => this.engancharVideo(el, url));
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
        // Escribir la URL es lo que dispara el enganche; no se llama aquí
        // directamente porque el <video> puede no existir todavía.
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

  private engancharVideo(el: HTMLVideoElement, url: string): void {
    if (el.canPlayType('application/vnd.apple.mpegurl')) {
      el.src = url;
      el.play().catch(() => { /* el navegador puede exigir un gesto del usuario */ });
      return;
    }

    if (!Hls.isSupported()) {
      this.error.set('Este navegador no puede reproducir HLS. Use Chrome, Edge o Firefox actualizados.');
      return;
    }

    this.hls = new Hls({
      // El despacho quiere ver lo que pasa AHORA: se limita cuánto se queda
      // atrás el reproductor en vez de dejarlo acumular buffer.
      liveSyncDurationCount: 2,
      lowLatencyMode: true,
      // La URL es de corta vida; reintentar eternamente solo esconde el fallo.
      manifestLoadingMaxRetry: 2,
      levelLoadingMaxRetry: 2,
      fragLoadingMaxRetry: 3,
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

  private soltarReproductor(): void {
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

  ngOnDestroy(): void { this.soltarReproductor(); }
}
