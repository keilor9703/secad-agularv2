import { ChangeDetectionStrategy, Component } from '@angular/core';

import { UiBadgeComponent } from '../../../../../shared/components/ui-badge/ui-badge.component';
import { UiChipComponent } from '../../../../../shared/components/ui-chip/ui-chip.component';

@Component({
  selector: 'app-status-components-demo',
  standalone: true,
  imports: [UiBadgeComponent, UiChipComponent],
  templateUrl: './status-components-demo.component.html',
  styleUrl: './status-components-demo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusComponentsDemoComponent {
  readonly badgeUsage = `<!-- Badge rectangular: ideal para estados dentro de tablas. -->
<app-ui-badge
  label="Completado"
  variant="success"
  appearance="outline"
  size="xs"
  icon="fa-solid fa-check"
  [uppercase]="true"
/>`;

  readonly chipUsage = `<!-- Cápsula: ideal para filtros, resúmenes y metadatos. -->
<app-ui-chip
  label="Marca configurada"
  variant="success"
  appearance="outline"
  size="sm"
  [dot]="true"
/>`;
}
