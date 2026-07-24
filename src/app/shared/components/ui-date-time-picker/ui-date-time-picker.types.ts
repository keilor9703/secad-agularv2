export type UiDateTimeMode = 'date' | 'time' | 'datetime';

export interface UiDateTimeModeConfig {
  readonly displayFormat: string;
  readonly modelFormat: string;
  readonly placeholder: string;
  readonly icon: string;
  readonly enableTime: boolean;
  readonly noCalendar: boolean;
}
