import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { UiButtonComponent } from '../../../../../shared/components/ui-button/ui-button.component';
import { UiInputComponent } from '../../../../../shared/components/ui-input/ui-input.component';
import { UiSegmentedTabsComponent } from '../../../../../shared/components/ui-segmented-tabs/ui-segmented-tabs.component';
import { UiSegmentedTabItem } from '../../../../../shared/components/ui-segmented-tabs/ui-segmented-tabs.types';
import { UiSelectComponent } from '../../../../../shared/components/ui-select/ui-select.component';
import { UiTabComponent } from '../../../../../shared/components/ui-tabs/ui-tab.component';
import { UiTabsComponent } from '../../../../../shared/components/ui-tabs/ui-tabs.component';
import { UiTimePickerComponent } from '../../../../../shared/components/ui-time-picker/ui-time-picker.component';
import { UiSelectOption } from '../../../../../shared/interfaces/ui-select-option.interface';
import { getFormErrorMessage } from '../../../../../shared/utils/form-error.util';

interface TabsProfileForm {
  nombres: FormControl<string>;
  identificacion: FormControl<string>;
  correo: FormControl<string>;
  horaContacto: FormControl<string>;
  rol: FormControl<number | null>;
  observaciones: FormControl<string>;
}

@Component({
  selector: 'app-tabs-demo',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    UiButtonComponent,
    UiInputComponent,
    UiSegmentedTabsComponent,
    UiSelectComponent,
    UiTabComponent,
    UiTabsComponent,
    UiTimePickerComponent,
  ],
  templateUrl: './tabs-demo.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './tabs-demo.component.scss',
})
export class TabsDemoComponent {
  readonly savedProfile = signal('');
  readonly segmentedActive = signal('active');
  readonly segmentedItems: readonly UiSegmentedTabItem[] = [
    {
      id: 'active',
      label: 'Activos',
      description: 'Estructura visible',
      icon: 'fa-solid fa-user-shield',
      badge: 4,
      tone: 'info',
    },
    {
      id: 'inactive',
      label: 'Inactivos',
      description: 'Histórico administrable',
      icon: 'fa-solid fa-user-clock',
      badge: 11,
      tone: 'neutral',
    },
  ];

  readonly roleOptions: UiSelectOption<number>[] = [
    { label: 'Administrador', value: 1 },
    { label: 'Coordinador', value: 2 },
    { label: 'Consulta', value: 3 },
  ];

  /**
   * Formulario utilizado únicamente por la demostración de tabs contenidos.
   * Cada tab agrupa una responsabilidad diferente del mismo formulario.
   */
  readonly profileForm = new FormGroup<TabsProfileForm>({
    nombres: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    identificacion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[0-9]{6,12}$/)],
    }),
    correo: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    horaContacto: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    rol: new FormControl<number | null>(null, [Validators.required]),
    observaciones: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(250)],
    }),
  });

  /**
   * Valida todos los tabs antes de generar el resumen del formulario.
   */
  saveProfile(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.savedProfile.set(JSON.stringify(this.profileForm.getRawValue(), null, 2));
  }

  /**
   * Restablece el formulario proyectado en los tabs.
   */
  resetProfile(): void {
    this.profileForm.reset({
      nombres: '',
      identificacion: '',
      correo: '',
      horaContacto: '',
      rol: null,
      observaciones: '',
    });
    this.savedProfile.set('');
  }

  /**
   * Centraliza los mensajes para no acoplar validaciones al template.
   */
  error(controlName: keyof TabsProfileForm): string {
    return getFormErrorMessage(this.profileForm.controls[controlName]);
  }
}
