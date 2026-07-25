import { Injectable, inject } from '@angular/core';
import { SweetAlert2LoaderService } from '@sweetalert2/ngx-sweetalert2';
import type { SweetAlertIcon, SweetAlertOptions, SweetAlertResult } from 'sweetalert2';

import { AlertOptions, ConfirmAlertOptions } from '../models/alert-options.model';

const DEFAULT_CONFIRM_TEXT = 'Aceptar';
const DEFAULT_CANCEL_TEXT = 'Cancelar';

@Injectable({
  providedIn: 'root',
})
export class AlertService {
  private readonly sweetAlertLoader = inject(SweetAlert2LoaderService);

  /**
   * Muestra un mensaje informativo estandarizado.
   */
  show(options: AlertOptions): Promise<SweetAlertResult>;
  show(title: string, message: string, icon?: SweetAlertIcon): Promise<SweetAlertResult>;
  show(
    optionsOrTitle: AlertOptions | string,
    message = '',
    icon: SweetAlertIcon = 'info',
  ): Promise<SweetAlertResult> {
    const options = this.normalizeAlertOptions(optionsOrTitle, message, icon);

    return this.fire({
      ...this.baseOptions(options),
      icon: options.icon ?? 'info',
      confirmButtonText: options.confirmText ?? DEFAULT_CONFIRM_TEXT,
      customClass: {
        ...this.baseCustomClasses(),
        confirmButton: 'app-alert__button app-alert__button--primary',
      },
    });
  }

  success(
    title: string,
    message: string,
    confirmText = DEFAULT_CONFIRM_TEXT,
  ): Promise<SweetAlertResult> {
    return this.show({ title, message, confirmText, icon: 'success' });
  }

  info(
    title: string,
    message: string,
    confirmText = DEFAULT_CONFIRM_TEXT,
  ): Promise<SweetAlertResult> {
    return this.show({ title, message, confirmText, icon: 'info' });
  }

  warning(
    title: string,
    message: string,
    confirmText = DEFAULT_CONFIRM_TEXT,
  ): Promise<SweetAlertResult> {
    return this.show({ title, message, confirmText, icon: 'warning' });
  }

  error(
    title: string,
    message: string,
    confirmText = DEFAULT_CONFIRM_TEXT,
  ): Promise<SweetAlertResult> {
    return this.show({ title, message, confirmText, icon: 'error' });
  }

  /**
   * Solicita confirmación y devuelve solamente la decisión del usuario.
   */
  confirm(options: ConfirmAlertOptions): Promise<boolean>;
  confirm(title: string, message: string, confirmText?: string): Promise<boolean>;
  async confirm(
    optionsOrTitle: ConfirmAlertOptions | string,
    message = '',
    confirmText = 'Confirmar',
  ): Promise<boolean> {
    const options = this.normalizeConfirmOptions(optionsOrTitle, message, confirmText);
    const result = await this.fire({
      ...this.baseOptions(options),
      icon: options.icon ?? 'warning',
      showCancelButton: true,
      confirmButtonText: options.confirmText ?? 'Confirmar',
      cancelButtonText: options.cancelText ?? DEFAULT_CANCEL_TEXT,
      reverseButtons: true,
      focusCancel: options.focusCancel ?? true,
      customClass: {
        ...this.baseCustomClasses(),
        actions: 'app-alert__actions',
        confirmButton:
          options.intent === 'danger'
            ? 'app-alert__button app-alert__button--danger'
            : 'app-alert__button app-alert__button--primary',
        cancelButton: 'app-alert__button app-alert__button--secondary',
      },
    });

    return result.isConfirmed;
  }

  /**
   * Atajo semántico para operaciones destructivas.
   */
  confirmDelete(title: string, message: string, confirmText = 'Sí, eliminar'): Promise<boolean> {
    return this.confirm({
      title,
      message,
      confirmText,
      icon: 'warning',
      intent: 'danger',
      focusCancel: true,
    });
  }

  private async fire(options: SweetAlertOptions) {
    const SweetAlert = await this.sweetAlertLoader.swal;

    return SweetAlert.fire(options);
  }

  private baseOptions(options: AlertOptions): SweetAlertOptions {
    return {
      titleText: options.title,
      text: options.message ?? '',
      allowOutsideClick: options.allowOutsideClick ?? false,
      allowEscapeKey: options.allowEscapeKey ?? true,
      buttonsStyling: false,
      heightAuto: false,
      returnFocus: true,
      scrollbarPadding: false,
      customClass: this.baseCustomClasses(),
    };
  }

  private baseCustomClasses(): NonNullable<SweetAlertOptions['customClass']> {
    return {
      container: 'app-alert-layer',
      popup: 'app-alert',
      icon: 'app-alert__icon',
      title: 'app-alert__title',
      htmlContainer: 'app-alert__message',
    };
  }

  private normalizeAlertOptions(
    optionsOrTitle: AlertOptions | string,
    message: string,
    icon: SweetAlertIcon,
  ): AlertOptions {
    if (typeof optionsOrTitle !== 'string') {
      return optionsOrTitle;
    }

    return {
      title: optionsOrTitle,
      message,
      icon,
    };
  }

  private normalizeConfirmOptions(
    optionsOrTitle: ConfirmAlertOptions | string,
    message: string,
    confirmText: string,
  ): ConfirmAlertOptions {
    if (typeof optionsOrTitle !== 'string') {
      return optionsOrTitle;
    }

    return {
      title: optionsOrTitle,
      message,
      confirmText,
      icon: 'warning',
      intent: 'danger',
    };
  }
}
