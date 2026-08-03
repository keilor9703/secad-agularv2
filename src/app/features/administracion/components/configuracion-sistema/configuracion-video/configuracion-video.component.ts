import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';

import { ToastService } from '../../../../../core/services/toast.service';
import {
  VideoUnidadInfo,
  VideoUnidadService,
} from '../../../../../core/services/video-unidad.service';
import { UiButtonComponent } from '../../../../../shared/components/ui-button/ui-button.component';
import { UiChipComponent } from '../../../../../shared/components/ui-chip/ui-chip.component';
import { UiFileUploadComponent } from '../../../../../shared/components/ui-file-upload/ui-file-upload.component';
import { UiInputComponent } from '../../../../../shared/components/ui-input/ui-input.component';
import { UiPanelHeaderComponent } from '../../../../../shared/components/ui-panel-header/ui-panel-header.component';
import { UiSpinnerComponent } from '../../../../../shared/components/ui-spinner/ui-spinner.component';
import { getApiErrorMessage } from '../../../../../shared/utils/api-error-message.util';
import { getFormErrorMessage } from '../../../../../shared/utils/form-error.util';

interface VideoConfigurationForm {
  descripcion: FormControl<string>;
  observaciones: FormControl<string>;
}

const VIDEO_MAX_SIZE_BYTES = 100 * 1024 * 1024;

@Component({
  selector: 'app-configuracion-video',
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
    UiButtonComponent,
    UiChipComponent,
    UiFileUploadComponent,
    UiInputComponent,
    UiPanelHeaderComponent,
    UiSpinnerComponent,
  ],
  templateUrl: './configuracion-video.component.html',
  styleUrl: './configuracion-video.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfiguracionVideoComponent implements OnInit, OnDestroy {
  private readonly videoService = inject(VideoUnidadService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(false);
  readonly uploading = signal(false);
  readonly currentVideo = signal<VideoUnidadInfo | null>(null);
  readonly selectedFile = signal<File | null>(null);
  readonly selectedPreviewUrl = signal('');
  readonly fileError = signal('');

  readonly form = new FormGroup<VideoConfigurationForm>({
    descripcion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(255)],
    }),
    observaciones: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(500)],
    }),
  });

  readonly selectedFileName = computed(() => this.selectedFile()?.name ?? '');
  readonly currentVideoUrl = computed(() => {
    const current = this.currentVideo();
    return current?.hasVideo ? current.url : '';
  });
  readonly previewUrl = computed(() => this.selectedPreviewUrl() || this.currentVideoUrl());
  readonly previewIsDraft = computed(() => Boolean(this.selectedPreviewUrl()));
  readonly statusLabel = computed(() => {
    if (this.loading()) {
      return 'Consultando';
    }

    if (this.selectedFile()) {
      return 'Cambio pendiente';
    }

    return this.currentVideo()?.hasVideo ? 'Video configurado' : 'Sin video';
  });

  readonly acceptedVideoTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
  readonly acceptedVideoExtensions = ['mp4', 'webm', 'ogg', 'mov'];
  readonly maximumVideoSize = VIDEO_MAX_SIZE_BYTES;

  ngOnInit(): void {
    this.loadCurrentVideo();
  }

  ngOnDestroy(): void {
    this.revokeSelectedPreview();
  }

  loadCurrentVideo(): void {
    this.loading.set(true);

    this.videoService
      .getCurrent()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (video) => this.currentVideo.set(video),
        error: (error: unknown) => {
          this.currentVideo.set(null);
          this.toast.error(
            'Configuración del sistema',
            getApiErrorMessage(error, 'No fue posible consultar el video actual.'),
          );
        },
      });
  }

  onVideoSelected(file: File): void {
    this.revokeSelectedPreview();
    this.fileError.set('');
    this.selectedFile.set(file);
    this.selectedPreviewUrl.set(URL.createObjectURL(file));
    this.form.controls.descripcion.markAsUntouched();
  }

  clearDraft(): void {
    this.revokeSelectedPreview();
    this.fileError.set('');
    this.selectedFile.set(null);
    this.form.reset({
      descripcion: '',
      observaciones: '',
    });
  }

  saveVideo(): void {
    const selectedFile = this.selectedFile();

    if (!selectedFile) {
      this.fileError.set('Seleccione un archivo de video.');
      this.toast.warning('Video institucional', 'Seleccione el archivo que desea publicar.');
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.warning('Video institucional', 'Revise la información obligatoria.');
      return;
    }

    const value = this.form.getRawValue();
    this.uploading.set(true);

    this.videoService
      .upload(selectedFile, value.descripcion.trim(), value.observaciones.trim() || undefined)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.uploading.set(false)),
      )
      .subscribe({
        next: (response) => {
          if (!response.success) {
            this.toast.warning(
              'Video institucional',
              response.message || 'No fue posible cargar el video.',
            );
            return;
          }

          this.toast.success(
            'Video institucional',
            response.message || 'Video cargado correctamente.',
          );
          this.clearDraft();
          this.loadCurrentVideo();
        },
        error: (error: unknown) => {
          this.toast.error(
            'Video institucional',
            getApiErrorMessage(error, 'Ocurrió un error cargando el video.'),
          );
        },
      });
  }

  showFileValidationError(message: string): void {
    this.toast.warning('Video institucional', message);
  }

  error(controlName: keyof VideoConfigurationForm): string {
    return getFormErrorMessage(this.form.controls[controlName]);
  }

  private revokeSelectedPreview(): void {
    const previewUrl = this.selectedPreviewUrl();

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      this.selectedPreviewUrl.set('');
    }
  }
}
