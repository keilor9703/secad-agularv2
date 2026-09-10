import {
  ChangeDetectionStrategy, Component, EventEmitter, OnInit, Output,
  computed, inject, input, signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';

import { UiSectionHeaderComponent } from '../../../../../shared/components/ui-section-header/ui-section-header.component';
import { UiButtonComponent } from '../../../../../shared/components/ui-button/ui-button.component';
import { UiBadgeComponent } from '../../../../../shared/components/ui-badge/ui-badge.component';
import { UiInputComponent } from '../../../../../shared/components/ui-input/ui-input.component';
import { UiSelectComponent } from '../../../../../shared/components/ui-select/ui-select.component';
import { UiModalComponent } from '../../../../../shared/components/ui-modal/ui-modal.component';
import { UiSpinnerComponent } from '../../../../../shared/components/ui-spinner/ui-spinner.component';
import { UiSelectOption } from '../../../../../shared/interfaces/ui-select-option.interface';
import { ToastService } from '../../../../../core/services/toast.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import {
  ApiKeysService, DtoApiKey, DtoPruebaIntegracion, AlcanceApiKey, ALCANCES,
} from '../../../services/api-keys.service';
import { SitioGrabacionService, DtoSitioGrabacion } from '../../../services/sitio-grabacion.service';

/**
 * Las llaves de API de un canal.
 *
 * Cada llave pertenece a UN CAD y es lo que le dice al sistema a qué base
 * escribir. Antes existía una sola clave para todo el país en appsettings.json
 * y el CAD lo decidía una cabecera, así que quien tuviera esa clave escribía
 * donde quisiera; esto es lo que lo sustituye.
 *
 * La llave se guarda cifrada y se puede volver a ver, porque rotarla obliga a
 * que alguien vaya a reconfigurar el equipo del proveedor. El precio es que
 * cada revelado queda registrado con usuario, IP y fecha.
 */
