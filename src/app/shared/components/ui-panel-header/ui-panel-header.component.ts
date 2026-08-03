import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type UiPanelHeaderAppearance = 'institutional' | 'soft';

let nextPanelHeaderId = 0;

@Component({
  selector: 'app-ui-panel-header',
  standalone: true,
  templateUrl: './ui-panel-header.component.html',
  styleUrl: './ui-panel-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiPanelHeaderComponent {
  readonly title = input.required<string>();
  readonly description = input('');
  readonly icon = input('');
  readonly appearance = input<UiPanelHeaderAppearance>('institutional');
  readonly headingId = input(`ui-panel-header-${nextPanelHeaderId++}`);
}
