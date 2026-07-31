import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';

import {
  LoginVisualAdminConfig,
  LoginVisualItem,
  LoginVisualService,
} from '../../../../core/services/login-visual.service';
import { ToastService } from '../../../../core/services/toast.service';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiChipComponent } from '../../../../shared/components/ui-chip/ui-chip.component';
import { UiFileUploadComponent } from '../../../../shared/components/ui-file-upload/ui-file-upload.component';
import { UiInputComponent } from '../../../../shared/components/ui-input/ui-input.component';
import { UiSelectComponent } from '../../../../shared/components/ui-select/ui-select.component';
import { UiSpinnerComponent } from '../../../../shared/components/ui-spinner/ui-spinner.component';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';
import { AlertService } from '../../../../shared/services/alert.service';
import { getApiErrorMessage } from '../../../../shared/utils/api-error-message.util';
import { getFormErrorMessage } from '../../../../shared/utils/form-error.util';

interface LoginVisualItemForm {
  file: FormControl<string>;
  active: FormControl<boolean>;
  order: FormControl<string>;
  title: FormControl<string>;
  subtitle: FormControl<string>;
  url: FormControl<string>;
}

interface LoginVisualConfigurationForm {
  intervalMs: FormControl<string>;
  items: FormArray<FormGroup<LoginVisualItemForm>>;
}

const LOGIN_IMAGE_MAX_SIZE_BYTES = 10 * 1024 * 1024;

