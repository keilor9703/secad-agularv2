import { UiDateTimeMode, UiDateTimeModeConfig } from './ui-date-time-picker.types';

const DATE_CONFIG: UiDateTimeModeConfig = {
  displayFormat: 'd/m/Y',
  modelFormat: 'Y-m-d',
  placeholder: 'dd/mm/aaaa',
  icon: 'fa-solid fa-calendar-days',
  enableTime: false,
  noCalendar: false,
};

const TIME_CONFIG: UiDateTimeModeConfig = {
  displayFormat: 'H:i',
  modelFormat: 'H:i',
  placeholder: 'hh:mm',
  icon: 'fa-solid fa-clock',
  enableTime: true,
  noCalendar: true,
};

const DATE_TIME_CONFIG: UiDateTimeModeConfig = {
  displayFormat: 'd/m/Y H:i',
  modelFormat: 'Y-m-d\\TH:i',
  placeholder: 'dd/mm/aaaa hh:mm',
  icon: 'fa-solid fa-calendar-check',
  enableTime: true,
  noCalendar: false,
};

export const UI_DATE_TIME_MODE_CONFIG: Readonly<Record<UiDateTimeMode, UiDateTimeModeConfig>> = {
  date: DATE_CONFIG,
  time: TIME_CONFIG,
  datetime: DATE_TIME_CONFIG,
};
