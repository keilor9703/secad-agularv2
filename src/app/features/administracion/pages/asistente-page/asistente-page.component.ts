import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  AsistenteService,
  AsistenteCategoria,
  AsistentePregunta,
  AsistenteCategoriaRequest,
  AsistentePreguntaRequest,
  TIPOS_RESPUESTA,
  parsearOpciones,
} from '../../../../core/services/operacion/asistente.service';
import { ToastService } from '../../../../core/services/toast.service';
import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiPanelHeaderComponent } from '../../../../shared/components/ui-panel-header/ui-panel-header.component';
import { UiSectionHeaderComponent } from '../../../../shared/components/ui-section-header/ui-section-header.component';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiInputComponent } from '../../../../shared/components/ui-input/ui-input.component';
import { UiSelectComponent } from '../../../../shared/components/ui-select/ui-select.component';
import { UiToggleComponent } from '../../../../shared/components/ui-toggle/ui-toggle.component';
import { UiIconPickerComponent } from '../../../../shared/components/ui-icon-picker/ui-icon-picker.component';
import { UiBadgeComponent } from '../../../../shared/components/ui-badge/ui-badge.component';
import { UiChipComponent } from '../../../../shared/components/ui-chip/ui-chip.component';
import { UiSpinnerComponent } from '../../../../shared/components/ui-spinner/ui-spinner.component';
import { UiModalComponent } from '../../../../shared/components/ui-modal/ui-modal.component';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';

/** Lo que hay pendiente de confirmar cuando el modal de borrado está abierto. */
interface Borrado {
  readonly tipo: 'categoria' | 'pregunta';
  readonly id: string;
  readonly titulo: string;
  readonly detalle: string;
}

