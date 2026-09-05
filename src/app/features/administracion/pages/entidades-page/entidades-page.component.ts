import { Component, ChangeDetectionStrategy, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiPanelHeaderComponent } from '../../../../shared/components/ui-panel-header/ui-panel-header.component';
import { UiSectionHeaderComponent } from '../../../../shared/components/ui-section-header/ui-section-header.component';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiInputComponent } from '../../../../shared/components/ui-input/ui-input.component';
import { UiSearchInputComponent } from '../../../../shared/components/ui-search-input/ui-search-input.component';
import { UiSelectComponent } from '../../../../shared/components/ui-select/ui-select.component';
import { UiBadgeComponent } from '../../../../shared/components/ui-badge/ui-badge.component';
import { UiChipComponent } from '../../../../shared/components/ui-chip/ui-chip.component';
import { UiSpinnerComponent } from '../../../../shared/components/ui-spinner/ui-spinner.component';
import { UiTabsComponent } from '../../../../shared/components/ui-tabs/ui-tabs.component';
import { UiTabComponent } from '../../../../shared/components/ui-tabs/ui-tab.component';
import { UiSegmentedTabsComponent } from '../../../../shared/components/ui-segmented-tabs/ui-segmented-tabs.component';
import { UiSegmentedTabItem } from '../../../../shared/components/ui-segmented-tabs/ui-segmented-tabs.types';
import { SitiosPanelComponent } from '../../components/entidades/sitios-panel/sitios-panel.component';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';
import { ToastService } from '../../../../core/services/toast.service';
import {
  FuerzaService,
  DtoFuerza, DtoFuerzaRequest,
  DtoCanalFuerza, DtoCanalRequest,
  DtoUsuarioEnFuerza
} from '../../services/fuerza.service';
import { SitioGrabacionService, DtoSitioGrabacion } from '../../services/sitio-grabacion.service';

