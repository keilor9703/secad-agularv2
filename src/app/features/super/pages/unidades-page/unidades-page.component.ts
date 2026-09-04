import {
  Component, ChangeDetectionStrategy, OnInit, ViewChild, TemplateRef,
  inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  SuperAdminService, UnidadItem, UnidadSaveRequest,
  DepartamentoItem, UnidadImportItem, ImportarUnidadesResult
} from '../../../../core/services/super-admin.service';
import { ToastService } from '../../../../core/services/toast.service';

import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiTableComponent } from '../../../../shared/components/ui-table/ui-table.component';
import { UiModalComponent } from '../../../../shared/components/ui-modal/ui-modal.component';
import { UiInputComponent } from '../../../../shared/components/ui-input/ui-input.component';
import { UiSelectComponent } from '../../../../shared/components/ui-select/ui-select.component';
import { UiBadgeComponent } from '../../../../shared/components/ui-badge/ui-badge.component';
import { UiSectionHeaderComponent } from '../../../../shared/components/ui-section-header/ui-section-header.component';
import { UiFileUploadComponent } from '../../../../shared/components/ui-file-upload/ui-file-upload.component';
import { cargarExcelJS, descargarLibroExcel } from '../../../../shared/utils/exceljs-loader.util';
import { UiTableAction, UiTableActionEvent, UiTableColumn } from '../../../../shared/interfaces/ui-table.interface';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';

type ModalMode = 'create' | 'edit';

