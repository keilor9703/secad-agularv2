import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import {
  UiSpinnerComponent,
  UiSpinnerSize,
  UiSpinnerType,
  UiSpinnerVariant,
} from '../../../../shared/components/ui-spinner/ui-spinner.component';

interface SpinnerSizeExample {
  value: UiSpinnerSize;
  label: string;
}

interface SpinnerTypeExample {
  value: UiSpinnerType;
  label: string;
  message: string;
}

interface SpinnerVariantExample {
  value: UiSpinnerVariant;
  label: string;
}

@Component({
  selector: 'app-spinner-demo',
  standalone: true,
  imports: [UiButtonComponent, UiSpinnerComponent],
  templateUrl: './spinner-demo.component.html',
  styleUrl: './spinner-demo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpinnerDemoComponent {
  readonly previewLoading = signal(true);

  readonly sizeExamples: readonly SpinnerSizeExample[] = [
    { value: 'xs', label: 'Extra pequeño' },
    { value: 'sm', label: 'Pequeño' },
    { value: 'md', label: 'Mediano' },
    { value: 'lg', label: 'Grande' },
    { value: 'xl', label: 'Extra grande' },
  ];

  readonly typeExamples: readonly SpinnerTypeExample[] = [
    { value: 'ring', label: 'Circular', message: 'Procesando solicitud...' },
    { value: 'dots', label: 'Puntos', message: 'Sincronizando datos...' },
    { value: 'bars', label: 'Barras', message: 'Validando información...' },
    { value: 'pulse', label: 'Pulso', message: 'Conectando al servicio...' },
  ];

  readonly variantExamples: readonly SpinnerVariantExample[] = [
    { value: 'primary', label: 'Principal' },
    { value: 'info', label: 'Información' },
    { value: 'accent', label: 'Acento' },
    { value: 'success', label: 'Correcto' },
    { value: 'warning', label: 'Advertencia' },
    { value: 'danger', label: 'Error' },
    { value: 'neutral', label: 'Neutral' },
  ];

  togglePreviewLoading(): void {
    this.previewLoading.update((isLoading) => !isLoading);
  }
}
