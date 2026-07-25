import type { SweetAlertIcon } from 'sweetalert2';

export type AlertIntent = 'primary' | 'danger';

/**
 * Contrato estable de la aplicación. Los consumidores no dependen de la
 * configuración interna de SweetAlert2.
 */
export interface AlertOptions {
  readonly title: string;
  readonly message?: string;
  readonly icon?: SweetAlertIcon;
  readonly confirmText?: string;
  readonly allowOutsideClick?: boolean;
  readonly allowEscapeKey?: boolean;
}

export interface ConfirmAlertOptions extends AlertOptions {
  readonly cancelText?: string;
  readonly intent?: AlertIntent;
  readonly focusCancel?: boolean;
}
