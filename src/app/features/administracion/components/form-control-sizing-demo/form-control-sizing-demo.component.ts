import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { UiDateTimePickerComponent } from '../../../../shared/components/ui-date-time-picker/ui-date-time-picker.component';
import { UiInputComponent } from '../../../../shared/components/ui-input/ui-input.component';
import { UiSearchInputComponent } from '../../../../shared/components/ui-search-input/ui-search-input.component';
import { UiSelectComponent } from '../../../../shared/components/ui-select/ui-select.component';
import { UiTimePickerComponent } from '../../../../shared/components/ui-time-picker/ui-time-picker.component';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';
import { UiFormControlSize } from '../../../../shared/models/ui-form-control-size.model';

interface FormControlSizingDemoForm {
  nombre: FormControl<string>;
  unidad: FormControl<number | null>;
  fecha: FormControl<string>;
  hora: FormControl<string>;
  busqueda: FormControl<string>;
}

@Component({
  selector: 'app-form-control-sizing-demo',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    UiDateTimePickerComponent,
    UiInputComponent,
    UiSearchInputComponent,
    UiSelectComponent,
    UiTimePickerComponent,
  ],
  templateUrl: './form-control-sizing-demo.component.html',
  styleUrl: './form-control-sizing-demo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormControlSizingDemoComponent {
  /**
   * Ejemplo por instancia. La altura preferida de 48px queda limitada entre
   * 40px y 50px; en móvil cambia de forma independiente.
   */
  readonly compactControlSize: UiFormControlSize = {
    // Pantalla normal
    height: '35px',
    minHeight: '30px',
    maxHeight: '38px',
    width: '360px',
    minWidth: '220px',
    maxWidth: '100%',
    // Pantalla móvil
    mobile: {
      height: '40px',
      minHeight: '36px',
      maxHeight: '44px',
      width: '100%',
      minWidth: '0px',
      maxWidth: '100%',
    },
  };

  readonly unidadOptions: UiSelectOption<number>[] = [
    { label: 'Administrativa', value: 1 },
    { label: 'Talento Humano', value: 2 },
    { label: 'Tecnologías de la información', value: 3 },
  ];

  readonly demoForm = new FormGroup<FormControlSizingDemoForm>({
    nombre: new FormControl('', { nonNullable: true }),
    unidad: new FormControl<number | null>(null),
    fecha: new FormControl('', { nonNullable: true }),
    hora: new FormControl('', { nonNullable: true }),
    busqueda: new FormControl('', { nonNullable: true }),
  });

  readonly typescriptExample = `readonly controlSize: UiFormControlSize = {
    height: '48px',
    minHeight: '40px',
    maxHeight: '50px',
    width: '360px',
    minWidth: '220px',
    maxWidth: '100%',
  mobile: {
      height: '40px',
      minHeight: '36px',
      maxHeight: '44px',
      width: '100%',
      minWidth: '0px',
      maxWidth: '100%',
    },
};`;

  readonly htmlExample = `<app-ui-input
  formControlName="nombre"
  label="Nombre"
  [controlSize]="controlSize"
/>

<!-- La misma entrada funciona en ui-select, ui-date-time-picker,
     ui-time-picker y ui-search-input. -->`;

  readonly cssExample = `.mi-formulario {
  --form-control-height: 46px;
  --form-control-min-height: 38px;
  --form-control-max-height: 50px;
  --form-control-width: 100%;
  --form-control-max-width: 520px;

  --form-control-mobile-height: 40px;
  --form-control-mobile-min-height: 36px;
  --form-control-mobile-max-height: 44px;
  --form-control-mobile-width: 100%;
  --form-control-mobile-max-width: 100%;
}`;
}