@Component({
  selector: 'app-entidades-page',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule, RouterModule,
    UiPageHeaderComponent, UiPanelHeaderComponent, UiSectionHeaderComponent,
    UiButtonComponent, UiInputComponent, UiSearchInputComponent, UiSelectComponent, UiBadgeComponent,
    UiChipComponent, UiSpinnerComponent, UiTabsComponent, UiTabComponent,
    UiSegmentedTabsComponent, SitiosPanelComponent
  ],
  templateUrl: './entidades-page.component.html',
  styleUrls: ['./entidades-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EntidadesPageComponent implements OnInit {
  private readonly fuerzaService = inject(FuerzaService);
  private readonly sitioService  = inject(SitioGrabacionService);
  private readonly toast         = inject(ToastService);
  private readonly fb            = inject(FormBuilder);

  // ── Estado general ─────────────────────────────────────────────────────────
  /** La vigencia se guarda como 'S'/'N' en la base, no como booleano. */
  readonly opcionesVigencia: UiSelectOption<string>[] = [
    { label: 'Vigente',  value: 'S' },
    { label: 'Inactivo', value: 'N' },
  ];

  readonly loading = signal(false);
  readonly saving  = signal(false);

  // ── Filtros y búsqueda ─────────────────────────────────────────────────────
  readonly busqueda = signal('');
  readonly filtroVigencia = signal<'todas' | 'vigentes' | 'inactivas'>('todas');

  // ── Lista de fuerzas ───────────────────────────────────────────────────────
  readonly fuerzas             = signal<DtoFuerza[]>([]);
  readonly fuerzaSeleccionada  = signal<DtoFuerza | null>(null);

  readonly fuerzasFiltradas = computed(() => {
    const q = this.busqueda().trim().toLowerCase();
    const filtro = this.filtroVigencia();

    return this.fuerzasDelSitio().filter((f) => {
      const coincideFiltro =
        filtro === 'todas' ||
        (filtro === 'vigentes' && f.vigente === 'S') ||
        (filtro === 'inactivas' && f.vigente !== 'S');

      if (!coincideFiltro) return false;
      if (!q) return true;

      const idStr = String(f.id);
      const desc = (f.descripcion || '').toLowerCase();
      const abrev = (f.abreviatura || '').toLowerCase();
      return idStr.includes(q) || desc.includes(q) || abrev.includes(q);
    });
  });

  // ── Métricas de la unidad activa ───────────────────────────────────────────
  // Van sobre la unidad, no sobre el CAD: sumar los canales de las dos
  // unidades daría un número que no le sirve a quien administra una sola.
  readonly totalCanalesGlobal = computed(() =>
    this.fuerzasDelSitio().reduce((sum, f) => sum + (f.totalCanales || 0), 0)
  );
  readonly totalUsuariosGlobal = computed(() =>
    this.fuerzasDelSitio().reduce((sum, f) => sum + (f.totalUsuarios || 0), 0)
  );

  // ── Sitios de grabación (unidades del CAD) ─────────────────────────────────
  // Cada fuerza pertenece a una unidad. Cuando el CAD aloja más de una —dos
  // municipios que comparten sala—, es lo que mantiene separado su despacho.
  readonly sitios = signal<DtoSitioGrabacion[]>([]);

  /** Vista activa: la administración de fuerzas o el catálogo de sitios. */
  readonly vista = signal<'fuerzas' | 'sitios'>('fuerzas');

  /**
   * Sitio activo, como id de pestaña. '' mientras no se ha resuelto ninguno;
   * 'sin' es el cajón de las fuerzas que todavía no tienen unidad.
   */
  readonly sitioActivo = signal('');

  /** Solo los vigentes se pueden elegir: a una unidad retirada no se asigna. */
  readonly sitiosVigentes = computed(() => this.sitios().filter(s => s.vigente === 'S'));

  readonly opcionesSitio = computed<UiSelectOption<number>[]>(() =>
    this.sitiosVigentes().map(s => ({ label: this.sitioService.etiqueta(s), value: s.consecutivo }))
  );

  /** Fuerzas que todavía no pertenecen a ninguna unidad. */
  readonly fuerzasSinClasificar = computed(() =>
    this.fuerzas().filter(f => !f.sitioGraba)
  );

  /**
   * La banda de arriba. Una pestaña por unidad y, mientras queden fuerzas
   * huérfanas, una más para recogerlas: sin ella un CAD que viene de antes
   * abriría el módulo y no vería ninguna de sus fuerzas.
   */
  readonly pestanasSitio = computed<UiSegmentedTabItem[]>(() => {
    const items: UiSegmentedTabItem[] = this.sitiosVigentes().map(s => ({
      id:          String(s.consecutivo),
      label:       s.abreviatura || s.descripcion,
      description: s.abreviatura ? s.descripcion : undefined,
      icon:        'fa-solid fa-tower-cell',
      badge:       this.fuerzas().filter(f => f.sitioGraba === s.consecutivo).length,
      tone:        'info',
    }));

    const huerfanas = this.fuerzasSinClasificar().length;
    if (huerfanas > 0) {
      items.push({
        id:          'sin',
        label:       'Sin clasificar',
        description: 'Fuerzas que aún no pertenecen a ninguna unidad',
        icon:        'fa-solid fa-triangle-exclamation',
        badge:       huerfanas,
        tone:        'warning',
      });
    }

    return items;
  });

  /** Con una sola unidad la banda no aporta: se muestra como etiqueta. */
  readonly hayQueElegirSitio = computed(() => this.pestanasSitio().length > 1);

  /** Consecutivo del sitio activo. 0 = la pestaña «Sin clasificar». */
  readonly sitioActivoId = computed(() => {
    const id = this.sitioActivo();
    return id === 'sin' || id === '' ? 0 : Number(id);
  });

  readonly enSinClasificar = computed(() => this.sitioActivo() === 'sin');

  /** Las fuerzas de la unidad activa — el universo de todo lo de abajo. */
  readonly fuerzasDelSitio = computed(() => {
    const sitio = this.sitioActivoId();
    return this.fuerzas().filter(f => (f.sitioGraba || 0) === sitio);
  });

  readonly sitioActivoNombre = computed(() => {
    if (this.enSinClasificar()) return 'Sin clasificar';
    const s = this.sitios().find(x => x.consecutivo === this.sitioActivoId());
    return s ? this.sitioService.etiqueta(s) : '';
  });

  /** Destino elegido en el botón de mover en bloque. */
  readonly destinoReasignacion = signal(0);
  readonly reasignando         = signal(false);

  // ── Formulario de fuerza ───────────────────────────────────────────────────
  readonly modoFuerza = signal<'ninguno' | 'nueva' | 'editando'>('ninguno');
  readonly formFuerza = this.fb.nonNullable.group({
    id:          [0, [Validators.required, Validators.min(1)]],
    descripcion: ['', [Validators.required]],
    abreviatura: [''],
    sitioGraba:  [0],
    vigente:     ['S']
  });

  // ── Canales ────────────────────────────────────────────────────────────────
  readonly canales             = signal<DtoCanalFuerza[]>([]);
  readonly loadingCanales      = signal(false);
  readonly modoCanal           = signal<'ninguno' | 'nuevo' | 'editando'>('ninguno');
  readonly editingCanalCodigo  = signal<number | null>(null);
  readonly formCanal = this.fb.nonNullable.group({
    descripcion: ['', [Validators.required]],
    vigente:     ['S']
  });

  // ── Usuarios en fuerza ─────────────────────────────────────────────────────
  readonly usuariosEnFuerza = signal<DtoUsuarioEnFuerza[]>([]);
  readonly loadingUsuarios  = signal(false);

  // ── Tab activa en el detalle ───────────────────────────────────────────────
  readonly tabDetalle = signal<'canales' | 'usuarios'>('canales');

  ngOnInit(): void {
    this.cargarSitios();
    this.cargarFuerzas();
  }

  cargarSitios(): void {
    this.sitioService.getSitios().subscribe({
      next: (r) => { this.sitios.set(r.data ?? []); this.resolverSitioActivo(); },
      error: () => { /* silencioso: el catálogo es secundario, la pantalla sirve igual */ },
    });
  }

  /**
   * Deja seleccionada una unidad válida.
   *
   * Se llama cada vez que cambia el catálogo o la lista de fuerzas, porque
   * las dos cosas mueven las pestañas: retirar un sitio le quita la suya, y
   * clasificar la última fuerza huérfana hace desaparecer «Sin clasificar».
   * Si la que estaba activa sigue existiendo se respeta —cambiar de unidad
   * bajo los pies de quien está trabajando sería peor que no elegir nada.
   */
  private resolverSitioActivo(): void {
    const pestanas = this.pestanasSitio();
    if (pestanas.length === 0) { this.sitioActivo.set(''); return; }
    if (pestanas.some(p => p.id === this.sitioActivo())) return;

    // Se prefiere una unidad real; «Sin clasificar» solo si no hay otra cosa.
    const primera = pestanas.find(p => p.id !== 'sin') ?? pestanas[0];
    this.sitioActivo.set(primera.id);
    this.limpiarSeleccion();
  }

  /** Cambio de unidad desde la banda. */
  seleccionarSitio(id: string): void {
    if (id === this.sitioActivo()) return;
    this.sitioActivo.set(id);
    this.limpiarSeleccion();
  }

  /** Lo que se estuviera editando pertenece a la unidad anterior. */
  private limpiarSeleccion(): void {
    this.fuerzaSeleccionada.set(null);
    this.modoFuerza.set('ninguno');
    this.modoCanal.set('ninguno');
    this.canales.set([]);
    this.usuariosEnFuerza.set([]);
    this.busqueda.set('');
  }

  // ── Catálogo de sitios ─────────────────────────────────────────────────────

  abrirCatalogoSitios(): void {
    this.vista.set('sitios');
  }

  cerrarCatalogoSitios(): void {
    this.vista.set('fuerzas');
  }

  /** El catálogo cambió: puede haber aparecido o desaparecido una pestaña. */
  onSitiosCambiados(): void {
    this.cargarSitios();
    this.cargarFuerzas();
  }

  // ── Clasificación en bloque ────────────────────────────────────────────────

  /**
   * Mueve de una vez todas las fuerzas huérfanas a una unidad, con los
   * usuarios que colgaban de ellas. Es el camino de entrada de un CAD que ya
   * venía trabajando: hasta ahora sus fuerzas nacían en el sitio 0 porque el
   * valor salía del claim del administrador.
   */
  reasignarSinClasificar(): void {
    const destino = this.destinoReasignacion();
    if (!destino) {
      this.toast.warning('Sitios', 'Elija la unidad a la que van estas fuerzas.');
      return;
    }

    this.reasignando.set(true);
    this.fuerzaService.reasignarSitio(0, destino).subscribe({
      next: (r) => {
        this.reasignando.set(false);
        if (r.success) {
          this.toast.success('Sitios', r.message);
          // Al vaciarse, «Sin clasificar» desaparece: hay que reposicionarse
          // en la unidad de destino y no en una pestaña que ya no existe.
          this.sitioActivo.set(String(destino));
          this.destinoReasignacion.set(0);
          this.onSitiosCambiados();
        } else {
          this.toast.warning('Sitios', r.message);
        }
      },
      error: (err) => {
        this.reasignando.set(false);
        this.toast.error('Sitios', err?.error?.message ?? 'No se pudieron mover las fuerzas.');
      },
    });
  }

  // ── Fuerzas ────────────────────────────────────────────────────────────────

  cargarFuerzas(): void {
    this.loading.set(true);
    // sitio=0 → todas las del CAD, no solo las de la unidad del administrador:
    // si el CAD aloja varias, se administran todas desde aquí.
    this.fuerzaService.getFuerzas(0).subscribe({
      next: (r) => {
        const lista = r.data ?? [];
        this.fuerzas.set(lista);
        this.loading.set(false);
        // La pestaña «Sin clasificar» aparece y desaparece según esta lista.
        this.resolverSitioActivo();
        // Si había una fuerza seleccionada, refrescarla
        const actual = this.fuerzaSeleccionada();
        if (actual) {
          const updated = lista.find(f => f.id === actual.id);
          if (updated) this.fuerzaSeleccionada.set(updated);
        }
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Entidades', 'No se pudieron cargar las fuerzas.');
      }
    });
  }

  seleccionarFuerza(fuerza: DtoFuerza): void {
    this.fuerzaSeleccionada.set(fuerza);
    this.modoFuerza.set('ninguno');
    this.modoCanal.set('ninguno');
    this.tabDetalle.set('canales');
    this.cargarCanales(fuerza.id);
    this.cargarUsuarios(fuerza.id);
  }

  nuevaFuerza(): void {
    // Sin unidades no hay dónde poner la fuerza, y el backend la rechazaría:
    // se manda a crear la primera en vez de dejar llenar un formulario que
    // no se va a poder guardar.
    if (this.sitiosVigentes().length === 0) {
      this.toast.warning(
        'Fuerzas',
        'Primero registre el sitio de grabación (la unidad policial) al que pertenecerá la fuerza.',
      );
      this.abrirCatalogoSitios();
      return;
    }

    this.fuerzaSeleccionada.set(null);
    this.modoFuerza.set('nueva');
    // Hereda la unidad en la que se está trabajando; si se está en «Sin
    // clasificar» no hay ninguna que heredar y hay que elegirla en el campo.
    this.formFuerza.reset({
      id: 0, descripcion: '', abreviatura: '',
      sitioGraba: this.enSinClasificar() ? 0 : this.sitioActivoId(),
      vigente: 'S',
    });
    this.modoCanal.set('ninguno');
  }

  editarFuerza(fuerza: DtoFuerza, event: Event): void {
    event.stopPropagation();
    this.fuerzaSeleccionada.set(fuerza);
    this.modoFuerza.set('editando');
    this.formFuerza.reset({
      id: fuerza.id,          // id fijo en edición (no editable)
      descripcion: fuerza.descripcion,
      abreviatura: fuerza.abreviatura ?? '',
      sitioGraba: fuerza.sitioGraba ?? 0,
      vigente: fuerza.vigente
    });
    // Editar también selecciona la fuerza, así que sus canales y usuarios se
    // cargan aquí: al cancelar vuelve el detalle y debe traer datos reales,
    // no la lista vacía que se vería si sólo se cargaran al hacer clic.
    this.cargarCanales(fuerza.id);
    this.cargarUsuarios(fuerza.id);
  }

  cancelarFuerza(): void {
    this.modoFuerza.set('ninguno');
    this.formFuerza.reset({ id: 0, descripcion: '', abreviatura: '', sitioGraba: 0, vigente: 'S' });
  }

  guardarFuerza(): void {
    if (this.formFuerza.invalid) {
      this.formFuerza.markAllAsTouched();
      const v = this.formFuerza.getRawValue();
      if (this.modoFuerza() === 'nueva' && (!v.id || v.id <= 0)) {
        this.toast.warning('Guardar', 'El código de la fuerza es requerido y debe ser mayor que 0.');
      } else if (!v.descripcion?.trim()) {
        this.toast.warning('Guardar', 'La descripción de la fuerza es requerida.');
      }
      return;
    }

    this.saving.set(true);
    const v = this.formFuerza.getRawValue();
    const req: DtoFuerzaRequest = { ...v, descripcion: v.descripcion.trim() };

    const seleccionada = this.fuerzaSeleccionada();
    const op = this.modoFuerza() === 'editando' && seleccionada
      ? this.fuerzaService.updateFuerza(seleccionada.id, req)
      : this.fuerzaService.createFuerza(req);

    op.subscribe({
      next: (r) => {
        this.saving.set(false);
        if (r.success) {
          this.toast.success('Fuerza', r.message);
          this.modoFuerza.set('ninguno');
          this.cargarFuerzas();
        } else {
          this.toast.warning('Fuerza', r.message);
        }
      },
      error: () => {
        this.saving.set(false);
        this.toast.error('Fuerza', 'Error al guardar la fuerza.');
      }
    });
  }

  toggleFuerza(fuerza: DtoFuerza, event: Event): void {
    event.stopPropagation();
    this.fuerzaService.toggleFuerza(fuerza.id).subscribe({
      next: (r) => {
        if (r.success) {
          this.toast.success('Estado', r.message);
          this.cargarFuerzas();
        } else {
          this.toast.warning('Estado', r.message);
        }
      },
      error: () => this.toast.error('Estado', 'Error al cambiar estado de la fuerza.')
    });
  }

  // ── Canales ────────────────────────────────────────────────────────────────

  cargarCanales(fuerzaId: number): void {
    this.loadingCanales.set(true);
    this.fuerzaService.getCanales(fuerzaId).subscribe({
      next: (r) => { this.canales.set(r.data ?? []); this.loadingCanales.set(false); },
      error: () => { this.loadingCanales.set(false); this.toast.error('Canales', 'Error al cargar canales.'); }
    });
  }

  nuevoCanal(): void {
    this.modoCanal.set('nuevo');
    this.editingCanalCodigo.set(null);
    this.formCanal.reset({ descripcion: '', vigente: 'S' });
  }

  editarCanal(canal: DtoCanalFuerza): void {
    this.modoCanal.set('editando');
    this.editingCanalCodigo.set(canal.codigo);
    this.formCanal.reset({ descripcion: canal.descripcion, vigente: canal.vigente });
  }

  cancelarCanal(): void {
    this.modoCanal.set('ninguno');
    this.editingCanalCodigo.set(null);
    this.formCanal.reset({ descripcion: '', vigente: 'S' });
  }

  guardarCanal(): void {
    const fuerza = this.fuerzaSeleccionada();
    if (!fuerza) return;
    if (this.formCanal.invalid) {
      this.formCanal.markAllAsTouched();
      this.toast.warning('Canal', 'La descripción del canal es requerida.');
      return;
    }
    this.saving.set(true);
    const v = this.formCanal.getRawValue();
    const req: DtoCanalRequest = { ...v, descripcion: v.descripcion.trim() };
    const fuerzaId = fuerza.id;

    const editingCodigo = this.editingCanalCodigo();
    const op = this.modoCanal() === 'editando' && editingCodigo !== null
      ? this.fuerzaService.updateCanal(fuerzaId, editingCodigo, req)
      : this.fuerzaService.createCanal(fuerzaId, req);

    op.subscribe({
      next: (r) => {
        this.saving.set(false);
        if (r.success) {
          this.toast.success('Canal', r.message);
          this.cancelarCanal();
          this.cargarCanales(fuerzaId);
          this.cargarFuerzas();
        } else {
          this.toast.warning('Canal', r.message);
        }
      },
      error: () => {
        this.saving.set(false);
        this.toast.error('Canal', 'Error al guardar el canal.');
      }
    });
  }

  toggleCanal(canal: DtoCanalFuerza): void {
    const fuerza = this.fuerzaSeleccionada();
    if (!fuerza) return;
    this.fuerzaService.toggleCanal(fuerza.id, canal.codigo).subscribe({
      next: (r) => {
        if (r.success) {
          this.toast.success('Canal', r.message);
          this.cargarCanales(fuerza.id);
        } else {
          this.toast.warning('Canal', r.message);
        }
      },
      error: () => this.toast.error('Canal', 'Error al cambiar estado del canal.')
    });
  }

  // ── Usuarios ───────────────────────────────────────────────────────────────

  cargarUsuarios(fuerzaId: number): void {
    this.loadingUsuarios.set(true);
    this.fuerzaService.getUsuariosByFuerza(fuerzaId).subscribe({
      next: (r) => { this.usuariosEnFuerza.set(r.data ?? []); this.loadingUsuarios.set(false); },
      error: () => { this.loadingUsuarios.set(false); this.toast.error('Usuarios', 'Error al cargar usuarios.'); }
    });
  }

  setTab(tab: 'canales' | 'usuarios'): void {
    this.tabDetalle.set(tab);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  estaSeleccionada(fuerza: DtoFuerza): boolean {
    return this.fuerzaSeleccionada()?.id === fuerza.id;
  }

  setFiltroVigencia(filtro: 'todas' | 'vigentes' | 'inactivas'): void {
    this.filtroVigencia.set(filtro);
  }

  getFuerzaIcon(fuerza: DtoFuerza): string {
    const d = (fuerza.descripcion || '').toLowerCase();
    const a = (fuerza.abreviatura || '').toLowerCase();
    if (d.includes('polic') || a.includes('ponal') || a.includes('pol')) return 'fa-solid fa-shield-halved';
    if (d.includes('salud') || d.includes('medic') || d.includes('ambul') || a.includes('salud')) return 'fa-solid fa-heart-pulse';
    if (d.includes('bomber') || a.includes('bomb')) return 'fa-solid fa-fire-extinguisher';
    if (d.includes('transit') || d.includes('movilidad') || a.includes('stm')) return 'fa-solid fa-car-side';
    if (d.includes('defensa civil') || d.includes('gestion del riesgo') || d.includes('cruz roja')) return 'fa-solid fa-life-ring';
    if (d.includes('militar') || d.includes('ejercito') || d.includes('armada')) return 'fa-solid fa-person-military-rifle';
    return 'fa-solid fa-building-shield';
  }

  getFuerzaThemeClass(fuerza: DtoFuerza): string {
    const d = (fuerza.descripcion || '').toLowerCase();
    const a = (fuerza.abreviatura || '').toLowerCase();
    if (d.includes('polic') || a.includes('ponal') || a.includes('pol')) return 'ent-theme--policia';
    if (d.includes('salud') || d.includes('medic') || d.includes('ambul')) return 'ent-theme--salud';
    if (d.includes('bomber')) return 'ent-theme--bomberos';
    if (d.includes('transit') || d.includes('movilidad')) return 'ent-theme--transito';
    return 'ent-theme--default';
  }

  // Los conteos son de la unidad activa: en un CAD con dos, un total global
  // no le dice nada a quien está administrando una de ellas.
  readonly conteoVigentes = computed(() => this.fuerzasDelSitio().filter(f => f.vigente === 'S').length);
  readonly conteoInactivas = computed(() => this.fuerzasDelSitio().filter(f => f.vigente !== 'S').length);
  readonly conteoTotal    = computed(() => this.fuerzasDelSitio().length);
}
