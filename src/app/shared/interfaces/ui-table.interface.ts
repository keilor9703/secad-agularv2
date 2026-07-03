export type UiTableAlign = 'left' | 'center' | 'right';
export type UiTableActionVariant = 'primary' | 'secondary' | 'info' | 'outline' | 'ghost' | 'warning' | 'danger';
export type UiTableBadgeVariant = 'success' | 'warning' | 'info' | 'neutral' | 'danger' | 'primary';
export type UiTableSortDirection = 'asc' | 'desc';

export interface UiTableBadge {
  text: string;
  variant?: UiTableBadgeVariant;
  icon?: string;
}

export interface UiTableColumn<T> {
  key: keyof T & string;
  label: string;
  align?: UiTableAlign;
  sortable?: boolean;
  width?: string;
  value?: (row: T) => string | number | null | undefined;
  badge?: (row: T) => UiTableBadge | null;
}

export interface UiTableFilter {
  key: string;
  label: string;
  placeholder?: string;
  type?: 'text' | 'search' | 'number' | 'email';
}

export interface UiTableAction<T> {
  id: string;
  label: string;
  icon: string;
  variant?: UiTableActionVariant;
  title?: string;
  visible?: (row: T) => boolean;
  disabled?: (row: T) => boolean;
}

export interface UiTableActionEvent<T> {
  actionId: string;
  row: T;
}

export interface UiTableSortEvent<T> {
  key: keyof T & string;
  direction: UiTableSortDirection;
}
