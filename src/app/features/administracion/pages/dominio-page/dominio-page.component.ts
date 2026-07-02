import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { ToastService } from '../../../../core/services/toast.service';
import {
  UiButtonComponent,
  UiButtonVariant
} from '../../../../shared/components/ui-button/ui-button.component';
import { UiInputComponent } from '../../../../shared/components/ui-input/ui-input.component';
import { UiSelectComponent } from '../../../../shared/components/ui-select/ui-select.component';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';
import { DominioService, DtoDominio, DtoDominioRequest } from '../../services/dominio.service';

interface DtoDominioApi extends Partial<DtoDominio> {
  IdDominio?: number;
  id_dominio?: number;
  ID_DOMINIO?: number;
  Descripcion?: string;
  IdPadre?: number;
  id_padre?: number;
  ID_PADRE?: number;
  Vigente?: number;
  Abreviatura?: string;
  Observacion?: string;
}

interface DominioForm {
  Descripcion: FormControl<string>;
  IdPadre: FormControl<number>;
  Vigente: FormControl<number>;
  Abreviatura: FormControl<string>;
  Observacion: FormControl<string>;
}

@Component({
  selector: 'app-dominio',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, UiButtonComponent, UiInputComponent, UiSelectComponent],
  templateUrl: './dominio-page.component.html',
  styleUrls: ['./dominio-page.component.scss']
})
export class DominioPageComponent implements OnInit {
  readonly vigenteOptions: UiSelectOption<number>[] = [
    { label: 'Si', value: 1 },
    { label: 'No', value: 0 }
  ];

