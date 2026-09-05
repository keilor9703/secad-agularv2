import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  TemplateRef,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  CasoService,
  DtoCaso,
  DtoCasoRequest,
  DtoCasoImportItem,
  DtoImportarCasosResult,
} from '../../../administracion/services/caso.service';
import {
  SuperAdminService,
  TenantPublico,
} from '../../../../core/services/super-admin.service';
import {
  AsistenteService,
  AsistenteCategoria,
} from '../../../../core/services/operacion/asistente.service';
import { ToastService } from '../../../../core/services/toast.service';
import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiSectionHeaderComponent } from '../../../../shared/components/ui-section-header/ui-section-header.component';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiSearchInputComponent } from '../../../../shared/components/ui-search-input/ui-search-input.component';
import { UiInputComponent } from '../../../../shared/components/ui-input/ui-input.component';
import { UiSelectComponent } from '../../../../shared/components/ui-select/ui-select.component';
import { UiToggleComponent } from '../../../../shared/components/ui-toggle/ui-toggle.component';
import { UiBadgeComponent } from '../../../../shared/components/ui-badge/ui-badge.component';
import { UiTableComponent } from '../../../../shared/components/ui-table/ui-table.component';
import { UiModalComponent } from '../../../../shared/components/ui-modal/ui-modal.component';
import { UiFileUploadComponent } from '../../../../shared/components/ui-file-upload/ui-file-upload.component';
import {
  UiTableAction,
  UiTableActionEvent,
  UiTableColumn,
} from '../../../../shared/interfaces/ui-table.interface';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';
import { cargarExcelJS, descargarLibroExcel } from '../../../../shared/utils/exceljs-loader.util';

type ModalMode = 'create' | 'edit';

interface CeldaCtx {
  $implicit: DtoCaso;
  row: DtoCaso;
  column: UiTableColumn<DtoCaso>;
}

