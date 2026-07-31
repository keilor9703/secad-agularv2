import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  booleanAttribute,
  computed,
  forwardRef,
  input,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { UiFormControlSizeDirective } from '../../directives/ui-form-control-size.directive';
import { UiTimeFormat, UiTimeOption } from './ui-time-picker.types';
import { buildTimeOptions, formatTimeLabel, normalizeTimeValue } from './ui-time-picker.utils';

let nextTimePickerId = 0;

@Component({
  selector: 'app-ui-time-picker',
  standalone: true,
  imports: [OverlayModule],
  hostDirectives: [
    {
      directive: UiFormControlSizeDirective,
      inputs: ['controlSize'],
    },
  ],
  templateUrl: './ui-time-picker.component.html',
  styleUrl: './ui-time-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => UiTimePickerComponent),
      multi: true,
    },
  ],
})
export class UiTimePickerComponent implements ControlValueAccessor {
  readonly label = input.required<string>();
  readonly hourFormat = input<UiTimeFormat>('24');
  readonly controlId = input('');
  readonly placeholder = input('');
  readonly icon = input('fa-solid fa-clock');
  readonly hint = input('');
  readonly error = input('');
  readonly minTime = input<string | null>(null);
  readonly maxTime = input<string | null>(null);
  readonly minuteStep = input(30);
  readonly required = input(false, { transform: booleanAttribute });
  /**
   * Controla el marcador visual; el estado requerido del formulario no cambia.
   */
  readonly showRequiredMarker = input(true, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly clearable = input(true, { transform: booleanAttribute });

  readonly valueChange = output<string>();

  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly optionButtons = viewChildren<ElementRef<HTMLButtonElement>>('optionButton');
  private readonly generatedControlId = `ui-time-picker-${++nextTimePickerId}`;
  private readonly disabledByForm = signal(false);
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  readonly value = signal('');
  readonly opened = signal(false);
  readonly activeIndex = signal(-1);
  readonly panelWidth = signal(240);
  readonly options = computed(() =>
    buildTimeOptions(this.hourFormat(), this.minuteStep(), this.minTime(), this.maxTime()),
  );
  readonly resolvedControlId = computed(() => this.controlId().trim() || this.generatedControlId);
  readonly resolvedPlaceholder = computed(
    () =>
      this.placeholder().trim() ||
      (this.hourFormat() === '12' ? 'Seleccione una hora (AM/PM)' : 'Seleccione una hora'),
  );
  readonly selectedLabel = computed(() => formatTimeLabel(this.value(), this.hourFormat()));
  readonly hasValue = computed(() => Boolean(this.value()));
  readonly hasError = computed(() => Boolean(this.error().trim()));
  readonly isDisabled = computed(() => this.disabled() || this.disabledByForm());
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

  readonly positions: ConnectedPosition[] = [
    {
      originX: 'start',
      originY: 'bottom',
      overlayX: 'start',
      overlayY: 'top',
      offsetY: 4,
    },
    {
      originX: 'start',
      originY: 'top',
      overlayX: 'start',
      overlayY: 'bottom',
      offsetY: -4,
    },
  ];

  writeValue(value: string | null | undefined): void {
    this.value.set(normalizeTimeValue(value));
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabledByForm.set(isDisabled);

    if (isDisabled) {
      this.close();
    }
  }

  toggle(): void {
    if (this.opened()) {
      this.close();
      return;
    }

    this.open();
  }

  open(preferredOption: 'selected' | 'first' | 'last' = 'selected'): void {
    if (this.isDisabled()) {
      return;
    }

    this.panelWidth.set(Math.max(this.trigger().nativeElement.getBoundingClientRect().width, 240));
    this.activeIndex.set(this.resolveInitialIndex(preferredOption));
    this.opened.set(true);
  }

  close(restoreFocus = false): void {
    if (!this.opened()) {
      return;
    }

    this.opened.set(false);
    this.onTouched();

    if (restoreFocus) {
      queueMicrotask(() => this.trigger().nativeElement.focus());
    }
  }

  clear(event: MouseEvent): void {
    event.stopPropagation();

    if (this.isDisabled()) {
      return;
    }

    this.commitValue('');
    this.onTouched();
    this.trigger().nativeElement.focus();
  }

  selectOption(option: UiTimeOption): void {
    this.commitValue(option.value);
    this.close(true);
  }

  handleTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.open('selected');
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.open('last');
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }

  handleOptionKeydown(event: KeyboardEvent, index: number): void {
    const lastIndex = this.options().length - 1;
    let nextIndex: number | null = null;

    switch (event.key) {
      case 'ArrowDown':
        nextIndex = Math.min(index + 1, lastIndex);
        break;
      case 'ArrowUp':
        nextIndex = Math.max(index - 1, 0);
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = lastIndex;
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.close(true);
        return;
      case 'Tab':
        this.close();
        return;
      default:
        return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (nextIndex !== null) {
      this.focusOption(nextIndex);
    }
  }

  onOverlayAttached(): void {
    queueMicrotask(() => this.focusOption(this.activeIndex()));
  }

  onOptionFocus(index: number): void {
    this.activeIndex.set(index);
  }

  isSelected(option: UiTimeOption): boolean {
    return option.value === this.value();
  }

  optionId(index: number): string {
    return `${this.resolvedControlId()}-option-${index}`;
  }

  private commitValue(value: string): void {
    const normalizedValue = normalizeTimeValue(value);

    if (normalizedValue === this.value()) {
      return;
    }

    this.value.set(normalizedValue);
    this.onChange(normalizedValue);
    this.valueChange.emit(normalizedValue);
  }

  private resolveInitialIndex(preferredOption: 'selected' | 'first' | 'last'): number {
    const options = this.options();

    if (options.length === 0) {
      return -1;
    }

    if (preferredOption === 'last') {
      return options.length - 1;
    }

    if (preferredOption === 'selected') {
      const selectedIndex = options.findIndex((option) => this.isSelected(option));

      if (selectedIndex >= 0) {
        return selectedIndex;
      }
    }

    return 0;
  }

  private focusOption(index: number): void {
    const buttons = this.optionButtons();

    if (buttons.length === 0) {
      return;
    }

    const safeIndex = Math.min(Math.max(index, 0), buttons.length - 1);
    const optionElement = buttons[safeIndex].nativeElement;

    this.activeIndex.set(safeIndex);
    optionElement.focus({ preventScroll: true });
    optionElement.scrollIntoView({ block: 'nearest' });
  }
}
