export type UiSegmentedTabsSize = 'sm' | 'md';
export type UiSegmentedTabTone = 'info' | 'neutral' | 'success' | 'warning' | 'danger';

export interface UiSegmentedTabItem {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly icon?: string;
  readonly badge?: string | number | null;
  readonly tone?: UiSegmentedTabTone;
  readonly disabled?: boolean;
}

export interface UiSegmentedTabSelectionChange {
  readonly id: string;
  readonly index: number;
  readonly item: UiSegmentedTabItem;
}
