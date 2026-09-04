import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  computed,
  inject,
  signal
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiPanelHeaderComponent } from '../../../../shared/components/ui-panel-header/ui-panel-header.component';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiInputComponent } from '../../../../shared/components/ui-input/ui-input.component';
import { UiDateTimePickerComponent } from '../../../../shared/components/ui-date-time-picker/ui-date-time-picker.component';
import { UiSelectComponent } from '../../../../shared/components/ui-select/ui-select.component';
import { UiToggleComponent } from '../../../../shared/components/ui-toggle/ui-toggle.component';
import { UiBadgeComponent } from '../../../../shared/components/ui-badge/ui-badge.component';
import { UiChipComponent } from '../../../../shared/components/ui-chip/ui-chip.component';
import { UiSpinnerComponent } from '../../../../shared/components/ui-spinner/ui-spinner.component';
import { UiModalComponent } from '../../../../shared/components/ui-modal/ui-modal.component';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';
import { Subscription, interval } from 'rxjs';

import {
  TurnosService,
  DtoTurnoListItem, DtoTurno, DtoTurnoUnidad, DtoMedioDisponible, DtoPersonalMedio,
  DtoCrearTurnoRequest, DtoCopiarTurnoRequest,
  DtoAgregarUnidadRequest, DtoAgregarMedioRequest, DtoActualizarMedioRequest,
  DtoImportarSiviccRequest, DtoUnidadSivicc,
  EstadoMedio
} from '../../../../core/services/operacion/turnos.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { EventoService, DtoCanalItem } from '../../../../core/services/operacion/evento.service';
import { FuerzaService, DtoFuerza } from '../../../administracion/services/fuerza.service';
import { ToastService } from '../../../../core/services/toast.service';

/** Formulario de crear/copiar turno — extiende el DTO con campos de fecha datetime-local */
interface FormTurnoConFecha extends DtoCrearTurnoRequest {
  _inicio: string;
  _fin:    string;
}
interface FormCopiarConFecha extends DtoCopiarTurnoRequest {
  _inicio: string;
  _fin:    string;
}

/** Formulario de medio: wrappea hasta 2 personal como campos individuales */
interface FormMedio extends DtoAgregarMedioRequest {
  _personal1Cedu: string;
  _personal1Nomb: string;
  _personal2Cedu: string;
  _personal2Nomb: string;
}

