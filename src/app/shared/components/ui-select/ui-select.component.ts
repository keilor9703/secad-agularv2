import { CommonModule, DOCUMENT } from '@angular/common';
import {
  ConnectedOverlayPositionChange,
  ConnectedPosition,
  OverlayModule,
} from '@angular/cdk/overlay';
import {
  booleanAttribute,
  Component,
  ElementRef,
  forwardRef,
  inject,
  Input,
  input,
  signal,
  ChangeDetectionStrategy
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { UiFormControlSizeDirective } from '../../directives/ui-form-control-size.directive';
import { UiSelectOption } from '../../interfaces/ui-select-option.interface';
import { UiFormLabelMode } from '../../interfaces/ui-form-label-mode.interface';

let nextUiSelectId = 0;

type UiSelectPanelPlacement = 'above' | 'below';

@Component({
  selector: 'app-ui-select',
  standalone: true,
  imports: [CommonModule, OverlayModule],
  hostDirectives: [
    {
      directive: UiFormControlSizeDirective,
      inputs: ['controlSize'],
    },
  ],
  templateUrl: './ui-select.component.html',
  styleUrls: ['./ui-select.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => UiSelectComponent),
      multi: true,
    },
  ],
})
export class UiSelectComponent<T = string | number | boolean | null>
  implements ControlValueAccessor
{
  private readonly documentRef = inject(DOCUMENT);
  private readonly windowRef = this.documentRef.defaultView;

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

  /**
   * Permite ocultar el asterisco sin alterar `required` ni Validators.required.
   */
  readonly showRequiredMarker = input(true, { transform: booleanAttribute });
  /** Mantiene el modo histórico por defecto y habilita la variante animada por instancia. */
  readonly labelMode = input<UiFormLabelMode>('fixed');

  value: T | null = null;
  opened = false;
  touched = false;
  searchTerm = '';
  controlDisabled = false;
  readonly panelPlacement = signal<UiSelectPanelPlacement>('below');
  readonly panelPositioned = signal(false);
  readonly panelWidth = signal(240);

  /**
   * CDK intenta abrir debajo y, si no hay espacio, cambia el panel hacia arriba.
   * El overlay queda fuera del acordeón y no hereda sus recortes o transforms.
   */
  readonly panelPositions: ConnectedPosition[] = [
    {
      originX: 'start',
      originY: 'bottom',
      overlayX: 'start',
      overlayY: 'top',
      offsetY: 6,
    },
    {
      originX: 'start',
      originY: 'top',
      overlayX: 'start',
      overlayY: 'bottom',
      offsetY: -6,
    },
  ];

  private onChange: (value: T | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

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

    if (this.opened) {
      this.close();
      return;
    }

    this.opened = true;
    this.searchTerm = '';
    this.panelPositioned.set(false);
    this.syncPanelWidth();
  }

  close(): void {
    if (!this.opened) {
      return;
    }

    this.opened = false;
    this.panelPositioned.set(false);
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

  /** Activa la entrada visual cuando el overlay ya está anclado al control. */
  onPanelAttached(): void {
    this.panelPositioned.set(true);
  }

  /** Mantiene el origen de la animación al cambiar entre apertura superior e inferior. */
  onPanelPositionChange(event: ConnectedOverlayPositionChange): void {
    this.panelPlacement.set(event.connectionPair.overlayY === 'bottom' ? 'above' : 'below');
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

  trackOption(index: number, _option: UiSelectOption<T>): number {
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

  get describedBy(): string | null {
    if (this.error) return `${this.inputId}-error`;
    if (this.hint) return `${this.inputId}-hint`;
    return null;
  }

  private syncPanelWidth(): void {
    const control = this.elementRef.nativeElement.querySelector<HTMLElement>(
      '.form-select__control',
    );

    if (!control) {
      return;
    }

    const viewportWidth = this.windowRef?.innerWidth ?? control.clientWidth;
    const viewportMargin = viewportWidth <= 760 ? 8 : 12;
    const availableWidth = Math.max(0, viewportWidth - viewportMargin * 2);

    this.panelWidth.set(Math.min(control.getBoundingClientRect().width, availableWidth));
  }
}
