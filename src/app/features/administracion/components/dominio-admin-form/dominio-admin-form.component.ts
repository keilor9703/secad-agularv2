import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiInputComponent } from '../../../../shared/components/ui-input/ui-input.component';
import { UiSelectComponent } from '../../../../shared/components/ui-select/ui-select.component';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';
import { UiFormControlSize } from '../../../../shared/models/ui-form-control-size.model';
import { getFormErrorMessage } from '../../../../shared/utils/form-error.util';
import { DtoDominio, DtoDominioRequest } from '../../services/dominio.service';

export type DominioEditorMode = 'create' | 'edit';

type DominioFormField = 'descripcion' | 'idPadre' | 'vigente' | 'abreviatura' | 'observacion';

const DOMAIN_STATUS_OPTIONS: UiSelectOption<number>[] = [
  { value: 1, label: 'Activo' },
  { value: 0, label: 'Inactivo' },
];

@Component({
  selector: 'app-dominio-admin-form',
  standalone: true,
  imports: [ReactiveFormsModule, UiButtonComponent, UiInputComponent, UiSelectComponent],
  templateUrl: './dominio-admin-form.component.html',
  styleUrl: './dominio-admin-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DominioAdminFormComponent {
  private readonly fb = inject(NonNullableFormBuilder);

  readonly mode = input.required<DominioEditorMode>();
  readonly editingItem = input<DtoDominio | null>(null);
  readonly createParent = input<DtoDominio | null>(null);
  readonly parentOptions = input<UiSelectOption<number>[]>([]);
  readonly saving = input(false);
  readonly resetVersion = input(0);

  readonly saveRequested = output<DtoDominioRequest>();
  readonly cancelRequested = output<void>();

  readonly statusOptions = DOMAIN_STATUS_OPTIONS;
  readonly childCreation = computed(() => this.mode() === 'create' && this.createParent() !== null);

  /**
   * Una sola configuración mantiene consistencia entre input y select.
   * La grilla decide el ancho; el componente limita únicamente la altura.
   */
  readonly compactControlSize: UiFormControlSize = {
    height: '40px',
    minHeight: '38px',
    maxHeight: '42px',
    width: '100%',
    minWidth: '0px',
    maxWidth: '100%',
    mobile: {
      height: '41px',
      minHeight: '39px',
      maxHeight: '43px',
      width: '100%',
      minWidth: '0px',
      maxWidth: '100%',
    },
  };

  readonly observationControlSize: UiFormControlSize = {
    height: '88px',
    minHeight: '78px',
    maxHeight: '110px',
    width: '100%',
    minWidth: '0px',
    maxWidth: '100%',
    mobile: {
      height: '82px',
      minHeight: '74px',
      maxHeight: '104px',
      width: '100%',
      minWidth: '0px',
      maxWidth: '100%',
    },
  };

  readonly form = this.fb.group({
    descripcion: ['', [Validators.required, Validators.maxLength(255)]],
    idPadre: [0, [Validators.required, Validators.min(0)]],
    vigente: [1, [Validators.required]],
    abreviatura: ['', [Validators.maxLength(50)]],
    observacion: ['', [Validators.maxLength(500)]],
  });

  constructor() {
    effect(() => {
      const mode = this.mode();
      const item = this.editingItem();
      const parentId = this.createParent()?.idDominio ?? 0;
      this.resetVersion();
      this.writeForm(mode === 'edit' ? item : null, parentId);
    });
  }

  get title(): string {
    if (this.mode() === 'edit') {
      return 'Editar dominio';
    }

    return this.createParent() ? 'Crear dominio hijo' : 'Crear dominio principal';
  }

  get description(): string {
    if (this.mode() === 'edit') {
      return 'Actualice su información, ubicación jerárquica y disponibilidad.';
    }

    return this.createParent()
      ? `El nuevo dominio quedará dentro de “${this.createParent()?.descripcion}”.`
      : 'El nuevo dominio quedará en el primer nivel de la estructura.';
  }

  get submitLabel(): string {
    return this.mode() === 'edit' ? 'Guardar cambios' : 'Crear dominio';
  }

  submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();

    this.saveRequested.emit({
      Descripcion: value.descripcion.trim(),
      IdPadre: value.idPadre,
      Vigente: value.vigente,
      Abreviatura: value.abreviatura.trim(),
      Observacion: value.observacion.trim(),
    });
  }

  cancel(): void {
    this.cancelRequested.emit();
  }

  errorFor(field: DominioFormField): string {
    return getFormErrorMessage(this.form.controls[field]);
  }

  private writeForm(item: DtoDominio | null, createParentId: number): void {
    this.form.reset({
      descripcion: item?.descripcion ?? '',
      idPadre: item?.idPadre ?? createParentId,
      vigente: item?.vigente === 0 ? 0 : 1,
      abreviatura: item?.abreviatura ?? '',
      observacion: item?.observacion ?? '',
    });
  }
}
