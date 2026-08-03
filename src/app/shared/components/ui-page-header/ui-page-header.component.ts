import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  input,
  model,
} from '@angular/core';

import { UiButtonComponent } from '../ui-button/ui-button.component';

let nextPageHeaderId = 0;

@Component({
  selector: 'app-ui-page-header',
  standalone: true,
  imports: [UiButtonComponent],
  templateUrl: './ui-page-header.component.html',
  styleUrl: './ui-page-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiPageHeaderComponent {
  readonly eyebrow = input('');
  readonly title = input.required<string>();
  readonly description = input('');
  readonly icon = input('fa-solid fa-layer-group');
  readonly showIcon = input(true, { transform: booleanAttribute });
  readonly minimizable = input(true, { transform: booleanAttribute });
  readonly minimized = model(false);
  readonly headingId = input(`ui-page-header-${nextPageHeaderId++}`);

  /** Cambia únicamente la visibilidad del contenido administrado por el consumidor. */
  toggleMinimized(): void {
    if (this.minimizable()) {
      this.minimized.update((value) => !value);
    }
  }
}
