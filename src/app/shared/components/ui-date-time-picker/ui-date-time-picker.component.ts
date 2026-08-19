import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  booleanAttribute,
  computed,
  effect,
  forwardRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import flatpickr from 'flatpickr';
import type { Instance } from 'flatpickr/dist/types/instance';
import type { Options } from 'flatpickr/dist/types/options';
import { UiFormControlSizeDirective } from '../../directives/ui-form-control-size.directive';
import { UiFormLabelMode } from '../../interfaces/ui-form-label-mode.interface';
import { UI_DATE_TIME_MODE_CONFIG } from './ui-date-time-picker.config';
import { UI_DATE_TIME_SPANISH_LOCALE } from './ui-date-time-picker.locale';
import type { UiDateTimeHourFormat, UiDateTimeMode } from './ui-date-time-picker.types';

let nextControlId = 0;

@Component({
  selector: 'app-ui-date-time-picker',
  standalone: true,
  hostDirectives: [
    {
      directive: UiFormControlSizeDirective,
      inputs: ['controlSize'],
    },
  ],
  templateUrl: './ui-date-time-picker.component.html',
  styleUrl: './ui-date-time-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => UiDateTimePickerComponent),
      multi: true,
    },
  ],
})
export class UiDateTimePickerComponent implements AfterViewInit, OnDestroy, ControlValueAccessor {
  readonly label = input.required<string>();
  readonly mode = input<UiDateTimeMode>('date');
  /** Cambia únicamente la presentación horaria; el modelo conserva su formato estable. */
  readonly hourFormat = input<UiDateTimeHourFormat>('24');
  readonly controlId = input('');
  readonly placeholder = input('');
  readonly hint = input('');
  readonly error = input('');
  readonly icon = input('');
  readonly minDate = input<string | Date | null>(null);
  readonly maxDate = input<string | Date | null>(null);
  readonly minTime = input<string | null>(null);
  readonly maxTime = input<string | null>(null);
  readonly minuteStep = input(5);
  readonly required = input(false, { transform: booleanAttribute });
  /**
   * Oculta o muestra el asterisco sin modificar la validación requerida.
   */
  readonly showRequiredMarker = input(true, { transform: booleanAttribute });
  /** Presenta la etiqueta dentro del control hasta que se enfoca o recibe un valor. */
  readonly labelMode = input<UiFormLabelMode>('fixed');
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly allowManualInput = input(false, { transform: booleanAttribute });

  private readonly pickerInput = viewChild.required<ElementRef<HTMLInputElement>>('pickerInput');
  private readonly generatedControlId = `ui-date-time-${++nextControlId}`;
  private picker: Instance | null = null;
  private pendingValue = '';
  private readonly disabledByForm = signal(false);
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  readonly value = signal('');
  readonly opened = signal(false);
  readonly focused = signal(false);
  readonly useNativeFallback = signal(false);
  readonly modeConfig = computed(() => UI_DATE_TIME_MODE_CONFIG[this.mode()]);
  readonly resolvedControlId = computed(() => this.controlId().trim() || this.generatedControlId);
  readonly resolvedPlaceholder = computed(() => {
    const customPlaceholder = this.placeholder().trim();

    if (customPlaceholder) {
      return customPlaceholder;
    }

    if (this.hourFormat() === '12' && this.mode() === 'time') {
      return 'hh:mm AM/PM';
    }

    if (this.hourFormat() === '12' && this.mode() === 'datetime') {
      return 'dd/mm/aaaa hh:mm AM/PM';
    }

    return this.modeConfig().placeholder;
  });
  readonly resolvedDisplayFormat = computed(() => {
    if (this.hourFormat() === '24' || this.mode() === 'date') {
      return this.modeConfig().displayFormat;
    }

    return this.mode() === 'time' ? 'h:i K' : 'd/m/Y h:i K';
  });
  readonly resolvedIcon = computed(() => this.icon().trim() || this.modeConfig().icon);
  readonly isDisabled = computed(() => this.disabled() || this.disabledByForm());
  readonly hasError = computed(() => Boolean(this.error().trim()));
  readonly hasValue = computed(() => Boolean(this.value().trim()));
  readonly nativeInputType = computed<'date' | 'time' | 'datetime-local'>(() => {
    if (this.mode() === 'time') {
      return 'time';
    }

    return this.mode() === 'datetime' ? 'datetime-local' : 'date';
  });
  readonly nativeMin = computed(() =>
    this.mode() === 'time'
      ? this.minTime()
      : this.toNativeDateLimit(this.minDate(), this.mode() === 'datetime'),
  );
  readonly nativeMax = computed(() =>
    this.mode() === 'time'
      ? this.maxTime()
      : this.toNativeDateLimit(this.maxDate(), this.mode() === 'datetime'),
  );
  readonly nativeStep = computed(() =>
    this.mode() === 'date' ? null : String(this.normalizeMinuteStep(this.minuteStep()) * 60),
  );

