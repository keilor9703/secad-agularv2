import { ChangeDetectionStrategy, Component, booleanAttribute, input, output } from '@angular/core';

import {
  UiStatusAppearance,
  UiStatusSize,
  UiStatusVariant,
} from '../../interfaces/ui-status.interface';

export type UiChipAppearance = UiStatusAppearance | 'glass';

@Component({
  selector: 'app-ui-chip',
  standalone: true,
  templateUrl: './ui-chip.component.html',
  styleUrl: './ui-chip.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiChipComponent {
  readonly label = input('');
  readonly value = input<string | number | null>(null);
  readonly variant = input<UiStatusVariant>('neutral');
  readonly appearance = input<UiChipAppearance>('outline');
  readonly size = input<UiStatusSize>('sm');
  readonly icon = input('');
  readonly dot = input(false, { transform: booleanAttribute });
  readonly removable = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly ariaLabel = input<string | null>(null);

  readonly removeRequested = output<void>();

  requestRemove(): void {
    if (!this.disabled()) {
      this.removeRequested.emit();
    }
  }
}
