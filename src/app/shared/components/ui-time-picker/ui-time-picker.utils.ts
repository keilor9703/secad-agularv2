import { UiTimeFormat, UiTimeOption } from './ui-time-picker.types';

const MINUTES_PER_DAY = 24 * 60;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function normalizeTimeValue(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  const normalizedValue = value.trim();

  return TIME_PATTERN.test(normalizedValue) ? normalizedValue : '';
}

export function normalizeMinuteStep(value: number): number {
  if (!Number.isFinite(value)) {
    return 30;
  }

  return Math.min(60, Math.max(1, Math.trunc(value)));
}

export function timeToMinutes(value: string | null): number | null {
  const normalizedValue = normalizeTimeValue(value);

  if (!normalizedValue) {
    return null;
  }

  const [hours, minutes] = normalizedValue.split(':').map(Number);

  return hours * 60 + minutes;
}

export function minutesToTime(totalMinutes: number): string {
  const normalizedMinutes =
    ((Math.trunc(totalMinutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function formatTimeLabel(value: string, format: UiTimeFormat): string {
  const totalMinutes = timeToMinutes(value);

  if (totalMinutes === null) {
    return '';
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (format === '24') {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  const period = hours < 12 ? 'AM' : 'PM';
  const twelveHour = hours % 12 || 12;

  return `${twelveHour}:${String(minutes).padStart(2, '0')} ${period}`;
}

export function buildTimeOptions(
  format: UiTimeFormat,
  minuteStep: number,
  minTime: string | null,
  maxTime: string | null,
): readonly UiTimeOption[] {
  const normalizedStep = normalizeMinuteStep(minuteStep);
  const minMinutes = timeToMinutes(minTime);
  const maxMinutes = timeToMinutes(maxTime);
  const options: UiTimeOption[] = [];

  for (let minutes = 0; minutes < MINUTES_PER_DAY; minutes += normalizedStep) {
    if (!isWithinLimits(minutes, minMinutes, maxMinutes)) {
      continue;
    }

    const value = minutesToTime(minutes);

    options.push({
      value,
      label: formatTimeLabel(value, format),
      minutes,
    });
  }

  return options;
}

function isWithinLimits(
  minutes: number,
  minMinutes: number | null,
  maxMinutes: number | null,
): boolean {
  if (minMinutes === null && maxMinutes === null) {
    return true;
  }

  if (minMinutes !== null && maxMinutes === null) {
    return minutes >= minMinutes;
  }

  if (minMinutes === null && maxMinutes !== null) {
    return minutes <= maxMinutes;
  }

  if (minMinutes === null || maxMinutes === null) {
    return true;
  }

  if (minMinutes <= maxMinutes) {
    return minutes >= minMinutes && minutes <= maxMinutes;
  }

  return minutes >= minMinutes || minutes <= maxMinutes;
}
