import { ChangeDetectionStrategy, Component, input } from '@angular/core';

let nextSectionHeaderId = 0;

@Component({
  selector: 'app-ui-section-header',
  standalone: true,
  templateUrl: './ui-section-header.component.html',
  styleUrl: './ui-section-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiSectionHeaderComponent {
  readonly eyebrow = input('');
  readonly title = input.required<string>();
  readonly description = input('');
  readonly icon = input('fa-solid fa-layer-group');
  readonly headingId = input(`ui-section-header-${nextSectionHeaderId++}`);
  readonly compact = input(true);
}