@Component({
  selector: 'app-casos-super-page',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    UiPageHeaderComponent,
    UiSectionHeaderComponent,
    UiButtonComponent,
    UiSearchInputComponent,
    UiInputComponent,
    UiSelectComponent,
    UiToggleComponent,
    UiBadgeComponent,
    UiTableComponent,
    UiModalComponent,
    UiFileUploadComponent,
  ],
  templateUrl: './casos-super-page.component.html',
  styleUrls: ['./casos-super-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CasosSuperPageComponent implements OnInit {
  private readonly casoService   = inject(CasoService);
  private readonly superAdminSvc = inject(SuperAdminService);
  private readonly asistenteSvc  = inject(AsistenteService);
  private readonly toast         = inject(ToastService);
  private readonly fb            = inject(FormBuilder);

  // ── Estado principal ────────────────────────────────────────────────────────
  readonly casos      = signal<DtoCaso[]>([]);
  readonly tenants    = signal<TenantPublico[]>([]);
  readonly categorias = signal<AsistenteCategoria[]>([]);
  readonly loading    = signal(false);
  readonly saving     = signal(false);

  // ── Filtros ─────────────────────────────────────────────────────────────────
  readonly busqueda        = signal('');
  readonly filtroAmbito    = signal<string>('TODOS');
  readonly filtroEstado    = signal<'TODOS' | 'VIGENTE' | 'INACTIVO'>('TODOS');
  readonly filtroCategoria = signal<string>('');

  // ── Modales ─────────────────────────────────────────────────────────────────
  readonly showModal   = signal(false);
  readonly modalMode   = signal<ModalMode>('create');
  readonly editCodigo  = signal('');

  // ── Importación / Exportación ───────────────────────────────────────────────
  readonly showImportar    = signal(false);
  readonly importando      = signal(false);
  readonly nombreArchivo   = signal('');
  readonly resultadoImport = signal<DtoImportarCasosResult | null>(null);

  // ── Formulario de caso ──────────────────────────────────────────────────────
  readonly form = this.fb.nonNullable.group({
    codigo:              ['', [Validators.required]],
    descripcion:         ['', [Validators.required]],
    vigente:             [true],
    tipoAmbito:          ['NACIONAL' as 'NACIONAL' | 'TENANT', [Validators.required]],
    codDane:             [''],
    idCategoriaAsistente:[''],
  });

  // ── Opciones de selección ───────────────────────────────────────────────────
  readonly opcionesTipoAmbito: UiSelectOption<string>[] = [
    { label: 'Nacional — Aplica a todos los CADs del país', value: 'NACIONAL' },
    { label: 'Específico — Excepción para un CAD / Municipio', value: 'TENANT' },
  ];

  readonly opcionesTenants = computed<UiSelectOption<string>[]>(() => {
    return this.tenants().map((t) => ({
      label: `${t.nombre} (${t.codDane})${t.departamento ? ' · ' + t.departamento : ''}`,
      value: t.codDane,
    }));
  });

  readonly opcionesFiltroAmbito = computed<UiSelectOption<string>[]>(() => [
    { label: 'Todos los ámbitos', value: 'TODOS' },
    { label: 'Nacionales únicamente', value: 'NACIONAL' },
    ...this.tenants().map((t) => ({
      label: `CAD ${t.nombre} (${t.codDane})`,
      value: t.codDane,
    })),
  ]);

  readonly opcionesFiltroEstado: UiSelectOption<string>[] = [
    { label: 'Todos los estados', value: 'TODOS' },
    { label: 'Solo vigentes', value: 'VIGENTE' },
    { label: 'Solo inactivos', value: 'INACTIVO' },
  ];

  readonly opcionesCategoria = computed<UiSelectOption<string>[]>(() => [
    { label: 'Sin categoría del asistente', value: '' },
    ...this.categorias().map((c) => ({ label: c.descripcion, value: c.id })),
  ]);

  // ── Casos filtrados ─────────────────────────────────────────────────────────
  readonly casosFiltrados = computed(() => {
    const q = this.busqueda().trim().toLowerCase();
    const ambito = this.filtroAmbito();
    const estado = this.filtroEstado();
    const cat = this.filtroCategoria();

    return this.casos().filter((c) => {
      // Filtro texto
      if (q) {
        const cod = (c.codigo || '').toLowerCase();
        const desc = (c.descripcion || '').toLowerCase();
        if (!cod.includes(q) && !desc.includes(q)) return false;
      }

      // Filtro ámbito
      if (ambito === 'NACIONAL') {
        if (c.codDane && c.codDane !== 'NACIONAL' && !c.esNacional) return false;
      } else if (ambito !== 'TODOS') {
        if (c.codDane !== ambito) return false;
      }

      // Filtro estado
      if (estado === 'VIGENTE' && !c.vigente) return false;
      if (estado === 'INACTIVO' && c.vigente) return false;

      // Filtro categoría
      if (cat && c.idCategoriaAsistente !== cat) return false;

      return true;
    });
  });

  // ── Métricas de resumen ─────────────────────────────────────────────────────
  readonly totalCasos = computed(() => this.casos().length);
  readonly totalNacionales = computed(
    () => this.casos().filter((c) => !c.codDane || c.codDane === 'NACIONAL' || c.esNacional).length,
  );
  readonly totalLocales = computed(
    () => this.casos().filter((c) => c.codDane && c.codDane !== 'NACIONAL' && !c.esNacional).length,
  );
  readonly totalVigentes = computed(() => this.casos().filter((c) => c.vigente).length);

  // ── Columnas de tabla ───────────────────────────────────────────────────────
  @ViewChild('celdaCodigo', { static: true }) celdaCodigo!: TemplateRef<CeldaCtx>;
  @ViewChild('celdaAmbito', { static: true }) celdaAmbito!: TemplateRef<CeldaCtx>;

  columns: UiTableColumn<DtoCaso>[] = [];

  readonly acciones: UiTableAction<DtoCaso>[] = [
    { id: 'editar', label: 'Editar código', icon: 'fa-solid fa-pen' },
    {
      id: 'estado',
      label: 'Activar / Desactivar',
      icon: 'fa-solid fa-power-off',
      title: 'Cambiar vigencia',
    },
  ];

  ngOnInit(): void {
    this.construirColumnas();
    this.cargarDatos();
  }

  private construirColumnas(): void {
    this.columns = [
      {
        key: 'codigo',
        label: 'Código',
        cellTemplate: this.celdaCodigo,
        align: 'left',
      },
      {
        key: 'descripcion',
        label: 'Descripción del caso / incidente',
        align: 'left',
      },
      {
        key: 'codDane',
        label: 'Ámbito de aplicación',
        cellTemplate: this.celdaAmbito,
        align: 'center',
      },
      {
        key: 'categoriaDescripcion',
        label: 'Categoría Asistente',
        align: 'left',
        value: (c) => c.categoriaDescripcion || '—',
      },
      {
        key: 'vigente',
        label: 'Estado',
        align: 'center',
        badge: (c) =>
          c.vigente
            ? { text: 'Vigente', variant: 'success' }
            : { text: 'Inactivo', variant: 'danger' },
      },
    ];
  }

  cargarDatos(): void {
    this.loading.set(true);

    // Cargar Tenants
    this.superAdminSvc.getTenants().subscribe({
      next: (t) => this.tenants.set(t),
      error: () => {},
    });

    // Cargar Categorías
    this.asistenteSvc.getCategorias().subscribe({
      next: (cats) => this.categorias.set(cats),
      error: () => {},
    });

    // Cargar Catálogo de Casos
    this.casoService.getAll().subscribe({
      next: (r) => {
        this.loading.set(false);
        const lista = r.data ?? [];
        // Asociar nombres de tenant a los casos si vienen con codDane
        const enriched = lista.map((c) => {
          const esNac = !c.codDane || c.codDane === 'NACIONAL' || c.esNacional;
          const tenant = !esNac ? this.tenants().find((t) => t.codDane === c.codDane) : null;
          return {
            ...c,
            esNacional: esNac,
            nombreCad: tenant ? tenant.nombre : c.nombreCad ?? null,
          };
        });
        this.casos.set(enriched);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Códigos de caso', 'No se pudo cargar el catálogo de códigos.');
      },
    });
  }

  // ── Modales y Operaciones CRUD ─────────────────────────────────────────────

  nuevoCaso(): void {
    this.modalMode.set('create');
    this.editCodigo.set('');
    this.form.reset({
      codigo: '',
      descripcion: '',
      vigente: true,
      tipoAmbito: 'NACIONAL',
      codDane: '',
      idCategoriaAsistente: '',
    });
    this.showModal.set(true);
  }

  editarCaso(caso: DtoCaso): void {
    this.modalMode.set('edit');
    this.editCodigo.set(caso.codigo);
    const esNac = !caso.codDane || caso.codDane === 'NACIONAL' || caso.esNacional;
    this.form.reset({
      codigo: caso.codigo,
      descripcion: caso.descripcion,
      vigente: caso.vigente,
      tipoAmbito: esNac ? 'NACIONAL' : 'TENANT',
      codDane: esNac ? '' : (caso.codDane ?? ''),
      idCategoriaAsistente: caso.idCategoriaAsistente ?? '',
    });
    this.showModal.set(true);
  }

  cerrarModal(): void {
    this.showModal.set(false);
  }

  guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();
    if (v.tipoAmbito === 'TENANT' && !v.codDane.trim()) {
      this.toast.warning('Ámbito', 'Debe seleccionar el CAD o municipio al que aplica este código.');
      return;
    }

    const codDaneFinal = v.tipoAmbito === 'NACIONAL' ? 'NACIONAL' : v.codDane.trim();

    const request: DtoCasoRequest = {
      codigo: v.codigo.trim(),
      descripcion: v.descripcion.trim(),
      vigente: v.vigente,
      idCategoriaAsistente: v.idCategoriaAsistente || null,
      codDane: codDaneFinal,
    };

    this.saving.set(true);
    const op =
      this.modalMode() === 'edit'
        ? this.casoService.update(this.editCodigo(), request)
        : this.casoService.create(request);

    op.subscribe({
      next: (resp) => {
        this.saving.set(false);
        if (resp.success) {
          this.toast.success('Códigos de caso', resp.message);
          this.cerrarModal();
          this.cargarDatos();
        } else {
          this.toast.warning('Códigos de caso', resp.message);
        }
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(
          'Códigos de caso',
          err?.error?.message ?? 'Error al guardar el código de caso.',
        );
      },
    });
  }

  onAccion(event: UiTableActionEvent<DtoCaso>): void {
    const caso = event.row;
    if (event.actionId === 'editar') {
      this.editarCaso(caso);
    } else if (event.actionId === 'estado') {
      this.toggleEstado(caso);
    }
  }

  toggleEstado(caso: DtoCaso): void {
    const nuevo = !caso.vigente;
    this.casoService.setEstado(caso.codigo, nuevo).subscribe({
      next: (r) => {
        if (r.success) {
          this.toast.success('Estado', r.message);
          this.cargarDatos();
        } else {
          this.toast.warning('Estado', r.message);
        }
      },
      error: () => this.toast.error('Estado', 'Error al cambiar la vigencia del código.'),
    });
  }

  // ── Importación y Exportación Excel ─────────────────────────────────────────

  abrirImportar(): void {
    this.resultadoImport.set(null);
    this.nombreArchivo.set('');
    this.showImportar.set(true);
  }

  cerrarImportar(): void {
    this.showImportar.set(false);
  }

  async procesarArchivo(archivo: File): Promise<void> {
    this.nombreArchivo.set(archivo.name);
    this.importando.set(true);
    this.resultadoImport.set(null);

    try {
      const ExcelJS = await cargarExcelJS();
      const buffer = await archivo.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);

      const ws = wb.worksheets[0];
      if (!ws) throw new Error('El archivo no contiene hojas de cálculo.');

      const items: DtoCasoImportItem[] = [];
      ws.eachRow((row, rowNum) => {
        if (rowNum === 1) return; // omitir encabezados
        const cod = String(row.getCell(1).value ?? '').trim();
        const desc = String(row.getCell(2).value ?? '').trim();
        const dane = String(row.getCell(3).value ?? '').trim();

        if (cod && desc) {
          items.push({
            codigo: cod,
            descripcion: desc,
            codDane: dane || 'NACIONAL',
          });
        }
      });

      if (items.length === 0) {
        this.importando.set(false);
        this.toast.warning('Importar', 'No se encontraron filas con código y descripción válidos.');
        return;
      }

      this.casoService.importar(items).subscribe({
        next: (r) => {
          this.importando.set(false);
          this.resultadoImport.set(r);
          if (r.success) {
            this.toast.success('Importación', r.message);
            this.cargarDatos();
          } else {
            this.toast.warning('Importación', r.message);
          }
        },
        error: (err) => {
          this.importando.set(false);
          this.toast.error(
            'Importación',
            err?.error?.message ?? 'Error al procesar la importación.',
          );
        },
      });
    } catch (err: any) {
      this.importando.set(false);
      this.toast.error('Error al leer Excel', err.message ?? 'Formato inválido.');
    }
  }

  async exportarExcel(): Promise<void> {
    const lista = this.casosFiltrados();
    if (!lista.length) {
      this.toast.warning('Exportar', 'No hay registros para exportar con los filtros actuales.');
      return;
    }

    const ExcelJS = await cargarExcelJS();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Códigos de Caso');

    ws.columns = [
      { header: 'Código', key: 'codigo', width: 14 },
      { header: 'Descripción', key: 'descripcion', width: 45 },
      { header: 'Ámbito', key: 'ambito', width: 16 },
      { header: 'CAD / Municipio', key: 'cad', width: 30 },
      { header: 'Categoría Asistente', key: 'categoria', width: 30 },
      { header: 'Vigente', key: 'vigente', width: 12 },
    ];

    for (const c of lista) {
      const esNac = !c.codDane || c.codDane === 'NACIONAL' || c.esNacional;
      ws.addRow({
        codigo: c.codigo,
        descripcion: c.descripcion,
        ambito: esNac ? 'NACIONAL' : 'ESPECÍFICO',
        cad: esNac ? 'Todos los CADs' : `${c.nombreCad ?? c.codDane}`,
        categoria: c.categoriaDescripcion || 'Sin categoría',
        vigente: c.vigente ? 'SÍ' : 'NO',
      });
    }

    await descargarLibroExcel(wb, `SECAD_Codigos_Caso_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
}
