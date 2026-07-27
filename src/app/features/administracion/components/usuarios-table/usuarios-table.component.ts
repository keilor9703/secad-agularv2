import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';

import { UiSearchInputComponent } from '../../../../shared/components/ui-search-input/ui-search-input.component';
import { UiTableComponent } from '../../../../shared/components/ui-table/ui-table.component';
import {
  UiTableAction,
  UiTableActionEvent,
  UiTableColumn,
} from '../../../../shared/interfaces/ui-table.interface';
import { UsuarioListadoItem } from '../../services/usuario-admin.service';

@Component({
  selector: 'app-usuarios-table',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, UiSearchInputComponent, UiTableComponent],
  templateUrl: './usuarios-table.component.html',
  styleUrls: ['./usuarios-table.component.scss'],
})
export class UsuariosTableComponent implements OnChanges, OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  @Input() usuarios: UsuarioListadoItem[] = [];
  @Input() loading = false;
  @Input() isSearchMode = false;
  @Input() minSearchChars = 6;
  @Input() currentPage = 1;
  @Input() totalPaginas = 1;
  @Input() totalUsuarios = 0;
  @Input() pageSize = 10;
  @Input() canGoPrev = false;
  @Input() canGoNext = false;
  @Input() searchTerm = '';

  @Output() buscar = new EventEmitter<string>();
  @Output() cambiarPagina = new EventEmitter<number>();
  @Output() paginaAnterior = new EventEmitter<void>();
  @Output() paginaSiguiente = new EventEmitter<void>();
  @Output() editar = new EventEmitter<UsuarioListadoItem>();
  @Output() eliminar = new EventEmitter<UsuarioListadoItem>();

  searchForm = this.fb.group({
    nombre: [''],
  });

  readonly columns: UiTableColumn<UsuarioListadoItem>[] = [
    {
      key: 'username',
      label: 'Usuario empresarial',
      width: '180px',
      sortable: true,
      value: (item) => item.username || 'N/A',
    },
    {
      key: 'nombreCompleto',
      label: 'Grado y nombre',
      sortable: true,
      value: (item) => item.nombreCompleto || 'N/A',
    },
    {
      key: 'rol',
      label: 'Rol',
      width: '180px',
      badge: (item) => ({
        text: item.rol || 'Sin rol',
        variant: item.rol ? 'primary' : 'neutral',
      }),
    },
    {
      key: 'fechaFinRol',
      label: 'Vencimiento rol',
      width: '160px',
      value: (item) => item.fechaFinRol || 'Sin fecha',
    },
  ];

  readonly actions: UiTableAction<UsuarioListadoItem>[] = [
    {
      id: 'edit',
      label: 'Editar',
      icon: 'fa-solid fa-pen-to-square',
      description: 'Cargar el usuario en el formulario',
      variant: 'info',
    },
    {
      id: 'delete',
      label: 'Eliminar',
      icon: 'fa-solid fa-user-xmark',
      description: 'Eliminar usuario del sistema',
      variant: 'danger',
    },
  ];

  ngOnInit(): void {
    this.searchForm.controls.nombre.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((term) => this.buscar.emit(term ?? ''));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['searchTerm']) {
      this.searchForm.patchValue({ nombre: this.searchTerm }, { emitEvent: false });
    }
  }

  get tableEmptyMessage(): string {
    const term = (this.searchForm.controls.nombre.value ?? '').trim();

    if (this.isSearchMode && term.length < this.minSearchChars) {
      return `Escribe mínimo ${this.minSearchChars} caracteres para activar la búsqueda.`;
    }

    return this.isSearchMode ? 'No hay resultados para la búsqueda.' : 'No hay usuarios para mostrar.';
  }

  onSearchSubmit(term: string): void {
    this.searchForm.patchValue({ nombre: term }, { emitEvent: false });
    this.buscar.emit(term);
  }

  onSearchClear(): void {
    this.searchForm.patchValue({ nombre: '' }, { emitEvent: false });
    this.buscar.emit('');
  }

  handleAction(event: UiTableActionEvent<UsuarioListadoItem>): void {
    if (event.actionId === 'edit') {
      this.editar.emit(event.row);
      return;
    }

    if (event.actionId === 'delete') {
      this.eliminar.emit(event.row);
    }
  }
}
