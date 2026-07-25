/**
 * Contrato de cada destino mostrado en la navegación inferior móvil.
 * Mantener esta configuración tipada evita mezclar rutas y presentación en el HTML.
 */
export interface MobileBottomNavItem {
  readonly id: 'home' | 'future' | 'settings';
  readonly label: string;
  readonly icon: string;
  readonly route: string | null;
  readonly exact?: boolean;
  readonly disabled?: boolean;
}
