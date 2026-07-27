import { Directive, computed, input } from '@angular/core';

import { UiFormControlSize } from '../models/ui-form-control-size.model';

/**
 * Traduce una única configuración responsive a variables CSS compartidas.
 * Se utiliza como hostDirective para evitar repetir la lógica en cada control.
 */
@Directive({
  selector: '[appUiFormControlSize]',
  standalone: true,
  host: {
    '[style.--form-control-height]': 'height()',
    '[style.--form-control-min-height]': 'minHeight()',
    '[style.--form-control-max-height]': 'maxHeight()',
    '[style.--form-control-width]': 'width()',
    '[style.--form-control-min-width]': 'minWidth()',
    '[style.--form-control-max-width]': 'maxWidth()',
    '[style.--form-control-mobile-height]': 'mobileHeight()',
    '[style.--form-control-mobile-min-height]': 'mobileMinHeight()',
    '[style.--form-control-mobile-max-height]': 'mobileMaxHeight()',
    '[style.--form-control-mobile-width]': 'mobileWidth()',
    '[style.--form-control-mobile-min-width]': 'mobileMinWidth()',
    '[style.--form-control-mobile-max-width]': 'mobileMaxWidth()',
  },
})
export class UiFormControlSizeDirective {
  readonly controlSize = input<UiFormControlSize | null>(null);

  readonly height = computed(() => this.cssValue(this.controlSize()?.height));
  readonly minHeight = computed(() => this.cssValue(this.controlSize()?.minHeight));
  readonly maxHeight = computed(() => this.cssValue(this.controlSize()?.maxHeight));
  readonly width = computed(() => this.cssValue(this.controlSize()?.width));
  readonly minWidth = computed(() => this.cssValue(this.controlSize()?.minWidth));
  readonly maxWidth = computed(() => this.cssValue(this.controlSize()?.maxWidth));

  readonly mobileHeight = computed(() => this.cssValue(this.controlSize()?.mobile?.height));
  readonly mobileMinHeight = computed(() => this.cssValue(this.controlSize()?.mobile?.minHeight));
  readonly mobileMaxHeight = computed(() => this.cssValue(this.controlSize()?.mobile?.maxHeight));
  readonly mobileWidth = computed(() => this.cssValue(this.controlSize()?.mobile?.width));
  readonly mobileMinWidth = computed(() => this.cssValue(this.controlSize()?.mobile?.minWidth));
  readonly mobileMaxWidth = computed(() => this.cssValue(this.controlSize()?.mobile?.maxWidth));

  private cssValue(value: string | undefined): string | null {
    const normalizedValue = value?.trim();

    return normalizedValue ? normalizedValue : null;
  }
}
