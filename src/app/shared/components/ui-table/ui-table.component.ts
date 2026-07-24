import {
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
  UiTableBadge,
  UiTableColumn,
  UiTableFilter,
  UiTableSortDirection,
  UiTableSortEvent,
} from '../../interfaces/ui-table.interface';
import { UiInputComponent } from '../ui-input/ui-input.component';
import { UiTableActionsComponent } from '../ui-table-actions/ui-table-actions.component';

@Component({
  selector: 'app-ui-table',
  standalone: true,
  imports: [ReactiveFormsModule, UiInputComponent, UiTableActionsComponent],
  templateUrl: './ui-table.component.html',
  styleUrl: './ui-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiTableComponent<T extends object = Record<string, unknown>> {
  readonly labelledBy = input<string | null>(null);
  readonly title = input('');
  readonly titleIcon = input('fa-solid fa-table-list');
  readonly emptyMessage = input('No hay registros para mostrar.');
  readonly columns = input<UiTableColumn<T>[]>([]);
  readonly rows = input<T[]>([]);
  readonly filters = input<UiTableFilter[]>([]);
  readonly actions = input<UiTableAction<T>[]>([]);
  readonly total = input(0);
  readonly page = input(1);
  readonly pageSize = input(10);
  readonly pageSizeOptions = input<number[]>([5, 10, 20, 50]);
  readonly actionMenuLabel = input('Acciones disponibles para el registro');
  readonly showRecordBadge = input(true);
  readonly showPagination = input(true);

  readonly filterChange = output<Record<string, string>>();
  readonly sortChange = output<UiTableSortEvent<T>>();
  readonly actionClick = output<UiTableActionEvent<T>>();
  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();

  readonly titleId = `ui-table-title-${Math.random().toString(36).slice(2)}`;

  readonly filterForm = new FormRecord<FormControl<string>>({});

  private readonly sortedColumn = signal<(keyof T & string) | null>(null);
  private readonly sortDirection = signal<UiTableSortDirection>('asc');

  readonly hasConfiguredTable = computed(() => this.columns().length > 0);
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
    return `align-${column.align ?? 'left'}${column.sortable ? ' is-sortable' : ''}`;
  }

  getCellClass(column: UiTableColumn<T>): string {
    return `align-${column.align ?? 'left'}`;
  }

  getSortIcon(column: UiTableColumn<T>): string {
    if (this.sortedColumn() !== column.key) {
      return 'fa-solid fa-sort';
    }

    return this.sortDirection() === 'asc' ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down';
  }

  getBadgeClass(badge: UiTableBadge): string {
    return `ui-badge ${badge.variant ?? 'neutral'}`;
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
    this.filterChange.emit(this.filterForm.getRawValue());
  }
}
