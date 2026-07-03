import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { ToastService } from '../../../../core/services/toast.service';
import { UiTableComponent } from '../../../../shared/components/ui-table/ui-table.component';
import {
  UiTableAction,
  UiTableActionEvent,
  UiTableColumn,
  UiTableFilter,
  UiTableSortEvent,
} from '../../../../shared/interfaces/ui-table.interface';
import {
  FuncionarioEstado,
  FuncionarioListado,
} from '../../interfaces/funcionario-listado.interface';
import { FuncionariosDemoTableService } from '../../services/funcionarios-demo-table.service';

@Component({
  selector: 'app-funcionarios-table-demo',
  standalone: true,
  imports: [CommonModule, UiTableComponent],
  templateUrl: './funcionarios-table-demo.component.html',
  styleUrls: ['./funcionarios-table-demo.component.scss'],
})
export class FuncionariosTableDemoComponent {
  private readonly funcionariosDemoTableService = inject(FuncionariosDemoTableService);
  private readonly toast = inject(ToastService);

  private readonly funcionarios = this.funcionariosDemoTableService.getFuncionarios();

  currentPage = 1;
  readonly pageSize = 10;
  filterValues: Record<string, string> = {};
  sortState: UiTableSortEvent<FuncionarioListado> | null = null;

  /**
   * Para reutilizar la tabla con otro modelo:
   * 1. Cambie FuncionarioListado por la interfaz del nuevo modelo.
   * 2. Envie el arreglo al input [rows].
   * 3. Defina columnas usando la propiedad key o una funcion value.
   * 4. Cambie [title] para nombrar el nuevo listado.
   */
  readonly columns: UiTableColumn<FuncionarioListado>[] = [
    { key: 'especialidad', label: 'Especialidad', sortable: true, width: '17%' },
    { key: 'identificacion', label: 'Identificación', sortable: true, width: '16%' },
    { key: 'nombresApellidos', label: 'Nombres / Apellidos', sortable: true, width: '22%' },
    { key: 'correo', label: 'Email', sortable: true, width: '20%' },
    { key: 'cargo', label: 'Cargo', sortable: true, width: '18%' },
    {
      key: 'estado',
      label: 'Estado',
      align: 'center',
      sortable: true,
      width: '10%',
      badge: (row) => this.getEstadoBadge(row.estado),
    },
  ];

  /**
   * Los filtros se conectan por key; el componente emite filterChange y este demo decide como filtrar.
   * Para otra pantalla, puede cambiar estas keys por campos de su propio modelo o enviarlas a un servicio.
   */
  readonly filters: UiTableFilter[] = [
    { key: 'especialidad', label: 'Especialidad', placeholder: 'Filtrar...' },
    { key: 'identificacion', label: 'Identificación', placeholder: 'Filtrar...' },
    { key: 'nombresApellidos', label: 'Nombres / Apellidos', placeholder: 'Filtrar...' },
  ];

  /**
   * Cada accion recibe la fila completa en actionClick.
   * Para ocultar o bloquear acciones por fila, use visible(row) o disabled(row).
   */
  readonly actions: UiTableAction<FuncionarioListado>[] = [
    {
      id: 'ver',
      label: 'Ver',
      icon: 'fa-solid fa-eye',
      variant: 'info',
      title: 'Ver funcionario',
    },
    {
      id: 'editar',
      label: 'Editar',
      icon: 'fa-solid fa-pen-to-square',
      variant: 'secondary',
      title: 'Editar funcionario',
    },
    {
      id: 'retirar',
      label: 'Retirar',
      icon: 'fa-solid fa-user-xmark',
      variant: 'danger',
      title: 'Retirar funcionario',
      disabled: (row) => row.estado === 'Inactivo',
    },
  ];

  get totalFuncionarios(): number {
    return this.sortedFuncionarios.length;
  }

  get funcionariosPaginados(): FuncionarioListado[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.sortedFuncionarios.slice(start, start + this.pageSize);
  }

  /** Actualiza los filtros recibidos desde la tabla reutilizable y vuelve a la primera pagina. */
  onFiltersChange(values: Record<string, string>): void {
    this.filterValues = values;
    this.currentPage = 1;
  }

  /** Recibe el campo ordenado desde la tabla reutilizable y conserva el estado en el demo. */
  onSortChange(sort: UiTableSortEvent<FuncionarioListado>): void {
    this.sortState = sort;
    this.currentPage = 1;
  }

  /** Cambia la pagina visible sin modificar los datos originales. */
  onPageChange(page: number): void {
    this.currentPage = page;
  }

  /** Atiende acciones de ejemplo; en un modulo real aqui se llama el servicio o se abre un modal. */
  onTableAction(event: UiTableActionEvent<FuncionarioListado>): void {
    this.toast.info('Tabla de funcionarios', `${event.actionId}: ${event.row.nombresApellidos}`);
  }

  private get filteredFuncionarios(): FuncionarioListado[] {
    return this.funcionarios.filter((funcionario) =>
      this.filters.every((filter) => {
        const filterValue = this.normalize(this.filterValues[filter.key]);

        if (!filterValue) {
          return true;
        }

        return this.normalize(funcionario[filter.key as keyof FuncionarioListado]).includes(filterValue);
      }),
    );
  }

  private get sortedFuncionarios(): FuncionarioListado[] {
    const rows = [...this.filteredFuncionarios];

    if (!this.sortState) {
      return rows;
    }

    return rows.sort((left, right) => {
      const leftValue = this.normalize(left[this.sortState!.key]);
      const rightValue = this.normalize(right[this.sortState!.key]);
      const result = leftValue.localeCompare(rightValue, 'es');
      return this.sortState!.direction === 'asc' ? result : -result;
    });
  }

  private getEstadoBadge(estado: FuncionarioEstado): { text: string; variant: 'success' | 'warning' | 'danger' } {
    if (estado === 'Activo') {
      return { text: estado, variant: 'success' };
    }

    if (estado === 'Novedad') {
      return { text: estado, variant: 'warning' };
    }

    return { text: estado, variant: 'danger' };
  }

  private normalize(value: unknown): string {
    return String(value ?? '')
      .trim()
      .toLocaleLowerCase('es')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
}
