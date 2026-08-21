import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import { DtoLineaMando } from '../../../../core/services/linea-mando.service';
import { UiBadgeComponent } from '../../../../shared/components/ui-badge/ui-badge.component';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiChipComponent } from '../../../../shared/components/ui-chip/ui-chip.component';
import { UiPanelHeaderComponent } from '../../../../shared/components/ui-panel-header/ui-panel-header.component';
import { UiSegmentedTabsComponent } from '../../../../shared/components/ui-segmented-tabs/ui-segmented-tabs.component';
import { UiSegmentedTabItem } from '../../../../shared/components/ui-segmented-tabs/ui-segmented-tabs.types';
import { UiSpinnerComponent } from '../../../../shared/components/ui-spinner/ui-spinner.component';

const DEFAULT_PHOTO = 'imagenes/policia.jpg';
type CommandStructureView = 'active' | 'inactive';

@Component({
  selector: 'app-linea-mando-list',
  standalone: true,
  imports: [
    UiBadgeComponent,
    UiButtonComponent,
    UiChipComponent,
    UiPanelHeaderComponent,
    UiSegmentedTabsComponent,
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
  readonly previewOrder = input<number | null>(null);
  readonly processingId = input<number | null>(null);

  readonly editRequested = output<DtoLineaMando>();
  readonly removeRequested = output<DtoLineaMando>();
  readonly activateRequested = output<DtoLineaMando>();
  readonly permanentDeleteRequested = output<DtoLineaMando>();

  readonly currentView = signal<CommandStructureView>('active');
  readonly activeRows = computed(() => {
    const active = this.rows()
      .filter((item) => item.vigente === 1)
      .sort((left, right) => left.orden - right.orden || left.nombre.localeCompare(right.nombre));
    const selectedIndex = active.findIndex((item) => item.idLineaMando === this.selectedId());
    const requestedOrder = this.previewOrder();

    if (selectedIndex >= 0 && requestedOrder !== null) {
      const [selected] = active.splice(selectedIndex, 1);
      const destination = Math.min(Math.max(requestedOrder - 1, 0), active.length);
      active.splice(destination, 0, selected);
    }

    return active;
  });
  readonly inactiveRows = computed(() =>
    this.rows()
      .filter((item) => item.vigente !== 1)
      .sort((left, right) => left.nombre.localeCompare(right.nombre)),
  );
  readonly activeCount = computed(() => this.activeRows().length);
  readonly inactiveCount = computed(() => this.inactiveRows().length);
  readonly statusTabs = computed<readonly UiSegmentedTabItem[]>(() => [
    {
      id: 'active',
      label: 'Activos',
      description: 'Estructura visible',
      icon: 'fa-solid fa-user-shield',
      badge: this.activeCount(),
      tone: 'info',
    },
    {
      id: 'inactive',
      label: 'Inactivos',
      description: 'Histórico administrable',
      icon: 'fa-solid fa-user-clock',
      badge: this.inactiveCount(),
      tone: 'neutral',
    },
  ]);
  readonly visibleRows = computed(() =>
    this.currentView() === 'active' ? this.activeRows() : this.inactiveRows(),
  );

  /** Cambia la colección visible sin alterar el orden ni el estado recibido del API. */
  showView(view: CommandStructureView): void {
    this.currentView.set(view);
  }

  /** Traduce el identificador genérico del tab al estado permitido por esta pantalla. */
  selectView(tabId: string): void {
    this.showView(tabId === 'inactive' ? 'inactive' : 'active');
  }

  /** Durante la edición muestra el orden proyectado sin modificar el DTO recibido. */
  displayOrder(item: DtoLineaMando, index: number): number {
    return item.vigente === 1 ? index + 1 : item.orden;
  }

  isProcessing(item: DtoLineaMando): boolean {
    return this.processingId() === item.idLineaMando;
  }

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
