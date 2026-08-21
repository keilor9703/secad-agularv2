/** Posición preferida; el overlay prueba alternativas si no existe espacio. */
export type UiTooltipPosition = 'top' | 'right' | 'bottom' | 'left';

/** Alineación del contenido respecto al eje secundario del elemento origen. */
export type UiTooltipAlign = 'start' | 'center' | 'end';

/** Tratamientos visuales disponibles sin acoplar colores a una pantalla. */
export type UiTooltipVariant =
  | 'light'
  | 'dark'
  | 'institutional'
  | 'success'
  | 'warning'
  | 'danger';

export type UiTooltipSize = 'sm' | 'md';
