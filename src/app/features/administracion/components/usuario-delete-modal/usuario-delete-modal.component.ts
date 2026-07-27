import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiInputComponent } from '../../../../shared/components/ui-input/ui-input.component';
import { UiModalComponent } from '../../../../shared/components/ui-modal/ui-modal.component';
import { UsuarioListadoItem } from '../../services/usuario-admin.service';

@Component({
  selector: 'app-usuario-delete-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, UiButtonComponent, UiInputComponent, UiModalComponent],
  templateUrl: './usuario-delete-modal.component.html',
  styleUrls: ['./usuario-delete-modal.component.scss'],
})
export class UsuarioDeleteModalComponent implements OnChanges {
  private readonly fb = inject(FormBuilder);

  @Input() open = false;
  @Input() user: UsuarioListadoItem | null = null;
  @Input() loading = false;

  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<void>();

  confirmationError = '';

  readonly form = this.fb.group({
    confirmacion: ['', [Validators.required]],
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']?.currentValue) {
      this.form.reset({ confirmacion: '' });
      this.confirmationError = '';
    }
  }

  requestClose(): void {
    if (!this.loading) {
      this.close.emit();
    }
  }

  submit(): void {
    const value = (this.form.controls.confirmacion.getRawValue() ?? '').trim().toUpperCase();

    if (!value) {
      this.confirmationError = 'Este campo es obligatorio.';
      this.form.markAllAsTouched();
      return;
    }

    if (value !== 'ELIMINAR') {
      this.confirmationError = 'Escribe ELIMINAR para confirmar.';
      this.form.markAllAsTouched();
      return;
    }

    this.confirmationError = '';
    this.confirm.emit();
  }
}
