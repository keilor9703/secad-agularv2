import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  effect,
  forwardRef,
  input,
  output,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export type UiToggleSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type UiToggleVariant = 'neutral' | 'institutional' | 'success' | 'danger';
export type UiToggleLabelPosition = 'start' | 'end';

let nextUiToggleId = 0;

@Component({
  selector: 'app-ui-toggle',
  standalone: true,
  templateUrl: './ui-toggle.component.html',
  styleUrl: './ui-toggle.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => UiToggleComponent),
      multi: true,
    },
  ],
})
export class UiToggleComponent implements ControlValueAccessor {
  readonly label = input('');
  readonly hint = input('');
  readonly error = input('');
  readonly ariaLabel = input('');
  readonly toggleId = input(`ui-toggle-${nextUiToggleId++}`);

  readonly size = input<UiToggleSize>('md');
  readonly variant = input<UiToggleVariant>('neutral');
  readonly labelPosition = input<UiToggleLabelPosition>('end');

  readonly checked = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly readonly = input(false, { transform: booleanAttribute });
  readonly required = input(false, { transform: booleanAttribute });
  readonly showRequiredMarker = input(true, { transform: booleanAttribute });
  readonly showIcons = input(false, { transform: booleanAttribute });
  readonly showStateText = input(false, { transform: booleanAttribute });

  readonly onIcon = input('fa-solid fa-check');
  readonly offIcon = input('fa-solid fa-xmark');
  readonly onText = input('Activado');
  readonly offText = input('Desactivado');

  // Colores opcionales por instancia. Vacíos conservan el tema de la variante.
  readonly inactiveColor = input('');
  readonly activeColor = input('');
  readonly borderColor = input('');
  readonly thumbColor = input('');
  readonly activeThumbColor = input('');
  readonly iconColor = input('');
  readonly activeIconColor = input('');

  readonly checkedChange = output<boolean>();

  readonly value = signal(false);
  private readonly formDisabled = signal(false);
  private controlledByAngularForms = false;

  readonly isDisabled = computed(() => this.disabled() || this.formDisabled());
  readonly stateText = computed(() => (this.value() ? this.onText() : this.offText()));
  readonly accessibleLabel = computed(
    () => this.ariaLabel().trim() || this.label().trim() || this.stateText(),
  );

  private onChange: (value: boolean) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    // [checked] controla usos directos; Reactive Forms mantiene su propio valor
    // después de llamar writeValue y no debe ser sobrescrito por este effect.
    effect(() => {
      const checkedValue = this.checked();

      if (!this.controlledByAngularForms) {
        this.value.set(checkedValue);
      }
    });
  }

  writeValue(value: boolean | null | undefined): void {
    this.controlledByAngularForms = true;
    this.value.set(Boolean(value));
  }

  registerOnChange(fn: (value: boolean) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.formDisabled.set(isDisabled);
  }

  /** Evita cambios de usuario cuando el control es de solo lectura. */
  handleClick(event: MouseEvent): void {
    if (this.readonly()) {
      event.preventDefault();
    }
  }

  /** Sincroniza el nuevo valor con Angular Forms y notifica solo interacciones de usuario. */
  handleChange(event: Event): void {
    const inputElement = event.target as HTMLInputElement;

    if (this.isDisabled() || this.readonly()) {
      inputElement.checked = this.value();
      return;
    }

    const nextValue = inputElement.checked;
    this.value.set(nextValue);
    this.onChange(nextValue);
    this.onTouched();
    this.checkedChange.emit(nextValue);
  }

  markTouched(): void {
    this.onTouched();
  }
}
