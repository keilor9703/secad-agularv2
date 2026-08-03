import type { TemplateRef } from '@angular/core';
import type { UiStatusAppearance, UiStatusSize, UiStatusVariant } from './ui-status.interface';

export type UiTableAlign = 'left' | 'center' | 'right';
export type UiTableTextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize';
export type UiTableCssSize = string | number;
export type UiTableFontWeight =
  | 'light'
  | 'normal'
  | 'regular'
  | 'medium'
  | 'semibold'
  | 'bold'
  | 100
  | 200
  | 300
  | 400
  | 500
  | 600
  | 700
  | 800
  | 900;
export type UiTableActionVariant =
  | 'primary'
  | 'secondary'
  | 'info'
  | 'outline'
  | 'ghost'
  | 'warning'
  | 'danger';
export type UiTableBadgeVariant = UiStatusVariant;
export type UiTableSortDirection = 'asc' | 'desc';
export type UiTableDataMode = 'client' | 'external';
export type UiTableVariant = 'institutional' | 'plain';
export type UiTableActionDisplay = 'menu' | 'row-hover';
/**
 * Posición visual de la columna de acciones.
 * `start` y `end` se conservan para no romper implementaciones anteriores.
 */
export type UiTableActionsPosition = 'left' | 'right' | 'start' | 'end';

export interface UiTableBadge {
  text: string;
  variant?: UiTableBadgeVariant;
  icon?: string;
  appearance?: UiStatusAppearance;
  size?: UiStatusSize;
  uppercase?: boolean;
}

/**
 * Apariencia opcional de una fila concreta.
 * La columna tiene prioridad sobre la fila y la fila sobre la configuración general.
 */
export interface UiTableRowAppearance {
  /** Marca semánticamente la fila como seleccionada. */
  selected?: boolean;
  /** Color de la fila en tema claro. */
  textColor?: string;
  /** Color opcional de la fila en tema oscuro. */
  darkTextColor?: string;
  /** Fondo opcional para diferenciar una fila en tema claro. */
  backgroundColor?: string;
  /** Fondo equivalente en tema oscuro. */
  darkBackgroundColor?: string;
  /** Acento lateral usado principalmente por filas seleccionadas. */
  accentColor?: string;
  fontSize?: UiTableCssSize;
  fontWeight?: UiTableFontWeight;
  height?: UiTableCssSize;
  /** Espacio vertical interior de las celdas pertenecientes a esta fila. */
  paddingBlock?: UiTableCssSize;
}

export type UiTableRowAppearanceResolver<T> = (
  row: T,
  index: number,
) => UiTableRowAppearance | null | undefined;

export interface UiTableColumn<T> {
  key: keyof T & string;
  label: string;
  /**
   * Sobrescribe la alineación global para el encabezado y las celdas
   * pertenecientes a esta columna.
   */
  align?: UiTableAlign;
  /** Color CSS aplicado únicamente al contenido interior de esta columna. */
  textColor?: string;
  /** Color CSS opcional aplicado a esta columna en tema oscuro. */
  darkTextColor?: string;
  /** Tamaño de fuente de las celdas de esta columna. Un número se interpreta en px. */
  fontSize?: UiTableCssSize;
  /** Peso de fuente de las celdas de esta columna. */
  fontWeight?: UiTableFontWeight;
  /** Transformación visual aplicada únicamente al texto de esta columna. */
  textTransform?: UiTableTextTransform;
  sortable?: boolean;
  width?: string;
  value?: (row: T) => string | number | null | undefined;
  badge?: (row: T) => UiTableBadge | null;
  cellTemplate?: TemplateRef<{
    $implicit: T;
    row: T;
    column: UiTableColumn<T>;
  }>;
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
  description?: string;
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
