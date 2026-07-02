import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Editor, Toolbar, schema, NgxEditorModule } from 'ngx-editor';
import { ToastService } from '../../../../core/services/toast.service';
import { ClasificacionCorreo, CorreoEnviado, CuentaEmail } from '../../interfaces/gestion-correo.interface';
import { GestionCorreoService } from '../../services/gestion-correo.service';

@Component({
  selector: 'app-gestion-correos-electronicos',
  standalone: true,
  imports: [CommonModule, FormsModule, NgxEditorModule],
  templateUrl: './gestion-correos-electronicos-page.component.html',
  styleUrls: ['./gestion-correos-electronicos-page.component.scss'],
})
export class GestionCorreosElectronicosPageComponent implements OnInit, OnDestroy {
  view: 'compose' | 'history' | 'settings' = 'compose';

  cuentas: CuentaEmail[] = [];
  selectedCuentaId: number | null = null;
  
  emailForm = {
    para: '',
    cc: '',
    asunto: '',
    cuerpo: '',
    idClasificacion: null as number | null,
    prioridadAlta: false,
    acuseRecibido: false
  };
  
  clasificaciones: ClasificacionCorreo[] = [];
  
  adjuntos: File[] = [];
  historial: CorreoEnviado[] = [];
  isSending = false;
  showSuccessModal = false;
  lastRadicado = '';
  selectedCorreo: CorreoEnviado | null = null;
  
  p: number = 1;
  pageSize: number = 10;

  get paginatedHistorial(): CorreoEnviado[] {
    const start = (this.p - 1) * this.pageSize;
    return this.historial.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.ceil(this.historial.length / this.pageSize);
  }

  nextPage(): void {
    if (this.p < this.totalPages) this.p++;
  }

  prevPage(): void {
    if (this.p > 1) this.p--;
  }
  
