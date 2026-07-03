import { CommonModule } from '@angular/common';
import {
  booleanAttribute,
  Component,
  EventEmitter,
  forwardRef,
  Input,
  numberAttribute,
  Output,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

let nextUiSearchInputId = 0;

@Component({
  selector: 'app-ui-search-input',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ui-search-input.component.html',
  styleUrls: ['./ui-search-input.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => UiSearchInputComponent),
      multi: true,
    },
  ],
})
export class UiSearchInputComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() placeholder = '';
  @Input() buttonText = 'Buscar';
  @Input() icon = 'fa-solid fa-magnifying-glass';
  @Input() error = '';
  @Input() hint = '';
  @Input() inputId = `ui-search-input-${nextUiSearchInputId++}`;
  @Input({ transform: numberAttribute }) maxlength: number | null = null;
  @Input({ transform: booleanAttribute }) required = false;
  @Input({ transform: booleanAttribute }) disabled = false;
  @Input({ transform: booleanAttribute }) clearable = true;

  @Output() search = new EventEmitter<string>();
  @Output() cleared = new EventEmitter<void>();

  value = '';
  focused = false;
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
    const target = event.target as HTMLInputElement;
    this.value = target.value;
    this.onChange(this.value);
  }

  handleFocus(): void {
    this.focused = true;
  }

  handleBlur(): void {
    this.focused = false;
    this.markAsTouched();
  }

  emitSearch(): void {
    this.markAsTouched();
    this.search.emit(this.value.trim());
  }

  clear(): void {
    this.value = '';
    this.onChange('');
    this.markAsTouched();
    this.cleared.emit();
  }

  markAsTouched(): void {
    this.onTouched();
  }

  get isDisabled(): boolean {
    return this.disabled || this.controlDisabled;
  }

  get describedBy(): string | null {
    if (this.error) return `${this.inputId}-error`;
    if (this.hint) return `${this.inputId}-hint`;
    return null;
  }
}
