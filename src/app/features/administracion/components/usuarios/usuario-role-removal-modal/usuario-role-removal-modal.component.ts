import { ChangeDetectionStrategy, Component, effect, input, output } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';

import { UiButtonComponent } from '../../../../../shared/components/ui-button/ui-button.component';
import { UiInputComponent } from '../../../../../shared/components/ui-input/ui-input.component';
import { UiModalComponent } from '../../../../../shared/components/ui-modal/ui-modal.component';
import { getFormErrorMessage } from '../../../../../shared/utils/form-error.util';
import { UserRole } from '../../../interfaces/usuario-admin-view.interface';

@Component({
  selector: 'app-usuario-role-removal-modal',
  standalone: true,
  imports: [ReactiveFormsModule, UiButtonComponent, UiInputComponent, UiModalComponent],
  templateUrl: './usuario-role-removal-modal.component.html',
  styleUrl: './usuario-role-removal-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsuarioRoleRemovalModalComponent {
  readonly open = input(false);
  readonly role = input<UserRole | null>(null);
  readonly loading = input(false);

  readonly closeRequested = output<void>();
  readonly confirmed = output<string>();

  readonly observation = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(10), Validators.maxLength(1000)],
  });

  constructor() {
    // Cada cierre limpia el motivo para no reutilizar información de otro retiro.
    effect(() => {
      if (!this.open()) {
        this.observation.reset('', { emitEvent: false });
      }
    });
  }

  requestClose(): void {
    if (!this.loading()) {
      this.closeRequested.emit();
    }
  }

  submit(): void {
    this.observation.setValue(this.observation.value.trim(), { emitEvent: false });
    this.observation.markAsTouched();

    if (this.observation.invalid || this.loading()) {
      return;
    }

    this.confirmed.emit(this.observation.value);
  }

  get errorMessage(): string {
    return getFormErrorMessage(this.observation);
  }
}
