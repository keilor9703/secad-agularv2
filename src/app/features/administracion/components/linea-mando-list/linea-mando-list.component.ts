import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { DtoLineaMando } from '../../../../core/services/linea-mando.service';
import { UiBadgeComponent } from '../../../../shared/components/ui-badge/ui-badge.component';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiChipComponent } from '../../../../shared/components/ui-chip/ui-chip.component';
import { UiPanelHeaderComponent } from '../../../../shared/components/ui-panel-header/ui-panel-header.component';
import { UiSpinnerComponent } from '../../../../shared/components/ui-spinner/ui-spinner.component';

const DEFAULT_PHOTO = 'imagenes/policia.jpg';

@Component({
  selector: 'app-linea-mando-list',
  standalone: true,
  imports: [
    UiBadgeComponent,
    UiButtonComponent,
    UiChipComponent,
    UiPanelHeaderComponent,
    UiSpinnerComponent,
  ],
  templateUrl: './linea-mando-list.component.html',
  styleUrl: './linea-mando-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LineaMandoListComponent {
  readonly rows = input<readonly DtoLineaMando[]>([]);
  readonly loading = input(false);
  readonly selectedId = input<number | null>(null);

  readonly editRequested = output<DtoLineaMando>();
  readonly removeRequested = output<DtoLineaMando>();

  readonly activeCount = computed(() => this.rows().filter((item) => item.vigente === 1).length);
  readonly orderedRows = computed(() =>
    [...this.rows()].sort(
      (left, right) =>
        Number(right.vigente === 1) - Number(left.vigente === 1) ||
        left.orden - right.orden ||
        left.nombre.localeCompare(right.nombre),
    ),
  );

  /** Normaliza la fotografía del API para que la plantilla solo reciba una URL segura. */
  photoUrl(item: DtoLineaMando): string {
    const photo = item.fotoBase64?.trim();

    if (!photo) {
      return DEFAULT_PHOTO;
    }

    return photo.startsWith('data:') ? photo : `data:image/jpeg;base64,${photo}`;
  }

  fullName(item: DtoLineaMando): string {
    return [item.grado, item.nombre, item.apellidos].filter(Boolean).join(' ');
  }
}
