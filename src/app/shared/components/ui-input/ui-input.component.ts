import { CommonModule } from '@angular/common';
import {
  booleanAttribute,
  Component,
  EventEmitter,
  forwardRef,
  Input,
  numberAttribute,
  Output
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

let nextUiInputId = 0;

@Component({
  selector: 'app-ui-input',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ui-input.component.html',
  styleUrls: ['./ui-input.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => UiInputComponent),
      multi: true
    }
  ]
})
export class UiInputComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() type = 'text';
  @Input() placeholder = '';
  @Input() autocomplete = 'off';
  @Input() hint = '';
  @Input() error = '';
  @Input() inputId = `ui-input-${nextUiInputId++}`;
  @Input({ transform: numberAttribute }) maxlength: number | null = null;
  @Input({ transform: numberAttribute }) rows = 4;
  @Input({ transform: booleanAttribute }) multiline = false;
  @Input({ transform: booleanAttribute }) readonly = false;
  @Input({ transform: booleanAttribute }) disabled = false;

  @Output() enterPressed = new EventEmitter<void>();

  value = '';
  controlDisabled = false;

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: string | null | undefined): void {
    this.value = value ?? '';
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

  markAsTouched(): void {
    this.onTouched();
  }

  handleEnter(): void {
    this.enterPressed.emit();
  }

  get isDisabled(): boolean {
    return this.disabled || this.controlDisabled;
  }

  get describedBy(): string | null {
    if (this.error) {
      return `${this.inputId}-error`;
    }

    if (this.hint) {
      return `${this.inputId}-hint`;
    }

    return null;
  }
}