  constructor() {
    effect(() => this.applyDisabledState(this.isDisabled()));
    effect(() => {
      this.applyTimePresentation(this.hourFormat(), this.resolvedDisplayFormat());
    });
    effect(() => {
      this.applyDateLimits(this.minDate(), this.maxDate());
    });
  }

  readonly describedBy = computed(() => {
    const ids: string[] = [];

    if (this.hint().trim()) {
      ids.push(`${this.resolvedControlId()}-hint`);
    }

    if (this.hasError()) {
      ids.push(`${this.resolvedControlId()}-error`);
    }

    return ids.length > 0 ? ids.join(' ') : null;
  });

  /**
   * Inicializa Flatpickr una vez que el input ya existe en el DOM.
   */
  ngAfterViewInit(): void {
    const config = this.modeConfig();
    const inputElement = this.pickerInput().nativeElement;

    try {
      /*
       * Flatpickr recibe el input real, no una colección. Con un HTMLElement
       * individual la librería retorna una única Instance y evita que Angular
       * termine operando accidentalmente sobre un arreglo.
       */
      const pickerResult = flatpickr(inputElement, {
        locale: UI_DATE_TIME_SPANISH_LOCALE,
        dateFormat: this.resolvedDisplayFormat(),
        enableTime: config.enableTime,
        noCalendar: config.noCalendar,
        time_24hr: this.hourFormat() === '24',
        minuteIncrement: this.normalizeMinuteStep(this.minuteStep()),
        allowInput: this.allowManualInput(),
        clickOpens: true,
        /*
         * Impide que Flatpickr sustituya su calendario por el control nativo
         * basándose en el user agent del navegador.
         */
        disableMobile: true,
        /*
         * El modelo usa YYYY-MM-DD, pero Flatpickr interpreta los límites de
         * texto con el formato visible d/m/Y. Normalizarlos a Date evita que
         * minDate o maxDate se ignoren por esa diferencia de formatos.
         */
        minDate: this.toFlatpickrDateLimit(this.minDate()),
        maxDate: this.toFlatpickrDateLimit(this.maxDate()),
        minTime: this.minTime() ?? undefined,
        maxTime: this.maxTime() ?? undefined,
        monthSelectorType: 'static',
        position: 'auto',
        appendTo: document.body,
        positionElement: inputElement,
        onOpen: () => this.opened.set(true),
        onValueUpdate: (selectedDates, _dateText, instance) =>
          this.handleSelection(selectedDates, instance),
        onChange: (selectedDates, _dateText, instance) =>
          this.handleSelection(selectedDates, instance),
        onClose: (selectedDates, _dateText, instance) => {
          this.handleSelection(selectedDates, instance);
          this.opened.set(false);
          this.onTouched();
        },
      } satisfies Partial<Options>) as Instance | Instance[];

      this.picker = this.resolvePickerInstance(pickerResult);

      if (!this.picker) {
        this.activateNativeFallback(inputElement, false);
      } else {
        this.useNativeFallback.set(false);
        this.applyDateLimits(this.minDate(), this.maxDate());
        this.applyTimePresentation(this.hourFormat(), this.resolvedDisplayFormat());
      }
    } catch (error: unknown) {
      console.error('[UiDateTimePicker] Flatpickr no pudo inicializarse.', error);
      this.activateNativeFallback(inputElement, false);
    }

    this.syncValueToPicker(this.pendingValue);
    this.applyDisabledState(this.isDisabled());
  }

  /**
   * Libera la instancia y sus listeners al destruir el componente.
   */
  ngOnDestroy(): void {
    this.picker?.destroy();
    this.picker = null;
  }

  /**
   * Abre el selector al presionar cualquier zona del control.
   */
  openPicker(): void {
    if (this.isDisabled()) {
      return;
    }

    const inputElement = this.pickerInput().nativeElement;

    inputElement.focus({ preventScroll: true });

    if (this.useNativeFallback() || !this.picker) {
      this.openNativePicker(inputElement);
      return;
    }

    try {
      /*
       * open() también es utilizado por clickOpens. Esta llamada cubre el clic
       * sobre el borde y el icono sin decidir el fallback por isOpen.
       */
      this.picker.open(undefined, inputElement);
    } catch (error: unknown) {
      console.error('[UiDateTimePicker] Flatpickr no pudo abrirse.', error);
      this.activateNativeFallback(inputElement);
    }
  }

  /**
   * Evita que el mismo clic llegue al listener global de cierre de Flatpickr.
   */
  handleControlClick(event: MouseEvent): void {
    event.stopPropagation();
    this.openPicker();
  }

