import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  numberAttribute,
} from '@angular/core';

export type UiSpinnerType = 'ring' | 'dots' | 'bars' | 'pulse';
export type UiSpinnerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type UiSpinnerVariant =
  | 'primary'
  | 'info'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'neutral';
export type UiSpinnerLayout = 'stacked' | 'inline';
export type UiSpinnerAriaLive = 'off' | 'polite' | 'assertive';

@Component({
  selector: 'app-ui-spinner',
  standalone: true,
  templateUrl: './ui-spinner.component.html',
  styleUrl: './ui-spinner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.ui-spinner-host--overlay]': 'overlay()',
  },
})
export class UiSpinnerComponent {
  /** Tipo de animación disponible para el indicador. */
  readonly type = input<UiSpinnerType>('ring');

  /** Escala visual predefinida: xs, sm, md, lg o xl. */
  readonly size = input<UiSpinnerSize>('md');

  /** Variante semántica basada en los colores del sistema. */
  readonly variant = input<UiSpinnerVariant>('primary');

  /** Distribución del indicador y su mensaje. */
  readonly layout = input<UiSpinnerLayout>('stacked');

  /** Mensaje visible y nombre accesible predeterminado. */
  readonly label = input('Cargando...');

  /** Nombre accesible alternativo cuando no debe coincidir con el texto visible. */
  readonly ariaLabel = input('');

  /** Canal ARIA utilizado para anunciar cambios de carga. */
  readonly ariaLive = input<UiSpinnerAriaLive>('polite');

  /** Permite ocultar visualmente el mensaje sin perder accesibilidad. */
  readonly showLabel = input(true, { transform: booleanAttribute });

  /** Agrega una superficie delimitada para estados vacíos o zonas independientes. */
  readonly contained = input(false, { transform: booleanAttribute });

  /** Ocupa el contenedor relativo más cercano sin bloquear la API del consumidor. */
  readonly overlay = input(false, { transform: booleanAttribute });

  /** Aplica desenfoque y fondo translúcido cuando se utiliza como overlay. */
  readonly backdrop = input(true, { transform: booleanAttribute });

  /** Sobrescribe la variante con cualquier color CSS válido. */
  readonly color = input('');

  /** Duración de una vuelta o ciclo en milisegundos. */
  readonly speed = input(900, { transform: numberAttribute });

  /** Grosor del spinner circular en píxeles. */
  readonly thickness = input(3, { transform: numberAttribute });

  protected readonly dotItems = [0, 1, 2] as const;
  protected readonly barItems = [0, 1, 2, 3, 4] as const;

  protected readonly accessibleLabel = computed(
    () => this.ariaLabel().trim() || this.label().trim() || 'Contenido en carga',
  );

  protected readonly animationDuration = computed(
    () => `${this.clamp(this.speed(), 400, 3000, 900)}ms`,
  );

  protected readonly borderWidth = computed(() => `${this.clamp(this.thickness(), 1, 8, 3)}px`);

  private clamp(value: number, minimum: number, maximum: number, fallback: number): number {
    const normalizedValue = Number.isFinite(value) ? value : fallback;
    return Math.min(Math.max(normalizedValue, minimum), maximum);
  }
}
