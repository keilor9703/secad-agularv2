import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  model,
  numberAttribute,
} from '@angular/core';

export type UiExpansionPanelAppearance = 'card' | 'divider';
export type UiExpansionPanelDensity = 'compact' | 'comfortable';
export type UiExpansionPanelIndicator = 'plus-minus' | 'chevron' | 'custom';
export type UiExpansionPanelAccentScope = 'header' | 'panel';
export type UiExpansionPanelFrame = 'panel' | 'header' | 'none';

let nextExpansionPanelId = 0;

@Component({
  selector: 'app-ui-expansion-panel',
  standalone: true,
  templateUrl: './ui-expansion-panel.component.html',
  styleUrl: './ui-expansion-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiExpansionPanelComponent {
  readonly title = input.required<string>();
  readonly description = input('');
  readonly icon = input('');
  readonly appearance = input<UiExpansionPanelAppearance>('divider');
  readonly density = input<UiExpansionPanelDensity>('compact');
  readonly indicator = input<UiExpansionPanelIndicator>('plus-minus');
  readonly collapsedIcon = input('fa-solid fa-plus');
  readonly expandedIcon = input('fa-solid fa-minus');
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly showAccent = input(true, { transform: booleanAttribute });
  readonly accentWidth = input(4, { transform: numberAttribute });
  /** Decide si la línea acompaña solo la cabecera o toda la altura abierta. */
  readonly accentScope = input<UiExpansionPanelAccentScope>('panel');
  /** Separa el marco neutro del acento para permitir contenido completamente suelto. */
  readonly frame = input<UiExpansionPanelFrame>('panel');
  /** Separación vertical heredable por formularios o grillas proyectadas. */
  readonly contentRowGap = input(18, { transform: numberAttribute });
  /** Separación horizontal heredable cuando el contenido utiliza varias columnas. */
  readonly contentColumnGap = input(14, { transform: numberAttribute });
  readonly panelId = input(`ui-expansion-panel-${nextExpansionPanelId++}`);

  /** Permite uso autónomo con expanded o controlado con [(expanded)]. */
  readonly expanded = model(false);

  readonly headingId = computed(() => `${this.panelId()}-heading`);
  readonly contentId = computed(() => `${this.panelId()}-content`);
  readonly resolvedAccentWidth = computed(() => {
    if (!this.showAccent()) {
      return 0;
    }

    const width = this.accentWidth();
    return Number.isFinite(width) ? Math.min(8, Math.max(0, width)) : 4;
  });
  readonly resolvedContentRowGap = computed(() => this.clampSpacing(this.contentRowGap(), 18));
  readonly resolvedContentColumnGap = computed(() =>
    this.clampSpacing(this.contentColumnGap(), 14),
  );
  readonly classes = computed(() =>
    [
      'ui-expansion',
      `ui-expansion--${this.appearance()}`,
      `ui-expansion--${this.density()}`,
      `ui-expansion--indicator-${this.indicator()}`,
      `ui-expansion--accent-${this.accentScope()}`,
      `ui-expansion--frame-${this.frame()}`,
      this.resolvedAccentWidth() > 0 ? 'has-accent' : '',
      this.expanded() ? 'is-expanded' : '',
      this.disabled() ? 'is-disabled' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
  readonly indicatorIcon = computed(() => {
    if (this.indicator() === 'chevron') {
      return 'fa-solid fa-chevron-down';
    }

    if (this.indicator() === 'custom') {
      return this.expanded() ? this.expandedIcon() : this.collapsedIcon();
    }

    return this.expanded() ? 'fa-solid fa-minus' : 'fa-solid fa-plus';
  });

  /** Alterna el panel sin desmontar los controles proyectados. */
  toggle(): void {
    if (this.disabled()) {
      return;
    }

    this.expanded.update((current) => !current);
  }

  /** Abre el panel desde flujos externos como validación o navegación. */
  open(): void {
    if (!this.disabled()) {
      this.expanded.set(true);
    }
  }

  /** Cierra el panel conservando el estado de su contenido. */
  close(): void {
    if (!this.disabled()) {
      this.expanded.set(false);
    }
  }

  /** Evita separaciones negativas o excesivas que rompan la composición responsive. */
  private clampSpacing(value: number, fallback: number): number {
    return Number.isFinite(value) ? Math.min(48, Math.max(0, value)) : fallback;
  }
}
