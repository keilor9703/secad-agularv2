import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { UiTableComponent } from '../../../../shared/components/ui-table/ui-table.component';
import {
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
  private readonly funcionarios = this.funcionariosDemoTableService.getFuncionarios();

  currentPage = 1;
  readonly pageSize = 10;
  filterValues: Record<string, string> = {};
  sortState: UiTableSortEvent<FuncionarioListado> | null = null;

  /**
   * Para reutilizar la tabla con otro modelo:
   * 1. Cambie FuncionarioListado por la interfaz del nuevo modelo.
   * 2. Envie el arreglo al input [rows].
   * 3. Defina columnas usando key, value o badge.
   * 4. Cambie [title] para nombrar el nuevo listado.
   * 5. Si necesita acciones, envie [actions] y escuche (actionClick); este demo no las usa para respetar la imagen.
   */
  readonly columns: UiTableColumn<FuncionarioListado>[] = [
    { key: 'name', label: 'Name', sortable: true, width: '12%' },
    { key: 'email', label: 'Email', sortable: true, width: '24%' },
    { key: 'position', label: 'Position', sortable: true, width: '22%' },
    { key: 'company', label: 'Company', sortable: true, width: '18%' },
    { key: 'country', label: 'Country', sortable: true, width: '16%' },
    {
      key: 'estado',
      label: 'Status',
      align: 'center',
      sortable: true,
      width: '8%',
      badge: (row) => this.getEstadoBadge(row.estado),
    },
  ];

  /**
   * Los filtros se renderizan con app-ui-input y Reactive Forms dentro de app-ui-table.
   * Para otro modulo, cambie estas keys por campos del modelo o envie sus valores al servicio.
   */
  readonly filters: UiTableFilter[] = [
    { key: 'especialidad', label: 'Especialidad', placeholder: 'Filtrar...' },
    { key: 'identificacion', label: 'Identificación', placeholder: 'Filtrar...' },
    { key: 'name', label: 'Nombres / Apellidos', placeholder: 'Filtrar...' },
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

  private getEstadoBadge(
    estado: FuncionarioEstado,
  ): { text: string; variant: 'success' | 'warning' | 'danger'; icon: string } {
    if (estado === 'Success') {
      return { text: estado, variant: 'success', icon: 'fa-solid fa-check' };
    }

    if (estado === 'Pending') {
      return { text: estado, variant: 'warning', icon: 'fa-solid fa-clock' };
    }

    return { text: estado, variant: 'danger', icon: 'fa-solid fa-xmark' };
  }

  private normalize(value: unknown): string {
    return String(value ?? '')
      .trim()
      .toLocaleLowerCase('es')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
}