@Component({
  selector: 'app-asistente-page',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    UiPageHeaderComponent,
    UiPanelHeaderComponent,
    UiSectionHeaderComponent,
    UiButtonComponent,
    UiInputComponent,
    UiSelectComponent,
    UiToggleComponent,
    UiIconPickerComponent,
    UiBadgeComponent,
    UiChipComponent,
    UiSpinnerComponent,
    UiModalComponent,
  ],
  templateUrl: './asistente-page.component.html',
  styleUrls: ['./asistente-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AsistentePageComponent implements OnInit {
  private readonly service = inject(AsistenteService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(false);
  readonly loadingPreguntas = signal(false);
  readonly saving = signal(false);

  // ── Categorías ───────────────────────────────────────────────────────────
  readonly categorias = signal<AsistenteCategoria[]>([]);
  readonly categoriaSeleccionada = signal<AsistenteCategoria | null>(null);
  readonly editandoCategoriaId = signal<string | null>(null);

  readonly formCategoria = this.fb.nonNullable.group({
    codigo: ['', [Validators.required]],
    descripcion: ['', [Validators.required]],
    icono: ['fa-solid fa-circle-question'],
    orden: [0],
    activo: [true],
  });

  // ── Preguntas ────────────────────────────────────────────────────────────
  readonly preguntas = signal<AsistentePregunta[]>([]);
  readonly editandoPreguntaId = signal<string | null>(null);

  readonly formPregunta = this.fb.nonNullable.group({
    pregunta: ['', [Validators.required]],
    ayuda: [''],
    tipoRespuesta: ['TEXTO'],
    obligatoria: [false],
    orden: [0],
    activo: [true],
  });

  /** Opciones en texto plano, una por línea; se convierten a JSON al guardar. */
  readonly opcionesTexto = signal('');

  /** El tipo vive también en una señal: valueChanges no repinta con OnPush. */
  private readonly tipoRespuestaActual = signal('TEXTO');
  readonly esSeleccion = computed(() => this.tipoRespuestaActual() === 'SELECCION');

  readonly opcionesTipo: UiSelectOption<string>[] = TIPOS_RESPUESTA.map((t) => ({
    label: t.label,
    value: t.valor,
  }));

  // ── Errores por campo ────────────────────────────────────────────────────
  // El origen los sacaba por toast al pulsar guardar; mostrarlos en el campo
  // que falla evita tener que adivinar cuál era.
  readonly intentoCategoria = signal(false);
  readonly intentoPregunta = signal(false);

  readonly errorCodigo = computed(() =>
    this.intentoCategoria() && !this.formCategoria.getRawValue().codigo.trim()
      ? 'El código es obligatorio.'
      : '',
  );
  readonly errorDescripcion = computed(() =>
    this.intentoCategoria() && !this.formCategoria.getRawValue().descripcion.trim()
      ? 'La descripción es obligatoria.'
      : '',
  );
  readonly errorPregunta = computed(() =>
    this.intentoPregunta() && !this.formPregunta.getRawValue().pregunta.trim()
      ? 'El texto de la pregunta es obligatorio.'
      : '',
  );
  readonly errorOpciones = computed(() =>
    this.intentoPregunta() && this.esSeleccion() && !this.opcionesTexto().trim()
      ? 'Una pregunta de selección necesita al menos una opción.'
      : '',
  );

  // ── Confirmación de borrado ──────────────────────────────────────────────
  readonly borradoPendiente = signal<Borrado | null>(null);

  constructor() {
    this.formPregunta.controls.tipoRespuesta.valueChanges.subscribe((v) =>
      this.tipoRespuestaActual.set(v),
    );
  }

  ngOnInit(): void {
    this.cargarCategorias();
  }

  // ══ Categorías ═══════════════════════════════════════════════════════════

  cargarCategorias(): void {
    this.loading.set(true);
    this.service.getCategorias(false).subscribe({
      next: (r) => {
        this.categorias.set(r.data ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Asistente', 'No se pudieron cargar las categorías.');
      },
    });
  }

  seleccionarCategoria(cat: AsistenteCategoria): void {
    if (this.categoriaSeleccionada()?.id === cat.id) {
      return;
    }
    this.categoriaSeleccionada.set(cat);
    this.nuevaPregunta();
    this.cargarPreguntas(cat.id);
  }

  estaSeleccionada(cat: AsistenteCategoria): boolean {
    return this.categoriaSeleccionada()?.id === cat.id;
  }

  nuevaCategoria(): void {
    this.editandoCategoriaId.set(null);
    this.intentoCategoria.set(false);
    this.formCategoria.reset({
      codigo: '',
      descripcion: '',
      icono: 'fa-solid fa-circle-question',
      orden: this.categorias().length,
      activo: true,
    });
  }

  editarCategoria(cat: AsistenteCategoria, event: Event): void {
    event.stopPropagation();
    this.editandoCategoriaId.set(cat.id);
    this.intentoCategoria.set(false);
    this.formCategoria.reset({
      codigo: cat.codigo,
      descripcion: cat.descripcion,
      icono: cat.icono,
      orden: cat.orden,
      activo: cat.activo,
    });
  }

  guardarCategoria(): void {
    this.intentoCategoria.set(true);
    if (this.errorCodigo() || this.errorDescripcion()) {
      this.formCategoria.markAllAsTouched();
      return;
    }

    const v = this.formCategoria.getRawValue();
    // La API espera las claves en PascalCase; los controles se llaman como en
    // la interfaz, y el mapeo se hace aquí en vez de arrastrarlo al formulario.
    const request: AsistenteCategoriaRequest = {
      Codigo: v.codigo.trim().toUpperCase(),
      Descripcion: v.descripcion.trim(),
      Icono: v.icono.trim() || 'fa-solid fa-circle-question',
      Orden: v.orden,
      Activo: v.activo,
    };

    this.saving.set(true);
    const id = this.editandoCategoriaId();
    const peticion = id
      ? this.service.updateCategoria(id, request)
      : this.service.createCategoria(request);

    peticion.subscribe({
      next: (r) => {
        this.saving.set(false);
        if (!r.success) {
          this.toast.warning('Categoría', r.message);
          return;
        }
        this.toast.success('Categoría', r.message);
        this.nuevaCategoria();
        this.cargarCategorias();
      },
      error: () => {
        this.saving.set(false);
        this.toast.error('Categoría', id ? 'Error al actualizar.' : 'Error al crear.');
      },
    });
  }

  // ══ Preguntas ════════════════════════════════════════════════════════════

  cargarPreguntas(categoriaId: string): void {
    this.loadingPreguntas.set(true);
    this.service.getPreguntas(categoriaId, false).subscribe({
      next: (r) => {
        this.preguntas.set(r.data ?? []);
        this.loadingPreguntas.set(false);
      },
      error: () => {
        this.loadingPreguntas.set(false);
        this.toast.error('Asistente', 'No se pudieron cargar las preguntas.');
      },
    });
  }

  nuevaPregunta(): void {
    this.editandoPreguntaId.set(null);
    this.intentoPregunta.set(false);
    this.opcionesTexto.set('');
    this.formPregunta.reset({
      pregunta: '',
      ayuda: '',
      tipoRespuesta: 'TEXTO',
      obligatoria: false,
      orden: this.preguntas().length,
      activo: true,
    });
    this.tipoRespuestaActual.set('TEXTO');
  }

  editarPregunta(p: AsistentePregunta): void {
    this.editandoPreguntaId.set(p.id);
    this.intentoPregunta.set(false);
    this.opcionesTexto.set(parsearOpciones(p.opciones).join('\n'));
    this.formPregunta.reset({
      pregunta: p.pregunta,
      ayuda: p.ayuda ?? '',
      tipoRespuesta: p.tipoRespuesta,
      obligatoria: p.obligatoria,
      orden: p.orden,
      activo: p.activo,
    });
    this.tipoRespuestaActual.set(p.tipoRespuesta);
  }

  guardarPregunta(): void {
    const categoria = this.categoriaSeleccionada();
    if (!categoria) {
      this.toast.warning('Pregunta', 'Elija primero una categoría.');
      return;
    }

    this.intentoPregunta.set(true);
    if (this.errorPregunta() || this.errorOpciones()) {
      this.formPregunta.markAllAsTouched();
      return;
    }

    const v = this.formPregunta.getRawValue();
    const request: AsistentePreguntaRequest = {
      CategoriaId: categoria.id,
      Pregunta: v.pregunta.trim(),
      Ayuda: v.ayuda.trim() || undefined,
      TipoRespuesta: v.tipoRespuesta,
      // Solo las de selección llevan opciones; en el resto se envía sin campo.
      Opciones: this.esSeleccion() ? JSON.stringify(this.opcionesComoLista()) : undefined,
      Obligatoria: v.obligatoria,
      Orden: v.orden,
      Activo: v.activo,
    };

    this.saving.set(true);
    const id = this.editandoPreguntaId();
    const peticion = id
      ? this.service.updatePregunta(id, request)
      : this.service.createPregunta(request);

    peticion.subscribe({
      next: (r) => {
        this.saving.set(false);
        if (!r.success) {
          this.toast.warning('Pregunta', r.message);
          return;
        }
        this.toast.success('Pregunta', r.message);
        this.nuevaPregunta();
        this.cargarPreguntas(categoria.id);
      },
      error: () => {
        this.saving.set(false);
        this.toast.error('Pregunta', id ? 'Error al actualizar.' : 'Error al crear.');
      },
    });
  }

  onOpciones(event: Event): void {
    this.opcionesTexto.set((event.target as HTMLTextAreaElement).value);
  }

  private opcionesComoLista(): string[] {
    return this.opcionesTexto()
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }

  readonly totalOpciones = computed(() => this.opcionesComoLista().length);

  // ══ Borrado ══════════════════════════════════════════════════════════════
  // El origen usaba confirm() del navegador. Se sustituye por ui-modal: el
  // diálogo nativo bloquea el hilo y no respeta el tema ni la escala de fuente.

  pedirBorrarCategoria(cat: AsistenteCategoria, event: Event): void {
    event.stopPropagation();
    this.borradoPendiente.set({
      tipo: 'categoria',
      id: cat.id,
      titulo: 'Eliminar categoría',
      detalle: `Se eliminará «${cat.descripcion}» y sus ${cat.totalPreguntas} pregunta(s). No se puede deshacer.`,
    });
  }

  pedirBorrarPregunta(p: AsistentePregunta): void {
    this.borradoPendiente.set({
      tipo: 'pregunta',
      id: p.id,
      titulo: 'Eliminar pregunta',
      detalle: `Se eliminará «${p.pregunta}». No se puede deshacer.`,
    });
  }

  cancelarBorrado(): void {
    this.borradoPendiente.set(null);
  }

  confirmarBorrado(): void {
    const pendiente = this.borradoPendiente();
    if (!pendiente) {
      return;
    }
    this.borradoPendiente.set(null);

    if (pendiente.tipo === 'categoria') {
      this.borrarCategoria(pendiente.id);
    } else {
      this.borrarPregunta(pendiente.id);
    }
  }

  private borrarCategoria(id: string): void {
    this.service.deleteCategoria(id).subscribe({
      next: (r) => {
        if (!r.success) {
          this.toast.warning('Categoría', r.message);
          return;
        }
        this.toast.success('Categoría', r.message);
        if (this.categoriaSeleccionada()?.id === id) {
          this.categoriaSeleccionada.set(null);
          this.preguntas.set([]);
        }
        this.cargarCategorias();
      },
      error: () => this.toast.error('Categoría', 'Error al eliminar.'),
    });
  }

  private borrarPregunta(id: string): void {
    const categoria = this.categoriaSeleccionada();
    this.service.deletePregunta(id).subscribe({
      next: (r) => {
        if (!r.success) {
          this.toast.warning('Pregunta', r.message);
          return;
        }
        this.toast.success('Pregunta', r.message);
        if (categoria) {
          this.cargarPreguntas(categoria.id);
        }
        // Recarga las categorías porque cambia el conteo de preguntas.
        this.cargarCategorias();
      },
      error: () => this.toast.error('Pregunta', 'Error al eliminar.'),
    });
  }

  // ── Presentación ─────────────────────────────────────────────────────────

  tipoLabel(tipo: string): string {
    return TIPOS_RESPUESTA.find((t) => t.valor === tipo)?.label ?? tipo;
  }

  tipoIcono(tipo: string): string {
    return `fa-solid ${TIPOS_RESPUESTA.find((t) => t.valor === tipo)?.icono ?? 'fa-circle-question'}`;
  }

  opcionesDe(p: AsistentePregunta): string[] {
    return parsearOpciones(p.opciones);
  }
}
