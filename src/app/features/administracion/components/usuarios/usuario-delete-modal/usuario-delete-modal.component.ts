import { ChangeDetectionStrategy, Component, effect, input, output } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';

import { UiButtonComponent } from '../../../../../shared/components/ui-button/ui-button.component';
import { UiInputComponent } from '../../../../../shared/components/ui-input/ui-input.component';
import { UiModalComponent } from '../../../../../shared/components/ui-modal/ui-modal.component';
import { getFormErrorMessage } from '../../../../../shared/utils/form-error.util';
import type { UsuarioListadoItem } from '../../../services/usuario-admin.service';

@Component({
  selector: 'app-usuario-delete-modal',
  standalone: true,
  imports: [ReactiveFormsModule, UiButtonComponent, UiInputComponent, UiModalComponent],
  templateUrl: './usuario-delete-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './usuario-delete-modal.component.scss',
})
export class UsuarioDeleteModalComponent {
  readonly open = input(false);
  readonly user = input<UsuarioListadoItem | null>(null);
  readonly loading = input(false);

  readonly close = output<void>();
  readonly confirm = output<string>();

  readonly observation = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(10), Validators.maxLength(1000)],
  });

  constructor() {
    // Al cerrar se limpia el motivo para no reutilizarlo en otro usuario.
    effect(() => {
      if (!this.open()) {
        this.observation.reset('', { emitEvent: false });
      }
    });
  }

  requestClose(): void {
    if (!this.loading()) {
      this.close.emit();
    }
  }

  submit(): void {
    this.observation.setValue(this.observation.value.trim(), { emitEvent: false });
    this.observation.markAsTouched();

    if (this.observation.invalid || this.loading()) {
      return;
    }

    this.confirm.emit(this.observation.value);
  }

  get errorMessage(): string {
    return getFormErrorMessage(this.observation);
  }
}
