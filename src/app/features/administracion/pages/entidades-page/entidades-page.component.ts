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
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';
import { ToastService } from '../../../../core/services/toast.service';
import {
  FuerzaService,
  DtoFuerza, DtoFuerzaRequest,
  DtoCanalFuerza, DtoCanalRequest,
  DtoUsuarioEnFuerza
} from '../../services/fuerza.service';

@Component({
  selector: 'app-entidades-page',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule, RouterModule,
    UiPageHeaderComponent, UiPanelHeaderComponent, UiSectionHeaderComponent,
    UiButtonComponent, UiInputComponent, UiSearchInputComponent, UiSelectComponent, UiBadgeComponent,
    UiChipComponent, UiSpinnerComponent, UiTabsComponent, UiTabComponent
  ],
  templateUrl: './entidades-page.component.html',
  styleUrls: ['./entidades-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EntidadesPageComponent implements OnInit {
  private readonly fuerzaService = inject(FuerzaService);
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

    return this.fuerzas().filter((f) => {
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

  // ── Métricas globales ──────────────────────────────────────────────────────
  readonly totalCanalesGlobal = computed(() =>
    this.fuerzas().reduce((sum, f) => sum + (f.totalCanales || 0), 0)
  );
  readonly totalUsuariosGlobal = computed(() =>
    this.fuerzas().reduce((sum, f) => sum + (f.totalUsuarios || 0), 0)
  );

  // ── Formulario de fuerza ───────────────────────────────────────────────────
  readonly modoFuerza = signal<'ninguno' | 'nueva' | 'editando'>('ninguno');
  readonly formFuerza = this.fb.nonNullable.group({
    id:          [0, [Validators.required, Validators.min(1)]],
    descripcion: ['', [Validators.required]],
    abreviatura: [''],
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
    this.cargarFuerzas();
  }

  // ── Fuerzas ────────────────────────────────────────────────────────────────

  cargarFuerzas(): void {
    this.loading.set(true);
    this.fuerzaService.getFuerzas().subscribe({
      next: (r) => {
        const lista = r.data ?? [];
        this.fuerzas.set(lista);
        this.loading.set(false);
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
    this.fuerzaSeleccionada.set(null);
    this.modoFuerza.set('nueva');
    this.formFuerza.reset({ id: 0, descripcion: '', abreviatura: '', vigente: 'S' });
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
    this.formFuerza.reset({ id: 0, descripcion: '', abreviatura: '', vigente: 'S' });
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

  readonly conteoVigentes = computed(() => this.fuerzas().filter(f => f.vigente === 'S').length);
  readonly conteoInactivas = computed(() => this.fuerzas().filter(f => f.vigente !== 'S').length);
  readonly conteoTotal    = computed(() => this.fuerzas().length);
}