@Component({
  selector: 'app-api-keys-panel',
  standalone: true,
  imports: [
    DatePipe, FormsModule, ReactiveFormsModule,
    UiSectionHeaderComponent, UiButtonComponent, UiBadgeComponent, UiInputComponent,
    UiSelectComponent, UiModalComponent, UiSpinnerComponent,
  ],
  templateUrl: './api-keys-panel.component.html',
  styleUrls: ['./api-keys-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApiKeysPanelComponent implements OnInit {
  private readonly svc    = inject(ApiKeysService);
  private readonly sitios = inject(SitioGrabacionService);
  private readonly toast  = inject(ToastService);
  private readonly alert  = inject(AlertService);
  private readonly fb     = inject(FormBuilder);

  /**
   * Alcances con los que trabaja este panel. Vacío = todos.
   *
   * La pestaña de la planta pasa ['PBX'] y la de entrantes los canales que le
   * corresponden, de forma que cada una enseña y emite sus propias llaves sin
   * repetir las de la otra.
   */
  readonly alcances = input<AlcanceApiKey[]>([]);
  readonly titulo      = input('Llaves de API');
  readonly descripcion = input(
    'Con estas llaves se autentica el sistema externo. Cada una pertenece a este CAD: ' +
    'es lo que permite que SECAD sepa a qué base escribir sin que nadie tenga que decírselo.',
  );

  /** El contenedor recarga el contrato cuando cambia la llave elegida. */
  @Output() llaveSeleccionada = new EventEmitter<DtoApiKey | null>();

  readonly llaves    = signal<DtoApiKey[]>([]);
  readonly unidades  = signal<DtoSitioGrabacion[]>([]);
  readonly cargando  = signal(false);
  readonly guardando = signal(false);
  readonly probando  = signal('');

  /** Llaves ya reveladas en esta sesión, para poder mostrarlas y copiarlas. */
  readonly reveladas = signal<Record<string, string>>({});
  readonly visibles  = signal<Record<string, boolean>>({});
  readonly copiada   = signal('');

  readonly resultadoPrueba = signal<{ id: string; datos: DtoPruebaIntegracion } | null>(null);

  // ── Alta / edición ─────────────────────────────────────────────────────────
  readonly modalAbierto = signal(false);
  readonly editandoId   = signal('');
  readonly intento      = signal(false);

  /** El secreto recién emitido: solo vive en pantalla hasta que se cierra. */
  readonly recienEmitida = signal<{ clave: string; mensaje?: string | null } | null>(null);

  readonly form = this.fb.nonNullable.group({
    nombre:            ['', [Validators.required]],
    alcance:           ['PBX' as AlcanceApiKey],
    sitioGrabaDefecto: [0],
    notas:             [''],
  });

  readonly errorNombre = computed(() =>
    this.intento() && !this.form.controls.nombre.value.trim()
      ? 'Póngale un nombre que diga de quién es la llave, por ejemplo «Planta Avaya».' : '');

  /** Solo se puede emitir dentro de los alcances del panel. */
  readonly opcionesAlcance = computed<UiSelectOption<string>[]>(() => {
    const permitidos = this.alcances();
    const lista = permitidos.length ? ALCANCES.filter(a => permitidos.includes(a.value)) : ALCANCES;
    return lista.map(a => ({ label: a.label, value: a.value }));
  });

  /** Con un solo alcance posible no hay nada que elegir. */
  readonly alcanceUnico = computed(() => this.alcances().length === 1);

  readonly opcionesUnidad = computed<UiSelectOption<number>[]>(() => [
    { label: 'Sin unidad por defecto', value: 0 },
    ...this.unidades().map(u => ({ label: this.sitios.etiqueta(u), value: u.consecutivo })),
  ]);

  readonly listaFiltrada = computed(() => {
    const permitidos = this.alcances();
    if (!permitidos.length) return this.llaves();
    // La comodín «TODO» sirve para cualquier canal, así que aparece siempre.
    return this.llaves().filter(l => permitidos.includes(l.alcance) || l.alcance === 'TODO');
  });

  readonly hayActiva = computed(() => this.listaFiltrada().some(l => l.activa));

  ngOnInit(): void {
    this.cargar();
    this.sitios.getSitios(true).subscribe({
      next: r => this.unidades.set(r.data ?? []),
      error: () => { /* el catálogo es secundario: el panel sirve igual */ },
    });
  }

  cargar(): void {
    this.cargando.set(true);
    this.svc.listar().subscribe({
      next: r => {
        this.llaves.set(r.data ?? []);
        this.cargando.set(false);
        const primera = this.listaFiltrada().find(l => l.activa) ?? null;
        this.llaveSeleccionada.emit(primera);
      },
      error: () => {
        this.cargando.set(false);
        this.toast.error('Llaves', 'No se pudieron cargar las llaves de API.');
      },
    });
  }

  // ── Alta / edición ─────────────────────────────────────────────────────────

  abrirCreacion(): void {
    const unidad = this.unidades().length === 1 ? this.unidades()[0].consecutivo : 0;
    this.form.reset({
      nombre: '',
      alcance: (this.alcances()[0] ?? 'PBX') as AlcanceApiKey,
      sitioGrabaDefecto: unidad,
      notas: '',
    });
    this.intento.set(false);
    this.editandoId.set('');
    this.recienEmitida.set(null);
    this.modalAbierto.set(true);
  }

  abrirEdicion(l: DtoApiKey): void {
    this.form.reset({
      nombre: l.nombre,
      alcance: l.alcance,
      sitioGrabaDefecto: l.sitioGrabaDefecto,
      notas: l.notas ?? '',
    });
    this.intento.set(false);
    this.editandoId.set(l.id);
    this.recienEmitida.set(null);
    this.modalAbierto.set(true);
  }

  cerrarModal(): void {
    this.modalAbierto.set(false);
    this.recienEmitida.set(null);
    this.intento.set(false);
  }

  guardar(): void {
    this.intento.set(true);
    if (this.errorNombre()) return;

    const v = this.form.getRawValue();
    const request = {
      nombre: v.nombre.trim(),
      alcance: v.alcance,
      sitioGrabaDefecto: v.sitioGrabaDefecto,
      notas: v.notas.trim() || null,
    };

    this.guardando.set(true);

    if (this.editandoId()) {
      this.svc.actualizar(this.editandoId(), request).subscribe({
        next: r => {
          this.guardando.set(false);
          if (r.success) { this.toast.success('Llaves', r.message); this.cerrarModal(); this.cargar(); }
          else            this.toast.warning('Llaves', r.message);
        },
        error: err => { this.guardando.set(false); this.toast.error('Llaves', err?.error?.message ?? 'No se pudo guardar.'); },
      });
      return;
    }

    this.svc.crear(request).subscribe({
      next: r => {
        this.guardando.set(false);
        // El secreto se queda en pantalla; el modal no se cierra solo para que
        // dé tiempo de copiarlo.
        this.recienEmitida.set({ clave: r.data.clave });
        this.cargar();
      },
      error: err => { this.guardando.set(false); this.toast.error('Llaves', err?.error?.message ?? 'No se pudo crear la llave.'); },
    });
  }

  // ── Ver / copiar ───────────────────────────────────────────────────────────

  /**
   * Trae la llave del servidor la primera vez y la recuerda para esta pantalla.
   * Cada viaje al servidor queda registrado en la bitácora, así que no se
   * repite por cada clic en el ojo.
   */
  alternarVisible(l: DtoApiKey): void {
    const ya = this.visibles()[l.id];
    if (ya) { this.visibles.update(v => ({ ...v, [l.id]: false })); return; }

    if (this.reveladas()[l.id]) { this.visibles.update(v => ({ ...v, [l.id]: true })); return; }

    this.svc.revelar(l.id).subscribe({
      next: r => {
        this.reveladas.update(m => ({ ...m, [l.id]: r.data.clave }));
        this.visibles.update(v => ({ ...v, [l.id]: true }));
      },
      error: err => this.toast.error('Llaves', err?.error?.message ?? 'No se pudo mostrar la llave.'),
    });
  }

  async copiar(l: DtoApiKey): Promise<void> {
    const clave = this.reveladas()[l.id];
    if (!clave) {
      this.svc.revelar(l.id).subscribe({
        next: async r => {
          this.reveladas.update(m => ({ ...m, [l.id]: r.data.clave }));
          await this.alPortapapeles(r.data.clave, l.id);
        },
        error: err => this.toast.error('Llaves', err?.error?.message ?? 'No se pudo copiar la llave.'),
      });
      return;
    }
    await this.alPortapapeles(clave, l.id);
  }

  async copiarTexto(texto: string, marca: string): Promise<void> {
    await this.alPortapapeles(texto, marca);
  }

  private async alPortapapeles(texto: string, marca: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(texto);
      this.copiada.set(marca);
      setTimeout(() => { if (this.copiada() === marca) this.copiada.set(''); }, 2000);
    } catch {
      this.toast.warning('Copiar', 'El navegador no permitió copiar. Muéstrela y selecciónela a mano.');
    }
  }

  mostrada(l: DtoApiKey): string {
    return this.visibles()[l.id] ? (this.reveladas()[l.id] ?? '…') : `${l.prefijo}${'•'.repeat(20)}`;
  }

  // ── Rotación y estado ──────────────────────────────────────────────────────

  async regenerar(l: DtoApiKey): Promise<void> {
    const ok = await this.alert.confirm(
      'Regenerar la llave',
      `Se emite una llave nueva para «${l.nombre}». La actual seguirá funcionando 24 horas más, ` +
      `para que el proveedor tenga tiempo de cambiarla en su equipo. Pasado ese plazo dejará de servir.`,
      'Regenerar',
    );
    if (!ok) return;

    this.svc.regenerar(l.id, 24).subscribe({
      next: r => {
        this.reveladas.update(m => ({ ...m, [l.id]: r.data.clave }));
        this.visibles.update(v => ({ ...v, [l.id]: true }));
        this.toast.success('Llaves', r.data.mensaje ?? 'Llave regenerada.');
        this.cargar();
      },
      error: err => this.toast.error('Llaves', err?.error?.message ?? 'No se pudo regenerar.'),
    });
  }

  async cambiarEstado(l: DtoApiKey): Promise<void> {
    if (l.activa) {
      const ok = await this.alert.confirm(
        'Revocar la llave',
        `«${l.nombre}» dejará de funcionar de inmediato, sin periodo de gracia. ` +
        `El sistema externo que la use dejará de entrar en cuanto acepte.`,
        'Revocar',
      );
      if (!ok) return;
    }

    this.svc.cambiarEstado(l.id, !l.activa).subscribe({
      next: r => {
        if (r.success) { this.toast.success('Llaves', r.message); this.cargar(); }
        else            this.toast.warning('Llaves', r.message);
      },
      error: err => this.toast.error('Llaves', err?.error?.message ?? 'No se pudo cambiar el estado.'),
    });
  }

  // ── Prueba ─────────────────────────────────────────────────────────────────

  probar(l: DtoApiKey): void {
    this.probando.set(l.id);
    this.resultadoPrueba.set(null);
    this.svc.probar(l.id).subscribe({
      next: r => {
        this.probando.set('');
        this.resultadoPrueba.set({ id: l.id, datos: r.data });
        if (r.data.ok) this.toast.success('Prueba', 'La llave funciona y resuelve a este CAD.');
        else           this.toast.warning('Prueba', `El endpoint respondió ${r.data.estado}.`);
      },
      error: err => {
        this.probando.set('');
        this.toast.error('Prueba', err?.error?.message ?? 'No se pudo probar la llave.');
      },
    });
  }

  // ── Presentación ───────────────────────────────────────────────────────────

  etiquetaAlcance = (a: string) => this.svc.etiquetaAlcance(a);

  nombreUnidad(consecutivo: number): string {
    if (!consecutivo) return 'sin unidad por defecto';
    const u = this.unidades().find(x => x.consecutivo === consecutivo);
    return u ? this.sitios.etiqueta(u) : `unidad ${consecutivo}`;
  }

  /** Aviso mientras la llave anterior siga viva tras una rotación. */
  enGracia(l: DtoApiKey): boolean {
    return !!l.anteriorExpira && new Date(l.anteriorExpira).getTime() > Date.now();
  }

  seleccionar(l: DtoApiKey): void {
    this.llaveSeleccionada.emit(l);
  }
}
