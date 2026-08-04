import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { UiButtonComponent } from '../../../../../shared/components/ui-button/ui-button.component';
import { UiDateTimePickerComponent } from '../../../../../shared/components/ui-date-time-picker/ui-date-time-picker.component';
import { UiInputComponent } from '../../../../../shared/components/ui-input/ui-input.component';
import { UiSelectComponent } from '../../../../../shared/components/ui-select/ui-select.component';
import { UiTimePickerComponent } from '../../../../../shared/components/ui-time-picker/ui-time-picker.component';
import { UiSelectOption } from '../../../../../shared/interfaces/ui-select-option.interface';
import { getFormErrorMessage } from '../../../../../shared/utils/form-error.util';

interface FloatingControlsDemoForm {
  repositoryName: FormControl<string>;
  owner: FormControl<string>;
  environment: FormControl<string | null>;
  description: FormControl<string>;
  releaseDate: FormControl<string>;
  executionTime: FormControl<string>;
  meetingTime: FormControl<string>;
  deploymentDateTime: FormControl<string>;
}

@Component({
  selector: 'app-floating-controls-demo',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    UiButtonComponent,
    UiDateTimePickerComponent,
    UiInputComponent,
    UiSelectComponent,
    UiTimePickerComponent,
  ],
  templateUrl: './floating-controls-demo.component.html',
  styleUrl: './floating-controls-demo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FloatingControlsDemoComponent {
  readonly validationMessage = signal('');
  readonly showRequiredMarkers = signal(true);
  readonly today = new Date();

  readonly environmentOptions: UiSelectOption<string>[] = [
    { label: 'Desarrollo', value: 'development' },
    { label: 'Pruebas', value: 'testing' },
    { label: 'Producción', value: 'production' },
  ];

  readonly demoForm = new FormGroup<FloatingControlsDemoForm>({
    repositoryName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    owner: new FormControl('Policía Nacional', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    environment: new FormControl<string | null>(null, Validators.required),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(300)],
    }),
    releaseDate: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    executionTime: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    meetingTime: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    deploymentDateTime: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  readonly basicUsage = `<app-ui-input
  formControlName="repositoryName"
  label="Nombre del repositorio"
  labelMode="floating"
  [required]="true"
  [showRequiredMarker]="showRequiredMarkers()"
  [error]="error('repositoryName')"
/>

<app-ui-input
  formControlName="description"
  label="Descripción"
  labelMode="floating"
  [multiline]="true"
  [rows]="4"
/>`;

  readonly selectionUsage = `<app-ui-select
  formControlName="environment"
  label="Entorno"
  labelMode="floating"
  [options]="environmentOptions"
  [required]="true"
/>

<app-ui-date-time-picker
  formControlName="releaseDate"
  label="Fecha de publicación"
  labelMode="floating"
  mode="date"
/>

<app-ui-time-picker
  formControlName="meetingTime"
  label="Hora de reunión"
  labelMode="floating"
  hourFormat="12"
/>`;

  readonly behaviorUsage = `// El valor predeterminado es "fixed" para no cambiar formularios existentes.
// Active "floating" solamente en los controles que requieran la animación.

labelMode="fixed"     // Etiqueta siempre sobre el borde.
labelMode="floating"  // Etiqueta interior que sube con foco o valor.

// La validación continúa perteneciendo al FormControl.
repositoryName: new FormControl('', {
  nonNullable: true,
  validators: [Validators.required],
});`;

  /** Fuerza la validación para demostrar el estado rojo de todos los controles. */
  validateExample(): void {
    this.demoForm.markAllAsTouched();

    if (this.demoForm.invalid) {
      this.validationMessage.set('Revise los campos obligatorios resaltados.');
      return;
    }

    this.validationMessage.set('El formulario demostrativo es válido.');
  }

  /** Devuelve la demostración al estado inicial para repetir la animación. */
  resetExample(): void {
    this.demoForm.reset({
      repositoryName: '',
      owner: 'Policía Nacional',
      environment: null,
      description: '',
      releaseDate: '',
      executionTime: '',
      meetingTime: '',
      deploymentDateTime: '',
    });
    this.validationMessage.set('');
  }

  /** Cambia solo el asterisco visual; Validators.required continúa activo. */
  updateRequiredMarkerVisibility(event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    this.showRequiredMarkers.set(checkbox.checked);
  }

  /** Centraliza el mensaje para que la plantilla no conozca reglas de validación. */
  error(controlName: keyof FloatingControlsDemoForm): string {
    return getFormErrorMessage(this.demoForm.controls[controlName]);
  }
}
