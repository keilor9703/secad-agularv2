import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import { ReactiveFormsModule, UntypedFormControl, UntypedFormGroup } from '@angular/forms';
import { Subscription } from 'rxjs';

import { UiInputComponent } from '../ui-input/ui-input.component';
import {
  UiTableAction,
  UiTableActionEvent,
  UiTableBadge,
  UiTableColumn,
  UiTableFilter,
  UiTableSortDirection,
  UiTableSortEvent,
} from '../../interfaces/ui-table.interface';

@Component({
  selector: 'app-ui-table',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, UiInputComponent],
  templateUrl: './ui-table.component.html',
  styleUrls: ['./ui-table.component.scss'],
})
export class UiTableComponent<T = any> implements OnChanges, OnDestroy {
  @Input() labelledBy: string | null = null;
  @Input() title = '';
  @Input() titleIcon = 'fa-solid fa-table-list';
  @Input() emptyMessage = 'No hay registros para mostrar.';
  @Input() columns: UiTableColumn<T>[] = [];
  @Input() rows: T[] = [];
  @Input() filters: UiTableFilter[] = [];
  @Input() actions: UiTableAction<T>[] = [];
  @Input() total = 0;
  @Input() page = 1;
  @Input() pageSize = 10;
  @Input() showRecordBadge = true;
  @Input() showPagination = true;

  @Output() filterChange = new EventEmitter<Record<string, string>>();
  @Output() sortChange = new EventEmitter<UiTableSortEvent<T>>();
  @Output() actionClick = new EventEmitter<UiTableActionEvent<T>>();
  @Output() pageChange = new EventEmitter<number>();

  readonly titleId = `ui-table-title-${Math.random().toString(36).slice(2)}`;
  readonly filterForm = new UntypedFormGroup({});
  private readonly filterChangesSubscription: Subscription = this.filterForm.valueChanges.subscribe(() =>
    this.emitFilterChange(),
  );

  sortedColumn: string | null = null;
  sortDirection: UiTableSortDirection = 'asc';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['filters']) {
      this.syncFilterControls();
    }
  }

  ngOnDestroy(): void {
    this.filterChangesSubscription.unsubscribe();
  }

  /** Mantiene los controles reactivos alineados con la configuración de filtros recibida. */
  private syncFilterControls(): void {
    const nextKeys = new Set(this.filters.map((filter) => filter.key));

    Object.keys(this.filterForm.controls).forEach((key) => {
      if (!nextKeys.has(key)) {
        this.filterForm.removeControl(key);
      }
    });

    this.filters.forEach((filter) => {
      if (!this.filterForm.contains(filter.key)) {
        this.filterForm.addControl(filter.key, new UntypedFormControl(''));
      }
    });
  }

  /** Emite los filtros para que la página o componente contenedor decida cómo consultar o filtrar datos. */
  emitFilterChange(): void {
    this.filterChange.emit(this.filterForm.getRawValue() as Record<string, string>);
  }

  /** Emite la columna ordenada; el consumidor mantiene el control sobre el ordenamiento de sus datos. */
  toggleSort(column: UiTableColumn<T>): void {
    if (!column.sortable) {
      return;
    }

    const isSameColumn = this.sortedColumn === column.key;
    this.sortDirection = isSameColumn && this.sortDirection === 'asc' ? 'desc' : 'asc';
    this.sortedColumn = column.key;
    this.sortChange.emit({ key: column.key, direction: this.sortDirection });
  }

  emitAction(action: UiTableAction<T>, row: T): void {
    this.actionClick.emit({ actionId: action.id, row });
  }

  get hasConfiguredTable(): boolean {
    return this.columns.length > 0;
  }

  get totalRecords(): number {
    return this.total || this.rows.length;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalRecords / Math.max(this.pageSize, 1)));
  }

  get startItem(): number {
    if (this.totalRecords === 0) {
      return 0;
    }

    return (this.page - 1) * this.pageSize + 1;
  }

  get endItem(): number {
    return Math.min(this.page * this.pageSize, this.totalRecords);
  }

  get visiblePages(): number[] {
    return Array.from({ length: this.totalPages }, (_, index) => index + 1).slice(0, 5);
  }

  goToPage(nextPage: number): void {
    const targetPage = Math.min(Math.max(nextPage, 1), this.totalPages);

    if (targetPage !== this.page) {
      this.pageChange.emit(targetPage);
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
    if (this.sortedColumn !== column.key) {
      return 'fa-solid fa-sort';
    }

    return this.sortDirection === 'asc' ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down';
  }

  getBadgeClass(badge: UiTableBadge): string {
    return `ui-badge ${badge.variant ?? 'neutral'}`;
  }

  getActionClass(action: UiTableAction<T>): string {
    return `ui-btn sm ${action.variant ?? 'secondary'}`;
  }

  isActionVisible(action: UiTableAction<T>, row: T): boolean {
    return action.visible ? action.visible(row) : true;
  }

  isActionDisabled(action: UiTableAction<T>, row: T): boolean {
    return action.disabled ? action.disabled(row) : false;
  }

  filterControlId(filter: UiTableFilter): string {
    return `${this.titleId}-${filter.key}`;
  }

  trackByIndex(index: number): number {
    return index;
  }
}
