export type UiDateTimeMode = 'date' | 'time' | 'datetime';
export type UiDateTimeHourFormat = '12' | '24';

export interface UiDateTimeModeConfig {
  readonly displayFormat: string;
  readonly modelFormat: string;
  readonly placeholder: string;
  readonly icon: string;
  readonly enableTime: boolean;
  readonly noCalendar: boolean;
}
