import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { SafeUrlPipe } from '../../../../shared/pipes/safe-url.pipe';

@Component({
  selector: 'app-home-media-panel',
  standalone: true,
  imports: [SafeUrlPipe],
  templateUrl: './home-media-panel.component.html',
  styleUrl: './home-media-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeMediaPanelComponent {
  readonly unitVideoUrl = input('');
  readonly institutionalVideoUrl = input('');
}
