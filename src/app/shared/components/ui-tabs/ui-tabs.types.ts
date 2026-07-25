export type UiTabsVariant = 'pills' | 'contained' | 'underline';
export type UiTabsSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface UiTabSelectionChange {
  readonly id: string;
  readonly label: string;
  readonly index: number;
}
