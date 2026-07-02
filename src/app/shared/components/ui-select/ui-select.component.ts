import { CommonModule } from '@angular/common';
import { booleanAttribute, Component, forwardRef, Input } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { UiSelectOption } from '../../interfaces/ui-select-option.interface';

let nextUiSelectId = 0;

@Component({
  selector: 'app-ui-select',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ui-select.component.html',
  styleUrls: ['./ui-select.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => UiSelectComponent),
      multi: true
    }
  ]
})
export class UiSelectComponent<T = string | number | boolean | null> implements ControlValueAccessor {
  @Input() label = '';
  @Input() placeholder = '';
  @Input() hint = '';
  @Input() error = '';
  @Input() inputId = `ui-select-${nextUiSelectId++}`;
  @Input() options: UiSelectOption<T>[] = [];
  @Input({ transform: booleanAttribute }) disabled = false;

  value: T | null = null;
  controlDisabled = false;

  private onChange: (value: T | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: T | null | undefined): void {
    this.value = value ?? null;
  }

  registerOnChange(fn: (value: T | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.controlDisabled = isDisabled;
  }

  handleChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const selectedIndex = target.value === '' ? -1 : Number(target.value);
    this.value = selectedIndex >= 0 ? this.options[selectedIndex]?.value ?? null : null;
    this.onChange(this.value);
    this.onTouched();
  }

  markAsTouched(): void {
    this.onTouched();
  }

  trackOption(index: number): number {
    return index;
  }

  get selectedIndex(): string {
    const index = this.options.findIndex((option) => Object.is(option.value, this.value));
    return index >= 0 ? String(index) : '';
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
