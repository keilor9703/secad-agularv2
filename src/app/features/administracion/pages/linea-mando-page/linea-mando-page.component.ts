import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ToastService } from '../../../../core/services/toast.service';
import { LineaMandoService, DtoLineaMando, DtoLineaMandoRequest } from '../../../../core/services/linea-mando.service';
import { UsuarioAdminService } from '../../services/usuario-admin.service';

interface CargoOpcion {
  id: string;
  nombre: string;
}

@Component({
  selector: 'app-linea-mando',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './linea-mando-page.component.html',
  styleUrls: ['./linea-mando-page.component.scss']
})
export class LineaMandoPageComponent implements OnInit {
  listaLineaMando: DtoLineaMando[] = [];
  loading = false;
  saving = false;
  searchingFuncionario = false;

  searchIdentificacion = '';
  modoEdicion = false;
  idEditando: number | null = null;

  fotoPreview: string | null = null;
  fotoCambiada = false;
  hayFuncionario = false;

  pesoOpciones: CargoOpcion[] = [
    { id: 'Director Policía', nombre: 'Director Policía' },
    { id: 'Subdirector Policía', nombre: 'Subdirector Policía' },
    { id: 'Jefe Unidad', nombre: 'Jefe Unidad' },
    { id: 'Mando Ejecutivo', nombre: 'Mando Ejecutivo' }
  ];

  formData: DtoLineaMandoRequest = {
    identificacion: '',
    nombre: '',
    apellidos: '',
    grado: '',
    cargo: '',
    peso: '',
    unidad: '',
    fotoBase64: null,
    orden: 1
  };

  constructor(
    private toast: ToastService,
    private lineaMandoService: LineaMandoService,
    private usuarioAdminService: UsuarioAdminService
  ) {}

  ngOnInit(): void {
    this.cargarLineaMando();
  }

  cargarLineaMando(): void {
    this.loading = true;
    this.lineaMandoService.getAll().subscribe({
      next: (data) => {
        this.listaLineaMando = data ?? [];
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.toast.error('Error', 'No se pudo cargar la línea de mando');
      }
    });
  }

  onSearchEnter(event: Event): void {
    event.preventDefault();
    this.buscarFuncionario();
  }

  buscarFuncionario(): void {
    const doc = this.searchIdentificacion.trim();
    if (!doc) {
      this.toast.warning('Buscar', 'Ingrese un número de identificación');
      return;
    }

    this.searchingFuncionario = true;
    this.hayFuncionario = false;

    this.usuarioAdminService.consultarUsuarioPorIdentificacion(doc).subscribe({
      next: (resp) => {
        const func = resp.funcionario;
        
        if (!func || !func.nombres) {
          this.searchingFuncionario = false;
          this.toast.warning('Buscar', 'No se encontró funcionario con esa identificación');
          return;
        }

        const activo = func.activo !== false;
        
        if (!activo) {
          this.searchingFuncionario = false;
          this.toast.warning('Buscar', 'El usuario está inactivo en el sistema');
          return;
        }

        this.formData = {
          identificacion: doc,
          nombre: func.nombres ?? '',
          apellidos: func.apellidos ?? '',
          grado: func.nombreGrado ?? func.cargo ?? '',
          cargo: func.cargo ?? '',
          peso: '',
          unidad: func.dependencia ?? '',
          fotoBase64: resp.fotoBase64 ?? null,
          orden: this.listaLineaMando.length + 1
        };
        
        this.fotoPreview = this.getFotoUrlFromBase64(resp.fotoBase64);
        this.fotoCambiada = false;
        this.hayFuncionario = true;
        this.searchingFuncionario = false;
        this.toast.success('Encontrado', 'Datos del funcionario cargados');
      },
      error: () => {
        this.searchingFuncionario = false;
        this.toast.error('Buscar', 'Error al consultar funcionario');
      }
    });
  }

