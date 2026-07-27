import { CommonModule } from '@angular/common';
import {
  booleanAttribute,
  Component,
  ElementRef,
  forwardRef,
  HostListener,
  Input,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { UiFormControlSizeDirective } from '../../directives/ui-form-control-size.directive';
import { UiSelectOption } from '../../interfaces/ui-select-option.interface';

let nextUiSelectId = 0;

@Component({
  selector: 'app-ui-select',
  standalone: true,
  imports: [CommonModule],
  hostDirectives: [
    {
      directive: UiFormControlSizeDirective,
      inputs: ['controlSize'],
    },
  ],
  templateUrl: './ui-select.component.html',
  styleUrls: ['./ui-select.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => UiSelectComponent),
      multi: true,
    },
  ],
})
export class UiSelectComponent<
  T = string | number | boolean | null,
> implements ControlValueAccessor {
  @Input() label = '';
  @Input() placeholder = 'Seleccione';
  @Input() searchPlaceholder = 'Buscar...';
  @Input() hint = '';
  @Input() error = '';
  @Input() inputId = `ui-select-${nextUiSelectId++}`;
  @Input() options: UiSelectOption<T>[] = [];
  @Input({ transform: booleanAttribute }) disabled = false;
  @Input({ transform: booleanAttribute }) required = false;
  @Input({ transform: booleanAttribute }) clearable = true;
  @Input({ transform: booleanAttribute }) searchable = true;

  value: T | null = null;
  opened = false;
  touched = false;
  searchTerm = '';
  controlDisabled = false;

  private onChange: (value: T | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

  @HostListener('document:click', ['$event'])
  closeOnOutsideClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

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

  toggle(): void {
    if (this.isDisabled) {
      return;
    }

    this.opened = !this.opened;

    if (this.opened) {
      this.searchTerm = '';
    }
  }

  close(): void {
    if (!this.opened) {
      return;
    }

    this.opened = false;
    this.markAsTouched();
  }

  selectOption(option: UiSelectOption<T>): void {
    if (option.disabled) {
      return;
    }

    this.value = option.value;
    this.onChange(this.value);
    this.close();
  }

  clear(event: MouseEvent): void {
    event.stopPropagation();
    this.value = null;
    this.onChange(null);
    this.markAsTouched();
  }

  onSearch(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchTerm = target.value;
  }

  handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.close();
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.toggle();
    }
  }

  markAsTouched(): void {
    if (this.touched) {
      return;
    }

    this.touched = true;
    this.onTouched();
  }

  isSelected(option: UiSelectOption<T>): boolean {
    return Object.is(option.value, this.value);
  }

  trackOption(index: number): number {
    return index;
  }

  get selectedLabel(): string {
    return this.options.find((option) => Object.is(option.value, this.value))?.label ?? '';
  }

  get filteredOptions(): UiSelectOption<T>[] {
    const term = this.searchTerm.trim().toLowerCase();

    if (!term) {
      return this.options;
    }

    return this.options.filter((option) => option.label.toLowerCase().includes(term));
  }

  get isDisabled(): boolean {
    return this.disabled || this.controlDisabled;
  }
}
