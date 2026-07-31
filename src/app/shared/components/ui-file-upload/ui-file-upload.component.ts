import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  numberAttribute,
  output,
  signal,
} from '@angular/core';

import { UiButtonComponent } from '../ui-button/ui-button.component';

let nextUiFileUploadId = 0;

@Component({
  selector: 'app-ui-file-upload',
  standalone: true,
  imports: [UiButtonComponent],
  templateUrl: './ui-file-upload.component.html',
  styleUrl: './ui-file-upload.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiFileUploadComponent {
  readonly label = input.required<string>();
  readonly inputId = input('');
  readonly accept = input('');
  readonly hint = input('');
  readonly error = input('');
  readonly icon = input('fa-solid fa-cloud-arrow-up');
  readonly buttonText = input('Seleccionar archivo');
  readonly emptyText = input('Ningún archivo seleccionado');
  readonly fileName = input('');
  readonly allowedMimeTypes = input<readonly string[]>([]);
  readonly allowedExtensions = input<readonly string[]>([]);
  readonly maxSizeBytes = input(0, { transform: numberAttribute });
  readonly required = input(false, { transform: booleanAttribute });
  readonly showRequiredMarker = input(true, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly loading = input(false, { transform: booleanAttribute });
  readonly clearable = input(true, { transform: booleanAttribute });

  readonly fileSelected = output<File>();
  readonly clearRequested = output<void>();
  readonly validationError = output<string>();

  private readonly internalError = signal('');

  readonly resolvedInputId = computed(
    () => this.inputId().trim() || `ui-file-upload-${++nextUiFileUploadId}`,
  );
  readonly resolvedError = computed(() => this.error().trim() || this.internalError());
  readonly hasError = computed(() => Boolean(this.resolvedError()));
  readonly isDisabled = computed(() => this.disabled() || this.loading());
  readonly displayedFileName = computed(() => this.fileName().trim() || this.emptyText());

  openFileDialog(input: HTMLInputElement): void {
    if (!this.isDisabled()) {
      input.click();
    }
  }

  handleFileSelection(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    const file = inputElement.files?.item(0);

    // Permite volver a seleccionar el mismo archivo después de procesarlo.
    inputElement.value = '';

    if (!file) {
      return;
    }

    const validationMessage = this.validateFile(file);

    if (validationMessage) {
      this.internalError.set(validationMessage);
      this.validationError.emit(validationMessage);
      return;
    }

    this.internalError.set('');
    this.fileSelected.emit(file);
  }

  requestClear(): void {
    if (!this.isDisabled()) {
      this.internalError.set('');
      this.clearRequested.emit();
    }
  }

  private validateFile(file: File): string {
    const allowedMimeTypes = this.allowedMimeTypes();
    const allowedExtensions = this.allowedExtensions().map((extension) =>
      extension.trim().toLowerCase().replace(/^\./, ''),
    );
    const fileExtension = file.name.split('.').pop()?.toLowerCase() ?? '';
    const hasTypeRestrictions = allowedMimeTypes.length > 0 || allowedExtensions.length > 0;
    const hasValidMimeType = allowedMimeTypes.includes(file.type);
    const hasValidExtension = allowedExtensions.includes(fileExtension);

    if (hasTypeRestrictions && !hasValidMimeType && !hasValidExtension) {
      return 'El formato del archivo seleccionado no está permitido.';
    }

    const maximumSize = this.maxSizeBytes();

    if (maximumSize > 0 && file.size > maximumSize) {
      return `El archivo supera el tamaño máximo de ${this.formatBytes(maximumSize)}.`;
    }

    return '';
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) {
      return `${Math.round(bytes / 1024)} KB`;
    }

    const megabytes = bytes / (1024 * 1024);
    return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`;
  }
}
