import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  output,
} from '@angular/core';
import { UiTooltipComponent } from '../ui-tooltip/ui-tooltip.component';
import {
  UiTooltipAlign,
  UiTooltipPosition,
  UiTooltipSize,
  UiTooltipVariant,
} from '../ui-tooltip/ui-tooltip.types';

export type UiButtonVariant =
  | 'primary'
  | 'secondary'
  | 'info'
  | 'success'
  | 'neutral'
  | 'outline'
  | 'ghost'
  | 'warning'
  | 'danger';
export type UiButtonAppearance = 'solid' | 'soft' | 'outline' | 'ghost';
export type UiButtonSize = 'sm' | 'md' | 'lg';
export type UiButtonIconPosition = 'start' | 'end';
export type UiButtonTooltipAlign = UiTooltipAlign;

@Component({
  selector: 'app-ui-button',
  standalone: true,
  imports: [UiTooltipComponent],
  host: {
    '[class.ui-button-host--block]': 'block()',
  },
  templateUrl: './ui-button.component.html',
  styleUrl: './ui-button.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiButtonComponent {
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly variant = input<UiButtonVariant>('secondary');
  readonly appearance = input<UiButtonAppearance>('solid');
  readonly size = input<UiButtonSize>('md');
  readonly icon = input('');
  readonly iconPosition = input<UiButtonIconPosition>('start');
  readonly title = input('');
  /** Tooltip visual reutilizable; también sirve como nombre accesible de respaldo. */
  readonly tooltip = input('');
  readonly tooltipAlign = input<UiButtonTooltipAlign>('center');
  readonly tooltipPosition = input<UiTooltipPosition>('bottom');
  readonly tooltipVariant = input<UiTooltipVariant>('light');
  readonly tooltipSize = input<UiTooltipSize>('sm');
  readonly tooltipShowDelay = input(180);
  readonly tooltipHideDelay = input(80);
  readonly ariaLabel = input('');
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly loading = input(false, { transform: booleanAttribute });
  readonly block = input(false, { transform: booleanAttribute });
  readonly iconOnly = input(false, { transform: booleanAttribute });
  readonly hideTextOnMobile = input(false, { transform: booleanAttribute });

  /** Colores opcionales por instancia; si se omiten se conserva la variante. */
  readonly backgroundColor = input('');
  readonly textColor = input('');
  readonly borderColor = input('');
  readonly iconColor = input('');

  readonly buttonClick = output<MouseEvent>();

  readonly resolvedVariant = computed<Exclude<UiButtonVariant, 'outline' | 'ghost'>>(() => {
    const variant = this.variant();

    return variant === 'outline' || variant === 'ghost' ? 'neutral' : variant;
  });
  readonly resolvedAppearance = computed<UiButtonAppearance>(() => {
    if (this.variant() === 'outline') {
      return 'outline';
    }

    if (this.variant() === 'ghost') {
      return 'ghost';
    }

    return this.appearance();
  });
  readonly classes = computed(() =>
    [
      'ui-btn',
      `ui-btn--${this.resolvedVariant()}`,
      `ui-btn--${this.resolvedAppearance()}`,
      `ui-btn--${this.size()}`,
      this.block() ? 'ui-btn--block' : '',
      this.iconOnly() ? 'ui-btn--icon-only' : '',
      this.hideTextOnMobile() ? 'ui-btn--mobile-icon-only' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );

  handleClick(event: MouseEvent): void {
    if (this.disabled() || this.loading()) {
      event.preventDefault();
      return;
    }

    this.buttonClick.emit(event);
  }
}
