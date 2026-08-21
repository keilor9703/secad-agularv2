import { AbstractControl, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';

import { isKnownAppRoute } from '../../../../core/navigation/app-route-catalog';
import { MenuDestinationType } from '../../../../core/navigation/menu-destination';

const SAFE_EXTERNAL_URL = /^(https?:\/\/|www\.)[^\s]+$/i;
const SAFE_PDF_RESOURCE =
  /^(?:(?:https?:\/\/|www\.)[^\s]+|\/?(?:assets|documentos)\/[^\s]+\.pdf(?:[?#].*)?)$/i;

export function menuDetailValidators(type: MenuDestinationType): ValidatorFn[] {
  if (type === 'S') {
    return [
      Validators.maxLength(500),
      (control: AbstractControl): ValidationErrors | null => {
        const value = String(control.value ?? '').trim();
        return !value || isKnownAppRoute(value) ? null : { unknownInternalRoute: true };
      },
    ];
  }

  const destinationValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '').trim();

    if (type === 'frm') {
      return isKnownAppRoute(value) ? null : { unknownInternalRoute: true };
    }

    if (type === 'url') {
      return SAFE_EXTERNAL_URL.test(value) ? null : { unsafeExternalUrl: true };
    }

    return SAFE_PDF_RESOURCE.test(value) ? null : { invalidPdfResource: true };
  };

  return [Validators.required, Validators.maxLength(500), destinationValidator];
}

export function menuDetailError(control: AbstractControl): string {
  if (control.hasError('unknownInternalRoute')) {
    return 'Seleccione una ruta Angular registrada en el catálogo.';
  }
  if (control.hasError('unsafeExternalUrl')) {
    return 'Ingrese una URL completa que comience por https://, http:// o www.';
  }
  if (control.hasError('invalidPdfResource')) {
    return 'Use una URL segura o una ruta PDF dentro de /assets o /documentos.';
  }
  return '';
}
