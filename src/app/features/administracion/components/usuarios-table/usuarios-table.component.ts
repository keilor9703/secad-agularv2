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
  TemplateRef,
  ViewChild,
  inject,
  signal,
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
import { UiFormControlSize } from '../../../../shared/models/ui-form-control-size.model';
import { UsuarioListadoItem } from '../../services/usuario-admin.service';
import { UsuarioRolesDropdownComponent } from '../usuario-roles-dropdown/usuario-roles-dropdown.component';

@Component({
  selector: 'app-usuarios-existentes',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    UiSearchInputComponent,
    UiTableComponent,
    UsuarioRolesDropdownComponent,
  ],
  templateUrl: './usuarios-table.component.html',
  styleUrls: ['./usuarios-table.component.scss'],
})
export class UsuariosTableComponent implements OnChanges, OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  readonly tableHeaderColor = signal('#3E82B3');
  readonly tableHeaderColorMiddle = signal('#2A6694');
  readonly tableHeaderColorEnd = signal('#174E78');
  readonly tableTitleId = 'usuarios-existentes-title';

  @Input() usuarios: UsuarioListadoItem[] = [];
  @Input() loading = false;
  @Input() isSearchMode = false;
  @Input() minSearchChars = 6;
  @Input() currentPage = 1;
  @Input() totalUsuarios = 0;
  @Input() pageSize = 5;
  @Input() searchTerm = '';

  @Output() buscar = new EventEmitter<string>();
  @Output() cambiarPagina = new EventEmitter<number>();
  @Output() cambiarTamanoPagina = new EventEmitter<number>();
  @Output() editar = new EventEmitter<UsuarioListadoItem>();
  @Output() eliminar = new EventEmitter<UsuarioListadoItem>();

  @ViewChild('rolesCell', { static: true })
  rolesCell!: TemplateRef<{
    $implicit: UsuarioListadoItem;
    row: UsuarioListadoItem;
    column: UiTableColumn<UsuarioListadoItem>;
  }>;

  readonly searchForm = this.fb.group({
    nombre: [''],
  });

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

  /** Tamaño compacto del buscador ubicado en el encabezado de la tabla. */
  readonly alturaCompacta: UiFormControlSize = {
    height: '36px',
    minHeight: '32px',
    maxHeight: '42px',
    width: '350px',
    minWidth: '220px',
    maxWidth: '100%',
    mobile: {
      height: '40px',
      minHeight: '38px',
      maxHeight: '44px',
      width: '100%',
      minWidth: '0px',
      maxWidth: '100%',
    },
  };

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

  get columns(): UiTableColumn<UsuarioListadoItem>[] {
    return [
      {
        key: 'username',
        label: 'Usuario empresarial',
        width: '35%',
        textTransform: 'uppercase',
        sortable: true,
        value: (item) => item.username || 'N/A',
      },
      {
        key: 'nombreCompleto',
        label: 'Grado y nombre',
        width: '35%',
        sortable: true,
        value: (item) => item.nombreCompleto || 'N/A',
      },
      {
        key: 'rol',
        label: 'Roles',
        width: '30%',
        align: 'center',
        cellTemplate: this.rolesCell,
      },
    ];
  }

  get tableEmptyMessage(): string {
    const term = (this.searchForm.controls.nombre.value ?? '').trim();

    if (this.isSearchMode && term.length < this.minSearchChars) {
      return `Escribe mínimo ${this.minSearchChars} caracteres para activar la búsqueda.`;
    }

    return this.isSearchMode
      ? 'No hay resultados para la búsqueda.'
      : 'No hay usuarios para mostrar.';
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
