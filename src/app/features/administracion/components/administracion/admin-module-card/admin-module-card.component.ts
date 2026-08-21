import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AdminSite } from '../../../interfaces/admin-site.interface';

@Component({
  selector: 'app-admin-module-card',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './admin-module-card.component.html',
  styleUrl: './admin-module-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminModuleCardComponent {
  readonly site = input.required<AdminSite>();
  readonly sequence = input.required<number>();

  readonly cardClass = computed(() => `admin-module-card is-${this.site().tone}`);
  readonly titleId = computed(() => `admin-module-${this.sequence()}-title`);
  readonly descriptionId = computed(() => `admin-module-${this.sequence()}-description`);

  /** Presenta un orden estable y legible sin mezclarlo con la navegación. */
  readonly displaySequence = computed(() => this.sequence().toString().padStart(2, '0'));
}
