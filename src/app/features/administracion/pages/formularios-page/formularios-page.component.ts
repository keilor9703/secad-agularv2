import { Component, inject  } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../../../core/services/toast.service';
import { AlertService } from '../../../../core/services/alert.service';


@Component({
  selector: 'app-formularios',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './formularios-page.component.html',
  styleUrls: ['./formularios-page.component.scss'],
})
export class FormulariosPageComponent {
  constructor(private toast: ToastService) {}

  textValue = '';
  emailValue = '';
  numberValue: number | null = null;
  selectValue = '';
  textareaValue = '';
  checked = false;
  radioValue = 'op1';
  dateValue = '';

  onBuscar(): void {
  this.toast.info('Buscar', 'Consultando registros...');
}

onNuevo(): void {
  this.toast.success('Nuevo', 'Formulario listo para crear un registro.');
}

onEliminar(): void {
  this.toast.warning('Eliminar', 'Selecciona un registro antes de eliminar.');
}
 private alert = inject(AlertService);

  btnAdvertencia() {
    this.alert.warning('Advertencia', 'No se encontraron datos para el EKOGUI proporcionado');
  }

  btnError() {
    this.alert.error('Error', 'No se encontraron datos para el numero  proporcionado');
  }

    btnInfo() {
    this.alert.info('Información', 'No se encontraron datos para el numero  proporcionado');
  }
 minimized = false;
  visible = true;

  toggleMinimize(): void {
    this.minimized = !this.minimized;
  }

  closePanel(): void {
    this.visible = false;
  }
}


