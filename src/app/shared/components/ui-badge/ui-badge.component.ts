import { ChangeDetectionStrategy, Component, booleanAttribute, input } from '@angular/core';

import {
  UiStatusAppearance,
  UiStatusSize,
  UiStatusVariant,
} from '../../interfaces/ui-status.interface';

@Component({
  selector: 'app-ui-badge',
  standalone: true,
  templateUrl: './ui-badge.component.html',
  styleUrl: './ui-badge.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiBadgeComponent {
  readonly label = input('');
  readonly variant = input<UiStatusVariant>('neutral');
  readonly appearance = input<UiStatusAppearance>('soft');
  readonly size = input<UiStatusSize>('sm');
  readonly icon = input('');
  readonly iconPosition = input<'start' | 'end'>('end');
  readonly uppercase = input(false, { transform: booleanAttribute });
  readonly ariaLabel = input<string | null>(null);
}
