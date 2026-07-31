import { JsonPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastService } from '../../../../core/services/toast.service';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiDateTimePickerComponent } from '../../../../shared/components/ui-date-time-picker/ui-date-time-picker.component';
import { UiInputComponent } from '../../../../shared/components/ui-input/ui-input.component';
import { UiModalComponent } from '../../../../shared/components/ui-modal/ui-modal.component';
import { UiSearchInputComponent } from '../../../../shared/components/ui-search-input/ui-search-input.component';
import { UiSelectComponent } from '../../../../shared/components/ui-select/ui-select.component';
import { UiTimePickerComponent } from '../../../../shared/components/ui-time-picker/ui-time-picker.component';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';
import { getFormErrorMessage } from '../../../../shared/utils/form-error.util';
import { ButtonSearchDemoComponent } from '../../components/formularios/button-search-demo/button-search-demo.component';
import { FormControlSizingDemoComponent } from '../../components/formularios/form-control-sizing-demo/form-control-sizing-demo.component';
import { FuncionariosTableDemoComponent } from '../../components/formularios/funcionarios-table-demo/funcionarios-table-demo.component';
import { NotificacionesDemoComponent } from '../../components/formularios/notificaciones-demo/notificaciones-demo.component';
import { SpinnerDemoComponent } from '../../components/formularios/spinner-demo/spinner-demo.component';
import { StatusComponentsDemoComponent } from '../../components/formularios/status-components-demo/status-components-demo.component';
import { TableVariantsDemoComponent } from '../../components/formularios/table-variants-demo/table-variants-demo.component';
import { TabsDemoComponent } from '../../components/formularios/tabs-demo/tabs-demo.component';

interface FormulariosDemoForm {
  nombres: FormControl<string>;
  telefono: FormControl<string>;
  correo: FormControl<string>;
  unidad: FormControl<number | null>;
  ciudad: FormControl<number | null>;
  fechaNacimiento: FormControl<string>;
  horaInicio: FormControl<string>;
  fechaHoraCita: FormControl<string>;
  horaAmPm: FormControl<string>;
  hora24Horas: FormControl<string>;
  observacion: FormControl<string>;
  criterioBusqueda: FormControl<string>;
}

interface ModalActividadForm {
  actividad: FormControl<string>;
  unidadResponsable: FormControl<number | null>;
  fechaProgramada: FormControl<string>;
  observaciones: FormControl<string>;
}

@Component({
  selector: 'app-formularios',
  standalone: true,
  imports: [
    JsonPipe,
    ReactiveFormsModule,
    UiButtonComponent,
    UiDateTimePickerComponent,
    UiInputComponent,
    UiModalComponent,
    UiSearchInputComponent,
    UiSelectComponent,
    UiTimePickerComponent,
    ButtonSearchDemoComponent,
    FormControlSizingDemoComponent,
    FuncionariosTableDemoComponent,
    NotificacionesDemoComponent,
    SpinnerDemoComponent,
    StatusComponentsDemoComponent,
    TableVariantsDemoComponent,
    TabsDemoComponent,
  ],
  templateUrl: './formularios-page.component.html',
  styleUrl: './formularios-page.component.scss',
})
export class FormulariosPageComponent {
  private readonly toast = inject(ToastService);

  readonly visible = signal(true);
  readonly minimized = signal(false);
  readonly modalOpen = signal(false);
  readonly submittedJson = signal('');
  /**
   * Variable consumidora de ejemplo:
   * cambia únicamente la visibilidad del asterisco en los controles requeridos.
   */
  readonly showRequiredMarkers = signal(true);
  readonly today = new Date();

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
    horaAmPm: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    hora24Horas: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    observacion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(500)],
    }),
    criterioBusqueda: new FormControl('', { nonNullable: true }),
  });

  readonly modalActividadForm = new FormGroup<ModalActividadForm>({
    actividad: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    unidadResponsable: new FormControl<number | null>(null, [Validators.required]),
    fechaProgramada: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    observaciones: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(300)],
    }),
  });

  /**
   * Alterna el estado minimizado del panel de demostración.
   */
  toggleMinimize(): void {
    this.minimized.update((value) => !value);
  }

  /**
   * Oculta el panel principal de formularios.
   */
  closePanel(): void {
    this.visible.set(false);
  }

  /**
   * Valida y serializa el formulario de demostración.
   */
  guardar(): void {
    if (this.formularioDemo.invalid) {
      this.formularioDemo.markAllAsTouched();
      this.toast.warning('Formulario', 'Revisa los campos obligatorios.');
      return;
    }

    const value = this.formularioDemo.getRawValue();

    this.submittedJson.set(JSON.stringify(value, null, 2));
    console.log(value);
    this.toast.success('Formulario', 'Formulario válido.');
  }

  /**
   * Restablece todos los controles y limpia el JSON generado.
   */
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
      horaAmPm: '',
      hora24Horas: '',
      observacion: '',
      criterioBusqueda: '',
    });

    this.submittedJson.set('');
  }

  /**
   * Demuestra que el asterisco se puede ocultar sin eliminar Validators.required.
   */
  updateRequiredMarkerVisibility(event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    this.showRequiredMarkers.set(checkbox.checked);
  }

  /**
   * Notifica la cancelación de la acción actual.
   */
  cancelar(): void {
    this.toast.info('Formulario', 'Acción cancelada.');
  }

  /**
   * Ejecuta la búsqueda simulada del componente compartido.
   */
  buscar(valor: string): void {
    const message = valor ? `Buscando: ${valor}` : 'Digite un criterio de búsqueda.';
    this.toast.info('Buscar', message);
  }

  /**
   * Abre la demostración manteniendo el estado en la página consumidora.
   */
  abrirModal(): void {
    this.modalOpen.set(true);
  }

  /**
   * Atiende cualquier solicitud de cierre emitida por el modal.
   */
  cerrarModal(): void {
    this.modalOpen.set(false);
  }

  /**
   * Restablece únicamente el formulario contenido en el modal.
   */
  limpiarModal(): void {
    this.modalActividadForm.reset({
      actividad: '',
      unidadResponsable: null,
      fechaProgramada: '',
      observaciones: '',
    });
  }

  /**
   * Valida la demostración, expone el resultado y cierra el modal.
   */
  guardarModal(): void {
    if (this.modalActividadForm.invalid) {
      this.modalActividadForm.markAllAsTouched();
      this.toast.warning('Actividad', 'Revisa los campos obligatorios del modal.');
      return;
    }

    const value = this.modalActividadForm.getRawValue();

    this.submittedJson.set(JSON.stringify(value, null, 2));
    this.toast.success('Actividad', 'La actividad fue programada correctamente.');
    this.modalOpen.set(false);
  }

  /**
   * Obtiene el mensaje de validación visible de un control.
   */
  error(controlName: keyof FormulariosDemoForm): string {
    return getFormErrorMessage(this.formularioDemo.controls[controlName]);
  }

  /**
   * Obtiene los mensajes de validación del formulario proyectado en el modal.
   */
  modalError(controlName: keyof ModalActividadForm): string {
    return getFormErrorMessage(this.modalActividadForm.controls[controlName]);
  }
}