  readonly dominioForm = new FormGroup<DominioForm>({
    Descripcion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(255)]
    }),
    IdPadre: new FormControl(0, { nonNullable: true }),
    Vigente: new FormControl(1, { nonNullable: true }),
    Abreviatura: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(50)]
    }),
    Observacion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(500)]
    })
  });

  visible = true;
  minimized = false;

  loading = false;
  saving = false;

  listaDominios: DtoDominio[] = [];
  dominiosTree: {
    item: DtoDominio;
    children: { item: DtoDominio; children: DtoDominio[]; expanded: boolean }[];
    expanded: boolean;
  }[] = [];
  editingId: number | null = null;

  dominioOptions: { id: number; descripcion: string }[] = [];

  constructor(
    private readonly toast: ToastService,
    private readonly dominioService: DominioService
  ) {}

  ngOnInit(): void {
    this.cargarDominios();
  }

  cargarDominios(): void {
    this.loading = true;
    this.dominioService.getAll().subscribe({
      next: (data) => {
        this.listaDominios = (data ?? []).map((item) => this.normalizarDominio(item));
        this.buildTree();
        this.actualizarOpcionesPadre();
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.toast.error('Error', 'No se pudieron cargar los dominios');
      }
    });
  }

  toggleExpand(index: number): void {
    this.dominiosTree[index].expanded = !this.dominiosTree[index].expanded;
  }

  toggleChildExpand(padreIndex: number, childIndex: number): void {
    this.dominiosTree[padreIndex].children[childIndex].expanded =
      !this.dominiosTree[padreIndex].children[childIndex].expanded;
  }

  nuevo(): void {
    this.editingId = null;
    this.dominioForm.reset(this.getDefaultForm());
    this.dominioForm.markAsPristine();
    this.actualizarOpcionesPadre();
  }

  editar(item: DtoDominio): void {
    this.editingId = item.idDominio;
    this.dominioForm.reset({
      Descripcion: item.descripcion,
      IdPadre: item.idPadre,
      Vigente: item.vigente,
      Abreviatura: item.abreviatura || '',
      Observacion: item.observacion || ''
    });
    this.actualizarOpcionesPadre();
  }

  guardar(): void {
    if (this.dominioForm.invalid) {
      this.dominioForm.markAllAsTouched();
      this.toast.warning('Guardar', 'Revisa los campos obligatorios antes de guardar.');
      return;
    }

    const formValue = this.dominioForm.getRawValue();
    const descripcion = formValue.Descripcion.trim();
    if (!descripcion) {
      this.toast.warning('Guardar', 'La descripcion es requerida');
      return;
    }

    this.saving = true;

    const request: DtoDominioRequest = {
      Descripcion: descripcion,
      IdPadre: formValue.IdPadre || 0,
      Vigente: formValue.Vigente,
      Abreviatura: formValue.Abreviatura.trim(),
      Observacion: formValue.Observacion.trim()
    };

    if (this.editingId) {
      this.dominioService.update(this.editingId, request).subscribe({
        next: (resp) => {
          this.saving = false;
          if (resp.success) {
            this.toast.success('Guardar', resp.message);
            this.nuevo();
            this.cargarDominios();
          } else {
            this.toast.warning('Guardar', resp.message);
          }
        },
        error: () => {
          this.saving = false;
          this.toast.error('Guardar', 'Error al actualizar dominio');
        }
      });
      return;
    }

    this.dominioService.create(request).subscribe({
      next: (resp) => {
        this.saving = false;
        if (resp.success) {
          this.toast.success('Guardar', resp.message);
          this.nuevo();
          this.cargarDominios();
        } else {
          this.toast.warning('Guardar', resp.message);
        }
      },
      error: () => {
        this.saving = false;
        this.toast.error('Guardar', 'Error al crear dominio');
      }
    });
  }

  eliminar(item: DtoDominio): void {
    if (!confirm(`Esta seguro de eliminar el dominio "${item.descripcion}"?`)) {
      return;
    }

    this.dominioService.delete(item.idDominio).subscribe({
      next: (resp) => {
        if (resp.success) {
          this.toast.success('Eliminar', resp.message);
          this.cargarDominios();
        } else {
          this.toast.warning('Eliminar', resp.message);
        }
      },
      error: () => {
        this.toast.error('Eliminar', 'Error al eliminar dominio');
      }
    });
  }

  cambiarEstado(item: DtoDominio): void {
    const nuevoEstado = item.vigente === 1 ? 0 : 1;
    const request: DtoDominioRequest = {
      Descripcion: item.descripcion,
      IdPadre: item.idPadre,
      Vigente: nuevoEstado,
      Abreviatura: item.abreviatura || '',
      Observacion: item.observacion || ''
    };

    this.dominioService.update(item.idDominio, request).subscribe({
      next: (resp) => {
        if (resp.success) {
          this.toast.success('Estado', resp.message);
          this.cargarDominios();
        } else {
          this.toast.warning('Estado', resp.message);
        }
      },
      error: () => {
        this.toast.error('Estado', 'Error al cambiar estado');
      }
    });
  }

  getNombrePadre(idPadre: number | string | null): string {
    if (!idPadre || idPadre === 0 || idPadre === '0' || idPadre === 'null') {
      return 'Raiz (sin padre)';
    }
    const padre = this.listaDominios.find((dominio) => dominio.idDominio === Number(idPadre));
    return padre?.descripcion || 'Sin padre';
  }

  toggleMinimize(): void {
    this.minimized = !this.minimized;
  }

  closePanel(): void {
    this.visible = false;
  }

  get dominioPadreOptions(): UiSelectOption<number>[] {
    return [
      { label: 'Dominio principal', value: 0 },
      ...this.dominioOptions.map((option) => ({
        label: option.descripcion,
        value: option.id
      }))
    ];
  }

  get descripcionError(): string {
    const control = this.dominioForm.controls.Descripcion;
    if (!control.touched && !control.dirty) {
      return '';
    }

    if (control.hasError('required')) {
      return 'La descripcion es requerida.';
    }

    if (control.hasError('maxlength')) {
      return 'La descripcion no puede superar 255 caracteres.';
    }

    return '';
  }

  getEstadoButtonVariant(item: DtoDominio): UiButtonVariant {
    return item.vigente === 0 ? 'primary' : 'secondary';
  }

  private actualizarOpcionesPadre(): void {
    this.dominioOptions = this.listaDominios
      .filter(
        (dominio) =>
          dominio.idDominio !== 0 &&
          dominio.idDominio !== (this.editingId ?? 0) &&
          Number(dominio.idPadre) === 0
      )
      .map((dominio) => ({
        id: dominio.idDominio,
        descripcion: dominio.descripcion
      }));
  }

  private normalizarDominio(item: DtoDominioApi): DtoDominio {
    return {
      idDominio: Number(item?.idDominio ?? item?.IdDominio ?? item?.id_dominio ?? item?.ID_DOMINIO ?? 0),
      descripcion: String(item?.descripcion ?? item?.Descripcion ?? ''),
      idPadre: Number(item?.idPadre ?? item?.IdPadre ?? item?.id_padre ?? item?.ID_PADRE ?? 0),
      vigente: Number(item?.vigente ?? item?.Vigente ?? 0),
      abreviatura: String(item?.abreviatura ?? item?.Abreviatura ?? ''),
      observacion: String(item?.observacion ?? item?.Observacion ?? '')
    };
  }

  private buildTree(): void {
    const noRaiz = this.listaDominios.filter((dominio) => dominio.idDominio !== 0);
    const raiz = noRaiz.filter((dominio) => !dominio.idPadre || dominio.idPadre === 0);
    this.dominiosTree = raiz.map((padre) => {
      const children = noRaiz.filter((hijo) => hijo.idPadre === padre.idDominio);
      return {
        item: padre,
        children: children.map((hijo) => ({
          item: hijo,
          children: noRaiz.filter((nieto) => nieto.idPadre === hijo.idDominio),
          expanded: true
        })),
        expanded: true
      };
    });
  }

  private getDefaultForm(): DtoDominioRequest {
    return {
      Descripcion: '',
      IdPadre: 0,
      Vigente: 1,
      Abreviatura: '',
      Observacion: ''
    };
  }
}
