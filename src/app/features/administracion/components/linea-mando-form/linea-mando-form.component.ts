import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { DtoLineaMandoRequest } from '../../../../core/services/linea-mando.service';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiChipComponent } from '../../../../shared/components/ui-chip/ui-chip.component';
import { UiFileUploadComponent } from '../../../../shared/components/ui-file-upload/ui-file-upload.component';
import { UiInputComponent } from '../../../../shared/components/ui-input/ui-input.component';
import { UiPanelHeaderComponent } from '../../../../shared/components/ui-panel-header/ui-panel-header.component';
import { UiSearchInputComponent } from '../../../../shared/components/ui-search-input/ui-search-input.component';
import { UiSelectComponent } from '../../../../shared/components/ui-select/ui-select.component';

const DEFAULT_PHOTO = 'imagenes/policia.jpg';
const MAX_PHOTO_SIZE = 2 * 1024 * 1024;

@Component({
  selector: 'app-linea-mando-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    UiButtonComponent,
    UiChipComponent,
    UiFileUploadComponent,
    UiInputComponent,
    UiPanelHeaderComponent,
    UiSearchInputComponent,
    UiSelectComponent,
  ],
  templateUrl: './linea-mando-form.component.html',
  styleUrl: './linea-mando-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LineaMandoFormComponent {
  private readonly formBuilder = inject(FormBuilder);

  readonly value = input<DtoLineaMandoRequest | null>(null);
  readonly editing = input(false);
  readonly searching = input(false);
  readonly saving = input(false);

  readonly searchRequested = output<string>();
  readonly saveRequested = output<DtoLineaMandoRequest>();
  readonly cancelRequested = output<void>();
  readonly validationWarning = output<string>();

  readonly searchControl = this.formBuilder.nonNullable.control('', [Validators.required]);
  readonly form = this.formBuilder.nonNullable.group({
    identificacion: ['', Validators.required],
    nombre: ['', Validators.required],
    apellidos: [''],
    grado: [''],
    cargo: [''],
    peso: ['', Validators.required],
    unidad: [''],
    fotoBase64: this.formBuilder.control<string | null>(null),
    orden: [1, [Validators.required, Validators.min(1)]],
  });

  readonly photoPreview = signal(DEFAULT_PHOTO);
  readonly photoFileName = signal('');
  readonly hasEmployee = computed(() => Boolean(this.value()?.identificacion));
  readonly title = computed(() => (this.editing() ? 'Editar integrante' : 'Agregar integrante'));
  readonly description = computed(() =>
    this.editing()
      ? 'Actualice la responsabilidad, el cargo o la posición dentro de la estructura.'
      : 'Consulte al funcionario y complete su posición dentro de la línea de mando.',
  );

  readonly positionOptions: UiSelectOption<string>[] = [
    { value: 'Director Policía', label: 'Director Policía' },
    { value: 'Subdirector Policía', label: 'Subdirector Policía' },
    { value: 'Jefe Unidad', label: 'Jefe Unidad' },
    { value: 'Mando Ejecutivo', label: 'Mando Ejecutivo' },
  ];

  constructor() {
    effect(() => {
      const value = this.value();

      if (!value) {
        this.form.reset({ orden: 1, fotoBase64: null });
        this.searchControl.reset('');
        this.photoPreview.set(DEFAULT_PHOTO);
        this.photoFileName.set('');
        return;
      }

      // El componente recibe una copia del registro y nunca modifica el estado del padre.
      this.form.reset({ ...value, orden: Math.max(1, Number(value.orden) || 1) });
      this.searchControl.setValue(value.identificacion);
      this.photoPreview.set(this.resolvePhoto(value.fotoBase64));
      this.photoFileName.set(value.fotoBase64 ? 'Fotografía actual' : '');
    });
  }

  /** Solicita la consulta solo cuando existe una identificación válida. */
  searchEmployee(value = this.searchControl.value): void {
    const identification = value.trim();

    if (!identification) {
      this.searchControl.markAsTouched();
      this.validationWarning.emit('Ingrese un número de identificación para consultar.');
      return;
    }

    this.searchRequested.emit(identification);
  }

  /** Valida el formulario y entrega al contenedor un DTO listo para persistir. */
  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.validationWarning.emit('Complete los campos obligatorios antes de guardar.');
      return;
    }

    const value = this.form.getRawValue();
    this.saveRequested.emit({
      identificacion: value.identificacion.trim(),
      nombre: value.nombre.trim(),
      apellidos: value.apellidos.trim(),
      grado: value.grado.trim(),
      cargo: value.cargo.trim(),
      peso: value.peso.trim(),
      unidad: value.unidad.trim(),
      fotoBase64: value.fotoBase64,
      orden: Math.max(1, Number(value.orden) || 1),
    });
  }

  /** Lee la fotografía validada por el UI y actualiza la vista previa local. */
  loadPhoto(file: File): void {
    const reader = new FileReader();

    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';

      if (!result.startsWith('data:image/')) {
        this.validationWarning.emit('El archivo seleccionado no contiene una imagen válida.');
        return;
      }

      this.form.controls.fotoBase64.setValue(result);
      this.photoPreview.set(result);
      this.photoFileName.set(file.name);
      this.form.markAsDirty();
    };

    reader.readAsDataURL(file);
  }

  /** Retira únicamente la fotografía personalizada y conserva los demás datos. */
  clearPhoto(): void {
    this.form.controls.fotoBase64.setValue(null);
    this.photoPreview.set(DEFAULT_PHOTO);
    this.photoFileName.set('');
    this.form.markAsDirty();
  }

  fieldError(field: 'identificacion' | 'nombre' | 'peso' | 'orden'): string {
    const control = this.form.controls[field];

    if (!control.touched || control.valid) {
      return '';
    }

    if (control.hasError('required')) {
      return 'Este campo es obligatorio.';
    }

    return field === 'orden' ? 'El orden debe ser igual o mayor que 1.' : 'Revise este campo.';
  }

  protected readonly allowedPhotoTypes = ['image/jpeg', 'image/png', 'image/webp'];
  protected readonly allowedPhotoExtensions = ['jpg', 'jpeg', 'png', 'webp'];
  protected readonly maximumPhotoSize = MAX_PHOTO_SIZE;

  private resolvePhoto(photo: string | null): string {
    const normalizedPhoto = photo?.trim();

    if (!normalizedPhoto) {
      return DEFAULT_PHOTO;
    }

    return normalizedPhoto.startsWith('data:')
      ? normalizedPhoto
      : `data:image/jpeg;base64,${normalizedPhoto}`;
  }
}