@Component({
  selector: 'app-turnos-page',
  standalone:  true,
  imports: [
    FormsModule,
    UiPageHeaderComponent,
    UiPanelHeaderComponent,
    UiButtonComponent,
    UiInputComponent,
    UiSelectComponent,
    UiToggleComponent,
    UiBadgeComponent,
    UiChipComponent,
    UiSpinnerComponent,
    UiModalComponent,
    UiDateTimePickerComponent,
  ],
  templateUrl: './turnos-page.component.html',
  styleUrls: ['./turnos-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TurnosPageComponent implements OnInit, OnDestroy {

  // ── Services ─────────────────────────────────────────────────────────────────
  private turnosSvc  = inject(TurnosService);
  private authSvc    = inject(AuthService);
  private eventoSvc  = inject(EventoService);
  private fuerzaSvc  = inject(FuerzaService);
  private toast      = inject(ToastService);

  // ── Fuerzas disponibles (para desplegable) ────────────────────────────────────
  readonly fuerzas = signal<DtoFuerza[]>([]);

  // ── Canales de radio (cargados una vez) ───────────────────────────────────────
  readonly canales = signal<DtoCanalItem[]>([]);
  readonly cargandoCanales = signal(false);

  // ── Claims JWT ────────────────────────────────────────────────────────────────
  fuerzaId   = 0;
  sitioGraba = 0;

  // ── Filtros ───────────────────────────────────────────────────────────────────
  /** Fuerza a consultar (inicia con la del JWT, el usuario puede cambiarla) */
  fuerzaFiltro = 0;
  /** yyyy-MM-dd (formato del input[type=date]) */
  fechaBusqueda = '';
  readonly cargando = signal(false);
  readonly error    = signal('');

  // ── Lista de turnos ───────────────────────────────────────────────────────────
  readonly turnos            = signal<DtoTurnoListItem[]>([]);
  turnoSeleccionado: DtoTurnoListItem | null = null;
  readonly turnoDetalle       = signal<DtoTurno | null>(null);

  // ── Unidades ──────────────────────────────────────────────────────────────────
  readonly unidades = signal<DtoTurnoUnidad[]>([]);
  unidadActiva:      DtoTurnoUnidad | null = null;
  readonly cargandoUnidades = signal(false);

  // ── Medios ────────────────────────────────────────────────────────────────────
  readonly medios = signal<DtoMedioDisponible[]>([]);
  readonly cargandoMedios = signal(false);

  // ── Modal: Crear turno ────────────────────────────────────────────────────────
  readonly modalCrear       = signal(false);
  readonly guardandoCrear   = signal(false);
  readonly errorCrear       = signal('');
  formCrear: FormTurnoConFecha = this.nuevoFormCrear();

  // ── Modal: Copiar turno ───────────────────────────────────────────────────────
  readonly modalCopiar      = signal(false);
  readonly guardandoCopiar  = signal(false);
  readonly errorCopiar      = signal('');
  formCopiar: FormCopiarConFecha = { turnoOrigenId: '', claseTurno: 1, horaInicia: '', horaTermina: '', _inicio: '', _fin: '' };

  // ── Modal: Agregar unidad ─────────────────────────────────────────────────────
  readonly modalUnidad      = signal(false);
  readonly guardandoUnidad  = signal(false);
  readonly errorUnidad      = signal('');
  formUnidad: DtoAgregarUnidadRequest = { turnoId: '', unidadCodigo: '', unidadDesc: '', consignas: '' };

  // ── Modal: Agregar medio ──────────────────────────────────────────────────────
  readonly modalMedio       = signal(false);
  readonly guardandoMedio   = signal(false);
  readonly errorMedio       = signal('');
  formMedio: FormMedio = this.nuevoFormMedio();

  // ── Modal: Editar medio ───────────────────────────────────────────────────────
  readonly modalEditarMedio      = signal(false);
  readonly guardandoEditarMedio  = signal(false);
  readonly errorEditarMedio      = signal('');
  readonly medioEditando = signal<DtoMedioDisponible | null>(null);
  formEditarMedio: FormMedio = this.nuevoFormMedio();

  // ── Modal: Importar SIVICC (wizard 2 pasos) ──────────────────────────────────
  readonly modalSivicc           = signal(false);
  /** Paso 1: consultando unidades en SIVICC */
  readonly cargandoUnidadesSivicc = signal(false);
  /** Unidades disponibles retornadas por GET .../sivicc/unidades */
  readonly unidadesSivicc = signal<DtoUnidadSivicc[]>([]);
  /** Paso 3: importando */
  readonly guardandoSivicc  = signal(false);
  readonly errorSivicc      = signal('');
  /** Canal radio a asignar (opcional) */
  siviccCanalCodigo:   number | undefined = undefined;
  siviccCanalFuerzaId: number | undefined = undefined;
  formSivicc: DtoImportarSiviccRequest = {
    turnoId: '', fuerzaId: 0, sitioGraba: 0, unidades: []
  };

  // ── Resumen de disponibilidad en vivo (medios de la unidad activa) ────────────
  /** Refresca `medios` cada 15 s mientras haya una unidad seleccionada y la pestaña esté visible. */
  private readinessSub: Subscription | null = null;
  readonly ultimaActualizacionMedios = signal<Date | null>(null);

  // ── Subscriptions ─────────────────────────────────────────────────────────────
  private subs = new Subscription();

  // ── Constantes expuestas al template ─────────────────────────────────────────
  readonly TIPOS_MEDIO_LIST = [
    { value: 20, label: 'Motocicleta'     },
    { value: 21, label: 'Bicicleta'       },
    { value: 22, label: 'Patrulla'        },
    { value: 23, label: 'Ambulancia'      },
    { value: 24, label: 'Camión Bomberos' },
    { value: 25, label: 'Helicóptero'    },
    { value: 26, label: 'Lancha'          }
  ];

  readonly opcionesTipoMedio: UiSelectOption<number>[] = this.TIPOS_MEDIO_LIST.map(t => ({
    label: t.label,
    value: t.value,
  }));

  /** Las tres franjas de vigilancia; el turno 1 cruza la medianoche. */
  readonly opcionesClaseTurno: UiSelectOption<number>[] = [
    { label: '2.º turno — 06:00 a 14:00', value: 2 },
    { label: '3.er turno — 14:00 a 22:00', value: 3 },
    { label: '1.er turno — 22:00 a 06:00', value: 1 },
  ];

  readonly opcionesFuerza = computed<UiSelectOption<number>[]>(() =>
    this.fuerzas().map(f => ({ label: f.descripcion, value: f.id })),
  );

  /**
   * El valor es «código::fuerza», no solo el código: cad_canales.codigo se
   * numera por fuerza y se repite entre fuerzas distintas.
   */
  readonly opcionesCanal = computed<UiSelectOption<string>[]>(() => [
    { label: '— Sin canal —', value: '' },
    ...this.canales().map(c => ({
      label: c.descripcion,
      value: `${c.codigo}::${c.fuerzaId}`,
    })),
  ]);

  readonly opcionesCanalUnidad = computed<UiSelectOption<string>[]>(() => [
    { label: '— Canal por defecto —', value: '' },
    ...this.canales().map(c => ({
      label: c.descripcion,
      value: `${c.codigo}::${c.fuerzaId}`,
    })),
  ]);

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  ngOnInit(): void {
    const claims    = this.authSvc.getJwtClaims();
    this.fuerzaId   = claims.fuerzaId;
    this.sitioGraba = claims.sitioGraba;
    this.fuerzaFiltro = this.fuerzaId;
    this.fechaBusqueda = this.hoyIso();
    this.cargarFuerzas();
    this.cargarTurnos();
  }

  private cargarFuerzas(): void {
    this.subs.add(
      this.fuerzaSvc.getFuerzas().subscribe({
        next: r => { this.fuerzas.set((r.data ?? []).filter(f => f.vigente === 'S')); },
        error: () => { /* no crítico — si falla, el campo queda sin opciones */ }
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.detenerReadiness();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CARGA DE DATOS
  // ═══════════════════════════════════════════════════════════════════════════

  cargarTurnos(): void {
    if (!this.fuerzaFiltro || !this.fechaBusqueda) { this.error.set('Seleccione una fuerza y una fecha.'); return; }
    this.cargando.set(true);
    this.error.set('');
    this.subs.add(
      this.turnosSvc.getTurnos(this.fuerzaFiltro, this.fechaParaApi(this.fechaBusqueda), this.sitioGraba)
        .subscribe({
          next: (t) => { this.turnos.set(t); this.cargando.set(false); },
          error: (e) => {
            this.cargando.set(false);
            this.error.set('Error al cargar turnos: ' + (e.error?.message ?? e.message));
          }
        })
    );
  }

  seleccionarTurno(t: DtoTurnoListItem): void {
    if (this.turnoSeleccionado?.id === t.id) return;
    this.turnoSeleccionado = t;
    this.turnoDetalle.set(null);
    this.unidades.set([]);
    this.unidadActiva      = null;
    this.medios.set([]);
    this.detenerReadiness();

    // Detalle completo del turno
    this.subs.add(
      this.turnosSvc.getTurno(t.id).subscribe({
        next:  d => { this.turnoDetalle.set(d); },
        error: () => { this.turnoDetalle.set(null); this.error.set('No se pudo cargar el detalle del turno.'); }
      })
    );

    // Cargar unidades
    this.cargandoUnidades.set(true);
    this.subs.add(
      this.turnosSvc.getUnidades(t.id).subscribe({
        next: (u) => { this.unidades.set(u); this.cargandoUnidades.set(false); },
        error: ()  => { this.cargandoUnidades.set(false); this.error.set('No se pudieron cargar las unidades.'); }
      })
    );
  }

  seleccionarUnidad(u: DtoTurnoUnidad): void {
    if (this.unidadActiva?.id === u.id) return;
    this.unidadActiva  = u;
    this.medios.set([]);
    this.cargarMedios(u.turnoId, u.id);
    this.iniciarReadiness();
  }

  cargarMedios(turnoId: string, unidadId?: string): void {
    if (!this.turnoSeleccionado) return;
    this.cargandoMedios.set(true);
    this.subs.add(
      this.turnosSvc.getMedios(turnoId, unidadId).subscribe({
        next: (m) => {
          this.medios.set(m);
          this.cargandoMedios.set(false);
          this.ultimaActualizacionMedios.set(new Date());
        },
        error: () => { this.cargandoMedios.set(false); this.error.set('No se pudieron cargar los medios.'); }
      })
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESUMEN DE DISPONIBILIDAD EN VIVO ("Shift Readiness")
  // Refresca silenciosamente los medios de la unidad activa cada 15 s, para que
  // el operador vea libres actualizados sin tener que reabrir la unidad. Se
  // pausa cuando la pestaña está oculta para no gastar red/CPU.
  //
  // Turnos NO sincroniza GPS ni consulta georreferenciación — este módulo solo
  // administra turnos/unidades/medios. La sincronización con GESPO vive
  // únicamente en Eventos, durante la gestión de un caso.
  // ═══════════════════════════════════════════════════════════════════════════

  private iniciarReadiness(): void {
    this.detenerReadiness();
    this.readinessSub = interval(15_000).subscribe(() => {
      if (document.hidden || !this.unidadActiva) return;
      this.cargarMedios(this.unidadActiva.turnoId, this.unidadActiva.id);
    });
  }

  private detenerReadiness(): void {
    this.readinessSub?.unsubscribe();
    this.readinessSub = null;
    this.ultimaActualizacionMedios.set(null);
  }

  /** Medios libres (estado 27) sobre el total de la unidad activa. */
  get resumenLibres(): string {
    const medios = this.medios();
    if (medios.length === 0) return '—';
    const libres = medios.filter(m => m.estado === 27).length;
    return `${libres}/${medios.length}`;
  }

  /** Color del punto de disponibilidad: verde si hay medios libres, rojo si no queda ninguno. */
  get readinessColor(): 'ok' | 'warn' | 'none' {
    const medios = this.medios();
    if (medios.length === 0) return 'none';
    return medios.some(m => m.estado === 27) ? 'ok' : 'warn';
  }

  /** "hace Ns" / "hace Nm" desde la última actualización de medios. */
  get readinessHaceTexto(): string {
    const ultima = this.ultimaActualizacionMedios();
    if (!ultima) return '';
    const seg = Math.max(0, Math.round((Date.now() - ultima.getTime()) / 1000));
    if (seg < 60) return `hace ${seg}s`;
    return `hace ${Math.round(seg / 60)}m`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODAL: CREAR TURNO
  // ═══════════════════════════════════════════════════════════════════════════

  abrirModalCrear(): void {
    this.formCrear       = this.nuevoFormCrear();
    this.errorCrear.set('');
    this.guardandoCrear.set(false);
    this.modalCrear.set(true);
    // Sin esto el modal abre con la clase de turno ya seleccionada pero las
    // fechas vacías — el usuario tenía que volver a tocar el select para que
    // se autocompletaran las horas.
    this.autocompletarHoras(this.formCrear.claseTurno, this.formCrear);
  }

  cerrarModalCrear(): void {
    this.modalCrear.set(false);
  }

  onClaseTurnoCrear(clase: number): void {
    this.formCrear.claseTurno = clase as 1 | 2 | 3;
    this.autocompletarHoras(clase, this.formCrear);
  }

  private autocompletarHoras(clase: number, form: any): void {
    const base = this.fechaBusqueda;
    const sigte = this.sumarDia(base);
    switch (clase) {
      case 2: form._inicio = `${base}T06:00`;  form._fin = `${base}T14:00`;  break;
      case 3: form._inicio = `${base}T14:00`;  form._fin = `${base}T22:00`;  break;
      case 1: form._inicio = `${base}T22:00`;  form._fin = `${sigte}T06:00`; break;
    }
  }

  guardarCrear(): void {
    if (!this.formCrear._inicio || !this.formCrear._fin) { this.errorCrear.set('Complete las fechas.'); return; }
    const rangoError = this.validarRangoHoras(this.formCrear._inicio, this.formCrear._fin);
    if (rangoError) { this.errorCrear.set(rangoError); return; }
    this.guardandoCrear.set(true);
    this.errorCrear.set('');
    const req: DtoCrearTurnoRequest = {
      sitioGraba:  this.formCrear.sitioGraba,
      fuerzaId:    this.formCrear.fuerzaId,
      claseTurno:  this.formCrear.claseTurno,
      tipoTurno:   this.formCrear.tipoTurno,
      horaInicia:  this.dtLocalParaApi(this.formCrear._inicio),
      horaTermina: this.dtLocalParaApi(this.formCrear._fin),
      consignas:   this.formCrear.consignas
    };
    this.subs.add(
      this.turnosSvc.crearTurno(req).subscribe({
        next: (r) => {
          this.guardandoCrear.set(false);
          if (r.success) {
            this.cerrarModalCrear();
            this.toast.success('Turno creado', `Turno registrado correctamente (ID ${r.id}).`);
            this.cargarTurnos();
          } else { this.errorCrear.set(r.message); }
        },
        error: (e) => { this.guardandoCrear.set(false); this.errorCrear.set(e.error?.message ?? 'Error al crear turno.'); }
      })
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODAL: COPIAR TURNO
  // ═══════════════════════════════════════════════════════════════════════════

  abrirModalCopiar(): void {
    if (!this.turnoSeleccionado) return;
    this.formCopiar = {
      turnoOrigenId: this.turnoSeleccionado.id,
      claseTurno:    1,
      horaInicia:    '',
      horaTermina:   '',
      _inicio:       '',
      _fin:          ''
    };
    this.errorCopiar.set('');
    this.guardandoCopiar.set(false);
    this.modalCopiar.set(true);
    this.autocompletarHoras(this.formCopiar.claseTurno, this.formCopiar);
  }

  cerrarModalCopiar(): void {
    this.modalCopiar.set(false);
  }

  onClaseTurnoCopiar(clase: number): void {
    this.formCopiar.claseTurno = clase as 1 | 2 | 3;
    this.autocompletarHoras(clase, this.formCopiar);
  }

  guardarCopiar(): void {
    if (!this.formCopiar._inicio || !this.formCopiar._fin) { this.errorCopiar.set('Complete las fechas.'); return; }
    const rangoError = this.validarRangoHoras(this.formCopiar._inicio, this.formCopiar._fin);
    if (rangoError) { this.errorCopiar.set(rangoError); return; }
    this.guardandoCopiar.set(true);
    this.errorCopiar.set('');
    const req: DtoCopiarTurnoRequest = {
      turnoOrigenId: this.formCopiar.turnoOrigenId,
      claseTurno:    this.formCopiar.claseTurno,
      tipoTurno:     this.formCopiar.tipoTurno,
      horaInicia:    this.dtLocalParaApi(this.formCopiar._inicio),
      horaTermina:   this.dtLocalParaApi(this.formCopiar._fin)
    };
    this.subs.add(
      this.turnosSvc.copiarTurno(req).subscribe({
        next: (r) => {
          this.guardandoCopiar.set(false);
          if (r.success) {
            this.cerrarModalCopiar();
            this.toast.success('Turno copiado', `Se creó el nuevo turno (ID ${r.id}) con toda su jerarquía.`);
            this.cargarTurnos();
          } else { this.errorCopiar.set(r.message); }
        },
        error: (e) => { this.guardandoCopiar.set(false); this.errorCopiar.set(e.error?.message ?? 'Error al copiar turno.'); }
      })
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODAL: AGREGAR UNIDAD
  // ═══════════════════════════════════════════════════════════════════════════

  abrirModalUnidad(): void {
    if (!this.turnoSeleccionado) return;
    this.formUnidad   = { turnoId: this.turnoSeleccionado.id, unidadCodigo: '', unidadDesc: '', consignas: '' };
    this.errorUnidad.set('');
    this.guardandoUnidad.set(false);
    this.modalUnidad.set(true);
  }

  cerrarModalUnidad(): void { this.modalUnidad.set(false); }

  guardarUnidad(): void {
    if (!this.formUnidad.unidadCodigo.trim()) { this.errorUnidad.set('El código de unidad es obligatorio.'); return; }
    this.guardandoUnidad.set(true);
    this.errorUnidad.set('');
    this.subs.add(
      this.turnosSvc.agregarUnidad(this.formUnidad.turnoId, this.formUnidad).subscribe({
        next: (r) => {
          this.guardandoUnidad.set(false);
          if (r.success) {
            this.cerrarModalUnidad();
            this.toast.success('Unidad agregada', `'${this.formUnidad.unidadCodigo}' se registró en el turno.`);
            // Recargar unidades
            this.subs.add(
              this.turnosSvc.getUnidades(this.formUnidad.turnoId).subscribe({
                next: u => this.unidades.set(u),
                error: () => { this.error.set('No se pudo actualizar la lista de unidades.'); }
              })
            );
          } else { this.errorUnidad.set(r.message); }
        },
        error: (e) => { this.guardandoUnidad.set(false); this.errorUnidad.set(e.error?.message ?? 'Error al agregar la unidad.'); }
      })
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODAL: AGREGAR MEDIO
  // ═══════════════════════════════════════════════════════════════════════════

  abrirModalMedio(): void {
    if (!this.turnoSeleccionado) return;
    this.formMedio              = this.nuevoFormMedio();
    this.formMedio.turnoId      = this.turnoSeleccionado.id;
    this.formMedio.turnoUnidadId = this.unidadActiva?.id ?? undefined;
    this.formMedio.unidadCodigo  = this.unidadActiva?.unidadCodigo ?? undefined;
    this.formMedio.fuerzaId      = this.fuerzaFiltro;
    this.errorMedio.set('');
    this.guardandoMedio.set(false);
    this.modalMedio.set(true);
    // Cargar canales si aún no están disponibles
    this.cargarCanales();
  }

  /** Carga los canales de radio del sitio una sola vez (lazy). */
  private cargarCanales(): void {
    if (this.canales().length > 0 || this.cargandoCanales()) return;
    this.cargandoCanales.set(true);
    this.subs.add(
      this.eventoSvc.getCanales(this.sitioGraba).subscribe({
        next:  c  => { this.canales.set(c); this.cargandoCanales.set(false); },
        error: () => { this.cargandoCanales.set(false); }
      })
    );
  }

  cerrarModalMedio(): void { this.modalMedio.set(false); }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODAL: EDITAR MEDIO
  // ═══════════════════════════════════════════════════════════════════════════

  abrirModalEditarMedio(m: DtoMedioDisponible): void {
    this.medioEditando.set(m);
    this.errorEditarMedio.set('');
    this.guardandoEditarMedio.set(false);

    // Pre-cargar el formulario con los datos actuales del medio
    this.formEditarMedio = {
      turnoId:        m.turnoId,
      turnoUnidadId:  m.turnoUnidadId,
      unidadCodigo:   m.unidadCodigo,
      fuerzaId:       m.fuerzaId ?? 0,
      canalCodigo:    m.canalCodigo,
      canalFuerzaId:  m.canalFuerzaId,
      patrullaCodigo: m.patrullaCodigo,
      patrullaDesc:   m.patrullaDesc || undefined,
      tipoMedio:      m.tipoMedio,
      personal:       [],
      _personal1Cedu: m.personal[0]?.ceduEmpleado  ?? '',
      _personal1Nomb: m.personal[0]?.nombrePolicial ?? '',
      _personal2Cedu: m.personal[1]?.ceduEmpleado  ?? '',
      _personal2Nomb: m.personal[1]?.nombrePolicial ?? ''
    };

    this.modalEditarMedio.set(true);
    this.cargarCanales();
  }

  cerrarModalEditarMedio(): void {
    this.modalEditarMedio.set(false);
    this.medioEditando.set(null);
  }

  /** Llama al endpoint PUT /medios/{id} con los campos editados. */
  guardarEditarMedio(): void {
    const medioEditando = this.medioEditando();
    if (!medioEditando) return;
    if (!this.formEditarMedio.patrullaCodigo.trim()) {
      this.errorEditarMedio.set('El código de patrulla es obligatorio.');
      return;
    }

    this.guardandoEditarMedio.set(true);
    this.errorEditarMedio.set('');

    const personal: DtoPersonalMedio[] = [];
    if (this.formEditarMedio._personal1Cedu.trim()) {
      personal.push({
        ceduEmpleado:   this.formEditarMedio._personal1Cedu.trim(),
        nombrePolicial: this.formEditarMedio._personal1Nomb.trim() || undefined
      });
    }
    if (this.formEditarMedio._personal2Cedu.trim()) {
      personal.push({
        ceduEmpleado:   this.formEditarMedio._personal2Cedu.trim(),
        nombrePolicial: this.formEditarMedio._personal2Nomb.trim() || undefined
      });
    }

    const req: DtoActualizarMedioRequest = {
      canalCodigo:    this.formEditarMedio.canalCodigo,
      canalFuerzaId:  this.formEditarMedio.canalFuerzaId,
      patrullaCodigo: this.formEditarMedio.patrullaCodigo.trim().toUpperCase(),
      patrullaDesc:   this.formEditarMedio.patrullaDesc?.trim(),
      tipoMedio:      this.formEditarMedio.tipoMedio,
      personal
    };

    this.subs.add(
      this.turnosSvc.actualizarMedio(medioEditando.id, req).subscribe({
        next: (r) => {
          this.guardandoEditarMedio.set(false);
          if (r.success) {
            this.cerrarModalEditarMedio();
            this.toast.success('Medio actualizado', 'Los cambios se guardaron correctamente.');
            // Recargar la lista de medios de la unidad activa
            if (this.unidadActiva) {
              this.cargarMedios(this.unidadActiva.turnoId, this.unidadActiva.id);
            }
          } else {
            this.errorEditarMedio.set(r.message);
          }
        },
        error: (e) => {
          this.guardandoEditarMedio.set(false);
          this.errorEditarMedio.set(e.error?.message ?? 'Error al actualizar el medio.');
        }
      })
    );
  }

  /**
   * Clave compuesta código::fuerza para el <select> de canal.
   * cad_canales.codigo NO es único por sí solo (cada fuerza numera sus
   * canales desde 1) — usar solo el código para identificar la opción
   * seleccionada hace que el <select> confunda canales de fuerzas distintas
   * que comparten el mismo código.
   */
  canalKey(codigo: number | undefined, fuerzaId: number | undefined): string | undefined {
    return codigo != null && fuerzaId != null ? `${codigo}::${fuerzaId}` : undefined;
  }

  /** Handler del canal en el modal "Agregar medio" (sincroniza canalCodigo + canalFuerzaId). */
  onCanalChange(key: string | undefined): void {
    if (!key) {
      this.formMedio.canalCodigo   = undefined;
      this.formMedio.canalFuerzaId = undefined;
      return;
    }
    const [codigo, fuerzaId] = key.split('::').map(Number);
    this.formMedio.canalCodigo   = codigo;
    this.formMedio.canalFuerzaId = fuerzaId;
  }

  /** Handler del canal en el modal de edición (sincroniza canalCodigo + canalFuerzaId). */
  onCanalChangeEditar(key: string | undefined): void {
    if (!key) {
      this.formEditarMedio.canalCodigo   = undefined;
      this.formEditarMedio.canalFuerzaId = undefined;
      return;
    }
    const [codigo, fuerzaId] = key.split('::').map(Number);
    this.formEditarMedio.canalCodigo   = codigo;
    this.formEditarMedio.canalFuerzaId = fuerzaId;
  }

  /** Handler del canal por defecto en el wizard de importación SIVICC. */
  onCanalChangeSivicc(key: string | undefined): void {
    if (!key) {
      this.siviccCanalCodigo   = undefined;
      this.siviccCanalFuerzaId = undefined;
      return;
    }
    const [codigo, fuerzaId] = key.split('::').map(Number);
    this.siviccCanalCodigo   = codigo;
    this.siviccCanalFuerzaId = fuerzaId;
  }

  /**
   * Handler del canal PROPIO de una unidad en el wizard SIVICC — cada unidad
   * puede necesitar un canal distinto (no todas comparten el mismo radio).
   * Si se deja "— Usar canal por defecto —" se limpia y al importar se usa
   * el canal por defecto del modal (si hay alguno).
   */
  onCanalChangeSiviccUnidad(u: DtoUnidadSivicc, key: string | undefined): void {
    if (!key) {
      u.canalCodigo   = undefined;
      u.canalFuerzaId = undefined;
      return;
    }
    const [codigo, fuerzaId] = key.split('::').map(Number);
    u.canalCodigo   = codigo;
    u.canalFuerzaId = fuerzaId;
  }

  guardarMedio(): void {
    if (!this.formMedio.patrullaCodigo.trim()) { this.errorMedio.set('El código de patrulla es obligatorio.'); return; }
    this.guardandoMedio.set(true);
    this.errorMedio.set('');

    // Construir personal desde los campos separados
    const personal: DtoPersonalMedio[] = [];
    if (this.formMedio._personal1Cedu.trim()) {
      personal.push({ ceduEmpleado: this.formMedio._personal1Cedu.trim(), nombrePolicial: this.formMedio._personal1Nomb.trim() || undefined });
    }
    if (this.formMedio._personal2Cedu.trim()) {
      personal.push({ ceduEmpleado: this.formMedio._personal2Cedu.trim(), nombrePolicial: this.formMedio._personal2Nomb.trim() || undefined });
    }

    const req: DtoAgregarMedioRequest = {
      turnoId:       this.formMedio.turnoId,
      turnoUnidadId: this.formMedio.turnoUnidadId,
      unidadCodigo:  this.formMedio.unidadCodigo,
      fuerzaId:      this.formMedio.fuerzaId,
      canalCodigo:   this.formMedio.canalCodigo,
      canalFuerzaId: this.formMedio.canalFuerzaId,
      patrullaCodigo: this.formMedio.patrullaCodigo.trim().toUpperCase(),
      patrullaDesc:  this.formMedio.patrullaDesc?.trim(),
      tipoMedio:     this.formMedio.tipoMedio,
      personal
    };
    this.subs.add(
      this.turnosSvc.agregarMedio(req.turnoId, req).subscribe({
        next: (r) => {
          this.guardandoMedio.set(false);
          if (r.success) {
            this.cerrarModalMedio();
            this.toast.success('Medio agregado', `'${req.patrullaCodigo}' se registró en el turno.`);
            if (this.unidadActiva) this.cargarMedios(req.turnoId, req.turnoUnidadId);
            // Actualizar conteo en turno seleccionado
            this.subs.add(
              this.turnosSvc.getUnidades(req.turnoId).subscribe({
                next: u => this.unidades.set(u),
                error: () => { this.error.set('No se pudo actualizar la lista de unidades.'); }
              })
            );
          } else { this.errorMedio.set(r.message); }
        },
        error: (e) => { this.guardandoMedio.set(false); this.errorMedio.set(e.error?.message ?? 'Error al agregar el medio.'); }
      })
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODAL: IMPORTAR SIVICC  (wizard de 2 pasos)
  // Paso 1: abrir → consultar automáticamente las unidades en SIVICC
  // Paso 3: confirmar → importar los medios de las unidades seleccionadas
  // ═══════════════════════════════════════════════════════════════════════════

  abrirModalSivicc(): void {
    if (!this.turnoSeleccionado) return;
    this.formSivicc = {
      turnoId:    this.turnoSeleccionado.id,
      fuerzaId:   this.fuerzaFiltro,
      sitioGraba: this.sitioGraba,
      unidades:   []
    };
    this.siviccCanalCodigo        = undefined;
    this.siviccCanalFuerzaId      = undefined;
    this.errorSivicc.set('');
    this.guardandoSivicc.set(false);
    this.unidadesSivicc.set([]);
    this.cargandoUnidadesSivicc.set(true);
    this.modalSivicc.set(true);
    this.cargarCanales(); // para el select de canal opcional

    // Paso 1: consultar unidades automáticamente
    this.subs.add(
      this.turnosSvc.getUnidadesSivicc(this.turnoSeleccionado.id).subscribe({
        next: (lista) => {
          this.cargandoUnidadesSivicc.set(false);
          // Todas comienzan seleccionadas si no existen aún en CAD
          this.unidadesSivicc.set(lista.map(u => ({ ...u, seleccionada: !u.existeEnCadMedios })));
          // Si no hay unidades se muestra el estado vacío en el template (no es un error)
        },
        error: (e) => {
          this.cargandoUnidadesSivicc.set(false);
          this.errorSivicc.set('Error al consultar GESPO: ' + (e.error?.message ?? e.message ?? 'Error desconocido.'));
        }
      })
    );
  }

  cerrarModalSivicc(): void {
    this.modalSivicc.set(false);
  }

  /** Seleccionar / deseleccionar todas las unidades. */
  toggleTodaSivicc(seleccionar: boolean): void {
    this.unidadesSivicc().forEach(u => (u.seleccionada = seleccionar));
  }

  get todasSiviccSeleccionadas(): boolean {
    const unidades = this.unidadesSivicc();
    return unidades.length > 0 && unidades.every(u => u.seleccionada);
  }

  get algunaSiviccSeleccionada(): boolean {
    return this.unidadesSivicc().some(u => u.seleccionada);
  }

  guardarSivicc(): void {
    if (!this.algunaSiviccSeleccionada) {
      this.errorSivicc.set('Seleccione al menos una unidad para importar.');
      return;
    }
    this.guardandoSivicc.set(true);
    this.errorSivicc.set('');

    const unidades = this.unidadesSivicc()
      .filter(u => u.seleccionada)
      .map(u => ({
        minutaId:      u.minutaId,
        consecutivo:   u.consecutivo,
        descripcion:   u.descripcion,
        canalCodigo:   u.canalCodigo,
        canalFuerzaId: u.canalFuerzaId
      }));

    const req: DtoImportarSiviccRequest = {
      ...this.formSivicc,
      canalCodigo:   this.siviccCanalCodigo,
      canalFuerzaId: this.siviccCanalFuerzaId,
      unidades
    };

    this.subs.add(
      this.turnosSvc.importarSivicc(req.turnoId, req).subscribe({
        next: (r) => {
          this.guardandoSivicc.set(false);
          if (r.success) {
            this.cerrarModalSivicc();
            this.toast.success('Importación SIVICC completada', 'Se importaron los medios y personal seleccionados.');
            this.cargarTurnos();
            if (this.turnoSeleccionado) {
              this.subs.add(
                this.turnosSvc.getUnidades(this.turnoSeleccionado.id).subscribe({
                  next: u => this.unidades.set(u),
                  error: () => { this.error.set('No se pudo actualizar la lista de unidades.'); }
                })
              );
            }
          } else {
            this.errorSivicc.set(r.message);
          }
        },
        error: (e) => {
          this.guardandoSivicc.set(false);
          this.errorSivicc.set(e.error?.message ?? 'Error al importar desde SIVICC.');
        }
      })
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS DE PRESENTACIÓN
  // ═══════════════════════════════════════════════════════════════════════════

  claseTurnoCorto(clase: number): string {
    return this.turnosSvc.etiquetaClaseTurnoCorta(clase as 1 | 2 | 3);
  }

  /** Formatea la lista de personal de un medio para mostrar en la UI. */
  formatearPersonal(personal: DtoPersonalMedio[]): string {
    if (!personal?.length) return '—';
    return personal
      .map(p => p.ceduEmpleado + (p.nombrePolicial ? ' – ' + p.nombrePolicial : ''))
      .join(' | ');
  }

  claseTurnoCss(clase: number): string {
    return { 1: 'tr-clase-1', 2: 'tr-clase-2', 3: 'tr-clase-3' }[clase] ?? 'tr-clase-1';
  }

  /**
   * El backend manda la letra cruda (A/C/V) y el origen la pintaba tal cual.
   * Una sola letra no le dice nada a quien mira la lista de turnos.
   */
  estadoTurnoLabel(estado: string): string {
    return { A: 'Activo', C: 'Cerrado', V: 'Anulado' }[estado] ?? estado;
  }

  estadoTurnoCss(estado: string): string {
    return { A: 'tr-estado-a', C: 'tr-estado-c', V: 'tr-estado-v' }[estado] ?? 'tr-estado-a';
  }

  estadoMedioCss(estado: number): string {
    return this.turnosSvc.claseEstadoMedio(estado as EstadoMedio);
  }

  /** Clases FontAwesome para el tipo de medio (delega en el servicio para no duplicar el mapa). */
  iconoTipo(tipo: number): string {
    return this.turnosSvc.iconoTipoMedio(tipo as any);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONVERSIÓN DE FECHAS
  // ═══════════════════════════════════════════════════════════════════════════

  /** yyyy-MM-dd → dd/MM/yyyy */
  private fechaParaApi(iso: string): string {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  /** yyyy-MM-ddTHH:mm → dd/MM/yyyy HH:mm */
  private dtLocalParaApi(local: string): string {
    if (!local) return '';
    const [date, time] = local.split('T');
    const [y, m, d]    = date.split('-');
    return `${d}/${m}/${y} ${time ?? '00:00'}`;
  }

  /**
   * yyyy-MM-dd de HOY en hora local. Usar Date.toISOString() aquí convierte a
   * UTC antes de recortar la fecha — en Bogotá (UTC-5), entre las 19:00 y las
   * 23:59 locales ya es "mañana" en UTC, así que el filtro de fecha y el
   * autocompletado de horas mostraban el día siguiente al real.
   */
  private hoyIso(): string {
    return this.fechaLocalIso(new Date());
  }

  private sumarDia(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    const fecha = new Date(y, m - 1, d);
    fecha.setDate(fecha.getDate() + 1);
    return this.fechaLocalIso(fecha);
  }

  private fechaLocalIso(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /**
   * Valida del lado del cliente el mismo rango que exige el backend
   * (P_CrearTurnoAsync/P_CopiarTurnoAsync): inicio antes que fin y duración
   * entre 6 y 9 horas. Evita el viaje al servidor para el error más común.
   */
  private validarRangoHoras(inicioLocal: string, finLocal: string): string {
    const inicio = new Date(inicioLocal);
    const fin    = new Date(finLocal);
    if (isNaN(inicio.getTime()) || isNaN(fin.getTime())) return 'Fechas inválidas.';
    if (inicio >= fin) return 'La hora de inicio debe ser anterior a la hora de fin.';
    const horas = (fin.getTime() - inicio.getTime()) / 3_600_000;
    if (horas < 6 || horas > 9) {
      return `La duración del turno debe estar entre 6 y 9 horas (actual: ${horas.toFixed(1)}h).`;
    }
    return '';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FÁBRICA DE FORMS VACÍOS
  // ═══════════════════════════════════════════════════════════════════════════

  private nuevoFormCrear(): FormTurnoConFecha {
    return {
      sitioGraba:  this.sitioGraba,
      fuerzaId:    this.fuerzaFiltro,
      claseTurno:  1,
      horaInicia:  '',
      horaTermina: '',
      consignas:   '',
      _inicio:     '',
      _fin:        ''
    };
  }

  private nuevoFormMedio(): FormMedio {
    return {
      turnoId: '', turnoUnidadId: undefined, unidadCodigo: undefined,
      fuerzaId: 0, canalCodigo: undefined, canalFuerzaId: undefined,
      patrullaCodigo: '', patrullaDesc: undefined, tipoMedio: 22, personal: [],
      _personal1Cedu: '', _personal1Nomb: '',
      _personal2Cedu: '', _personal2Nomb: ''
    };
  }

  // ─── scroll lock ──────────────────────────────────────────────────────────
  // ─── trackBy helpers ──────────────────────────────────────────────────────
  trackByTurno(_: number, t: DtoTurnoListItem): string { return t.id; }
  trackByUnidad(_: number, u: DtoTurnoUnidad): string  { return u.id; }
  trackByMedio(_: number, m: DtoMedioDisponible): string { return m.id; }
}
