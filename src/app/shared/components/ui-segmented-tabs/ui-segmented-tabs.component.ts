import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  booleanAttribute,
  computed,
  input,
  model,
  output,
  viewChildren,
} from '@angular/core';
import {
  UiSegmentedTabItem,
  UiSegmentedTabSelectionChange,
  UiSegmentedTabsSize,
} from './ui-segmented-tabs.types';

let nextSegmentedTabsId = 0;

@Component({
  selector: 'app-ui-segmented-tabs',
  standalone: true,
  templateUrl: './ui-segmented-tabs.component.html',
  styleUrl: './ui-segmented-tabs.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiSegmentedTabsComponent {
  readonly items = input.required<readonly UiSegmentedTabItem[]>();
  readonly activeId = model('');
  readonly ariaLabel = input('Secciones por estado');
  readonly tabsId = input('');
  readonly controlsId = input('');
  readonly size = input<UiSegmentedTabsSize>('md');
  readonly stretch = input(true, { transform: booleanAttribute });
  readonly showDescriptions = input(true, { transform: booleanAttribute });
  readonly hideDescriptionsOnMobile = input(true, { transform: booleanAttribute });
  readonly showBadges = input(true, { transform: booleanAttribute });

  readonly selectionChange = output<UiSegmentedTabSelectionChange>();

  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');
  private readonly generatedId = `ui-segmented-tabs-${++nextSegmentedTabsId}`;

  readonly resolvedTabsId = computed(() => this.tabsId().trim() || this.generatedId);
  readonly enabledItems = computed(() => this.items().filter((item) => !item.disabled));
  readonly resolvedActiveId = computed(
    () =>
      this.enabledItems().find((item) => item.id === this.activeId())?.id ??
      this.enabledItems().at(0)?.id ??
      '',
  );
  readonly classes = computed(() =>
    [
      'ui-segmented-tabs',
      `ui-segmented-tabs--${this.size()}`,
      this.stretch() ? 'is-stretched' : '',
      this.hideDescriptionsOnMobile() ? 'hide-description-mobile' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );

  isActive(item: UiSegmentedTabItem): boolean {
    return item.id === this.resolvedActiveId();
  }

  buttonId(item: UiSegmentedTabItem): string {
    return `${this.resolvedTabsId()}-tab-${item.id}`;
  }

  itemClasses(item: UiSegmentedTabItem): string {
    return [
      'ui-segmented-tabs__item',
      `is-${item.tone ?? 'info'}`,
      this.isActive(item) ? 'is-active' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  select(item: UiSegmentedTabItem): void {
    if (item.disabled || this.isActive(item)) {
      return;
    }

    this.activate(item);
  }

  handleKeydown(event: KeyboardEvent, item: UiSegmentedTabItem): void {
    const enabledItems = this.enabledItems();
    const currentIndex = enabledItems.indexOf(item);
    let target: UiSegmentedTabItem | undefined;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        target = enabledItems[(currentIndex + 1) % enabledItems.length];
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        target = enabledItems[(currentIndex - 1 + enabledItems.length) % enabledItems.length];
        break;
      case 'Home':
        target = enabledItems.at(0);
        break;
      case 'End':
        target = enabledItems.at(-1);
        break;
      default:
        return;
    }

    event.preventDefault();

    if (target) {
      this.activate(target);
      this.focus(target);
    }
  }

  private activate(item: UiSegmentedTabItem): void {
    const index = this.items().indexOf(item);

    this.activeId.set(item.id);
    this.selectionChange.emit({ id: item.id, index, item });
  }

  private focus(item: UiSegmentedTabItem): void {
    const index = this.items().indexOf(item);
    this.buttons().at(index)?.nativeElement.focus();
  }
}
