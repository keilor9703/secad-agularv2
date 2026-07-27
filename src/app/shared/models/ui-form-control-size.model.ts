/**
 * Dimensiones CSS aceptadas por un control de formulario.
 *
 * La altura y el ancho preferidos siempre quedan limitados por sus valores
 * mínimos y máximos mediante CSS clamp().
 */
export interface UiFormControlDimensions {
  readonly height?: string;
  readonly minHeight?: string;
  readonly maxHeight?: string;
  readonly width?: string;
  readonly minWidth?: string;
  readonly maxWidth?: string;
}

/**
 * Configuración responsive común para inputs, selects y selectores de fecha/hora.
 */
export interface UiFormControlSize extends UiFormControlDimensions {
  readonly mobile?: UiFormControlDimensions;
}
