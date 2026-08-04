import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  numberAttribute,
} from '@angular/core';

export type UiSectionHeaderAppearance = 'boxed' | 'divider';

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
  readonly appearance = input<UiSectionHeaderAppearance>('boxed');
  readonly showAccent = input(true, { transform: booleanAttribute });
  readonly accentWidth = input(4, { transform: numberAttribute });
  readonly resolvedAccentWidth = computed(() => {
    if (!this.showAccent()) {
      return 0;
    }

    const width = this.accentWidth();
    return Number.isFinite(width) ? Math.min(8, Math.max(0, width)) : 4;
  });
}