  /**
   * Gestiona la navegación por teclado del contenedor.
   */
  handleControlKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    this.openPicker();
  }

  /**
   * Marca visualmente el control como enfocado.
   */
  handleFocus(): void {
    this.focused.set(true);
  }

  /**
   * Marca el control como tocado al perder el foco.
   */
  handleBlur(): void {
    this.focused.set(false);
    this.onTouched();
  }

  /**
   * Propaga al formulario los valores estables emitidos por el fallback nativo.
   */
  handleNativeChange(event: Event): void {
    if (!this.useNativeFallback()) {
      return;
    }

    const modelValue = (event.target as HTMLInputElement).value;

    this.pendingValue = modelValue;
    this.value.set(modelValue);
    this.onChange(modelValue);
    this.onTouched();
  }

  /**
   * Escribe en el selector los cambios emitidos por Reactive Forms.
   */
  writeValue(value: string | null | undefined): void {
    const normalizedValue = typeof value === 'string' ? value.trim() : '';

    this.pendingValue = normalizedValue;
    this.value.set(normalizedValue);
    this.syncValueToPicker(normalizedValue);
  }

  /**
   * Registra el callback utilizado por Angular Forms para cambios de valor.
   */
  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  /**
   * Registra el callback utilizado por Angular Forms para estado touched.
   */
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  /**
   * Sincroniza el estado disabled enviado por FormControl.
   */
  setDisabledState(isDisabled: boolean): void {
    this.disabledByForm.set(isDisabled);
  }

  /**
   * Convierte la fecha elegida al formato estable almacenado por el formulario.
   */
  private handleSelection(selectedDates: Date[], instance: Instance): void {
    const selectedDate = selectedDates.at(0);
    const modelValue = selectedDate
      ? instance.formatDate(selectedDate, this.modeConfig().modelFormat)
      : '';
    const displayValue = selectedDate
      ? instance.formatDate(selectedDate, this.resolvedDisplayFormat())
      : '';

    /*
     * El input conserva el formato visible mientras Reactive Forms recibe el
     * formato estable definido para cada modo.
     */
    this.pickerInput().nativeElement.value = displayValue;
    this.value.set(modelValue);

    if (modelValue === this.pendingValue) {
      return;
    }

    this.pendingValue = modelValue;
    this.onChange(modelValue);
  }

  /**
   * Refleja un valor externo sin disparar nuevamente valueChanges.
   */
  private syncValueToPicker(value: string): void {
    if (!this.picker) {
      return;
    }

    if (!value) {
      this.picker.clear(false);
      return;
    }

    /*
     * No se delega el modelo estable al parser textual de Flatpickr. En un
     * modal reutilizado ese parser puede conservar el formato visible de la
     * instancia anterior y dejar el input vacío aunque el FormControl sí
     * contenga yyyy-MM-dd. La conversión local hace determinista la edición.
     */
    const parsedValue = this.parseModelValue(value);

    if (!parsedValue) {
      this.picker.setDate(value, false, this.modeConfig().modelFormat);
      return;
    }

    this.picker.setDate(parsedValue, false);

    /*
     * setDate actualiza normalmente el input. La asignación explícita cubre
     * también instancias reabiertas después de cambiar minDate o maxDate.
     */
    const selectedDate = this.picker.selectedDates.at(0) ?? parsedValue;
    this.pickerInput().nativeElement.value = this.picker.formatDate(
      selectedDate,
      this.resolvedDisplayFormat(),
    );
  }

  /**
   * Aplica el estado disabled al input real administrado por Flatpickr.
   */
  private applyDisabledState(disabled: boolean): void {
    if (!this.picker) {
      return;
    }
    const inputElement = this.pickerInput().nativeElement;

    inputElement.disabled = disabled;
    inputElement.setAttribute('aria-disabled', String(disabled));

    if (disabled) {
      this.picker.close();
    }
  }

  /**
   * Actualiza la presentación de Flatpickr cuando el consumidor cambia entre
   * reloj de 12 y 24 horas. El valor emitido por Reactive Forms no se modifica.
   */
  private applyTimePresentation(hourFormat: UiDateTimeHourFormat, displayFormat: string): void {
    if (!this.picker || this.mode() === 'date') {
      return;
    }

    this.picker.set({
      dateFormat: displayFormat,
      time_24hr: hourFormat === '24',
    });

    if (this.pendingValue) {
      this.syncValueToPicker(this.pendingValue);
    }
  }

  /**
   * Mantiene los límites sincronizados aunque cambien después de inicializar
   * el picker, por ejemplo al reutilizar el control dentro de un modal.
   */
  private applyDateLimits(minimum: string | Date | null, maximum: string | Date | null): void {
    if (!this.picker || this.mode() === 'time') {
      return;
    }

    this.picker.set({
      minDate: this.toFlatpickrDateLimit(minimum),
      maxDate: this.toFlatpickrDateLimit(maximum),
    });

    /*
     * Flatpickr reconstruye parte del estado al cambiar límites. Se vuelve a
     * pintar el valor del formulario sin emitir un cambio hacia Angular.
     */
    if (this.pendingValue) {
      this.syncValueToPicker(this.pendingValue);
    }
  }

  /**
   * Convierte el formato estable del formulario a una fecha local validada.
   * Evita desplazamientos de zona horaria y admite date, time y datetime.
   */
  private parseModelValue(value: string): Date | null {
    if (this.mode() === 'time') {
      const timeMatch = value.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
      if (!timeMatch) {
        return null;
      }

      const [, hour, minute, second = '0'] = timeMatch;
      const parsedTime = new Date();
      parsedTime.setHours(Number(hour), Number(minute), Number(second), 0);

      return parsedTime.getHours() === Number(hour) &&
        parsedTime.getMinutes() === Number(minute) &&
        parsedTime.getSeconds() === Number(second)
        ? parsedTime
        : null;
    }

    const dateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/);

    if (!dateMatch) {
      return null;
    }

    const [, year, month, day, hour = '0', minute = '0', second = '0'] = dateMatch;
    const parsedDate = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      0,
    );

    const hasValidDate =
      parsedDate.getFullYear() === Number(year) &&
      parsedDate.getMonth() === Number(month) - 1 &&
      parsedDate.getDate() === Number(day);
    const hasValidTime =
      parsedDate.getHours() === Number(hour) &&
      parsedDate.getMinutes() === Number(minute) &&
      parsedDate.getSeconds() === Number(second);

    return hasValidDate && hasValidTime ? parsedDate : null;
  }

  /**
   * Mantiene el incremento de minutos dentro del rango aceptado.
   */
  private normalizeMinuteStep(value: number): number {
    if (!Number.isFinite(value)) {
      return 5;
    }

    return Math.min(60, Math.max(1, Math.trunc(value)));
  }

  /**
   * Obtiene siempre una instancia individual aunque Flatpickr retorne una lista.
   */
  private resolvePickerInstance(result: Instance | Instance[]): Instance | null {
    const instance = Array.isArray(result) ? result.at(0) : result;

    return instance ?? null;
  }

  /**
   * Activa el selector HTML moderno cuando Flatpickr no puede abrirse.
   */
  private activateNativeFallback(inputElement: HTMLInputElement, openPicker = true): void {
    this.picker?.destroy();
    this.picker = null;
    this.opened.set(false);
    this.useNativeFallback.set(true);
    inputElement.type = this.nativeInputType();

    if (openPicker) {
      this.openNativePicker(inputElement);
    }
  }

  /**
   * Abre programáticamente el selector nativo manteniendo un solo icono visual.
   */
  private openNativePicker(inputElement: HTMLInputElement): void {
    inputElement.type = this.nativeInputType();
    inputElement.value = this.pendingValue;

    if (typeof inputElement.showPicker === 'function') {
      try {
        inputElement.showPicker();
      } catch {
        /*
         * Algunos navegadores restringen showPicker() dentro de iframes.
         * El input conserva su tipo nativo y puede abrirse con el siguiente clic.
         */
        inputElement.focus({ preventScroll: true });
      }
    }
  }

  /**
   * Convierte límites Date al formato aceptado por los inputs HTML.
   */
  private toNativeDateLimit(value: string | Date | null, includeTime: boolean): string | null {
    if (!value) {
      return null;
    }

    if (typeof value === 'string') {
      return value;
    }

    const pad = (part: number): string => String(part).padStart(2, '0');
    const date = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;

    if (!includeTime) {
      return date;
    }

    return `${date}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
  }

  /**
   * Convierte los límites del modelo estable a fechas locales que Flatpickr
   * puede comparar sin depender del formato utilizado para mostrarlas.
   */
  private toFlatpickrDateLimit(value: string | Date | null): string | Date | undefined {
    if (!value) {
      return undefined;
    }

    if (value instanceof Date) {
      return new Date(value.getTime());
    }

    const stableDate = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/);

    if (!stableDate) {
      return value;
    }

    const [, year, month, day, hour = '0', minute = '0', second = '0'] = stableDate;
    const parsedDate = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      0,
    );

    const isValid =
      parsedDate.getFullYear() === Number(year) &&
      parsedDate.getMonth() === Number(month) - 1 &&
      parsedDate.getDate() === Number(day);

    return isValid ? parsedDate : value;
  }
}
