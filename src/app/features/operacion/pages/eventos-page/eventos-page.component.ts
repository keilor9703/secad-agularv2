import {
  Component, ChangeDetectionStrategy, OnInit, OnDestroy,
  ElementRef, HostListener, computed, inject, signal, viewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, interval } from 'rxjs';
import { debounceTime, distinctUntilChanged, startWith, switchMap } from 'rxjs/operators';

import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiSectionHeaderComponent } from '../../../../shared/components/ui-section-header/ui-section-header.component';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiSearchInputComponent } from '../../../../shared/components/ui-search-input/ui-search-input.component';
import { UiModalComponent } from '../../../../shared/components/ui-modal/ui-modal.component';
import { UiBadgeComponent } from '../../../../shared/components/ui-badge/ui-badge.component';
import { UiSpinnerComponent } from '../../../../shared/components/ui-spinner/ui-spinner.component';
import { UiToggleComponent } from '../../../../shared/components/ui-toggle/ui-toggle.component';

import { AuthService } from '../../../../core/auth/auth.service';
import {
  EventoService, DtoEventoListItem, DtoCanalItem, DtoSlaConfig, DtoEventoConteos
} from '../../../../core/services/operacion/evento.service';
import {
  EventoDetalleComponent, CambioEstadoEvento
} from '../../components/evento-detalle/evento-detalle.component';
import {
  ESTADOS_EVENTO, UmbralesSla, etiquetaEstadoEvento, etiquetaFechaCreacion,
  etiquetaPrioridad, etiquetaTiempo, semaforoDe, varianteEstadoEvento, variantePrioridad
} from '../../utils/eventos-sla.util';

type SemaforoColor = 'semaforo-verde' | 'semaforo-amarillo' | 'semaforo-rojo';
type EstadoEvento  = 'A' | 'P' | 'E' | 'T' | 'R' | 'C';


