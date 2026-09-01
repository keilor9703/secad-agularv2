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
  DtoImportarCasosResult,
} from '../../services/caso.service';
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
import { UiTableComponent } from '../../../../shared/components/ui-table/ui-table.component';
import { UiModalComponent } from '../../../../shared/components/ui-modal/ui-modal.component';
import { UiFileUploadComponent } from '../../../../shared/components/ui-file-upload/ui-file-upload.component';
import {
  UiTableAction,
  UiTableActionEvent,
  UiTableColumn,
} from '../../../../shared/interfaces/ui-table.interface';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';

type ModalMode = 'create' | 'edit';

/** Contexto que ui-table pasa a cada cellTemplate. */
interface CeldaCtx {
  $implicit: DtoCaso;
  row: DtoCaso;
  column: UiTableColumn<DtoCaso>;
}

@Component({
  selector: 'app-casos-page',
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
    UiTableComponent,
    UiModalComponent,
    UiFileUploadComponent,
  ],
  templateUrl: './casos-page.component.html',
  styleUrls: ['./casos-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CasosPageComponent implements OnInit {
  private readonly service = inject(CasoService);
  private readonly asistente = inject(AsistenteService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  readonly casos = signal<DtoCaso[]>([]);
  readonly categorias = signal<AsistenteCategoria[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly busqueda = signal('');

  readonly showModal = signal(false);
  readonly modalMode = signal<ModalMode>('create');
  readonly editCodigo = signal('');

  readonly importando = signal(false);
  readonly nombreArchivo = signal('');
  readonly resultadoImport = signal<DtoImportarCasosResult | null>(null);

  readonly opcionesCategoria = computed<UiSelectOption<string>[]>(() => [
    { label: 'Sin categoría', value: '' },
    ...this.categorias().map((c) => ({ label: c.descripcion, value: c.id })),
  ]);

  readonly form = this.fb.nonNullable.group({
    codigo: ['', [Validators.required]],
    descripcion: ['', [Validators.required]],
    vigente: [true],
    idCategoriaAsistente: [''],
  });

  // ── Tabla ────────────────────────────────────────────────────────────────
  // La paginación la lleva ui-table: el origen la resolvía a mano con señales
  // de página, rango y recorte, y todo eso lo hace ya el componente.
  @ViewChild('celdaDescripcion', { static: true }) celdaDescripcion!: TemplateRef<CeldaCtx>;

  columns: UiTableColumn<DtoCaso>[] = [];

  readonly acciones: UiTableAction<DtoCaso>[] = [
    { id: 'editar', label: 'Editar', icon: 'fa-solid fa-pen' },
    {
      id: 'estado',
      label: 'Activar / desactivar',
      icon: 'fa-solid fa-power-off',
      title: 'Cambiar estado',
    },
  ];

  ngOnInit(): void {
    this.columns = [
      { key: 'codigo', label: 'Código', align: 'center', sortable: true },
      { key: 'descripcion', label: 'Descripción', cellTemplate: this.celdaDescripcion },
      {
        key: 'categoriaDescripcion',
        label: 'Categoría del asistente',
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

    this.cargar();

    this.asistente.getCategorias(false).subscribe({
      // Sin categorías el selector queda con «Sin categoría» y nada más; no es
      // motivo para dejar la pantalla inservible.
      next: (r) => this.categorias.set(r.data ?? []),
      error: () => this.categorias.set([]),
    });
  }

  cargar(): void {
    this.loading.set(true);
    this.service.getAll(this.busqueda().trim() || undefined).subscribe({
      next: (r) => {
        this.casos.set(r.data ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Códigos de caso', 'No se pudo cargar el catálogo.');
      },
    });
  }

  /** La búsqueda la resuelve el backend, así que cada término es una consulta. */
  buscar(texto: string): void {
    this.busqueda.set(texto);
    this.cargar();
  }

  onAccion(ev: UiTableActionEvent<DtoCaso>): void {
    if (ev.actionId === 'editar') {
      this.abrirEdicion(ev.row);
    } else if (ev.actionId === 'estado') {
      this.cambiarEstado(ev.row);
    }
  }

  // ── Alta y edición ───────────────────────────────────────────────────────

  abrirCreacion(): void {
    this.modalMode.set('create');
    this.editCodigo.set('');
    this.form.reset({ codigo: '', descripcion: '', vigente: true, idCategoriaAsistente: '' });
    this.showModal.set(true);
  }

  abrirEdicion(item: DtoCaso): void {
    this.modalMode.set('edit');
    this.editCodigo.set(item.codigo);
    this.form.reset({
      codigo: item.codigo,
      descripcion: item.descripcion,
      vigente: item.vigente,
      idCategoriaAsistente: item.idCategoriaAsistente ?? '',
    });
    this.showModal.set(true);
  }

  cerrarModal(): void {
    this.showModal.set(false);
  }

  guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.warning('Códigos de caso', 'Código y descripción son obligatorios.');
      return;
    }

    const v = this.form.getRawValue();
    const request: DtoCasoRequest = {
      codigo: v.codigo.trim(),
      descripcion: v.descripcion.trim(),
      vigente: v.vigente,
      idCategoriaAsistente: v.idCategoriaAsistente || null,
    };

    this.saving.set(true);
    const peticion =
      this.modalMode() === 'edit'
        ? this.service.update(this.editCodigo(), request)
        : this.service.create(request);

    peticion.subscribe({
      next: (resp) => {
        this.saving.set(false);
        if (!resp.success) {
          this.toast.warning('Códigos de caso', resp.message);
          return;
        }
        this.toast.success('Códigos de caso', resp.message);
        this.cerrarModal();
        this.cargar();
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error('Códigos de caso', err?.error?.message ?? 'Error al guardar.');
      },
    });
  }

  cambiarEstado(item: DtoCaso): void {
    this.service.setEstado(item.codigo, !item.vigente).subscribe({
      next: (resp) => {
        if (!resp.success) {
          this.toast.warning('Códigos de caso', resp.message);
          return;
        }
        this.toast.success('Códigos de caso', resp.message);
        this.cargar();
      },
      error: () => this.toast.error('Códigos de caso', 'Error al cambiar el estado.'),
    });
  }

  // ── Importación masiva desde Excel ───────────────────────────────────────

  async onArchivo(file: File): Promise<void> {
    this.nombreArchivo.set(file.name);
    this.importando.set(true);
    this.resultadoImport.set(null);

    let items: { codigo: string; descripcion: string }[];
    try {
      items = await this.leerExcel(file);
    } catch {
      this.importando.set(false);
      this.toast.error(
        'Importar',
        'No se pudo leer el archivo. Compruebe que sea un Excel (.xlsx) válido.',
      );
      return;
    }

    if (items.length === 0) {
      this.importando.set(false);
      this.toast.warning('Importar', 'El archivo no tiene filas para importar.');
      return;
    }

    this.service.importar(items).subscribe({
      next: (resp) => {
        this.importando.set(false);
        this.resultadoImport.set(resp);
        if (resp.success) {
          this.toast.success('Importar', resp.message);
          this.cargar();
        } else {
          this.toast.warning('Importar', resp.message);
        }
      },
      error: (err) => {
        this.importando.set(false);
        this.toast.error('Importar', err?.error?.message ?? 'Error al importar el archivo.');
      },
    });
  }

  limpiarArchivo(): void {
    this.nombreArchivo.set('');
    this.resultadoImport.set(null);
  }

  /**
   * ExcelJS se carga solo cuando de verdad se va a leer o escribir un libro.
   * Importado arriba de forma estática se llevaba casi 700 kB al paquete de
   * esta pantalla, que el navegador descargaba al ENTRAR aunque nadie fuera a
   * importar ni exportar nada.
   */
  private async cargarExcelJS(): Promise<typeof import('exceljs')> {
    return import('exceljs');
  }

  /** Primera hoja: columna A = código, columna B = descripción, fila 1 = encabezado. */
  private async leerExcel(file: File): Promise<{ codigo: string; descripcion: string }[]> {
    const ExcelJS = await this.cargarExcelJS();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());

    const hoja = workbook.worksheets[0];
    const items: { codigo: string; descripcion: string }[] = [];
    if (!hoja) {
      return items;
    }

    hoja.eachRow((row, numeroFila) => {
      if (numeroFila === 1) {
        return;
      }
      const codigo = String(row.getCell(1).value ?? '').trim();
      const descripcion = String(row.getCell(2).value ?? '').trim();
      if (codigo || descripcion) {
        items.push({ codigo, descripcion });
      }
    });

    return items;
  }

  async descargarPlantilla(): Promise<void> {
    const ExcelJS = await this.cargarExcelJS();
    const workbook = new ExcelJS.Workbook();
    const hoja = workbook.addWorksheet('Códigos de caso');
    hoja.columns = [
      { header: 'Código', key: 'codigo', width: 20 },
      { header: 'Descripción', key: 'descripcion', width: 50 },
    ];
    hoja.addRow({ codigo: '904', descripcion: 'Hurto calificado' });
    hoja.addRow({ codigo: '934', descripcion: 'Riña' });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_codigos_caso.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }
}
