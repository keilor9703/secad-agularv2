
import {
  booleanAttribute,
  Component,
  EventEmitter,
  forwardRef,
  Input,
  input,
  numberAttribute,
  Output,
  ChangeDetectionStrategy
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { UiFormControlSizeDirective } from '../../directives/ui-form-control-size.directive';

let nextUiInputId = 0;

@Component({
  selector: 'app-ui-input',
  standalone: true,
  imports: [],
  hostDirectives: [
    {
      directive: UiFormControlSizeDirective,
      inputs: ['controlSize'],
    },
  ],
  templateUrl: './ui-input.component.html',
  styleUrls: ['./ui-input.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => UiInputComponent),
      multi: true,
    },
  ],
})
export class UiInputComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() type = 'text';
  @Input() placeholder = '';
  @Input() autocomplete = 'off';
  @Input() hint = '';
  @Input() error = '';
  @Input() icon = '';
  @Input() inputId = `ui-input-${nextUiInputId++}`;
  @Input({ transform: numberAttribute }) maxlength: number | null = null;
  @Input({ transform: numberAttribute }) rows = 4;
  @Input({ transform: booleanAttribute }) multiline = false;
  @Input({ transform: booleanAttribute }) readonly = false;
  @Input({ transform: booleanAttribute }) disabled = false;
  @Input({ transform: booleanAttribute }) required = false;

  /**
   * Controla únicamente la representación visual del asterisco.
   * `required` y los validadores continúan activos aunque se oculte.
   */
  readonly showRequiredMarker = input(true, { transform: booleanAttribute });

  @Output() enterPressed = new EventEmitter<void>();

  value = '';
  focused = false;
  controlDisabled = false;

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: string | number | null | undefined): void {
    this.value = value === null || value === undefined ? '' : String(value);
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.controlDisabled = isDisabled;
  }

  handleInput(event: Event): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    this.value = target.value;
    this.onChange(this.value);
  }

  handleFocus(): void {
    this.focused = true;
  }

  handleBlur(): void {
    this.focused = false;
    this.onTouched();
  }

  handleEnter(): void {
    this.enterPressed.emit();
  }

  get isDisabled(): boolean {
    return this.disabled || this.controlDisabled;
  }

  get shouldFloat(): boolean {
    return this.focused || !!this.value || ['date', 'time', 'datetime-local'].includes(this.type);
  }

  get describedBy(): string | null {
    if (this.error) return `${this.inputId}-error`;
    if (this.hint) return `${this.inputId}-hint`;
    return null;
  }
}
