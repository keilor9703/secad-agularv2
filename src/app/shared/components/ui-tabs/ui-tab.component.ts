import { ChangeDetectionStrategy, Component, booleanAttribute, input, signal } from '@angular/core';

@Component({
  selector: 'app-ui-tab',
  standalone: true,
  templateUrl: './ui-tab.component.html',
  styleUrl: './ui-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ui-tab-panel',
    role: 'tabpanel',
    '[class.is-active]': 'active()',
    '[attr.hidden]': 'active() ? null : ""',
    '[attr.id]': 'panelId()',
    '[attr.aria-labelledby]': 'labelledBy()',
    '[attr.tabindex]': 'active() ? "0" : "-1"',
  },
})
export class UiTabComponent {
  readonly id = input.required<string>();
  readonly label = input.required<string>();
  readonly icon = input('');
  readonly disabled = input(false, { transform: booleanAttribute });

  readonly active = signal(false);
  readonly panelId = signal('');
  readonly labelledBy = signal('');

  /**
   * Recibe del contenedor el estado accesible y visual del panel.
   */
  setPresentation(active: boolean, panelId: string, labelledBy: string): void {
    this.active.set(active);
    this.panelId.set(panelId);
    this.labelledBy.set(labelledBy);
  }
}