  editor!: Editor;
  detailEditor!: Editor;
  toolbar: Toolbar = [
    ['bold', 'italic'],
    ['underline', 'strike'],
    ['blockquote', 'code'],
    ['ordered_list', 'bullet_list'],
    [{ heading: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] }],
    ['link', 'image'],
    ['text_color', 'background_color'],
    ['align_left', 'align_center', 'align_right', 'align_justify'],
  ];

  constructor(
    private gestionCorreoService: GestionCorreoService,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.editor = new Editor({
      schema: schema,
      history: true,
      keyboardShortcuts: true
    });
    this.detailEditor = new Editor({
      schema: schema,
      history: false,
      keyboardShortcuts: false
    });
    
    this.cargarCuentas();
    this.cargarClasificaciones();
  }

  onPaste(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (e: ProgressEvent<FileReader>) => {
            const base64 = String(e.target?.result ?? '');
            this.editor.commands
              .insertImage(base64)
              .exec();
          };
          reader.readAsDataURL(file);
          event.preventDefault();
        }
      }
    }
  }

  ngOnDestroy(): void {
    this.editor.destroy();
    this.detailEditor.destroy();
  }

  cargarClasificaciones(): void {
    this.gestionCorreoService.getClasificaciones().subscribe({
      next: (data) => {
        this.clasificaciones = data;
      },
      error: (err) => console.error('Error cargando clasificaciones', err)
    });
  }

  cargarCuentas(): void {
    this.gestionCorreoService.getMisCuentas().subscribe({
      next: (data) => {
        this.cuentas = data;
        if (this.cuentas.length > 0) {
          this.selectedCuentaId = this.cuentas[0].idCuenta;
          this.prefillOpcionesDesdeCuenta(this.cuentas[0]);
        } else {
          this.selectedCuentaId = null;
        }
      },
      error: (err) => console.error('Error cargando cuentas SMTP', err)
    });
  }

  setView(newView: 'compose' | 'history' | 'settings'): void {
    this.view = newView;
    if (newView === 'history') {
      this.cargarHistorial();
    }
  }

  onCuentaChange(): void {
    const cuenta = this.cuentas.find(c => c.idCuenta === this.selectedCuentaId);
    if (cuenta) this.prefillOpcionesDesdeCuenta(cuenta);
  }

  private prefillOpcionesDesdeCuenta(cuenta: CuentaEmail): void {
    this.emailForm.prioridadAlta = cuenta.prioridadAlta === 1;
    this.emailForm.acuseRecibido = cuenta.acuseRecibido === 1;
  }

  cargarHistorial(): void {
    this.gestionCorreoService.getHistorico().subscribe({
      next: (data) => {
        this.historial = data;
      },
      error: (err) => console.error('Error cargando historial', err)
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (files) {
      for (let i = 0; i < files.length; i++) {
        this.adjuntos.push(files[i]);
      }
    }
  }

  removeAttachment(index: number): void {
    this.adjuntos.splice(index, 1);
  }

  enviarCorreo(): void {
    if (!this.selectedCuentaId || (!this.emailForm.para?.trim() && !this.emailForm.cc?.trim()) || !this.emailForm.asunto || !this.emailForm.idClasificacion) {
      this.toast.warning('Campos requeridos', 'Por favor complete al menos un destinatario (Para o CCO), asunto y clasificación.');
      return;
    }

    this.isSending = true;
    const formData = new FormData();
    formData.append('idCuentaEmail', this.selectedCuentaId.toString());
    if (this.emailForm.para?.trim()) formData.append('para', this.emailForm.para.trim());
    if (this.emailForm.cc?.trim()) formData.append('cc', this.emailForm.cc.trim());
    formData.append('asunto', this.emailForm.asunto);
    formData.append('cuerpo', this.emailForm.cuerpo);

    formData.append('prioridadAlta', this.emailForm.prioridadAlta ? 'true' : 'false');
    formData.append('acuseRecibido', this.emailForm.acuseRecibido ? 'true' : 'false');

    if (this.emailForm.idClasificacion) {
      formData.append('idClasificacion', this.emailForm.idClasificacion.toString());
      const clasif = this.clasificaciones.find(c => c.idDominio === this.emailForm.idClasificacion);
      if (clasif) {
        formData.append('nombreClasificacion', clasif.descripcion);
      }
    }
    
    this.adjuntos.forEach(file => {
      formData.append('adjuntos', file, file.name);
    });

    this.gestionCorreoService.enviar(formData).subscribe({
      next: (res) => {
        this.isSending = false;
        const cuenta = this.cuentas.find(c => c.idCuenta === this.selectedCuentaId);
        
        this.historial.unshift({
          idEnvio: Date.now(),
          radicado: res.radicado || 'COR-GEN',
          deEmail: cuenta?.email || '',
          nombreCuenta: cuenta?.nombreCuenta || '',
          para: this.emailForm.para,
          asunto: this.emailForm.asunto,
          cuerpo: this.emailForm.cuerpo,
          fecha: new Date(),
          tieneAdjuntos: this.adjuntos.length > 0,
          username: '',
          nombreCompleto: '',
          clasificacion: ''
        });

        this.lastRadicado = res.radicado;
        this.showSuccessModal = true;
        this.toast.success('Envío Exitoso', `Radicado: ${res.radicado}`);
        if (res.message && res.message.toLowerCase().includes('advertencia')) {
          this.toast.warning('Advertencia', res.message);
        }
        this.limpiarFormulario();
      },
      error: (err) => {
        this.isSending = false;
        console.error('Error enviando correo', err);
        const msg = err.error?.message || err.error?.title || 'No se pudo procesar el envío';
        this.toast.error('Error de Envío', msg);
      }
    });
  }

  limpiarFormulario(): void {
    this.emailForm = { para: '', cc: '', asunto: '', cuerpo: '', idClasificacion: null, prioridadAlta: false, acuseRecibido: false };
    const cuenta = this.cuentas.find(c => c.idCuenta === this.selectedCuentaId);
    if (cuenta) this.prefillOpcionesDesdeCuenta(cuenta);
    this.adjuntos = [];
  }

  closeSuccessModal(): void {
    this.showSuccessModal = false;
    this.setView('history');
  }

  verDetalle(correo: CorreoEnviado): void {
    this.selectedCorreo = correo;
  }
}
