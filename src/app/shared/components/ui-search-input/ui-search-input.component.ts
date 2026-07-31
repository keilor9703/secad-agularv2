import { CommonModule } from '@angular/common';
import {
  booleanAttribute,
  Component,
  computed,
  EventEmitter,
  forwardRef,
  Input,
  input,
  numberAttribute,
  Output,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { UiFormControlSizeDirective } from '../../directives/ui-form-control-size.directive';
import {
  UiButtonAppearance,
  UiButtonComponent,
  UiButtonVariant,
} from '../ui-button/ui-button.component';

let nextUiSearchInputId = 0;
export type UiSearchButtonLayout = 'attached' | 'detached';

@Component({
  selector: 'app-ui-search-input',
  standalone: true,
  imports: [CommonModule, UiButtonComponent],
  hostDirectives: [
    {
      directive: UiFormControlSizeDirective,
      inputs: ['controlSize'],
    },
  ],
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
  @Input() ariaLabel = '';
  @Input() placeholder = '';
  @Input() buttonText = 'Buscar';
  @Input() icon = 'fa-solid fa-magnifying-glass';
  @Input() error = '';
  @Input() hint = '';
  @Input() inputId = `ui-search-input-${nextUiSearchInputId++}`;
  @Input({ transform: numberAttribute }) maxlength: number | null = null;
  @Input({ transform: booleanAttribute }) iconOnly = false;
  @Input({ transform: booleanAttribute }) required = false;
  @Input({ transform: booleanAttribute }) disabled = false;
  @Input({ transform: booleanAttribute }) clearable = true;

  /**
   * En móvil compacta el botón mostrando únicamente su icono.
   * Puede desactivarse por instancia con [hideButtonTextOnMobile]="false".
   */
  readonly hideButtonTextOnMobile = input(true, { transform: booleanAttribute });
  /**
   * Permite usar el componente como buscador reactivo sin botón.
   * En ese modo, `icon` se presenta dentro del campo como icono inicial.
   */
  readonly showButton = input(true, { transform: booleanAttribute });
  /**
   * Decide si se representa el asterisco; no desactiva la validación requerida.
   */
  readonly showRequiredMarker = input(true, { transform: booleanAttribute });
  /** Apariencia del botón reutilizable integrado en el buscador. */
  readonly buttonVariant = input<UiButtonVariant>('secondary');
  readonly buttonAppearance = input<UiButtonAppearance>('solid');
  /**
   * attached: botón unido al campo.
   * detached: botón independiente con separación configurable.
   */
  readonly buttonLayout = input<UiSearchButtonLayout>('attached');
  readonly buttonGap = input<string | number>(8);
  /** Colores opcionales por instancia; vacío conserva la variante seleccionada. */
  readonly buttonBackgroundColor = input('');
  readonly buttonTextColor = input('');
  readonly buttonBorderColor = input('');
  readonly buttonIconColor = input('');
  readonly leadingIconColor = input('');

  readonly buttonGapCss = computed(() => {
    const gap = this.buttonGap();

    return typeof gap === 'number' ? `${Math.max(0, gap)}px` : gap;
  });

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

  get searchLabel(): string {
    return this.buttonText || 'Buscar';
  }
}
