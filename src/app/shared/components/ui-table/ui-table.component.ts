import { NgTemplateOutlet } from '@angular/common';
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormRecord, ReactiveFormsModule } from '@angular/forms';

import {
  UiTableAction,
  UiTableActionEvent,
  UiTableAlign,
  UiTableBadge,
  UiTableColumn,
  UiTableCssSize,
  UiTableDataMode,
  UiTableFilter,
  UiTableFontWeight,
  UiTableRowAppearance,
  UiTableRowAppearanceResolver,
  UiTableSortDirection,
  UiTableSortEvent,
  UiTableTextTransform,
} from '../../interfaces/ui-table.interface';
import { UiInputComponent } from '../ui-input/ui-input.component';
import {
  UiSpinnerComponent,
  UiSpinnerSize,
  UiSpinnerVariant,
} from '../ui-spinner/ui-spinner.component';
import { UiTableActionsComponent } from '../ui-table-actions/ui-table-actions.component';

@Component({
  selector: 'app-ui-table',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    UiInputComponent,
    UiSpinnerComponent,
    UiTableActionsComponent,
  ],
  templateUrl: './ui-table.component.html',
  styleUrl: './ui-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiTableComponent<T extends object = Record<string, unknown>> {
  readonly labelledBy = input<string | null>(null);
  readonly title = input('');
  readonly titleIcon = input('fa-solid fa-table-list');
  readonly emptyMessage = input('No hay registros para mostrar.');
  readonly loading = input(false, { transform: booleanAttribute });
  readonly loadingMessage = input('Cargando registros...');
  readonly loadingSpinnerSize = input<UiSpinnerSize>('lg');
  readonly loadingSpinnerVariant = input<UiSpinnerVariant>('primary');
  readonly columns = input<UiTableColumn<T>[]>([]);
  readonly rows = input<T[]>([]);
  readonly filters = input<UiTableFilter[]>([]);
  /**
   * client: ui-table filtra y ordena las filas recibidas.
   * external: solo emite filterChange/sortChange para que el consumidor
   * consulte o procese los datos, por ejemplo mediante una API.
   */
  readonly dataMode = input<UiTableDataMode>('client');
  readonly actions = input<UiTableAction<T>[]>([]);
  readonly total = input(0);
  readonly page = input(1);
  readonly pageSize = input(10);
  readonly pageSizeOptions = input<number[]>([5, 10, 20, 50]);
  readonly actionMenuLabel = input('Acciones disponibles para el registro');
  readonly showRecordBadge = input(true);
  readonly showPagination = input(true);
  readonly stickyHeader = input(true);
  readonly stickyActions = input(true);
  /**
   * Alineación predeterminada de encabezados y celdas. Cada columna puede
   * sobrescribirla mediante UiTableColumn.align.
   */
  readonly contentAlign = input<UiTableAlign>('left');
  /**
   * Color CSS predeterminado del contenido de las celdas. Un valor vacío
   * conserva el color del tema claro u oscuro.
   */
  readonly bodyTextColor = input('');
  /**
   * Tamaño y peso predeterminados del contenido. Los números de tamaño
   * se interpretan en píxeles y continúan respetando la escala de accesibilidad.
   */
  readonly bodyFontSize = input<UiTableCssSize>(13);
  readonly bodyFontWeight = input<UiTableFontWeight>(600);
  /**
   * Transformación visual predeterminada del contenido. No modifica los datos
   * originales y cada columna puede sobrescribirla con textTransform.
   */
  readonly bodyTextTransform = input<UiTableTextTransform>('none');
  /**
   * Alto mínimo y espacio vertical general de las filas.
   * rowPadding permite compactar realmente la tabla cuando rowHeight es pequeño.
   */
  readonly rowHeight = input<UiTableCssSize | null>(null);
  readonly rowPadding = input<UiTableCssSize>(14);
  /**
   * Personalización opcional por registro. Se evalúa una sola vez por fila
   * durante cada actualización de la vista.
   */
  readonly rowAppearance = input<UiTableRowAppearanceResolver<T> | null>(null);
  /**
   * Color base del encabezado. El componente genera el degradado, los bordes
   * y el estado sticky a partir de este valor.
   */
  readonly headerColor = input('#005478');
  /**
   * Color final opcional del degradado. Si queda vacío, se reutiliza
   * headerColor para conservar exactamente el comportamiento anterior.
   */
  readonly headerColorEnd = input('');
  /**
   * Permite conservar contraste cuando el consumidor usa un color base claro.
   */
  readonly headerTextColor = input('#ffffff');
  /**
   * Elimina únicamente la tarjeta exterior de la tabla cuando esta ya vive
   * dentro de un panel o sección. La grilla, el scroll y la paginación se conservan.
   */
  readonly embedded = input(false, { transform: booleanAttribute });

  readonly bodyFontSizeCss = computed(() => this.resolveCssSize(this.bodyFontSize()) ?? '13px');
  readonly bodyFontWeightCss = computed(
    () => this.resolveFontWeight(this.bodyFontWeight()) ?? '600',
  );
  readonly rowHeightCss = computed(() => this.resolveCssSize(this.rowHeight()));
  readonly rowPaddingCss = computed(() => this.resolveCssSize(this.rowPadding()) ?? '14px');

  readonly filterChange = output<Record<string, string>>();
  readonly sortChange = output<UiTableSortEvent<T>>();
  readonly actionClick = output<UiTableActionEvent<T>>();
  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();

  readonly titleId = `ui-table-title-${Math.random().toString(36).slice(2)}`;

  readonly filterForm = new FormRecord<FormControl<string>>({});

  private readonly activeFilters = signal<Record<string, string>>({});
  private readonly sortedColumn = signal<(keyof T & string) | null>(null);
  private readonly sortDirection = signal<UiTableSortDirection>('asc');
  private readonly valueCollator = new Intl.Collator('es', {
    numeric: true,
    sensitivity: 'base',
  });

  readonly hasConfiguredTable = computed(() => this.columns().length > 0);
  readonly displayedRows = computed(() => {
    const sourceRows = this.rows();

    if (this.dataMode() === 'external') {
      return sourceRows;
    }

    const filters = this.filters();
    const filterValues = this.activeFilters();
    const filteredRows = sourceRows.filter((row) =>
      filters.every((filter) => {
        const searchTerm = this.normalizeValue(filterValues[filter.key]);

        return (
          !searchTerm || this.normalizeValue(this.getRowValue(row, filter.key)).includes(searchTerm)
        );
      }),
    );
    const sortKey = this.sortedColumn();

    if (!sortKey) {
      return filteredRows;
    }

    const column = this.columns().find((item) => item.key === sortKey);
    const direction = this.sortDirection();

    return [...filteredRows].sort((left, right) =>
      this.compareValues(
        this.getRowValue(left, sortKey, column),
        this.getRowValue(right, sortKey, column),
        direction,
      ),
    );
  });
  readonly visibleColumnCount = computed(
    () => this.columns().length + (this.actions().length > 0 ? 1 : 0),
  );
  readonly normalizedPageSize = computed(() => Math.max(Number(this.pageSize()) || 1, 1));
  readonly totalRecords = computed(() => this.total() || this.rows().length);

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalRecords() / this.normalizedPageSize())),
  );

  readonly startItem = computed(() =>
    this.totalRecords() === 0 ? 0 : (this.page() - 1) * this.normalizedPageSize() + 1,
  );

  readonly endItem = computed(() =>
    Math.min(this.page() * this.normalizedPageSize(), this.totalRecords()),
  );

  readonly isFirstPage = computed(() => this.page() <= 1);
  readonly isLastPage = computed(() => this.page() >= this.totalPages());

  readonly pageSizeOptionsList = computed(() =>
    [...new Set([...this.pageSizeOptions(), this.normalizedPageSize()])]
      .filter((size) => Number.isFinite(size) && size > 0)
      .sort((left, right) => left - right),
  );

  private readonly syncFilters = effect(() => {
    this.syncFilterControls(this.filters());
  });

  constructor() {
    this.filterForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.emitFilterChange();
    });
  }

  toggleSort(column: UiTableColumn<T>): void {
    if (!column.sortable) {
      return;
    }

    const isSameColumn = this.sortedColumn() === column.key;
    const nextDirection = isSameColumn && this.sortDirection() === 'asc' ? 'desc' : 'asc';

    this.sortedColumn.set(column.key);
    this.sortDirection.set(nextDirection);
    this.sortChange.emit({ key: column.key, direction: nextDirection });
  }

  emitAction(event: UiTableActionEvent<T>): void {
    this.actionClick.emit(event);
  }

  goToPage(nextPage: number): void {
    const targetPage = Math.min(Math.max(nextPage, 1), this.totalPages());

    if (targetPage !== this.page()) {
      this.pageChange.emit(targetPage);
    }
  }

  changePageSize(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);

    if (Number.isFinite(value) && value > 0 && value !== this.normalizedPageSize()) {
      this.pageSizeChange.emit(value);
    }
  }

  getCellValue(row: T, column: UiTableColumn<T>): string | number {
    const value = column.value ? column.value(row) : (row as Record<string, unknown>)[column.key];

    return value === null || value === undefined || value === '' ? 'N/A' : String(value);
  }

  getBadge(row: T, column: UiTableColumn<T>): UiTableBadge | null {
    return column.badge ? column.badge(row) : null;
  }

  getHeaderClass(column: UiTableColumn<T>): string {
    return `align-${column.align ?? this.contentAlign()}${column.sortable ? ' is-sortable' : ''}`;
  }

  getCellClass(column: UiTableColumn<T>): string {
    return `align-${column.align ?? this.contentAlign()}`;
  }

  getRowAppearance(row: T, index: number): UiTableRowAppearance | null {
    return this.rowAppearance()?.(row, index) ?? null;
  }

  resolveCssSize(value: UiTableCssSize | null | undefined): string | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? `${Math.max(value, 0)}px` : null;
    }

    const normalizedValue = value?.trim();

    return normalizedValue || null;
  }

  resolveFontWeight(value: UiTableFontWeight | null | undefined): string | null {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return null;
      }

      const normalizedWeight = Math.round(Math.min(Math.max(value, 100), 900) / 100) * 100;

      return String(normalizedWeight);
    }

    const presets: Record<Exclude<UiTableFontWeight, number>, number> = {
      light: 300,
      normal: 400,
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    };

    return value ? String(presets[value]) : null;
  }

  getSortIcon(column: UiTableColumn<T>): string {
    if (this.sortedColumn() !== column.key) {
      return 'fa-solid fa-sort';
    }

    return this.sortDirection() === 'asc' ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down';
  }

  getAriaSort(column: UiTableColumn<T>): 'none' | 'ascending' | 'descending' | null {
    if (!column.sortable) {
      return null;
    }

    if (this.sortedColumn() !== column.key) {
      return 'none';
    }

    return this.sortDirection() === 'asc' ? 'ascending' : 'descending';
  }

  getSortLabel(column: UiTableColumn<T>): string {
    const nextDirection =
      this.sortedColumn() === column.key && this.sortDirection() === 'asc'
        ? 'descendente'
        : 'ascendente';

    return `Ordenar ${column.label} de forma ${nextDirection}`;
  }

  getBadgeClass(badge: UiTableBadge): string {
    return `ui-badge ${badge.variant ?? 'neutral'}`;
  }

  getCellContext(row: T, column: UiTableColumn<T>) {
    return {
      $implicit: row,
      row,
      column,
    };
  }

  filterControlId(filter: UiTableFilter): string {
    return `${this.titleId}-${filter.key}`;
  }

  trackColumn(_: number, column: UiTableColumn<T>): string {
    return column.key;
  }

  trackFilter(_: number, filter: UiTableFilter): string {
    return filter.key;
  }

  trackRow(index: number, row: T): unknown {
    return (row as { id?: unknown }).id ?? index;
  }

  private syncFilterControls(filters: UiTableFilter[]): void {
    const nextKeys = new Set(filters.map((filter) => filter.key));

    Object.keys(this.filterForm.controls).forEach((key) => {
      if (!nextKeys.has(key)) {
        this.filterForm.removeControl(key, { emitEvent: false });
      }
    });

    filters.forEach((filter) => {
      if (!this.filterForm.contains(filter.key)) {
        this.filterForm.addControl(filter.key, new FormControl('', { nonNullable: true }), {
          emitEvent: false,
        });
      }
    });
  }

  private emitFilterChange(): void {
    const values = this.filterForm.getRawValue();

    this.activeFilters.set(values);
    this.filterChange.emit(values);
  }

  private getRowValue(
    row: T,
    key: string,
    configuredColumn = this.columns().find((column) => column.key === key),
  ): unknown {
    return configuredColumn?.value
      ? configuredColumn.value(row)
      : (row as Record<string, unknown>)[key];
  }

  private normalizeValue(value: unknown): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLocaleLowerCase('es-CO');
  }

  private compareValues(left: unknown, right: unknown, direction: UiTableSortDirection): number {
    const leftIsEmpty = left === null || left === undefined || left === '';
    const rightIsEmpty = right === null || right === undefined || right === '';

    if (leftIsEmpty || rightIsEmpty) {
      return leftIsEmpty === rightIsEmpty ? 0 : leftIsEmpty ? 1 : -1;
    }

    const result =
      typeof left === 'number' && typeof right === 'number'
        ? left - right
        : this.valueCollator.compare(String(left), String(right));

    return direction === 'asc' ? result : -result;
  }
}