@Component({
  selector: 'app-eventos-page',
  standalone: true,
  imports: [
    FormsModule,
    UiPageHeaderComponent,
    UiSectionHeaderComponent,
    UiButtonComponent,
    UiSearchInputComponent,
    UiModalComponent,
    UiBadgeComponent,
    UiSpinnerComponent,
    UiToggleComponent,
    EventoDetalleComponent,
  ],
  templateUrl: './eventos-page.component.html',
  styleUrls: ['./eventos-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EventosPageComponent implements OnInit, OnDestroy {

  // ══════════════════════════════════════════════════════════════════════════
  //  Servicios
  // ══════════════════════════════════════════════════════════════════════════
  private readonly eventoSvc = inject(EventoService);
  private readonly authSvc   = inject(AuthService);

  // ── Claims del JWT ────────────────────────────────────────────────────────
  canalId    = 0;
  fuerzaId   = 0;
  sitioGraba = 0;
  idUsuario  = 0;
  esAdmin    = false;

  // ══════════════════════════════════════════════════════════════════════════
  //  Canal de despacho
  // ══════════════════════════════════════════════════════════════════════════
  readonly canalesDisponibles   = signal<DtoCanalItem[]>([]);
  readonly canalSeleccionado    = signal(0);
  readonly canalNombre          = signal('');
  readonly mostrarSelectorCanal = signal(false);

  /**
   * La elección de canal se guarda por usuario: en una estación compartida
   * entre turnos, alguien sin canal en su JWT no debe heredar en silencio el
   * canal que otro eligió a mano antes en esa misma pestaña.
   */
  private readonly CANAL_KEY = 'ev_canal_sel';
  private canalStorageKey(idUsuario: number): string { return `${this.CANAL_KEY}:${idUsuario}`; }

  // ══════════════════════════════════════════════════════════════════════════
  //  Bandeja
  // ══════════════════════════════════════════════════════════════════════════
  readonly eventos      = signal<DtoEventoListItem[]>([]);
  readonly filtroTexto  = signal('');
  readonly filtroEstado = signal('');
  readonly cargando     = signal(false);
  readonly errorCarga   = signal('');

  /** ids vistos en el poll anterior — para saber cuáles llegaron en este tick. */
  private idsConocidos = new Set<string>();
  private readonly idsRecienLlegados = signal(new Set<string>());
  private limpiarRecienLlegadosTimer?: ReturnType<typeof setTimeout>;
  /** En la primera carga no destella nada: lo que ya estaba no es «nuevo». */
  private primerPollCompletado = false;

  readonly conteos = signal<DtoEventoConteos>({
    total: 0, activos: 0, pendientes: 0, enProceso: 0,
    seguimiento: 0, revision: 0, cerradosTurno: 0, turnoActual: '', turnoDesde: ''
  });

  /** Evento abierto en el panel de detalle. */
  readonly eventoSeleccionado = signal<DtoEventoListItem | null>(null);

  // ── Búsqueda en el histórico ──────────────────────────────────────────────
  private readonly busquedaSubj = new Subject<string>();
  readonly resultadosBusqueda = signal<DtoEventoListItem[]>([]);
  readonly buscandoBackend    = signal(false);
  readonly mostrarResultadosBusqueda = computed(() => this.filtroTexto().trim().length >= 3);

  // ── Alerta sonora ─────────────────────────────────────────────────────────
  private readonly SONIDO_KEY = 'ev_sonido_activo';
  readonly sonidoActivo = signal(true);
  private audioCtx: AudioContext | null = null;

  // ── Semáforo ──────────────────────────────────────────────────────────────
  readonly tick      = signal(0);
  readonly slaConfig = signal<DtoSlaConfig[]>([]);

  // ── Suscripciones ─────────────────────────────────────────────────────────
  private readonly subs = new Subscription();

  readonly ESTADOS = ESTADOS_EVENTO;

  readonly umbrales = computed<UmbralesSla>(() => ({
    sinAcceso: this.slaConfig().find(x => x.nombre === 'SIN_ACCESO')?.umbralMinutos ?? 1,
    critico:   this.slaConfig().find(x => x.nombre === 'GESTION_CRITICA')?.umbralMinutos ?? 10,
  }));

  getEstadoLabel        = etiquetaEstadoEvento;
  getEstadoVariante     = varianteEstadoEvento;
  getPrioridadLabel     = etiquetaPrioridad;
  getPrioridadVariante  = variantePrioridad;
  getFechaCreacionLabel = etiquetaFechaCreacion;

  getSemaforoClass(ev: DtoEventoListItem) {
    void this.tick();
    return semaforoDe(ev, this.umbrales());
  }

  getElapsedLabel(ev: DtoEventoListItem): string {
    void this.tick();
    return etiquetaTiempo(ev);
  }

  /** Filtros de la bandeja, con su contador. */
  readonly filtros = computed(() => {
    const c = this.conteos();
    return [
      { valor: '',  label: 'Todos',       total: c.total },
      { valor: 'A', label: 'Activos',     total: c.activos },
      { valor: 'P', label: 'Pendientes',  total: c.pendientes },
      { valor: 'E', label: 'En proceso',  total: c.enProceso },
      { valor: 'T', label: 'Seguimiento', total: c.seguimiento },
      { valor: 'R', label: 'Revisión',    total: c.revision },
      { valor: 'C', label: 'Cerrados',    total: c.cerradosTurno },
    ];
  });

  // ══════════════════════════════════════════════════════════════════════════
  //  Ciclo de vida
  // ══════════════════════════════════════════════════════════════════════════

  ngOnInit(): void {
    const claims = this.authSvc.getJwtClaims();
    this.fuerzaId   = claims.fuerzaId;
    this.sitioGraba = claims.sitioGraba;
    this.canalId    = claims.canalId;
    this.esAdmin    = claims.esAdmin;
    this.idUsuario  = claims.idUsuario;

    // Prioridad: claim del JWT > lo guardado por ESTE usuario en la pestaña > 0.
    if (this.canalId > 0) {
      this.canalSeleccionado.set(this.canalId);
    } else {
      const guardado = sessionStorage.getItem(this.canalStorageKey(this.idUsuario));
      if (guardado) {
        // «codigo:fuerzaId» — se restauran juntos: el código no es único entre fuerzas.
        const [codigo, fuerzaId] = guardado.split(':').map(Number);
        if (codigo > 0) {
          this.canalSeleccionado.set(codigo);
          this.fuerzaId = fuerzaId || 0;
        }
      }
    }

    this.cargarCanales();

    const sonido = localStorage.getItem(this.SONIDO_KEY);
    if (sonido != null) this.sonidoActivo.set(sonido === '1');

    // Búsqueda en el histórico (incluye cerrados).
    this.subs.add(
      this.busquedaSubj.pipe(debounceTime(400), distinctUntilChanged()).subscribe(texto => {
        const q = texto.trim();
        if (q.length < 3) { this.resultadosBusqueda.set([]); this.buscandoBackend.set(false); return; }
        this.buscandoBackend.set(true);
        this.eventoSvc.buscar(q, this.fuerzaId || undefined, this.sitioGraba || undefined).subscribe({
          next: r  => { this.resultadosBusqueda.set(r); this.buscandoBackend.set(false); },
          error: () => { this.resultadosBusqueda.set([]); this.buscandoBackend.set(false); }
        });
      })
    );

    // Umbrales SLA. Si falla, quedan los valores por defecto de `umbrales`.
    this.eventoSvc.getSlaConfig().subscribe({
      next: cfg => this.slaConfig.set(cfg),
      error: () => { /* no crítico */ }
    });

    // Un solo latido de un minuto para toda la pantalla: mantiene vivos el
    // semáforo de la bandeja y los cronómetros del detalle.
    this.subs.add(interval(60_000).subscribe(() => this.tick.update(t => t + 1)));

    // Refresco de la bandeja cada 15 s, junto con los contadores.
    this.subs.add(
      interval(15_000).pipe(
        startWith(0),
        switchMap(() => {
          this.cargando.set(true);
          this.refrescarConteos();
          return this.eventoSvc.getEventos(
            this.canalSeleccionado() || undefined,
            this.fuerzaId || undefined,
            this.filtroEstado() || undefined
          );
        })
      ).subscribe({
        next: items => {
          if (this.primerPollCompletado) {
            const nuevos = items.filter(i => !this.idsConocidos.has(i.id)).map(i => i.id);
            if (nuevos.length) {
              this.idsRecienLlegados.set(new Set(nuevos));
              clearTimeout(this.limpiarRecienLlegadosTimer);
              this.limpiarRecienLlegadosTimer = setTimeout(() => this.idsRecienLlegados.set(new Set()), 6000);
              this.reproducirAlertaSonora();
            }
          } else {
            this.primerPollCompletado = true;
          }
          this.idsConocidos = new Set(items.map(i => i.id));
          this.eventos.set(items);
          this.cargando.set(false);
          this.errorCarga.set('');
        },
        error: err => {
          this.cargando.set(false);
          this.errorCarga.set('No se pudo obtener la cola de eventos. Reintentando…');
          console.error('[Eventos] Error de carga:', err);
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    clearTimeout(this.limpiarRecienLlegadosTimer);
    // El origen dejaba un AudioContext vivo por cada visita a la pantalla.
    void this.audioCtx?.close().catch(() => { /* ya cerrado */ });
    this.audioCtx = null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Canal de despacho
  // ══════════════════════════════════════════════════════════════════════════

  private cargarCanales(): void {
    this.eventoSvc.getCanales(this.sitioGraba || undefined).subscribe({
      next: c => {
        this.canalesDisponibles.set(c);
        this.actualizarNombreCanal();
        if (this.canalSeleccionado() <= 0 && c.length > 0) this.mostrarSelectorCanal.set(true);
      },
      error: () => { /* no fatal */ }
    });
  }

  private actualizarNombreCanal(): void {
    // El código no es único entre fuerzas: hay que emparejarlo con fuerzaId o
    // se puede resolver el nombre del canal de otra fuerza.
    const encontrado = this.canalesDisponibles().find(
      c => c.codigo === this.canalSeleccionado() && c.fuerzaId === this.fuerzaId
    );
    this.canalNombre.set(
      encontrado ? `${encontrado.fuerzaDesc} – ${encontrado.descripcion}`
      : this.canalSeleccionado() > 0 ? `Canal ${this.canalSeleccionado()}`
      : 'Sin canal'
    );
  }

  seleccionarCanal(codigo: number, fuerzaId: number): void {
    this.canalSeleccionado.set(codigo);
    this.fuerzaId = fuerzaId;
    this.mostrarSelectorCanal.set(false);
    sessionStorage.setItem(this.canalStorageKey(this.idUsuario), `${codigo}:${fuerzaId}`);
    this.actualizarNombreCanal();
    // El detalle abierto pertenece al canal anterior: volverLista() detiene
    // sus pollings, destruye el mapa y limpia el panel.
    this.volverLista();
    this.recargarAhora();
  }

  cambiarCanal(): void    { this.mostrarSelectorCanal.set(true); }
  cancelarSelector(): void { this.mostrarSelectorCanal.set(false); }

  // ══════════════════════════════════════════════════════════════════════════
  //  Bandeja
  // ══════════════════════════════════════════════════════════════════════════

  private refrescarConteos(): void {
    this.eventoSvc.getConteos(this.canalSeleccionado() || undefined, this.fuerzaId || undefined)
      .subscribe({ next: c => this.conteos.set(c), error: () => { /* los badges no se actualizan */ } });
  }

  recargarAhora(): void {
    this.cargando.set(true);
    this.refrescarConteos();
    this.eventoSvc.getEventos(
      this.canalSeleccionado() || undefined,
      this.fuerzaId || undefined,
      this.filtroEstado() || undefined
    ).subscribe({
      next: items => { this.eventos.set(items); this.cargando.set(false); this.errorCarga.set(''); },
      error: ()    => { this.cargando.set(false); this.errorCarga.set('No se pudo cargar la cola de eventos.'); }
    });
  }

  filtrarPorEstado(estado: string): void {
    this.filtroEstado.set(estado);
    this.recargarAhora();
  }

  abrirDetalle(evento: DtoEventoListItem): void {
    this.eventoSeleccionado.set(evento);
  }

  volverLista(): void {
    this.eventoSeleccionado.set(null);
  }

  /**
   * Refleja en la bandeja un cambio de estado hecho desde el detalle.
   *
   * Sale sin tocar nada si el estado ya era ese: reescribir la lista creaba un
   * objeto nuevo en cada vuelta, la entrada del panel de detalle cambiaba de
   * identidad y volvía a cargarse el caso, en bucle.
   */
  aplicarEstadoActualizado(pedidoId: string, nuevoEstado: string | null | undefined): void {
    if (!nuevoEstado) return;
    if (!this.eventos().some(ev => ev.id === pedidoId && ev.estado !== nuevoEstado)) return;
    this.eventos.update(l => l.map(ev => ev.id === pedidoId ? { ...ev, estado: nuevoEstado } : ev));
  }

  onFiltroTextoChange(texto: string): void {
    this.filtroTexto.set(texto);
    this.busquedaSubj.next(texto);
  }

  readonly eventosFiltrados = computed<DtoEventoListItem[]>(() => {
    const eventos = this.eventos();
    const q = this.filtroTexto().trim().toLowerCase();
    if (!q) return eventos;
    return eventos.filter(e =>
      e.direCaso?.toLowerCase().includes(q)         ||
      e.ciudad?.toLowerCase().includes(q)           ||
      e.codiPedido?.toLowerCase().includes(q)       ||
      e.codiPedido2?.toLowerCase().includes(q)      ||
      e.descPedido?.toLowerCase().includes(q)       ||
      String(e.numeLlamada  ?? '').includes(q)      ||
      String(e.numeTelefono ?? '').includes(q)      ||
      String(e.numeEvento   ?? '').includes(q)      ||
      String(e.id           ?? '').includes(q)      ||
      e.nombLlamante?.toLowerCase().includes(q)     ||
      e.usernameCreacion?.toLowerCase().includes(q)
    );
  });

  /** Casos abiertos sin ningún recurso que superaron el umbral crítico. */
  readonly eventosEscalados = computed(() => {
    void this.tick();
    const umbral = this.umbrales().critico;
    return this.eventos().filter(ev => {
      if (ev.estado === 'C' || ev.totalActuacionesActivas > 0 || !ev.fechaPrimerAcceso) return false;
      return (Date.now() - new Date(ev.fechaPrimerAcceso).getTime()) / 60000 >= umbral;
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  //  Alerta sonora y atajos
  // ══════════════════════════════════════════════════════════════════════════

  toggleSonido(activo: boolean): void {
    this.sonidoActivo.set(activo);
    localStorage.setItem(this.SONIDO_KEY, activo ? '1' : '0');
  }

  /** Pitido corto por Web Audio; no necesita ningún archivo de audio. */
  private reproducirAlertaSonora(): void {
    if (!this.sonidoActivo()) return;
    try {
      this.audioCtx ??= new AudioContext();
      const ctx = this.audioCtx;
      if (ctx.state === 'suspended') return;   // autoplay: requiere interacción previa
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch { /* silencioso: la alerta visual sigue funcionando */ }
  }

  @HostListener('window:keydown', ['$event'])
  onKeydown(ev: KeyboardEvent): void {
    const target = ev.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable) return;

    if (ev.key === 'Escape' && this.eventoSeleccionado()) { this.volverLista(); return; }
    if (this.eventoSeleccionado()) return;
    if (ev.key === '/') {
      ev.preventDefault();
      this.buscadorRef()?.nativeElement.querySelector('input')?.focus();
    } else if (ev.key === 'r' || ev.key === 'R') {
      this.recargarAhora();
    }
  }

  readonly buscadorRef = viewChild<ElementRef<HTMLElement>>('buscador');

  // ══════════════════════════════════════════════════════════════════════════
  //  Indicadores de la tarjeta
  // ══════════════════════════════════════════════════════════════════════════

  /** Destella unos segundos tras el poll en que el evento apareció. */
  esEventoNuevo(ev: DtoEventoListItem): boolean { return this.idsRecienLlegados().has(ev.id); }

  /** 'E' = en proceso, que el backend asigna al abrirlo un despachador. */
  esEventoEnGestion(ev: DtoEventoListItem): boolean { return ev.estado === 'E'; }
}