@Component({
  selector: 'app-unidades-page',
  templateUrl: './unidades-page.component.html',
  styleUrls: ['./unidades-page.component.scss'],
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    UiPageHeaderComponent, UiButtonComponent, UiTableComponent, UiModalComponent,
    UiInputComponent, UiSelectComponent, UiBadgeComponent, UiSectionHeaderComponent,
    UiFileUploadComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UnidadesPageComponent implements OnInit {
  private readonly service = inject(SuperAdminService);
  private readonly toast   = inject(ToastService);
  private readonly fb      = inject(FormBuilder);

  // ── Estado principal ──────────────────────────────────────────────────────
  readonly unidades = signal<UnidadItem[]>([]);
  readonly totalCount = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(15);
  readonly loading = signal(false);
  readonly saving  = signal(false);

  // Filtros
  readonly filtroTexto = signal('');
  readonly filtroDepartamento = signal('');
  readonly departamentos = signal<DepartamentoItem[]>([]);

  readonly filtroForm = this.fb.nonNullable.group({
    texto: [''],
    departamento: [''],
  });

  // ── Excel ─────────────────────────────────────────────────────────────────
  readonly showImportar   = signal(false);
  readonly importando     = signal(false);
  readonly exportando     = signal(false);
  readonly nombreArchivo  = signal('');
  readonly resultadoImport = signal<ImportarUnidadesResult | null>(null);

  // Modal
  readonly showModal = signal(false);
  readonly modalMode = signal<ModalMode>('create');
  readonly editConsecutivo = signal<number>(0);
  readonly intentoGuardar = signal(false);

  readonly totalPages = computed(() => {
    const total = this.totalCount();
    const size = this.pageSize();
    return Math.max(1, Math.ceil(total / size));
  });

  readonly opcionesDepartamentosFiltro = computed<UiSelectOption<string>[]>(() => {
    const opts: UiSelectOption<string>[] = [
      { label: 'Todos los departamentos', value: '' }
    ];
    for (const d of this.departamentos()) {
      opts.push({ label: `${d.departamento} (${d.totalMunicipios})`, value: d.departamento });
    }
    return opts;
  });

  readonly opcionesVigente: UiSelectOption<string>[] = [
    { label: 'Vigente (SI)',    value: 'SI' },
    { label: 'No vigente (NO)', value: 'NO' },
  ];

  // ── Formulario ────────────────────────────────────────────────────────────
  readonly form = this.fb.nonNullable.group({
    consecutivo:            this.fb.control<number | null>(null),
    fuerza:                 [6],
    descripcionDependencia: ['', [Validators.required]],
    vigente:                ['SI'],
    siglaFisica:            [''],
    siglaPapa:              [''],
    departamento:           ['', [Validators.required]],
    codigoDepartamento:     this.fb.control<number | null>(null),
    municipio:              ['', [Validators.required]],
    codigoDane:             ['', [Validators.required]],
    descRegional:           [''],
    codRegional:            this.fb.control<number | null>(null),
    direccion:              [''],
    telefono:               [''],
    telefonoIp:             [''],
    email:                  [''],
    zona:                   ['UR'],
  });

  // ── Validación de errores ─────────────────────────────────────────────────
  readonly errorDescripcion = computed(() =>
    this.intentoGuardar() && !this.form.controls.descripcionDependencia.value.trim()
      ? 'La descripción de la dependencia es obligatoria.' : '');

  readonly errorDepartamento = computed(() =>
    this.intentoGuardar() && !this.form.controls.departamento.value.trim()
      ? 'El departamento es obligatorio.' : '');

  readonly errorMunicipio = computed(() =>
    this.intentoGuardar() && !this.form.controls.municipio.value.trim()
      ? 'El municipio es obligatorio.' : '');

  readonly errorCodigoDane = computed(() =>
    this.intentoGuardar() && !this.form.controls.codigoDane.value.trim()
      ? 'El código DANE es obligatorio.' : '');

  // ── Tabla ────────────────────────────────────────────────────────────────
  @ViewChild('celdaUnidad',    { static: true }) celdaUnidad!: TemplateRef<CeldaCtx>;
  @ViewChild('celdaUbicacion', { static: true }) celdaUbicacion!: TemplateRef<CeldaCtx>;
  @ViewChild('celdaVigente',   { static: true }) celdaVigente!: TemplateRef<CeldaCtx>;

  columns: UiTableColumn<UnidadItem>[] = [];

  readonly acciones: UiTableAction<UnidadItem>[] = [
    { id: 'editar', label: 'Editar',               icon: 'fa-solid fa-pen' },
    { id: 'toggle', label: 'Activar / desactivar', icon: 'fa-solid fa-power-off', title: 'Cambiar vigencia' }
  ];

  ngOnInit(): void {
    this.columns = [
      { key: 'consecutivo',  label: 'Consecutivo', align: 'center', width: '110px' },
      { key: 'descripcionDependencia', label: 'Unidad / Dependencia', cellTemplate: this.celdaUnidad },
      { key: 'siglaFisica',  label: 'Sigla Física', align: 'center', width: '130px',
        value: u => u.siglaFisica || '—' },
      { key: 'municipio',    label: 'Ubicación',   cellTemplate: this.celdaUbicacion },
      { key: 'codigoDane',   label: 'Cód. DANE',   align: 'center', width: '110px',
        value: u => u.codigoDane || '—' },
      { key: 'descRegional', label: 'Regional',    width: '180px',
        value: u => u.descRegional || '—' },
      { key: 'vigente',      label: 'Vigente',     align: 'center', width: '100px', cellTemplate: this.celdaVigente },
    ];

    this.filtroForm.controls.texto.valueChanges.subscribe(v => {
      this.filtroTexto.set(v);
      this.page.set(1);
      this.cargarUnidades();
    });

    this.filtroForm.controls.departamento.valueChanges.subscribe(d => {
      this.filtroDepartamento.set(d);
      this.page.set(1);
      this.cargarUnidades();
    });

    this.cargarDepartamentos();
    this.cargarUnidades();
  }

  cargarDepartamentos(): void {
    this.service.getDepartamentos().subscribe({
      next: deps => this.departamentos.set(deps),
      error: () => this.toast.error('Departamentos', 'Error al cargar lista de departamentos.')
    });
  }

  cargarUnidades(): void {
    this.loading.set(true);
    this.service.getUnidades({
      filtro: this.filtroTexto().trim() || undefined,
      departamento: this.filtroDepartamento().trim() || undefined,
      page: this.page(),
      pageSize: this.pageSize(),
    }).subscribe({
      next: resp => {
        this.unidades.set(resp.items);
        this.totalCount.set(resp.totalCount);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Error', 'Error al cargar unidades institucionales.');
      }
    });
  }

  limpiarFiltros(): void {
    this.filtroForm.reset({ texto: '', departamento: '' });
  }

  cambiarPagina(nuevaPagina: number): void {
    if (nuevaPagina < 1 || nuevaPagina > this.totalPages()) return;
    this.page.set(nuevaPagina);
    this.cargarUnidades();
  }

  onAccion(ev: UiTableActionEvent<UnidadItem>): void {
    if (ev.actionId === 'editar') this.openEdit(ev.row);
    else if (ev.actionId === 'toggle') this.toggle(ev.row);
  }

  openCreate(): void {
    this.form.reset({
      consecutivo: null,
      fuerza: 6,
      descripcionDependencia: '',
      vigente: 'SI',
      siglaFisica: '',
      siglaPapa: '',
      departamento: this.filtroDepartamento() || '',
      codigoDepartamento: null,
      municipio: '',
      codigoDane: '',
      descRegional: '',
      codRegional: null,
      direccion: '',
      telefono: '',
      telefonoIp: '',
      email: '',
      zona: 'UR',
    });
    this.modalMode.set('create');
    this.editConsecutivo.set(0);
    this.intentoGuardar.set(false);
    this.showModal.set(true);
  }

  openEdit(u: UnidadItem): void {
    this.editConsecutivo.set(u.consecutivo);
    this.modalMode.set('edit');
    this.intentoGuardar.set(false);
    this.form.reset({
      consecutivo: u.consecutivo,
      fuerza: u.fuerza ?? 6,
      descripcionDependencia: u.descripcionDependencia,
      vigente: u.vigente || 'SI',
      siglaFisica: u.siglaFisica || '',
      siglaPapa: u.siglaPapa || '',
      departamento: u.departamento || '',
      codigoDepartamento: u.codigoDepartamento ?? null,
      municipio: u.municipio || '',
      codigoDane: u.codigoDane || '',
      descRegional: u.descRegional || '',
      codRegional: u.codRegional ?? null,
      direccion: u.direccion || '',
      telefono: u.telefono || '',
      telefonoIp: u.telefonoIp || '',
      email: u.email || '',
      zona: u.zona || 'UR',
    });
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
    this.intentoGuardar.set(false);
  }

  save(): void {
    this.intentoGuardar.set(true);
    if (this.errorDescripcion() || this.errorDepartamento() ||
        this.errorMunicipio() || this.errorCodigoDane()) return;

    this.saving.set(true);
    const v = this.form.getRawValue();
    const req: UnidadSaveRequest = {
      consecutivo:            this.modalMode() === 'edit' ? this.editConsecutivo() : (v.consecutivo || undefined),
      fuerza:                 v.fuerza || 6,
      descripcionDependencia: v.descripcionDependencia.trim(),
      vigente:                v.vigente,
      siglaFisica:            v.siglaFisica.trim() || undefined,
      siglaPapa:              v.siglaPapa.trim() || undefined,
      departamento:           v.departamento.trim(),
      codigoDepartamento:     v.codigoDepartamento ?? undefined,
      municipio:              v.municipio.trim(),
      codigoDane:             v.codigoDane.trim(),
      descRegional:           v.descRegional.trim() || undefined,
      codRegional:            v.codRegional ?? undefined,
      direccion:              v.direccion.trim() || undefined,
      telefono:               v.telefono.trim() || undefined,
      telefonoIp:             v.telefonoIp.trim() || undefined,
      email:                  v.email.trim() || undefined,
      zona:                   v.zona.trim() || 'UR',
    };

    const obs = this.modalMode() === 'create'
      ? this.service.createUnidad(req)
      : this.service.updateUnidad(this.editConsecutivo(), req);

    obs.subscribe({
      next: res => {
        this.saving.set(false);
        if (res.success) {
          this.toast.success('Unidad institucional', res.message);
          this.closeModal();
          this.cargarUnidades();
          this.cargarDepartamentos();
        } else {
          this.toast.error('Error', res.message);
        }
      },
      error: err => {
        this.saving.set(false);
        this.toast.error('Error', err?.error?.message || 'Error al guardar la unidad institucional.');
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Excel: exportar, plantilla e importar
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Las columnas del archivo, en orden. Es la MISMA lista para exportar, para
   * la plantilla y para leer al importar: si se toca aquí, las tres cosas se
   * mueven juntas y no hay forma de que un exportado deje de poder importarse.
   *
   * `consecutivo` va primero a propósito: es lo que permite exportar, corregir
   * en Excel y volver a importar sin duplicar nada.
   */
  private static readonly COLUMNAS: { header: string; campo: keyof UnidadItem; ancho: number }[] = [
    { header: 'Consecutivo',            campo: 'consecutivo',            ancho: 14 },
    { header: 'Dependencia',            campo: 'descripcionDependencia', ancho: 46 },
    { header: 'Sigla física',           campo: 'siglaFisica',            ancho: 18 },
    { header: 'Sigla papá',             campo: 'siglaPapa',              ancho: 18 },
    { header: 'Departamento',           campo: 'departamento',           ancho: 24 },
    { header: 'Código departamento',    campo: 'codigoDepartamento',     ancho: 20 },
    { header: 'Municipio',              campo: 'municipio',              ancho: 26 },
    { header: 'Código DANE',            campo: 'codigoDane',             ancho: 14 },
    { header: 'Regional',               campo: 'descRegional',           ancho: 24 },
    { header: 'Código regional',        campo: 'codRegional',            ancho: 16 },
    { header: 'Dirección',              campo: 'direccion',              ancho: 34 },
    { header: 'Teléfono',               campo: 'telefono',               ancho: 16 },
    { header: 'Teléfono IP',            campo: 'telefonoIp',             ancho: 16 },
    { header: 'Correo',                 campo: 'email',                  ancho: 28 },
    { header: 'Zona',                   campo: 'zona',                   ancho: 8  },
    { header: 'Vigente',                campo: 'vigente',                ancho: 10 },
    { header: 'Fuerza',                 campo: 'fuerza',                 ancho: 10 },
  ];

  private hoja(workbook: import('exceljs').Workbook): import('exceljs').Worksheet {
    const hoja = workbook.addWorksheet('Unidades');
    hoja.columns = UnidadesPageComponent.COLUMNAS.map(c => ({
      header: c.header, key: String(c.campo), width: c.ancho,
    }));
    hoja.getRow(1).font = { bold: true };
    hoja.views = [{ state: 'frozen', ySplit: 1 }];
    return hoja;
  }

  /**
   * Exporta TODO lo que cumple los filtros de la pantalla, no solo la página
   * a la vista: exportar 15 de 1.100 municipios no le sirve a nadie.
   */
  async exportar(): Promise<void> {
    if (this.exportando()) return;
    this.exportando.set(true);
    try {
      const filas = await this.traerTodasLasUnidades();
      if (filas.length === 0) {
        this.toast.warning('Exportar', 'No hay unidades que cumplan el filtro actual.');
        return;
      }

      const ExcelJS = await cargarExcelJS();
      const workbook = new ExcelJS.Workbook();
      const hoja = this.hoja(workbook);
      for (const u of filas) {
        const fila: Record<string, unknown> = {};
        for (const c of UnidadesPageComponent.COLUMNAS) fila[String(c.campo)] = u[c.campo] ?? '';
        hoja.addRow(fila);
      }

      const sufijo = new Date().toISOString().slice(0, 10);
      descargarLibroExcel(await workbook.xlsx.writeBuffer() as ArrayBuffer, `unidades_${sufijo}.xlsx`);
      this.toast.success('Exportar', `${filas.length} unidad(es) exportada(s).`);
    } catch {
      this.toast.error('Exportar', 'No se pudo generar el archivo.');
    } finally {
      this.exportando.set(false);
    }
  }

  /** Recorre la paginación del backend hasta juntar el listado completo. */
  private async traerTodasLasUnidades(): Promise<UnidadItem[]> {
    const TAMANO = 500;
    const todas: UnidadItem[] = [];
    let pagina = 1;
    let total = 0;

    do {
      const resp = await firstValueFrom(this.service.getUnidades({
        filtro: this.filtroTexto().trim() || undefined,
        departamento: this.filtroDepartamento().trim() || undefined,
        page: pagina,
        pageSize: TAMANO,
      }));
      total = resp.totalCount;
      todas.push(...resp.items);
      pagina++;
      // Cortafuegos: si el backend devolviera una página vacía, no se gira
      // indefinidamente esperando llegar a totalCount.
      if (resp.items.length === 0) break;
    } while (todas.length < total);

    return todas;
  }

  async descargarPlantilla(): Promise<void> {
    const ExcelJS = await cargarExcelJS();
    const workbook = new ExcelJS.Workbook();
    const hoja = this.hoja(workbook);
    hoja.addRow({
      consecutivo: '', descripcionDependencia: 'ESTACION DE POLICIA EJEMPLO',
      siglaFisica: 'EPEJE', siglaPapa: '', departamento: 'CUNDINAMARCA',
      codigoDepartamento: 25, municipio: 'SOACHA', codigoDane: '25754',
      descRegional: 'REGIONAL 1', codRegional: 1, direccion: 'Calle 1 # 2-3',
      telefono: '6011234567', telefonoIp: '', email: 'ejemplo@policia.gov.co',
      zona: 'UR', vigente: 'SI', fuerza: 6,
    });
    descargarLibroExcel(await workbook.xlsx.writeBuffer() as ArrayBuffer, 'plantilla_unidades.xlsx');
  }

  abrirImportar(): void {
    this.nombreArchivo.set('');
    this.resultadoImport.set(null);
    this.showImportar.set(true);
  }

  cerrarImportar(): void {
    this.showImportar.set(false);
  }

  limpiarArchivo(): void {
    this.nombreArchivo.set('');
    this.resultadoImport.set(null);
  }

  async onArchivo(file: File): Promise<void> {
    this.nombreArchivo.set(file.name);
    this.importando.set(true);
    this.resultadoImport.set(null);

    let items: UnidadImportItem[];
    try {
      items = await this.leerExcel(file);
    } catch {
      this.importando.set(false);
      this.toast.error('Importar', 'No se pudo leer el archivo. Compruebe que sea un Excel (.xlsx) válido.');
      return;
    }

    if (items.length === 0) {
      this.importando.set(false);
      this.toast.warning('Importar', 'El archivo no tiene filas para importar.');
      return;
    }

    this.service.importarUnidades(items).subscribe({
      next: resp => {
        this.importando.set(false);
        this.resultadoImport.set(resp);
        if (resp.success) {
          this.toast.success('Importar', resp.message);
        } else {
          this.toast.warning('Importar', resp.message);
        }
        this.cargarUnidades();
        this.cargarDepartamentos();
      },
      error: err => {
        this.importando.set(false);
        this.toast.error('Importar', err?.error?.message ?? 'Error al importar el archivo.');
      },
    });
  }

  /**
   * Lee la primera hoja con las columnas de COLUMNAS, en ese orden y con la
   * fila 1 de encabezado. Se salta las filas totalmente vacías, que es lo que
   * suele quedar al final de un archivo editado a mano.
   */
  private async leerExcel(file: File): Promise<UnidadImportItem[]> {
    const ExcelJS = await cargarExcelJS();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());

    const hoja = workbook.worksheets[0];
    const items: UnidadImportItem[] = [];
    if (!hoja) return items;

    const texto = (v: unknown): string => {
      if (v === null || v === undefined) return '';
      // Una celda con fórmula o con hipervínculo llega como objeto.
      if (typeof v === 'object') {
        const o = v as { result?: unknown; text?: unknown };
        return String(o.result ?? o.text ?? '').trim();
      }
      return String(v).trim();
    };
    const numero = (v: unknown): number | undefined => {
      const t = texto(v).replace(',', '.');
      if (!t) return undefined;
      const n = Number(t);
      return Number.isFinite(n) ? n : undefined;
    };

    hoja.eachRow((row, numeroFila) => {
      if (numeroFila === 1) return;

      const celda = (i: number) => row.getCell(i).value;
      const dependencia = texto(celda(2));
      const departamento = texto(celda(5));
      const municipio = texto(celda(7));
      const dane = texto(celda(8));

      if (!dependencia && !departamento && !municipio && !dane) return; // fila vacía

      items.push({
        fila: numeroFila,
        consecutivo:            numero(celda(1)),
        descripcionDependencia: dependencia,
        siglaFisica:            texto(celda(3)) || undefined,
        siglaPapa:              texto(celda(4)) || undefined,
        departamento,
        codigoDepartamento:     numero(celda(6)),
        municipio,
        codigoDane:             dane,
        descRegional:           texto(celda(9)) || undefined,
        codRegional:            numero(celda(10)),
        direccion:              texto(celda(11)) || undefined,
        telefono:               texto(celda(12)) || undefined,
        telefonoIp:             texto(celda(13)) || undefined,
        email:                  texto(celda(14)) || undefined,
        zona:                   texto(celda(15)) || 'UR',
        vigente:                (texto(celda(16)) || 'SI').toUpperCase(),
        fuerza:                 numero(celda(17)) ?? 6,
      });
    });

    return items;
  }

  toggle(u: UnidadItem): void {
    this.service.toggleUnidad(u.consecutivo).subscribe({
      next: res => {
        if (res.success) {
          this.toast.success('Vigencia', res.message);
          this.cargarUnidades();
        } else {
          this.toast.error('Error', res.message);
        }
      },
      error: () => this.toast.error('Error', 'Error al cambiar vigencia de la unidad.')
    });
  }
}

interface CeldaCtx {
  $implicit: UnidadItem;
  row: UnidadItem;
  column: UiTableColumn<UnidadItem>;
}
