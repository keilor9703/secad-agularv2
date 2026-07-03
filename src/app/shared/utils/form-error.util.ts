import { AbstractControl, ValidationErrors } from '@angular/forms';

export function getFormErrorMessage(control: AbstractControl | null): string {
  if (!control || (!control.touched && !control.dirty) || !control.errors) {
    return '';
  }

  const errors: ValidationErrors = control.errors;

  if (errors['required']) return 'Este campo es obligatorio.';
  if (errors['email']) return 'Ingrese un correo válido.';
  if (errors['minlength'])
    return `Debe tener mínimo ${errors['minlength'].requiredLength} caracteres.`;
  if (errors['maxlength'])
    return `Debe tener máximo ${errors['maxlength'].requiredLength} caracteres.`;
  if (errors['pattern']) return 'El formato ingresado no es válido.';
  if (errors['min']) return `El valor mínimo permitido es ${errors['min'].min}.`;
  if (errors['max']) return `El valor máximo permitido es ${errors['max'].max}.`;

  return 'Campo inválido.';
}
