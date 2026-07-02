import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';

import { UsuarioListadoItem } from '../../services/usuario-admin.service';

@Component({
  selector: 'app-usuarios-table',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './usuarios-table.component.html',
  styleUrls: ['./usuarios-table.component.scss'],
})
export class UsuariosTableComponent implements OnChanges {
  private readonly fb = inject(FormBuilder);

  @Input() usuarios: UsuarioListadoItem[] = [];
  @Input() loading = false;
  @Input() isSearchMode = false;
  @Input() minSearchChars = 6;
  @Input() currentPage = 1;
  @Input() totalPaginas = 1;
  @Input() totalUsuarios = 0;
  @Input() canGoPrev = false;
  @Input() canGoNext = false;
  @Input() searchTerm = '';

  @Output() buscar = new EventEmitter<string>();
  @Output() paginaAnterior = new EventEmitter<void>();
  @Output() paginaSiguiente = new EventEmitter<void>();
  @Output() editar = new EventEmitter<UsuarioListadoItem>();
  @Output() eliminar = new EventEmitter<UsuarioListadoItem>();

  searchForm = this.fb.group({
    nombre: [''],
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['searchTerm']) {
      this.searchForm.patchValue({ nombre: this.searchTerm }, { emitEvent: false });
    }
  }

  onBuscarChange(): void {
    this.buscar.emit(this.searchForm.controls.nombre.getRawValue() ?? '');
  }
}
