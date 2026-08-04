import { CommonModule, DOCUMENT } from '@angular/common';
import {
  booleanAttribute,
  Component,
  ElementRef,
  forwardRef,
  HostListener,
  inject,
  Input,
  input,
  OnDestroy,
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
  imports: [CommonModule],
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
  implements ControlValueAccessor, OnDestroy
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
  readonly panelStyles = signal<Readonly<Record<string, string>>>({
    top: '0px',
    left: '-10000px',
    width: '0px',
    maxHeight: '260px',
  });

  private onChange: (value: T | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  private panelAnimationFrame: number | null = null;
  private readonly handleViewportChange = (event: Event): void => {
    const panel = this.elementRef.nativeElement.querySelector<HTMLElement>('.form-select__panel');

    // El scroll propio de las opciones no debe volver a calcular el anclaje.
    if (event.target instanceof Node && panel?.contains(event.target)) {
      return;
    }

    if (this.opened) {
      this.schedulePanelPosition();
    }
  };

  constructor(private readonly elementRef: ElementRef<HTMLElement>) {
    this.documentRef.addEventListener('scroll', this.handleViewportChange, true);
    this.windowRef?.addEventListener('resize', this.handleViewportChange);
  }

  ngOnDestroy(): void {
    this.documentRef.removeEventListener('scroll', this.handleViewportChange, true);
    this.windowRef?.removeEventListener('resize', this.handleViewportChange);
    this.cancelPanelPosition();
  }

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

    if (this.opened) {
      this.close();
      return;
    }

    this.opened = true;
    this.searchTerm = '';
    this.panelPositioned.set(false);
    this.schedulePanelPosition();
  }

  close(): void {
    if (!this.opened) {
      return;
    }

    this.opened = false;
    this.panelPositioned.set(false);
    this.cancelPanelPosition();
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
    this.schedulePanelPosition();
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

  private schedulePanelPosition(): void {
    if (!this.windowRef) {
      return;
    }

    this.cancelPanelPosition();
    this.panelAnimationFrame = this.windowRef.requestAnimationFrame(() => {
      this.panelAnimationFrame = null;
      this.updatePanelPosition();
    });
  }

  private cancelPanelPosition(): void {
    if (this.panelAnimationFrame === null || !this.windowRef) {
      return;
    }

    this.windowRef.cancelAnimationFrame(this.panelAnimationFrame);
    this.panelAnimationFrame = null;
  }

  private updatePanelPosition(): void {
    if (!this.opened || !this.windowRef) {
      return;
    }

    const host = this.elementRef.nativeElement;
    const control = host.querySelector<HTMLElement>('.form-select__control');
    const panel = host.querySelector<HTMLElement>('.form-select__panel');

    if (!control || !panel) {
      return;
    }

    const controlRect = control.getBoundingClientRect();
    const viewportWidth = this.windowRef.innerWidth;
    const viewportHeight = this.windowRef.innerHeight;
    const viewportMargin = viewportWidth <= 760 ? 8 : 12;
    const mobileNavigationInset = viewportWidth <= 760 ? 78 : viewportMargin;
    const panelGap = 6;
    const maximumPanelHeight = 280;
    const naturalPanelHeight = Math.min(
      Math.max(panel.scrollHeight, this.searchable ? 170 : 110),
      maximumPanelHeight,
    );
    const spaceAbove = Math.max(0, controlRect.top - viewportMargin - panelGap);
    const spaceBelow = Math.max(
      0,
      viewportHeight - mobileNavigationInset - controlRect.bottom - panelGap,
    );
    const minimumComfortableHeight = Math.min(naturalPanelHeight, this.searchable ? 170 : 120);
    const placement: UiSelectPanelPlacement =
      spaceBelow < minimumComfortableHeight && spaceAbove > spaceBelow ? 'above' : 'below';
    const availableHeight = placement === 'above' ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(96, Math.min(maximumPanelHeight, Math.floor(availableHeight)));
    const renderedHeight = Math.min(panel.scrollHeight, maxHeight);
    const maximumPanelWidth = Math.max(0, viewportWidth - viewportMargin * 2);
    const panelWidth = Math.min(controlRect.width, maximumPanelWidth);
    const panelLeft = Math.min(
      Math.max(controlRect.left, viewportMargin),
      viewportWidth - viewportMargin - panelWidth,
    );
    const panelTop =
      placement === 'above'
        ? Math.max(viewportMargin, controlRect.top - panelGap - renderedHeight)
        : Math.min(
            controlRect.bottom + panelGap,
            viewportHeight - mobileNavigationInset - maxHeight,
          );

    this.panelPlacement.set(placement);
    this.panelStyles.set({
      top: `${Math.round(panelTop)}px`,
      left: `${Math.round(panelLeft)}px`,
      width: `${Math.round(panelWidth)}px`,
      maxHeight: `${Math.round(maxHeight)}px`,
    });
    this.panelPositioned.set(true);
  }
}