@Component({
  selector: 'app-configuracion-login-visual',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    UiButtonComponent,
    UiChipComponent,
    UiFileUploadComponent,
    UiInputComponent,
    UiSelectComponent,
    UiSpinnerComponent,
  ],
  templateUrl: './configuracion-login-visual.component.html',
  styleUrl: './configuracion-login-visual.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfiguracionLoginVisualComponent implements OnInit {
  private readonly loginVisualService = inject(LoginVisualService);
  private readonly toast = inject(ToastService);
  private readonly alert = inject(AlertService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly uploading = signal(false);
  readonly pendingFileName = signal('');
  readonly deletingFiles = signal<ReadonlySet<string>>(new Set<string>());

  readonly form = new FormGroup<LoginVisualConfigurationForm>({
    intervalMs: new FormControl('6000', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.pattern(/^\d+$/),
        Validators.min(1500),
        Validators.max(60000),
      ],
    }),
    items: new FormArray<FormGroup<LoginVisualItemForm>>([]),
  });

  readonly activeOptions: UiSelectOption<boolean>[] = [
    { label: 'Activa', value: true },
    { label: 'Inactiva', value: false },
  ];
  readonly acceptedImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
  readonly acceptedImageExtensions = ['jpg', 'jpeg', 'png', 'webp'];
  readonly maximumImageSize = LOGIN_IMAGE_MAX_SIZE_BYTES;

  get items(): FormArray<FormGroup<LoginVisualItemForm>> {
    return this.form.controls.items;
  }

  ngOnInit(): void {
    this.loadConfiguration();
  }

  loadConfiguration(): void {
    this.loading.set(true);

    this.loginVisualService
      .getAdminConfig()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (configuration) => this.setConfiguration(configuration),
        error: (error: unknown) => {
          this.items.clear();
          this.toast.error(
            'Imágenes de acceso',
            getApiErrorMessage(error, 'No fue posible cargar la configuración.'),
          );
        },
      });
  }

  onImageSelected(file: File): void {
    this.pendingFileName.set(file.name);
    this.uploading.set(true);

    this.loginVisualService
      .upload(file)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.uploading.set(false);
          this.pendingFileName.set('');
        }),
      )
      .subscribe({
        next: (response) => {
          if (!response.success || !response.fileName) {
            this.toast.warning(
              'Imágenes de acceso',
              response.message || 'No fue posible cargar la imagen.',
            );
            return;
          }

          const nextOrder = this.items.controls.reduce(
            (maximum, itemForm) => Math.max(maximum, Number(itemForm.controls.order.value) || 0),
            0,
          );

          this.items.push(
            this.createItemForm({
              file: response.fileName,
              active: true,
              order: nextOrder + 1,
              title: '',
              subtitle: '',
              url: response.url,
            }),
          );
          this.toast.success(
            'Imágenes de acceso',
            response.message || 'Imagen cargada correctamente.',
          );
        },
        error: (error: unknown) => {
          this.toast.error(
            'Imágenes de acceso',
            getApiErrorMessage(error, 'Ocurrió un error cargando la imagen.'),
          );
        },
      });
  }

  saveConfiguration(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.warning('Imágenes de acceso', 'Revise los valores de la configuración.');
      return;
    }

    const payload: LoginVisualAdminConfig = {
      intervalMs: Number(this.form.controls.intervalMs.value),
      items: this.items.controls.map((itemForm) => {
        const value = itemForm.getRawValue();

        return {
          file: value.file.trim(),
          active: value.active,
          order: Number(value.order),
          title: value.title.trim() || null,
          subtitle: value.subtitle.trim() || null,
        };
      }),
    };

    this.saving.set(true);

    this.loginVisualService
      .saveConfig(payload)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: (response) => {
          if (!response.success) {
            this.toast.warning(
              'Imágenes de acceso',
              response.message || 'No fue posible guardar la configuración.',
            );
            return;
          }

          this.toast.success(
            'Imágenes de acceso',
            response.message || 'Configuración guardada correctamente.',
          );
          this.loadConfiguration();
        },
        error: (error: unknown) => {
          this.toast.error(
            'Imágenes de acceso',
            getApiErrorMessage(error, 'Ocurrió un error guardando la configuración.'),
          );
        },
      });
  }

  async deleteImage(index: number): Promise<void> {
    const itemForm = this.items.at(index);
    const fileName = itemForm?.controls.file.value;

    if (!fileName) {
      return;
    }

    const confirmed = await this.alert.confirmDelete(
      'Eliminar imagen',
      'La imagen dejará de estar disponible en la pantalla de acceso.',
    );

    if (!confirmed) {
      return;
    }

    this.setDeleting(fileName, true);

    this.loginVisualService
      .delete(fileName)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.setDeleting(fileName, false)),
      )
      .subscribe({
        next: (response) => {
          if (!response.success) {
            this.toast.warning(
              'Imágenes de acceso',
              response.message || 'No fue posible eliminar la imagen.',
            );
            return;
          }

          const currentIndex = this.items.controls.findIndex(
            (control) => control.controls.file.value === fileName,
          );

          if (currentIndex >= 0) {
            this.items.removeAt(currentIndex);
          }

          this.toast.success('Imágenes de acceso', response.message || 'Imagen eliminada.');
        },
        error: (error: unknown) => {
          this.toast.error(
            'Imágenes de acceso',
            getApiErrorMessage(error, 'Ocurrió un error eliminando la imagen.'),
          );
        },
      });
  }

  showFileValidationError(message: string): void {
    this.toast.warning('Imágenes de acceso', message);
  }

  intervalError(): string {
    return getFormErrorMessage(this.form.controls.intervalMs);
  }

  itemError(
    itemForm: FormGroup<LoginVisualItemForm>,
    controlName: 'order' | 'title' | 'subtitle',
  ): string {
    return getFormErrorMessage(itemForm.controls[controlName]);
  }

  imageSource(itemForm: FormGroup<LoginVisualItemForm>): string {
    const value = itemForm.getRawValue();
    return value.url || this.loginVisualService.getImageUrl(value.file);
  }

  isDeleting(fileName: string): boolean {
    return this.deletingFiles().has(fileName);
  }

  private setConfiguration(configuration: LoginVisualAdminConfig): void {
    this.form.controls.intervalMs.setValue(String(configuration?.intervalMs ?? 6000));
    this.items.clear();

    const orderedItems = [...(configuration?.items ?? [])].sort(
      (first, second) => Number(first.order) - Number(second.order),
    );

    for (const item of orderedItems) {
      this.items.push(this.createItemForm(item));
    }

    this.form.markAsPristine();
  }

  private createItemForm(item: LoginVisualItem): FormGroup<LoginVisualItemForm> {
    return new FormGroup<LoginVisualItemForm>({
      file: new FormControl(item.file, { nonNullable: true }),
      active: new FormControl(item.active ?? true, { nonNullable: true }),
      order: new FormControl(String(item.order ?? 1), {
        nonNullable: true,
        validators: [Validators.required, Validators.pattern(/^\d+$/), Validators.min(1)],
      }),
      title: new FormControl(item.title ?? '', {
        nonNullable: true,
        validators: [Validators.maxLength(120)],
      }),
      subtitle: new FormControl(item.subtitle ?? '', {
        nonNullable: true,
        validators: [Validators.maxLength(200)],
      }),
      url: new FormControl(item.url ?? '', { nonNullable: true }),
    });
  }

  private setDeleting(fileName: string, deleting: boolean): void {
    this.deletingFiles.update((currentFiles) => {
      const nextFiles = new Set(currentFiles);

      if (deleting) {
        nextFiles.add(fileName);
      } else {
        nextFiles.delete(fileName);
      }

      return nextFiles;
    });
  }
}
