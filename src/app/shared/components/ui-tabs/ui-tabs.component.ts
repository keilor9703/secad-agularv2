import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  booleanAttribute,
  computed,
  contentChildren,
  effect,
  input,
  model,
  output,
  viewChildren,
} from '@angular/core';
import { UiTabComponent } from './ui-tab.component';
import { UiTabSelectionChange, UiTabsSize, UiTabsVariant } from './ui-tabs.types';

let nextTabsId = 0;

@Component({
  selector: 'app-ui-tabs',
  standalone: true,
  templateUrl: './ui-tabs.component.html',
  styleUrl: './ui-tabs.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiTabsComponent {
  readonly variant = input<UiTabsVariant>('contained');
  readonly size = input<UiTabsSize>('md');
  readonly ariaLabel = input('Secciones');
  readonly tabsId = input('');
  readonly stretch = input(false, { transform: booleanAttribute });
  readonly showPanel = input(true, { transform: booleanAttribute });

  /**
   * Controla la línea institucional del panel.
   * true: muestra la línea azul en el lateral izquierdo.
   * false: conserva el panel sin línea de acento.
   */
  readonly showPanelAccent = input(true, { transform: booleanAttribute });

  readonly activeTabId = model('');
  readonly selectionChange = output<UiTabSelectionChange>();

  readonly tabs = contentChildren(UiTabComponent);
  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');
  private readonly generatedTabsId = `ui-tabs-${++nextTabsId}`;

  readonly resolvedTabsId = computed(() => this.tabsId().trim() || this.generatedTabsId);
  readonly activeTab = computed(() => {
    const enabledTabs = this.tabs().filter((tab) => !tab.disabled());

    return enabledTabs.find((tab) => tab.id() === this.activeTabId()) ?? enabledTabs.at(0) ?? null;
  });
  readonly classes = computed(() => {
    const classNames = ['ui-tabs', `ui-tabs--${this.variant()}`, `ui-tabs--${this.size()}`];

    if (this.stretch()) {
      classNames.push('is-stretched');
    }

    if (!this.showPanel()) {
      classNames.push('without-panel');
    }

    if (this.showPanelAccent()) {
      classNames.push('with-panel-accent');
    }

    return classNames.join(' ');
  });

  /**
   * Mantiene sincronizado cada panel proyectado con el tab activo.
   * Los formularios permanecen instanciados y conservan su estado.
   */
  private readonly syncTabPresentation = effect(() => {
    const activeTab = this.activeTab();
    const showPanel = this.showPanel();

    for (const tab of this.tabs()) {
      tab.setPresentation(
        showPanel && tab === activeTab,
        this.tabPanelId(tab),
        this.tabButtonId(tab),
      );
    }
  });

  selectTab(tab: UiTabComponent): void {
    if (tab.disabled() || this.isActive(tab)) {
      return;
    }

    this.activateTab(tab);
  }

  handleTabKeydown(event: KeyboardEvent, currentTab: UiTabComponent): void {
    const enabledTabs = this.tabs().filter((tab) => !tab.disabled());
    const currentIndex = enabledTabs.indexOf(currentTab);
    let targetTab: UiTabComponent | undefined;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        targetTab = enabledTabs[(currentIndex + 1) % enabledTabs.length];
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        targetTab = enabledTabs[(currentIndex - 1 + enabledTabs.length) % enabledTabs.length];
        break;
      case 'Home':
        targetTab = enabledTabs.at(0);
        break;
      case 'End':
        targetTab = enabledTabs.at(-1);
        break;
      default:
        return;
    }

    event.preventDefault();

    if (targetTab) {
      this.activateTab(targetTab);
      this.focusTab(targetTab);
    }
  }

  isActive(tab: UiTabComponent): boolean {
    return this.activeTab() === tab;
  }

  tabButtonId(tab: UiTabComponent): string {
    return `${this.resolvedTabsId()}-tab-${tab.id()}`;
  }

  tabPanelId(tab: UiTabComponent): string {
    return `${this.resolvedTabsId()}-panel-${tab.id()}`;
  }

  private activateTab(tab: UiTabComponent): void {
    const index = this.tabs().indexOf(tab);

    this.activeTabId.set(tab.id());
    this.selectionChange.emit({
      id: tab.id(),
      label: tab.label(),
      index,
    });
  }

  private focusTab(tab: UiTabComponent): void {
    const tabIndex = this.tabs().indexOf(tab);
    const button = this.tabButtons().at(tabIndex);

    button?.nativeElement.focus();
  }
}
