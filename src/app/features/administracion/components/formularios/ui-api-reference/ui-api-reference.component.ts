import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { UiBadgeComponent } from '../../../../../shared/components/ui-badge/ui-badge.component';
import { UiSectionHeaderComponent } from '../../../../../shared/components/ui-section-header/ui-section-header.component';
import { UI_API_CATEGORIES, UI_API_COMPONENTS } from './ui-api-reference.data';
import { UiApiCategoryId, UiApiComponentDoc } from './ui-api-reference.model';

@Component({
  selector: 'app-ui-api-reference',
  standalone: true,
  imports: [UiBadgeComponent, UiSectionHeaderComponent],
  templateUrl: './ui-api-reference.component.html',
  styleUrl: './ui-api-reference.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiApiReferenceComponent {
  private readonly documentRef = inject(DOCUMENT);

  readonly categories = UI_API_CATEGORIES;
  readonly totalComponents = UI_API_COMPONENTS.length;
  readonly activeCategory = signal<UiApiCategoryId>('forms');
  readonly copiedSelector = signal('');

  readonly activeCategoryDoc = computed(
    () =>
      this.categories.find((category) => category.id === this.activeCategory()) ??
      this.categories[0],
  );

  readonly activeComponents = computed(() =>
    UI_API_COMPONENTS.filter((component) => component.category === this.activeCategory()),
  );

  /** Cambia la familia visible sin destruir el resto de ejemplos de la página. */
  selectCategory(category: UiApiCategoryId): void {
    this.activeCategory.set(category);
    this.copiedSelector.set('');
  }

  /** Devuelve la cantidad documentada para el indicador de cada categoría. */
  categoryCount(category: UiApiCategoryId): number {
    return UI_API_COMPONENTS.filter((component) => component.category === category).length;
  }

  /** Copia el ejemplo exacto del componente y confirma temporalmente la operación. */
  async copyExample(component: UiApiComponentDoc): Promise<void> {
    const clipboard = this.documentRef.defaultView?.navigator.clipboard;

    if (!clipboard) {
      return;
    }

    await clipboard.writeText(component.example);
    this.copiedSelector.set(component.selector);

    this.documentRef.defaultView?.setTimeout(() => {
      if (this.copiedSelector() === component.selector) {
        this.copiedSelector.set('');
      }
    }, 1800);
  }
}
