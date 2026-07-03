import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { ToastService } from '../../../../core/services/toast.service';
import { FuncionariosTableDemoComponent } from '../../components/funcionarios-table-demo/funcionarios-table-demo.component';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiInputComponent } from '../../../../shared/components/ui-input/ui-input.component';
import { UiSearchInputComponent } from '../../../../shared/components/ui-search-input/ui-search-input.component';
import { UiSelectComponent } from '../../../../shared/components/ui-select/ui-select.component';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';
import { getFormErrorMessage } from '../../../../shared/utils/form-error.util';

interface FormulariosDemoForm {
  nombres: FormControl<string>;
  telefono: FormControl<string>;
  correo: FormControl<string>;
  unidad: FormControl<number | null>;
  ciudad: FormControl<number | null>;
  fechaNacimiento: FormControl<string>;
  horaInicio: FormControl<string>;
  fechaHoraCita: FormControl<string>;
  observacion: FormControl<string>;
  criterioBusqueda: FormControl<string>;
}

@Component({
  selector: 'app-formularios',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    UiButtonComponent,
    UiInputComponent,
    UiSearchInputComponent,
    UiSelectComponent,
    FuncionariosTableDemoComponent,
  ],
  templateUrl: './formularios-page.component.html',
  styleUrls: ['./formularios-page.component.scss'],
})
export class FormulariosPageComponent {
  private readonly toast = inject(ToastService);

  visible = true;
  minimized = false;
  submittedJson = '';

  readonly unidadOptions: UiSelectOption<number>[] = [
    { label: 'Dirección Administrativa', value: 1 },
    { label: 'Talento Humano', value: 2 },
    { label: 'Sistemas', value: 3 },
  ];

  readonly ciudadOptions: UiSelectOption<number>[] = [
    { label: 'Bogotá', value: 1 },
    { label: 'Medellín', value: 2 },
    { label: 'Cali', value: 3 },
  ];

  readonly formularioDemo = new FormGroup<FormulariosDemoForm>({
    nombres: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    telefono: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[0-9]{10}$/)],
    }),
    correo: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    unidad: new FormControl<number | null>(null, [Validators.required]),
    ciudad: new FormControl<number | null>(null, [Validators.required]),
    fechaNacimiento: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    horaInicio: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    fechaHoraCita: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    observacion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(500)],
    }),
    criterioBusqueda: new FormControl('', { nonNullable: true }),
  });

  toggleMinimize(): void {
    this.minimized = !this.minimized;
  }

  closePanel(): void {
    this.visible = false;
  }

  guardar(): void {
    if (this.formularioDemo.invalid) {
      this.formularioDemo.markAllAsTouched();
      this.toast.warning('Formulario', 'Revisa los campos obligatorios.');
      return;
    }

    const value = this.formularioDemo.getRawValue();
    this.submittedJson = JSON.stringify(value, null, 2);
    console.log(value);
    this.toast.success('Formulario', 'Formulario válido.');
  }

  limpiar(): void {
    this.formularioDemo.reset({
      nombres: '',
      telefono: '',
      correo: '',
      unidad: null,
      ciudad: null,
      fechaNacimiento: '',
      horaInicio: '',
      fechaHoraCita: '',
      observacion: '',
      criterioBusqueda: '',
    });

    this.submittedJson = '';
  }

  cancelar(): void {
    this.toast.info('Formulario', 'Acción cancelada.');
  }

  buscar(valor: string): void {
    this.toast.info('Buscar', valor ? `Buscando: ${valor}` : 'Digite un criterio de búsqueda.');
  }

  error(controlName: keyof FormulariosDemoForm): string {
    return getFormErrorMessage(this.formularioDemo.controls[controlName]);
  }
}