  validarPesoUnico(): boolean {
    if (!this.formData.peso) {
      return true;
    }

    const pesoActual = this.formData.peso;
    const existentes = this.listaLineaMando.filter(item => 
      item.peso === pesoActual && 
      item.vigente === 1 && 
      item.idLineaMando !== (this.idEditando ?? 0)
    );

    if (existentes.length > 0) {
      this.toast.warning('Peso', `Ya existe un ${pesoActual} activo en la línea de mando`);
      return false;
    }

    return true;
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      
      if (file.size > 2 * 1024 * 1024) {
        this.toast.warning('Foto', 'El archivo no puede superar 2MB');
        return;
      }

      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      const isValidType = validTypes.includes(file.type);
      
      if (!isValidType) {
        this.toast.warning('Foto', 'Solo se permiten archivos de imagen (JPG, PNG, GIF, WEBP)');
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        if (!result.startsWith('data:image/')) {
          this.toast.warning('Foto', 'El archivo seleccionado no es una imagen válida');
          return;
        }
        this.fotoPreview = result;
        this.formData.fotoBase64 = result;
        this.fotoCambiada = true;
      };
      reader.readAsDataURL(file);
    }
  }

  limpiarForm(): void {
    this.formData = {
      identificacion: '',
      nombre: '',
      apellidos: '',
      grado: '',
      cargo: '',
      peso: '',
      unidad: '',
      fotoBase64: null,
      orden: 1
    };
    this.fotoPreview = null;
    this.fotoCambiada = false;
    this.modoEdicion = false;
    this.idEditando = null;
    this.searchIdentificacion = '';
    this.hayFuncionario = false;
  }

  limpiarDatosFuncionario(): void {
    this.formData = {
      identificacion: '',
      nombre: '',
      apellidos: '',
      grado: '',
      cargo: '',
      peso: '',
      unidad: '',
      fotoBase64: null,
      orden: this.formData.orden
    };
    this.fotoPreview = null;
    this.fotoCambiada = false;
    this.hayFuncionario = false;
  }

  editar(item: DtoLineaMando): void {
    this.modoEdicion = true;
    this.idEditando = item.idLineaMando;
    this.searchIdentificacion = item.identificacion;
    this.formData = {
      identificacion: item.identificacion,
      nombre: item.nombre,
      apellidos: item.apellidos,
      grado: item.grado,
      cargo: item.cargo,
      peso: item.peso,
      unidad: item.unidad,
      fotoBase64: item.fotoBase64,
      orden: item.orden
    };
    this.fotoPreview = this.getFotoUrlFromBase64(item.fotoBase64);
    this.fotoCambiada = false;
    this.hayFuncionario = true;
  }

  guardar(): void {
    if (!this.formData.identificacion) {
      this.toast.warning('Guardar', 'La identificación es requerida');
      return;
    }

    if (!this.formData.nombre) {
      this.toast.warning('Guardar', 'El nombre es requerido');
      return;
    }

    if (!this.formData.peso) {
      this.toast.warning('Guardar', 'Debe seleccionar un peso');
      return;
    }

    const existenteMismoPeso = this.listaLineaMando.find(item => 
      item.peso === this.formData.peso && 
      item.vigente === 1 && 
      item.idLineaMando !== (this.idEditando ?? 0)
    );

    if (existenteMismoPeso && !this.modoEdicion) {
      const confirmado = confirm(
        `Ya existe un registro activo con el cargo "${this.formData.peso}" (${existenteMismoPeso.grado} ${existenteMismoPeso.nombre}).\n\n` +
        `¿Está seguro que desea reemplazarlo?\n\n` +
        `El registro anterior pasará a estado Inactivo.`
      );
      
      if (!confirmado) {
        return;
      }
      
      this.sustituirRegistro(existenteMismoPeso.idLineaMando);
      return;
    }

    if (!this.validarPesoUnico()) {
      return;
    }

    this.ejecutarGuardado();
  }

  ejecutarGuardado(): void {
    this.saving = true;

    let fotoBase64: string | null = this.formData.fotoBase64;
    if (!this.fotoCambiada) {
      fotoBase64 = this.modoEdicion ? this.formData.fotoBase64 : null;
    }

    const request: DtoLineaMandoRequest = {
      identificacion: this.formData.identificacion || '',
      nombre: this.formData.nombre || '',
      apellidos: this.formData.apellidos || '',
      grado: this.formData.grado || '',
      cargo: this.formData.cargo || '',
      peso: this.formData.peso || '',
      unidad: this.formData.unidad || '',
      fotoBase64: fotoBase64,
      orden: Number(this.formData.orden) || 1
    };

    if (this.modoEdicion && this.idEditando) {
      this.lineaMandoService.update(this.idEditando, request).subscribe({
        next: (resp) => {
          this.saving = false;
          if (resp.success) {
            this.toast.success('Guardar', resp.message);
            this.limpiarForm();
            this.cargarLineaMando();
          } else {
            this.toast.warning('Guardar', resp.message);
          }
        },
        error: () => {
          this.saving = false;
          this.toast.error('Guardar', 'Error al actualizar');
        }
      });
    } else {
      this.lineaMandoService.create(request).subscribe({
        next: (resp) => {
          this.saving = false;
          if (resp.success) {
            this.toast.success('Guardar', resp.message);
            this.limpiarForm();
            this.cargarLineaMando();
          } else {
            this.toast.warning('Guardar', resp.message);
          }
        },
        error: () => {
          this.saving = false;
          this.toast.error('Guardar', 'Error al crear');
        }
      });
    }
  }

  eliminar(item: DtoLineaMando): void {
    if (!confirm(`¿Está seguro de eliminar a ${item.nombre} ${item.apellidos}?`)) {
      return;
    }

    this.lineaMandoService.setVigente(item.idLineaMando, 0).subscribe({
      next: (resp) => {
        if (resp.success) {
          this.toast.success('Eliminar', resp.message);
          this.cargarLineaMando();
        } else {
          this.toast.warning('Eliminar', resp.message);
        }
      },
      error: () => {
        this.toast.error('Eliminar', 'Error al eliminar');
      }
    });
  }

  sustituirRegistro(idAnterior: number): void {
    this.saving = true;

    this.lineaMandoService.setVigente(idAnterior, 0).subscribe({
      next: (resp) => {
        if (resp.success) {
          this.ejecutarGuardado();
        } else {
          this.saving = false;
          this.toast.error('Sustituir', 'Error al inactivar registro anterior');
        }
      },
      error: () => {
        this.saving = false;
        this.toast.error('Sustituir', 'Error al inactivar registro anterior');
      }
    });
  }

  getNombreCompleto(): string {
    return `${this.formData.nombre} ${this.formData.apellidos}`.trim();
  }

  getNombreCompletoItem(item: DtoLineaMando): string {
    return this.sanitizeText(`${item.nombre} ${item.apellidos}`.trim());
  }

  getGradoItem(item: DtoLineaMando): string {
    return this.sanitizeText(item.grado);
  }

  getIdentificacionItem(item: DtoLineaMando): string {
    return this.sanitizeText(item.identificacion);
  }

  getUnidadItem(item: DtoLineaMando): string {
    return this.sanitizeText(item.unidad);
  }

  getPesoItem(item: DtoLineaMando): string {
    return this.sanitizeText(item.peso);
  }

  private getFotoUrlFromBase64(fotoBase64: string | null): string {
    if (!fotoBase64) return 'imagenes/policia.jpg';
    const base64 = fotoBase64.trim();
    if (base64.startsWith('data:')) return base64;
    return 'data:image/jpeg;base64,' + base64;
  }

  private sanitizeText(text: string | null | undefined): string {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  getFotoUrl(item: DtoLineaMando): string {
    return this.getFotoUrlFromBase64(item.fotoBase64);
  }
}


