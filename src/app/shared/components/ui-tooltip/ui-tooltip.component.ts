import {
  ConnectedOverlayPositionChange,
  ConnectedPosition,
  OverlayModule,
} from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  booleanAttribute,
  computed,
  inject,
  input,
  numberAttribute,
  signal,
} from '@angular/core';
import {
  UiTooltipAlign,
  UiTooltipPosition,
  UiTooltipSize,
  UiTooltipVariant,
} from './ui-tooltip.types';

let nextTooltipId = 0;

@Component({
  selector: 'app-ui-tooltip',
  standalone: true,
  imports: [OverlayModule],
  host: {
    '[class.is-block]': 'block()',
  },
  templateUrl: './ui-tooltip.component.html',
  styleUrl: './ui-tooltip.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiTooltipComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly generatedId = `ui-tooltip-${++nextTooltipId}`;
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  readonly text = input('');
  readonly position = input<UiTooltipPosition>('bottom');
  readonly align = input<UiTooltipAlign>('center');
  readonly variant = input<UiTooltipVariant>('light');
  readonly size = input<UiTooltipSize>('sm');
  readonly tooltipId = input('');
  readonly showDelay = input(180, { transform: numberAttribute });
  readonly hideDelay = input(80, { transform: numberAttribute });
  readonly offset = input(8, { transform: numberAttribute });
  readonly maxWidth = input(260, { transform: numberAttribute });
  readonly viewportMargin = input(8, { transform: numberAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly showArrow = input(true, { transform: booleanAttribute });
  readonly block = input(false, { transform: booleanAttribute });

  readonly opened = signal(false);
  readonly renderedPosition = signal<UiTooltipPosition>('bottom');
  readonly resolvedId = computed(() => this.tooltipId().trim() || this.generatedId);
  readonly resolvedText = computed(() => this.text().trim());
  readonly tooltipClasses = computed(() =>
    [
      'ui-tooltip',
      `ui-tooltip--${this.variant()}`,
      `ui-tooltip--${this.size()}`,
      `is-${this.renderedPosition()}`,
      this.showArrow() ? 'has-arrow' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
  readonly positions = computed<ConnectedPosition[]>(() => {
    const preferred = this.position();
    const order: UiTooltipPosition[] = [
      preferred,
      this.opposite(preferred),
      ...(preferred === 'top' || preferred === 'bottom'
        ? (['right', 'left'] as const)
        : (['bottom', 'top'] as const)),
    ];

    return order.map((position) => this.createPosition(position));
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.clearTimers());
  }

  /** Abre con una espera breve para evitar destellos al cruzar varios botones. */
  scheduleOpen(): void {
    if (this.disabled() || !this.resolvedText()) {
      return;
    }

    this.clearHideTimer();
    this.clearShowTimer();
    this.showTimer = setTimeout(() => this.opened.set(true), Math.max(this.showDelay(), 0));
  }

  /** Conserva un margen de salida que permite pasar del origen al tooltip sin parpadeo. */
  scheduleClose(): void {
    this.clearShowTimer();
    this.clearHideTimer();
    this.hideTimer = setTimeout(() => this.opened.set(false), Math.max(this.hideDelay(), 0));
  }

  /** Cierra inmediatamente al activar el control o presionar Escape. */
  closeNow(): void {
    this.clearTimers();
    this.opened.set(false);
  }

  handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.closeNow();
    }
  }

  /** Sincroniza la flecha con la posición elegida por el motor responsive del CDK. */
  handlePositionChange(event: ConnectedOverlayPositionChange): void {
    const pair = event.connectionPair;

    if (pair.originY === 'top' && pair.overlayY === 'bottom') {
      this.renderedPosition.set('top');
    } else if (pair.originY === 'bottom' && pair.overlayY === 'top') {
      this.renderedPosition.set('bottom');
    } else if (pair.originX === 'start' && pair.overlayX === 'end') {
      this.renderedPosition.set('left');
    } else {
      this.renderedPosition.set('right');
    }
  }

  private createPosition(position: UiTooltipPosition): ConnectedPosition {
    const offset = Math.max(this.offset(), 0);
    const horizontal = this.horizontalAlignment();
    const vertical = this.verticalAlignment();

    switch (position) {
      case 'top':
        return {
          originX: horizontal,
          originY: 'top',
          overlayX: horizontal,
          overlayY: 'bottom',
          offsetY: -offset,
        };
      case 'right':
        return {
          originX: 'end',
          originY: vertical,
          overlayX: 'start',
          overlayY: vertical,
          offsetX: offset,
        };
      case 'left':
        return {
          originX: 'start',
          originY: vertical,
          overlayX: 'end',
          overlayY: vertical,
          offsetX: -offset,
        };
      default:
        return {
          originX: horizontal,
          originY: 'bottom',
          overlayX: horizontal,
          overlayY: 'top',
          offsetY: offset,
        };
    }
  }

  private horizontalAlignment(): 'start' | 'center' | 'end' {
    return this.align();
  }

  private verticalAlignment(): 'top' | 'center' | 'bottom' {
    if (this.align() === 'start') {
      return 'top';
    }

    return this.align() === 'end' ? 'bottom' : 'center';
  }

  private opposite(position: UiTooltipPosition): UiTooltipPosition {
    const opposites: Record<UiTooltipPosition, UiTooltipPosition> = {
      top: 'bottom',
      right: 'left',
      bottom: 'top',
      left: 'right',
    };

    return opposites[position];
  }

  private clearTimers(): void {
    this.clearShowTimer();
    this.clearHideTimer();
  }

  private clearShowTimer(): void {
    if (this.showTimer !== null) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }
  }

  private clearHideTimer(): void {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }
}
