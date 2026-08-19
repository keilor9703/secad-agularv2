import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

type DateLimit = string | Date | (() => string | Date);

/**
 * Valida fechas de calendario sin convertirlas a UTC.
 * El proveedor permite recalcular límites dinámicos, por ejemplo el día actual.
 */
export function minDateValidator(limit: DateLimit): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) {
      return null;
    }

    const minimumValue = typeof limit === 'function' ? limit() : limit;
    const selectedDate = toLocalCalendarDate(control.value);
    const minimumDate = toLocalCalendarDate(minimumValue);

    if (!selectedDate || !minimumDate) {
      return { invalidDate: true };
    }

    return selectedDate.getTime() < minimumDate.getTime()
      ? {
          minDate: {
            minimum: toStableDate(minimumDate),
            actual: toStableDate(selectedDate),
          },
        }
      : null;
  };
}

function toLocalCalendarDate(value: unknown): Date | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }

    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  if (typeof value !== 'string') {
    return null;
  }

  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  const isValid =
    date.getFullYear() === Number(year) &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day);

  return isValid ? date : null;
}

function toStableDate(value: Date): string {
  const pad = (part: number): string => String(part).padStart(2, '0');

  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}
