import { Directive, computed, input, numberAttribute } from '@angular/core';

/**
 * Publica una separación responsive uniforme para formularios, grids y grupos
 * de controles sin acoplarlos a una clase visual concreta.
 */
@Directive({
  selector: '[appUiFormSpacing]',
  standalone: true,
  host: {
    class: 'ui-form-spacing',
    '[style.--ui-form-row-gap]': 'rowGapCss()',
    '[style.--ui-form-column-gap]': 'columnGapCss()',
    '[style.--ui-form-mobile-row-gap]': 'mobileRowGapCss()',
    '[style.--ui-form-mobile-column-gap]': 'mobileColumnGapCss()',
    '[style.row-gap]': '"var(--_ui-form-effective-row-gap)"',
    '[style.column-gap]': '"var(--_ui-form-effective-column-gap)"',
  },
})
export class UiFormSpacingDirective {
  readonly formRowGap = input(18, { transform: numberAttribute });
  readonly formColumnGap = input(14, { transform: numberAttribute });
  readonly formMobileRowGap = input(18, { transform: numberAttribute });
  readonly formMobileColumnGap = input(10, { transform: numberAttribute });

  readonly rowGapCss = computed(() => this.toCssGap(this.formRowGap(), 18));
  readonly columnGapCss = computed(() => this.toCssGap(this.formColumnGap(), 14));
  readonly mobileRowGapCss = computed(() => this.toCssGap(this.formMobileRowGap(), 18));
  readonly mobileColumnGapCss = computed(() => this.toCssGap(this.formMobileColumnGap(), 10));

  /** Limita el espacio a una escala segura para evitar layouts rotos. */
  private toCssGap(value: number, fallback: number): string {
    const safeValue = Number.isFinite(value) ? Math.min(48, Math.max(0, value)) : fallback;
    return `${safeValue}px`;
  }
}
